-- « Voir avec… » et « Dis-moi ce que t'en as pensé ».
--
-- Deux gestes, un seul mécanisme :
-- - proposer un film à voir ensemble (kind = 'watch') ;
-- - demander l'avis de quelqu'un sur un film qu'on vient de noter (kind = 'verdict').
--
-- Chacun passe par l'un de deux chemins :
-- - vers une personne déjà sur l'app : une notification (`notifications`) ;
-- - vers n'importe qui : un lien (`share_links`), auquel on répond SANS compte
--   (`share_link_responses`), puis que l'on rattache à son compte en s'inscrivant.
--
-- Aucune table n'est écrite directement par l'app : tout passe par les fonctions
-- ci-dessous, qui vérifient qui a le droit de s'adresser à qui. La réponse à une
-- invitation n'a pas de colonne à elle : c'est le vote (`space_movie_votes`) ou
-- le verdict (`movie_ratings`) qui existent déjà, pour qu'il n'y ait qu'une seule
-- vérité et que l'onglet « À voir » de l'espace reste juste sans rien y toucher.

-- ─── Liens ──────────────────────────────────────────────────────────────────

create table if not exists public.share_links (
  id uuid primary key default gen_random_uuid(),
  -- 22 caractères base64url tirés d'un UUID v4 : 122 bits aléatoires.
  token text not null unique check (token ~ '^[A-Za-z0-9_-]{22}$'),
  inviter_id uuid not null references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('watch', 'verdict')),
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  tmdb_id integer,
  title text not null check (char_length(title) between 1 and 240),
  year integer,
  poster_url text,
  backdrop_url text,
  runtime integer,
  release_date date,
  -- Fiche complète, pour créer le film dans l'espace au moment du rattachement.
  movie jsonb not null default '{}'::jsonb,
  -- Verdict de la personne qui invite. Jamais rendu avant que l'invité ait donné
  -- sa propre note : c'est tout l'intérêt du lien.
  inviter_rating jsonb,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days'
);

create index if not exists share_links_inviter_idx on public.share_links (inviter_id, created_at desc);

create table if not exists public.share_link_responses (
  id uuid primary key default gen_random_uuid(),
  link_id uuid not null references public.share_links (id) on delete cascade,
  -- Identifiant tiré au hasard par le navigateur de l'invité : permet de changer
  -- d'avis, et de retrouver sa réponse au moment de créer son compte.
  guest_key uuid not null,
  guest_name text not null check (char_length(guest_name) between 1 and 30),
  interested boolean,
  rating numeric(3, 1) check (rating between 0 and 10),
  profile_id uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (link_id, guest_key)
);

create index if not exists share_link_responses_profile_idx
  on public.share_link_responses (profile_id) where profile_id is not null;

-- ─── Boîte de notifications ─────────────────────────────────────────────────

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  actor_id uuid references public.profiles (id) on delete cascade,
  kind text not null check (kind in (
    'watch_invite',     -- X veut voir un film avec toi
    'watch_accepted',   -- X dit oui
    'verdict_request',  -- X veut ton avis
    'verdict_given',    -- X a noté le film que tu lui as demandé de noter
    'link_answered',    -- quelqu'un a répondu à ton lien, sans compte
    'link_joined'       -- quelqu'un a créé son compte depuis ton lien
  )),
  space_id uuid references public.shared_spaces (id) on delete cascade,
  shared_movie_id uuid references public.shared_movies (id) on delete cascade,
  share_link_id uuid references public.share_links (id) on delete cascade,
  share_response_id uuid references public.share_link_responses (id) on delete cascade,
  -- Copies figées au moment de l'envoi : la notification doit rester lisible
  -- même si le film est retiré de l'espace.
  title text not null,
  poster_url text,
  guest_name text,
  rating numeric(3, 1),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  pushed_at timestamptz
);

create index if not exists notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index if not exists notifications_actor_idx on public.notifications (actor_id, created_at desc);
create index if not exists notifications_movie_idx on public.notifications (shared_movie_id);
create index if not exists notifications_link_idx on public.notifications (share_link_id);
create index if not exists notifications_space_idx on public.notifications (space_id);

-- Une seule notification par personne, par film et par sorte : relancer ou
-- changer d'avis ne rejoue pas la notification.
create unique index if not exists notifications_once_per_movie
  on public.notifications (recipient_id, kind, shared_movie_id, actor_id)
  where shared_movie_id is not null and actor_id is not null;
