-- « Le film que tu attends est là ».
--
-- Trois signaux, tous tirés de la liste « à voir » personnelle (`user_movies`) :
-- - envie commune : quelqu'un de tes espaces a le même film dans sa liste ;
-- - sortie en salle : le film sort aujourd'hui en France ;
-- - arrivée en streaming : le film arrive sur une plateforme d'abonnement en France.
--
-- Les deux derniers viennent de TMDB (données JustWatch pour le streaming), lues
-- chaque matin par l'Edge Function `availability`. `tmdb_availability` garde le
-- dernier état connu : c'est la différence avec la veille qui fait la nouvelle.
--
-- Rien de neuf n'est exposé : les membres d'un même espace voient déjà la
-- collection les uns des autres (politique « Space members can view each other
-- movies » sur `user_movies`).

-- ─── Nouvelles sortes de notifications ──────────────────────────────────────

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'watch_invite', 'watch_accepted', 'verdict_request', 'verdict_given', 'link_answered', 'link_joined',
  'plan_proposed', 'plan_agreed', 'plan_cancelled', 'plan_rate',
  'common_wish',    -- X veut aussi voir un film de ta liste
  'release_today',  -- un film de ta liste sort aujourd'hui en salle
  'now_streaming'   -- un film de ta liste arrive sur une plateforme
));

-- Une seule fois par personne, par film (et par autre personne, ou par nouvelle
-- plateforme) : une resynchronisation de la collection ne rejoue rien.
create unique index if not exists notifications_once_common_wish
  on public.notifications (recipient_id, actor_id, (payload ->> 'media_type'), (payload ->> 'tmdb_id'))
  where kind = 'common_wish';
create unique index if not exists notifications_once_availability
  on public.notifications (recipient_id, kind, (payload ->> 'media_type'), (payload ->> 'tmdb_id'), (payload ->> 'key'))
  where kind in ('release_today', 'now_streaming');

-- ─── Dernier état connu de chaque film ──────────────────────────────────────

create table if not exists public.tmdb_availability (
  media_type text not null default 'movie' check (media_type in ('movie', 'tv')),
  tmdb_id integer not null,
  region text not null default 'FR',
  release_date date,
  providers text[] not null default '{}',
  checked_at timestamptz not null default now(),
  primary key (media_type, tmdb_id, region)
);
alter table public.tmdb_availability enable row level security;
revoke all on table public.tmdb_availability from anon, authenticated;

-- ─── Envies communes ────────────────────────────────────────────────────────

/** Ce que tes proches ont aussi dans leur liste, parmi les films de la tienne. */
create or replace function public.get_common_wishes()
returns table (media_type text, tmdb_id integer, profile_id uuid, first_name text, avatar_url text)
language sql
stable
security definer
set search_path to ''
as $$
  select distinct coalesce(mine.media_type, 'movie'), mine.tmdb_id, them.profile_id,
    coalesce(nullif(btrim(p.first_name), ''), 'Membre'), p.avatar_url
  from public.user_movies mine
  join public.user_movies them
    on them.tmdb_id = mine.tmdb_id
   and coalesce(them.media_type, 'movie') = coalesce(mine.media_type, 'movie')
   and them.profile_id <> mine.profile_id
  join public.profiles p on p.id = them.profile_id
  where (select auth.uid()) is not null
    and mine.profile_id = (select auth.uid())
    and mine.status = 'watchlist' and mine.deleted_at is null and mine.season_number is null and mine.tmdb_id is not null
    and them.status = 'watchlist' and them.deleted_at is null and them.season_number is null
    and private.are_co_members(mine.profile_id, them.profile_id)
    and private.not_blocked(mine.profile_id, them.profile_id);
$$;

/**
 * Un film entre dans une liste « à voir » : prévenir, dans les deux sens, les
 * proches qui l'ont déjà. La resynchronisation complète au démarrage de l'app
 * repasse ici pour chaque film ; l'index unique en fait un simple rattrapage.
 */
create or replace function private.on_watchlist_common_wish()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_other record;
  v_media text := coalesce(new.media_type, 'movie');
begin
  if new.status <> 'watchlist' or new.deleted_at is not null or new.season_number is not null or new.tmdb_id is null then
    return new;
  end if;

  for v_other in
    select them.profile_id, them.title, them.poster_url
    from public.user_movies them
    where them.tmdb_id = new.tmdb_id and coalesce(them.media_type, 'movie') = v_media
      and them.profile_id <> new.profile_id
      and them.status = 'watchlist' and them.deleted_at is null and them.season_number is null
      and private.are_co_members(new.profile_id, them.profile_id)
      and private.not_blocked(new.profile_id, them.profile_id)
  loop
    insert into public.notifications (recipient_id, actor_id, kind, title, poster_url, payload)
    values
      (v_other.profile_id, new.profile_id, 'common_wish', coalesce(v_other.title, new.title),
       coalesce(v_other.poster_url, new.poster_url), jsonb_build_object('media_type', v_media, 'tmdb_id', new.tmdb_id)),
      (new.profile_id, v_other.profile_id, 'common_wish', new.title,
       new.poster_url, jsonb_build_object('media_type', v_media, 'tmdb_id', new.tmdb_id))
    on conflict do nothing;
  end loop;
  return new;