create unique index if not exists notifications_once_per_response
  on public.notifications (share_response_id)
  where kind = 'link_answered';
create unique index if not exists notifications_once_per_join
  on public.notifications (share_link_id, actor_id)
  where kind = 'link_joined';

alter table public.share_links enable row level security;
alter table public.share_link_responses enable row level security;
alter table public.notifications enable row level security;

revoke all on table public.share_links from anon, authenticated;
revoke all on table public.share_link_responses from anon, authenticated;
revoke all on table public.notifications from anon, authenticated;
grant select on table public.notifications to authenticated;

drop policy if exists "notifications: chacun lit les siennes" on public.notifications;
create policy "notifications: chacun lit les siennes"
  on public.notifications for select to authenticated
  using ((select auth.uid()) = recipient_id);

-- ─── Outils internes ────────────────────────────────────────────────────────

/** Deux personnes qui ne se sont pas bloquées, dans un sens comme dans l'autre. */
create or replace function private.not_blocked(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_a and b.blocked_id = p_b)
       or (b.blocker_id = p_b and b.blocked_id = p_a)
  );
$$;

/** Membres actifs d'au moins un même espace. */
create or replace function private.are_co_members(p_a uuid, p_b uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
    from public.space_members me
    join public.space_members them on them.space_id = me.space_id
    where me.profile_id = p_a and them.profile_id = p_b
      and me.is_active and them.is_active
  );
$$;

/** Note globale d'un verdict, telle que l'app l'affiche. */
create or replace function private.overall_rating(p_story numeric, p_visuals numeric, p_acting numeric, p_sound numeric, p_adaptive jsonb)
returns numeric
language sql
immutable
set search_path to ''
as $$
  select round(coalesce(
    case when (p_adaptive ->> 'weightedRating') ~ '^[0-9]+(\.[0-9]+)?$'
      then least(10, (p_adaptive ->> 'weightedRating')::numeric) end,
    (coalesce(p_story, 0) + coalesce(p_visuals, 0) + coalesce(p_acting, 0) + coalesce(p_sound, 0)) / 4.0
  ), 1);
$$;

/** Nombre borné lu dans un jsonb, ou null. N'échoue jamais sur une valeur mal formée. */
create or replace function private.json_num(p jsonb, p_key text, p_min numeric, p_max numeric)
returns numeric
language sql
immutable
set search_path to ''
as $$
  select case
    when jsonb_typeof(p -> p_key) = 'number'
      then greatest(p_min, least(p_max, (p ->> p_key)::numeric))
    when (p ->> p_key) ~ '^-?[0-9]+(\.[0-9]+)?$'
      then greatest(p_min, least(p_max, (p ->> p_key)::numeric))
  end;
$$;

/**
 * Espace où se retrouvent `p_owner` et tous les `p_others`.
 *
 * On prend le plus PETIT espace actif qui les réunit tous : proposer un film à
 * Léa ne doit pas l'envoyer dans l'espace de dix personnes où Léa se trouve
 * aussi. S'il n'y en a aucun, on en crée un, nommé d'après leurs prénoms.
 */
create or replace function private.ensure_space_for(p_owner uuid, p_others uuid[])
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_space uuid;
  v_name text;
begin
  select s.id into v_space
  from public.shared_spaces s
  where exists (
      select 1 from public.space_members m
      where m.space_id = s.id and m.profile_id = p_owner and m.is_active
    )
    and not exists (
      select 1 from unnest(p_others) o(id)
      where not exists (
        select 1 from public.space_members m
        where m.space_id = s.id and m.profile_id = o.id and m.is_active
      )
    )
  order by
    (select count(*) from public.space_members m where m.space_id = s.id and m.is_active),
    s.updated_at desc nulls last
  limit 1;

  if v_space is not null then
    return v_space;
  end if;

  select string_agg(name, ', ' order by ord) into v_name
  from (
    select coalesce(nullif(btrim(p.first_name), ''), 'Membre') as name, x.ord
    from unnest(array[p_owner] || p_others) with ordinality x(id, ord)
    join public.profiles p on p.id = x.id
  ) names;
  -- « Mika, Léa, Tom » → « Mika, Léa & Tom »
  v_name := regexp_replace(v_name, ', ([^,]*)$', ' & \1');
  v_name := left(coalesce(v_name, 'Nous'), 60);

  insert into public.shared_spaces (name, description, created_by)
  values (v_name, '', p_owner)
  returning id into v_space;

  insert into public.space_members (space_id, profile_id, role)
  values (v_space, p_owner, 'owner');

  insert into public.space_members (space_id, profile_id, role)
  select v_space, o.id, 'member'
  from (select distinct unnest(p_others) as id) o
  where o.id <> p_owner;

  return v_space;
end;
$$;

/**
 * Le film dans l'espace : la ligne existante si le film y est déjà, sinon une
 * nouvelle. Aucune contrainte d'unicité n'existe sur `shared_movies`, c'est donc
 * ici que l'on évite les doublons.
 *
 * Chaque champ est borné : la fiche vient de l'app, pas d'une source de confiance.
 */
create or replace function private.upsert_shared_movie(p_space uuid, p_by uuid, p_movie jsonb, p_status text)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_id uuid;
  v_status text;
  v_tmdb integer := case when (p_movie ->> 'tmdb_id') ~ '^[0-9]{1,9}$' then (p_movie ->> 'tmdb_id')::integer end;
  v_media text := case when p_movie ->> 'media_type' = 'tv' then 'tv' else 'movie' end;
  v_title text := left(btrim(coalesce(p_movie ->> 'title', '')), 240);
  v_genres text[];
begin
  if v_title = '' then
    raise exception 'movie-title-required';
  end if;

  if v_tmdb is not null then
    select id, status into v_id, v_status
    from public.shared_movies
    where space_id = p_space and tmdb_id = v_tmdb
      and coalesce(media_type, 'movie') = v_media
      and season_number is null
    order by added_at
    limit 1;
  end if;

  if v_id is not null then
    if p_status = 'watched' and v_status = 'watchlist' then
      update public.shared_movies
        set status = 'watched', date_watched = now(), updated_at = now()
        where id = v_id;
    end if;
    return v_id;
  end if;

  if jsonb_typeof(p_movie -> 'genres') = 'array' then
    select array_agg(left(g, 40)) into v_genres
    from (select jsonb_array_elements_text(p_movie -> 'genres') g limit 8) x;
  end if;

  insert into public.shared_movies (
    space_id, added_by, tmdb_id, title, director, year, genre, poster_url, status,
    date_watched, media_type, synopsis, runtime, genres, actors, trailer_key,
    tmdb_rating, number_of_seasons, release_date
  ) values (
    p_space, p_by, v_tmdb, v_title,
    left(coalesce(p_movie ->> 'director', ''), 200),
    coalesce(private.json_num(p_movie, 'year', 1870, 2100)::integer, extract(year from now())::integer),
    left(coalesce(p_movie ->> 'genre', ''), 200),
    case when (p_movie ->> 'poster_url') ~ '^https://image\.tmdb\.org/' then left(p_movie ->> 'poster_url', 300) end,
    p_status,
    case when p_status = 'watched' then now() end,
    v_media,
    left(p_movie ->> 'synopsis', 2000),
    private.json_num(p_movie, 'runtime', 1, 1000)::integer,
    v_genres,
    left(p_movie ->> 'actors', 500),
    case when (p_movie ->> 'trailer_key') ~ '^[A-Za-z0-9_-]{6,20}$' then p_movie ->> 'trailer_key' end,
    private.json_num(p_movie, 'tmdb_rating', 0, 10),
    private.json_num(p_movie, 'number_of_seasons', 1, 200)::integer,
    case when (p_movie ->> 'release_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_movie ->> 'release_date')::date end
  )
  returning id into v_id;

  return v_id;
end;
$$;

/** Verdict d'une personne sur un film de l'espace, s'il n'en a pas déjà un. */
create or replace function private.put_rating(p_movie uuid, p_profile uuid, p_rating jsonb)
returns void
language plpgsql
security definer
set search_path to ''
as $$
begin
  if p_rating is null or jsonb_typeof(p_rating) <> 'object' then
    return;
  end if;

  insert into public.movie_ratings (
    movie_id, profile_id, story, visuals, acting, sound, adaptive_rating, rating_mode, review
  ) values (
    p_movie, p_profile,
    coalesce(private.json_num(p_rating, 'story', 0, 10), 0),
    coalesce(private.json_num(p_rating, 'visuals', 0, 10), 0),
    coalesce(private.json_num(p_rating, 'acting', 0, 10), 0),
    coalesce(private.json_num(p_rating, 'sound', 0, 10), 0),
    case when jsonb_typeof(p_rating -> 'adaptive_rating') = 'object'
          and octet_length((p_rating -> 'adaptive_rating')::text) < 8000
      then p_rating -> 'adaptive_rating' end,
    case when p_rating ->> 'rating_mode' in ('bitter', 'bitter_plus') then p_rating ->> 'rating_mode' end,
    nullif(left(btrim(coalesce(p_rating ->> 'review', '')), 2000), '')
  )
  on conflict (movie_id, profile_id) do nothing;
end;
$$;

/** Verdict rendu sur la page du lien : la note et les quatre critères, jamais le texte. */
create or replace function private.public_rating(p_rating jsonb)
returns jsonb
language sql
immutable
set search_path to ''
as $$
  select case when p_rating is null then null else jsonb_build_object(
    'overall', private.overall_rating(
      private.json_num(p_rating, 'story', 0, 10), private.json_num(p_rating, 'visuals', 0, 10),
      private.json_num(p_rating, 'acting', 0, 10), private.json_num(p_rating, 'sound', 0, 10),
      p_rating -> 'adaptive_rating'),
    'story', private.json_num(p_rating, 'story', 0, 10),
    'visuals', private.json_num(p_rating, 'visuals', 0, 10),
    'acting', private.json_num(p_rating, 'acting', 0, 10),
    'sound', private.json_num(p_rating, 'sound', 0, 10)
  ) end;
$$;

-- ─── Fonctions appelées par l'app (compte connecté) ─────────────────────────

/** Les personnes à qui proposer un film : celles avec qui on partage un espace. */
create or replace function public.get_watch_companions()
returns table (profile_id uuid, first_name text, avatar_url text, shared_spaces integer, last_seen timestamptz)
language sql
stable
security definer
set search_path to ''
as $$
  select them.profile_id,
    coalesce(p.first_name, 'Membre'),
    p.avatar_url,
    count(distinct them.space_id)::integer,
    max(greatest(them.joined_at, s.updated_at))
  from public.space_members me
  join public.space_members them on them.space_id = me.space_id
  join public.shared_spaces s on s.id = me.space_id
  join public.profiles p on p.id = them.profile_id
  where (select auth.uid()) is not null
    and me.profile_id = (select auth.uid())
    and me.is_active and them.is_active
    and them.profile_id <> (select auth.uid())
    and private.not_blocked((select auth.uid()), them.profile_id)
  group by them.profile_id, p.first_name, p.avatar_url
  order by 5 desc nulls last;
$$;

/**
 * Proposer un film (kind = 'watch') ou demander un avis (kind = 'verdict') à des
 * personnes déjà sur l'app.
 */
create or replace function public.propose_to_people(
  p_kind text,
  p_movie jsonb,
  p_invitees uuid[],
  p_rating jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_others uuid[];
  v_other uuid;
  v_space uuid;
  v_movie uuid;
  v_title text;
  v_poster text;
  v_sent integer := 0;
  v_rows integer;
begin
  if v_me is null then raise exception 'not-authenticated'; end if;
  if p_kind not in ('watch', 'verdict') then raise exception 'invalid-kind'; end if;

  select array_agg(distinct x) into v_others
  from unnest(p_invitees) x
  where x is not null and x <> v_me;

  if v_others is null or cardinality(v_others) = 0 then raise exception 'no-invitee'; end if;
  if cardinality(v_others) > 8 then raise exception 'too-many-invitees'; end if;

  -- On ne s'adresse qu'à quelqu'un que l'on connaît déjà par un espace commun,
  -- et qui ne nous a pas bloqué : pas d'invitation vers un inconnu.
  foreach v_other in array v_others loop
    if not private.are_co_members(v_me, v_other) or not private.not_blocked(v_me, v_other) then
      raise exception 'invitee-not-allowed';
    end if;
  end loop;

  if (select count(*) from public.notifications
      where actor_id = v_me and kind in ('watch_invite', 'verdict_request')
        and created_at > now() - interval '1 day') >= 30 then
    raise exception 'rate-limited';
  end if;

  v_space := private.ensure_space_for(v_me, v_others);
  v_movie := private.upsert_shared_movie(
    v_space, v_me, p_movie, case p_kind when 'watch' then 'watchlist' else 'watched' end);

  if p_kind = 'watch' then
    insert into public.space_movie_votes (movie_id, profile_id, interested)
    values (v_movie, v_me, true)
    on conflict (movie_id, profile_id) do update set interested = true;
  else
    perform private.put_rating(v_movie, v_me, p_rating);
  end if;

  select title, poster_url into v_title, v_poster from public.shared_movies where id = v_movie;

  foreach v_other in array v_others loop
    insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url)
    values (v_other, v_me, case p_kind when 'watch' then 'watch_invite' else 'verdict_request' end,
            v_space, v_movie, v_title, v_poster)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_sent := v_sent + v_rows;
  end loop;

  update public.shared_spaces set updated_at = now() where id = v_space;

  return jsonb_build_object('space_id', v_space, 'shared_movie_id', v_movie, 'sent', v_sent);
end;
$$;

/** Crée un lien à envoyer à n'importe qui. Rend le jeton. */
create or replace function public.create_share_link(p_kind text, p_movie jsonb, p_rating jsonb default null)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_token text;
  v_title text := left(btrim(coalesce(p_movie ->> 'title', '')), 240);
begin
  if v_me is null then raise exception 'not-authenticated'; end if;
  if p_kind not in ('watch', 'verdict') then raise exception 'invalid-kind'; end if;
  if v_title = '' then raise exception 'movie-title-required'; end if;
  if octet_length(coalesce(p_movie, '{}'::jsonb)::text) > 16000 then raise exception 'movie-too-large'; end if;
  if p_kind = 'verdict' and (p_rating is null or jsonb_typeof(p_rating) <> 'object') then
    raise exception 'rating-required';
  end if;

  if (select count(*) from public.share_links
      where inviter_id = v_me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate-limited';
  end if;

  v_token := rtrim(translate(encode(decode(replace(gen_random_uuid()::text, '-', ''), 'hex'), 'base64'), '+/', '-_'), '=');

  insert into public.share_links (
    token, inviter_id, kind, media_type, tmdb_id, title, year, poster_url, backdrop_url,
    runtime, release_date, movie, inviter_rating
  ) values (
    v_token, v_me, p_kind,
    case when p_movie ->> 'media_type' = 'tv' then 'tv' else 'movie' end,
    case when (p_movie ->> 'tmdb_id') ~ '^[0-9]{1,9}$' then (p_movie ->> 'tmdb_id')::integer end,
    v_title,
    private.json_num(p_movie, 'year', 1870, 2100)::integer,
    case when (p_movie ->> 'poster_url') ~ '^https://image\.tmdb\.org/' then left(p_movie ->> 'poster_url', 300) end,
    case when (p_movie ->> 'backdrop_url') ~ '^https://image\.tmdb\.org/' then left(p_movie ->> 'backdrop_url', 300) end,
    private.json_num(p_movie, 'runtime', 1, 1000)::integer,
    case when (p_movie ->> 'release_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_movie ->> 'release_date')::date end,
    coalesce(p_movie, '{}'::jsonb),
    case when p_kind = 'verdict' then p_rating end
  );

  return v_token;
end;
$$;

/**
 * Rattache un lien à son compte, après l'inscription ou depuis un compte existant.
 *
 * Crée (ou retrouve) l'espace avec la personne qui a invité, y met le film, et
 * reporte la réponse donnée sur la page. Rejouable sans effet de bord.
 */
create or replace function public.claim_share_link(p_token text, p_guest_key uuid default null)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_link public.share_links%rowtype;
  v_response public.share_link_responses%rowtype;
  v_space uuid;
  v_movie uuid;
  v_rows integer;
begin
  if v_me is null then raise exception 'not-authenticated'; end if;

  select * into v_link from public.share_links where token = p_token;
  if not found then raise exception 'link-not-found'; end if;
  if v_link.inviter_id = v_me then
    return jsonb_build_object('own', true, 'kind', v_link.kind, 'title', v_link.title);
  end if;
  if v_link.expires_at < now() then raise exception 'link-expired'; end if;
  if not private.not_blocked(v_me, v_link.inviter_id) then raise exception 'blocked'; end if;

  if p_guest_key is not null then
    select * into v_response from public.share_link_responses
    where link_id = v_link.id and guest_key = p_guest_key;
    if found then
      update public.share_link_responses set profile_id = v_me, updated_at = now() where id = v_response.id;
    end if;
  end if;

  -- La personne qui invite est propriétaire de l'espace : c'est elle qui l'a voulu.
  v_space := private.ensure_space_for(v_link.inviter_id, array[v_me]);
  v_movie := private.upsert_shared_movie(
    v_space, v_link.inviter_id, v_link.movie || jsonb_build_object('title', v_link.title),
    case v_link.kind when 'watch' then 'watchlist' else 'watched' end);

  if v_link.kind = 'watch' then
    insert into public.space_movie_votes (movie_id, profile_id, interested)
    values (v_movie, v_link.inviter_id, true)
    on conflict (movie_id, profile_id) do nothing;

    if v_response.interested is true then
      insert into public.space_movie_votes (movie_id, profile_id, interested)
      values (v_movie, v_me, true)
      on conflict (movie_id, profile_id) do update set interested = true;
    elsif v_response.id is null then
      -- Pas de réponse sur la page : l'invitation l'attend dans l'app.
      insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url)
      values (v_me, v_link.inviter_id, 'watch_invite', v_space, v_movie, v_link.title, v_link.poster_url)
      on conflict do nothing;
    end if;
  else
    perform private.put_rating(v_movie, v_link.inviter_id, v_link.inviter_rating);
    -- La demande d'avis est posée pour que la note détaillée, quand elle viendra,
    -- revienne à la personne qui l'a demandée. Déjà lue : la page a fait son office.
    if not exists (select 1 from public.movie_ratings where movie_id = v_movie and profile_id = v_me) then
      insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, read_at)
      values (v_me, v_link.inviter_id, 'verdict_request', v_space, v_movie, v_link.title, v_link.poster_url,
              case when v_response.rating is not null then now() end)
      on conflict do nothing;
    end if;
  end if;

  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, share_link_id, title, poster_url)
  values (v_link.inviter_id, v_me, 'link_joined', v_space, v_movie, v_link.id, v_link.title, v_link.poster_url)
  on conflict do nothing;

  update public.shared_spaces set updated_at = now() where id = v_space;

  return jsonb_build_object(
    'space_id', v_space,
    'shared_movie_id', v_movie,
    'kind', v_link.kind,
    'title', v_link.title,
    'guest_rating', v_response.rating,
    'interested', v_response.interested
  );