end;
$$;

drop trigger if exists user_movies_common_wish on public.user_movies;
create trigger user_movies_common_wish
  after insert or update of status, deleted_at on public.user_movies
  for each row execute function private.on_watchlist_common_wish();

-- ─── Sorties et streaming : appelés par l'Edge Function `availability` ──────

/** Les films à surveiller : ceux d'au moins une liste « à voir ». */
create or replace function public.availability_candidates()
returns table (media_type text, tmdb_id integer, release_date date, providers text[], known boolean)
language sql
stable
security definer
set search_path to ''
as $$
  select w.media_type, w.tmdb_id, a.release_date, coalesce(a.providers, '{}'), a.tmdb_id is not null
  from (
    select distinct coalesce(m.media_type, 'movie') as media_type, m.tmdb_id
    from public.user_movies m
    where m.status = 'watchlist' and m.deleted_at is null and m.season_number is null and m.tmdb_id is not null
      and coalesce(m.media_type, 'movie') = 'movie'
  ) w
  left join public.tmdb_availability a
    on a.media_type = w.media_type and a.tmdb_id = w.tmdb_id and a.region = 'FR'
  order by a.checked_at nulls first
  limit 300;
$$;

/**
 * Enregistre le nouvel état d'un film et prévient qui l'attend.
 *
 * `p_kind` nul : simple mise à jour de l'état (premier passage, rien de neuf).
 * Chaque personne reçoit, dans `also`, les prénoms de ses proches qui l'attendent
 * aussi : c'est ce qui transforme « il sort » en « on y va ensemble ».
 */
create or replace function public.record_availability(
  p_media_type text, p_tmdb_id integer, p_release_date date, p_providers text[],
  p_kind text default null, p_key text default null, p_new_providers text[] default null
)
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row record;
  v_count integer := 0;
  v_rows integer;
begin
  insert into public.tmdb_availability (media_type, tmdb_id, region, release_date, providers, checked_at)
  values (p_media_type, p_tmdb_id, 'FR', p_release_date, coalesce(p_providers, '{}'), now())
  on conflict (media_type, tmdb_id, region) do update
    set release_date = excluded.release_date, providers = excluded.providers, checked_at = now();

  if p_kind is null or p_kind not in ('release_today', 'now_streaming') then return 0; end if;

  for v_row in
    select m.profile_id, m.title, m.poster_url
    from public.user_movies m
    where m.tmdb_id = p_tmdb_id and coalesce(m.media_type, 'movie') = p_media_type
      and m.status = 'watchlist' and m.deleted_at is null and m.season_number is null
  loop
    insert into public.notifications (recipient_id, kind, title, poster_url, payload)
    values (
      v_row.profile_id, p_kind, v_row.title, v_row.poster_url,
      jsonb_build_object(
        'media_type', p_media_type,
        'tmdb_id', p_tmdb_id,
        'key', coalesce(p_key, ''),
        'providers', to_jsonb(coalesce(p_new_providers, '{}'::text[])),
        'also', coalesce((
          select jsonb_agg(distinct coalesce(nullif(btrim(p.first_name), ''), 'Membre'))
          from public.user_movies o
          join public.profiles p on p.id = o.profile_id
          where o.tmdb_id = p_tmdb_id and coalesce(o.media_type, 'movie') = p_media_type
            and o.profile_id <> v_row.profile_id
            and o.status = 'watchlist' and o.deleted_at is null and o.season_number is null
            and private.are_co_members(v_row.profile_id, o.profile_id)
            and private.not_blocked(v_row.profile_id, o.profile_id)
        ), '[]'::jsonb)
      )
    )
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;
  end loop;
  return v_count;
end;
$$;

-- ─── Droits ─────────────────────────────────────────────────────────────────

revoke execute on function public.get_common_wishes() from public, anon;
grant execute on function public.get_common_wishes() to authenticated;
revoke execute on function private.on_watchlist_common_wish() from public, anon, authenticated;
-- Appelées par l'Edge Function, qui passe par l'API REST : elles vivent donc
-- dans `public`, mais seul `service_role` peut les exécuter.
revoke execute on function public.availability_candidates() from public, anon, authenticated;
revoke execute on function public.record_availability(text, integer, date, text[], text, text, text[]) from public, anon, authenticated;
grant execute on function public.availability_candidates() to service_role;
grant execute on function public.record_availability(text, integer, date, text[], text, text, text[]) to service_role;

-- ─── Chaque matin ───────────────────────────────────────────────────────────

-- 7 h UTC : 9 h à Paris l'été, 8 h l'hiver. Avant de partir travailler, pas au milieu de la nuit.
select cron.schedule(
  'bitter-film-attendu',
  '0 7 * * *',
  $$
    select net.http_post(
      url := 'https://tnvnmsevddvcklkitnpa.supabase.co/functions/v1/availability',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'workerToken', (select worker_token from public.push_worker_credentials where singleton)
      )
    );
  $$
);