end;
$$;

/** Marque des notifications comme lues ; toutes quand `p_ids` est nul. */
create or replace function public.mark_notifications_read(p_ids uuid[] default null)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rows integer;
begin
  if auth.uid() is null then raise exception 'not-authenticated'; end if;
  update public.notifications set read_at = now()
  where recipient_id = auth.uid() and read_at is null
    and (p_ids is null or id = any (p_ids));
  get diagnostics v_rows = row_count;
  return v_rows;
end;
$$;

-- ─── Fonctions de la page du lien (sans compte) ─────────────────────────────

/**
 * Ce que la page montre. Le verdict de la personne qui invite n'est rendu
 * qu'une fois que l'invité (reconnu par `p_guest_key`) a donné sa note.
 */
create or replace function public.get_share_link(p_token text, p_guest_key uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path to ''
as $$
declare
  v_link public.share_links%rowtype;
  v_response public.share_link_responses%rowtype;
  v_inviter text;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' then return null; end if;
  select * into v_link from public.share_links where token = p_token;
  if not found then return null; end if;

  select coalesce(nullif(btrim(first_name), ''), 'Quelqu''un') into v_inviter
  from public.profiles where id = v_link.inviter_id;

  if p_guest_key is not null then
    select * into v_response from public.share_link_responses
    where link_id = v_link.id and guest_key = p_guest_key;
  end if;

  return jsonb_build_object(
    'kind', v_link.kind,
    'inviter', coalesce(v_inviter, 'Quelqu''un'),
    'title', v_link.title,
    'year', v_link.year,
    'media_type', v_link.media_type,
    'tmdb_id', v_link.tmdb_id,
    'poster_url', v_link.poster_url,
    'backdrop_url', v_link.backdrop_url,
    'runtime', v_link.runtime,
    'release_date', v_link.release_date,
    'expired', v_link.expires_at < now(),
    'response', case when v_response.id is null then null else jsonb_build_object(
      'name', v_response.guest_name,
      'interested', v_response.interested,
      'rating', v_response.rating
    ) end,
    'inviter_rating', case when v_response.rating is not null
      then private.public_rating(v_link.inviter_rating) end
  );
end;
$$;

/**
 * Réponse donnée sur la page, sans compte.
 *
 * `p_rating` : une note (film vu, lien « avis »). `p_interested` : « ça me dit »
 * ou « pas cette fois ». Un refus n'envoie rien à la personne qui invite.
 */
create or replace function public.answer_share_link(
  p_token text,
  p_guest_key uuid,
  p_name text,
  p_interested boolean default null,
  p_rating numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_link public.share_links%rowtype;
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]<>]', '', 'g')), 30);
  v_rating numeric(3, 1);
  v_response uuid;
  v_existing boolean;
begin
  if p_token is null or p_token !~ '^[A-Za-z0-9_-]{22}$' or p_guest_key is null then
    raise exception 'invalid-request';
  end if;
  select * into v_link from public.share_links where token = p_token;
  if not found then raise exception 'link-not-found'; end if;
  if v_link.expires_at < now() then raise exception 'link-expired'; end if;

  if p_rating is not null then
    v_rating := round(greatest(0, least(10, p_rating)) * 2) / 2.0;
  end if;
  if v_rating is null and p_interested is null then raise exception 'empty-answer'; end if;
  if v_link.kind = 'watch' then v_rating := null; end if;
  -- Un « oui » ou une note se signent d'un prénom ; un refus peut rester anonyme.
  if v_name = '' then
    if v_rating is not null or p_interested is true then raise exception 'name-required'; end if;
    v_name := 'Anonyme';
  end if;

  select exists (
    select 1 from public.share_link_responses where link_id = v_link.id and guest_key = p_guest_key
  ) into v_existing;
  if not v_existing and (select count(*) from public.share_link_responses where link_id = v_link.id) >= 30 then
    raise exception 'rate-limited';
  end if;

  insert into public.share_link_responses (link_id, guest_key, guest_name, interested, rating)
  values (v_link.id, p_guest_key, v_name, p_interested, v_rating)
  on conflict (link_id, guest_key) do update
    set guest_name = excluded.guest_name,
        interested = excluded.interested,
        rating = coalesce(excluded.rating, public.share_link_responses.rating),
        updated_at = now()
  returning id into v_response;

  if v_rating is not null or p_interested is true then
    insert into public.notifications (recipient_id, kind, share_link_id, share_response_id, title, poster_url, guest_name, rating)
    values (v_link.inviter_id, 'link_answered', v_link.id, v_response, v_link.title, v_link.poster_url, v_name, v_rating)
    on conflict (share_response_id) where kind = 'link_answered'
      do update set guest_name = excluded.guest_name, rating = coalesce(excluded.rating, public.notifications.rating);
  end if;

  return jsonb_build_object(
    'ok', true,
    'inviter_rating', case when v_rating is not null then private.public_rating(v_link.inviter_rating) end
  );
end;
$$;

-- ─── Réponses dans l'app : les votes et les verdicts existants ──────────────

/** « Partant » sur un film proposé : prévenir la personne qui l'a proposé. */
create or replace function private.on_vote_answer_invite()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  if new.interested then
    insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url)
    select n.actor_id, new.profile_id, 'watch_accepted', n.space_id, n.shared_movie_id, n.title, n.poster_url
    from public.notifications n
    where n.kind = 'watch_invite' and n.shared_movie_id = new.movie_id
      and n.recipient_id = new.profile_id and n.actor_id is not null
    on conflict do nothing;
  end if;

  -- Oui ou non, l'invitation a trouvé sa réponse.
  update public.notifications set read_at = coalesce(read_at, now())
  where kind = 'watch_invite' and shared_movie_id = new.movie_id and recipient_id = new.profile_id;

  return new;
end;
$$;

drop trigger if exists space_movie_votes_answer_invite on public.space_movie_votes;
create trigger space_movie_votes_answer_invite
  after insert or update of interested on public.space_movie_votes
  for each row execute function private.on_vote_answer_invite();

/** Verdict posé sur un film dont on avait demandé l'avis : le renvoyer au demandeur. */
create or replace function private.on_rating_answer_request()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, rating)
  select n.actor_id, new.profile_id, 'verdict_given', n.space_id, n.shared_movie_id, n.title, n.poster_url,
    private.overall_rating(new.story, new.visuals, new.acting, new.sound, new.adaptive_rating)
  from public.notifications n
  where n.kind = 'verdict_request' and n.shared_movie_id = new.movie_id
    and n.recipient_id = new.profile_id and n.actor_id is not null
  on conflict do nothing;

  update public.notifications set read_at = coalesce(read_at, now())
  where kind = 'verdict_request' and shared_movie_id = new.movie_id and recipient_id = new.profile_id;

  return new;
end;
$$;

drop trigger if exists movie_ratings_answer_request on public.movie_ratings;
create trigger movie_ratings_answer_request
  after insert on public.movie_ratings
  for each row execute function private.on_rating_answer_request();

-- ─── Envoi en push ──────────────────────────────────────────────────────────

-- Même mécanique que l'alerte de signalement : pg_net, asynchrone, jeton de
-- worker. Toute erreur est avalée : une notification sans push reste une
-- notification, visible dans la cloche.
create or replace function private.push_new_notification()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  begin
    perform net.http_post(
      url := 'https://tnvnmsevddvcklkitnpa.supabase.co/functions/v1/notify',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'notificationId', new.id,
        'workerToken', (select worker_token from public.push_worker_credentials where singleton)
      )
    );
  exception when others then
    raise warning '[notify] appel impossible : %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists notifications_push on public.notifications;
create trigger notifications_push
  after insert on public.notifications
  for each row execute function private.push_new_notification();

-- ─── Purge ──────────────────────────────────────────────────────────────────

-- Les réponses sans compte (un prénom, une note) ne sont gardées que le temps
-- utile : trente jours après l'expiration du lien, le lien et ses réponses
-- disparaissent. Les notifications lues de plus de six mois aussi.
create or replace function private.purge_share_links()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_count integer;
begin
  delete from public.share_links where expires_at < now() - interval '30 days';
  get diagnostics v_count = row_count;
  delete from public.notifications where read_at < now() - interval '180 days';
  return v_count;
end;
$$;

-- ─── Droits ─────────────────────────────────────────────────────────────────

revoke execute on function private.not_blocked(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.are_co_members(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.overall_rating(numeric, numeric, numeric, numeric, jsonb) from public, anon, authenticated;
revoke execute on function private.json_num(jsonb, text, numeric, numeric) from public, anon, authenticated;
revoke execute on function private.ensure_space_for(uuid, uuid[]) from public, anon, authenticated;
revoke execute on function private.upsert_shared_movie(uuid, uuid, jsonb, text) from public, anon, authenticated;
revoke execute on function private.put_rating(uuid, uuid, jsonb) from public, anon, authenticated;
revoke execute on function private.public_rating(jsonb) from public, anon, authenticated;
revoke execute on function private.on_vote_answer_invite() from public, anon, authenticated;
revoke execute on function private.on_rating_answer_request() from public, anon, authenticated;
revoke execute on function private.push_new_notification() from public, anon, authenticated;
revoke execute on function private.purge_share_links() from public, anon, authenticated;

revoke execute on function public.get_watch_companions() from public, anon;
revoke execute on function public.propose_to_people(text, jsonb, uuid[], jsonb) from public, anon;
revoke execute on function public.create_share_link(text, jsonb, jsonb) from public, anon;
revoke execute on function public.claim_share_link(text, uuid) from public, anon;
revoke execute on function public.mark_notifications_read(uuid[]) from public, anon;
grant execute on function public.get_watch_companions() to authenticated;
grant execute on function public.propose_to_people(text, jsonb, uuid[], jsonb) to authenticated;
grant execute on function public.create_share_link(text, jsonb, jsonb) to authenticated;
grant execute on function public.claim_share_link(text, uuid) to authenticated;
grant execute on function public.mark_notifications_read(uuid[]) to authenticated;

-- Les deux seules portes ouvertes sans compte : lire un lien, y répondre.
revoke execute on function public.get_share_link(text, uuid) from public;
revoke execute on function public.answer_share_link(text, uuid, text, boolean, numeric) from public;
grant execute on function public.get_share_link(text, uuid) to anon, authenticated;
grant execute on function public.answer_share_link(text, uuid, text, boolean, numeric) to anon, authenticated;

-- ─── Temps réel et planification ────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'notifications'
     ) then
    alter publication supabase_realtime add table public.notifications;
  end if;
end $$;

select cron.schedule('bitter-purge-liens-partage', '50 4 * * *', $$ select private.purge_share_links(); $$);
