-- La séance à deux : après « ça me dit », « on y va quand ? ».
--
-- Une proposition de sortie (`watch_plans`) porte un à trois créneaux
-- (`watch_plan_slots`). Choisir un créneau l'arrête : la séance entre alors dans
-- le calendrier de chacun (`cinema_screenings`, rappels compris), et chacun
-- garde son lien de réservation. Le lendemain matin, on demande à chacun sa note.
--
-- Une proposition peut naître :
-- - avec l'invitation elle-même (`propose_to_people`, `create_share_link`) ;
-- - après un oui, depuis l'espace ou la cloche (`propose_plan`).
--
-- Comme pour les invitations, aucune écriture directe depuis l'app : tout passe
-- par les fonctions ci-dessous.

-- ─── Tables ─────────────────────────────────────────────────────────────────

create table if not exists public.watch_plans (
  id uuid primary key default gen_random_uuid(),
  proposer_id uuid not null references public.profiles (id) on delete cascade,
  space_id uuid references public.shared_spaces (id) on delete cascade,
  shared_movie_id uuid references public.shared_movies (id) on delete cascade,
  -- Proposition jointe à un lien : l'espace n'existe pas encore, il naîtra au
  -- rattachement du lien.
  share_link_id uuid references public.share_links (id) on delete cascade,
  title text not null,
  poster_url text,
  status text not null default 'open' check (status in ('open', 'agreed', 'replaced', 'cancelled')),
  chosen_slot_id uuid,
  -- Qui y va : la personne qui propose, puis chaque personne qui accepte.
  participant_ids uuid[] not null default '{}',
  rate_prompted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (shared_movie_id is not null or share_link_id is not null)
);

create table if not exists public.watch_plan_slots (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.watch_plans (id) on delete cascade,
  position smallint not null check (position between 1 and 3),
  starts_at timestamptz not null,
  cinema_name text check (char_length(cinema_name) <= 120),
  -- Séance UGC réelle : de quoi retrouver la réservation. Absents pour une
  -- séance saisie à la main.
  cinema_id text,
  showtime_id text,
  version text,
  booking_url text,
  unique (plan_id, position)
);

alter table public.watch_plans drop constraint if exists watch_plans_chosen_slot_fkey;
alter table public.watch_plans
  add constraint watch_plans_chosen_slot_fkey
  foreign key (chosen_slot_id) references public.watch_plan_slots (id) on delete set null;

create index if not exists watch_plans_space_idx on public.watch_plans (space_id, created_at desc);
create index if not exists watch_plans_movie_idx on public.watch_plans (shared_movie_id);
create index if not exists watch_plans_link_idx on public.watch_plans (share_link_id);
create index if not exists watch_plans_proposer_idx on public.watch_plans (proposer_id);
create index if not exists watch_plans_chosen_idx on public.watch_plans (chosen_slot_id);
create index if not exists watch_plan_slots_plan_idx on public.watch_plan_slots (plan_id);
-- Une seule proposition ouverte par film : la suivante remplace la précédente.
create unique index if not exists watch_plans_one_open_per_movie
  on public.watch_plans (shared_movie_id) where status = 'open' and shared_movie_id is not null;

alter table public.cinema_screenings add column if not exists plan_id uuid references public.watch_plans (id) on delete set null;
alter table public.cinema_screenings add column if not exists booking_url text;
create unique index if not exists cinema_screenings_one_per_plan
  on public.cinema_screenings (plan_id, profile_id) where plan_id is not null;

alter table public.share_links add column if not exists plan_id uuid references public.watch_plans (id) on delete set null;
alter table public.share_link_responses add column if not exists slot_id uuid references public.watch_plan_slots (id) on delete set null;
create index if not exists share_links_plan_idx on public.share_links (plan_id);
create index if not exists share_link_responses_slot_idx on public.share_link_responses (slot_id);

alter table public.notifications add column if not exists plan_id uuid references public.watch_plans (id) on delete cascade;
-- Ce qu'il faut pour écrire « samedi 20 h 30 · UGC Talence » sans relire la proposition.
alter table public.notifications add column if not exists payload jsonb;
create index if not exists notifications_plan_idx on public.notifications (plan_id);

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind in (
  'watch_invite', 'watch_accepted', 'verdict_request', 'verdict_given', 'link_answered', 'link_joined',
  'plan_proposed',   -- X propose une séance
  'plan_agreed',     -- X a choisi un créneau : c'est calé
  'plan_cancelled',  -- X a annulé la séance
  'plan_rate'        -- vous l'avez vu : note-le pour découvrir sa note
));

alter table public.watch_plans enable row level security;
alter table public.watch_plan_slots enable row level security;
revoke all on table public.watch_plans from anon, authenticated;
revoke all on table public.watch_plan_slots from anon, authenticated;
grant select on table public.watch_plans to authenticated;
grant select on table public.watch_plan_slots to authenticated;

drop policy if exists "plans: membres de l'espace" on public.watch_plans;
create policy "plans: membres de l'espace"
  on public.watch_plans for select to authenticated
  using (
    proposer_id = (select auth.uid())
    or (space_id is not null and public.is_member_of_space(space_id))
  );

drop policy if exists "créneaux: comme leur proposition" on public.watch_plan_slots;
create policy "créneaux: comme leur proposition"
  on public.watch_plan_slots for select to authenticated
  using (exists (
    select 1 from public.watch_plans p
    where p.id = plan_id
      and (p.proposer_id = (select auth.uid()) or (p.space_id is not null and public.is_member_of_space(p.space_id)))
  ));

-- ─── Outils internes ────────────────────────────────────────────────────────

/** Proposition lisible d'un bloc : créneaux, statut, créneau retenu. */
create or replace function private.plan_payload(p_plan uuid)
returns jsonb
language sql
stable
security definer
set search_path to ''
as $$
  select jsonb_build_object(
    'plan_id', p.id,
    'status', p.status,
    'proposer_id', p.proposer_id,
    'chosen_slot_id', p.chosen_slot_id,
    'slots', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id, 'starts_at', s.starts_at, 'cinema_name', s.cinema_name,
        'version', s.version, 'booking_url', s.booking_url
      ) order by s.position)
      from public.watch_plan_slots s where s.plan_id = p.id
    ), '[]'::jsonb)
  )
  from public.watch_plans p where p.id = p_plan;
$$;

/**
 * Crée une proposition et ses créneaux. Chaque créneau est borné : dans le
 * futur (dix minutes au moins, quatre-vingt-dix jours au plus), un lieu court,
 * un lien de réservation UGC ou rien.
 */
create or replace function private.insert_plan(
  p_proposer uuid, p_space uuid, p_movie uuid, p_link uuid, p_title text, p_poster text, p_slots jsonb
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan uuid;
  v_slot jsonb;
  v_starts timestamptz;
  v_position smallint := 0;
  v_seen timestamptz[] := '{}';
begin
  if p_slots is null or jsonb_typeof(p_slots) <> 'array' or jsonb_array_length(p_slots) = 0 then
    raise exception 'invalid-slots';
  end if;

  if p_movie is not null then
    -- Une séance déjà calée et à venir ne se remplace pas en silence : il faut
    -- l'annuler d'abord, pour que tout le monde le sache.
    if exists (
      select 1 from public.watch_plans p
      join public.watch_plan_slots s on s.id = p.chosen_slot_id
      where p.shared_movie_id = p_movie and p.status = 'agreed' and s.starts_at > now()
    ) then
      raise exception 'plan-already-agreed';
    end if;
    update public.watch_plans set status = 'replaced', updated_at = now()
      where shared_movie_id = p_movie and status = 'open';
  end if;

  insert into public.watch_plans (proposer_id, space_id, shared_movie_id, share_link_id, title, poster_url, participant_ids)
  values (p_proposer, p_space, p_movie, p_link, left(p_title, 240), p_poster, array[p_proposer])
  returning id into v_plan;

  for v_slot in select value from jsonb_array_elements(p_slots) loop
    exit when v_position >= 3;
    if jsonb_typeof(v_slot) <> 'object'
       or coalesce(v_slot ->> 'starts_at', '') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}' then
      continue;
    end if;
    v_starts := (v_slot ->> 'starts_at')::timestamptz;
    if v_starts < now() + interval '10 minutes' or v_starts > now() + interval '90 days' or v_starts = any (v_seen) then
      continue;
    end if;
    v_seen := v_seen || v_starts;
    v_position := v_position + 1;
    insert into public.watch_plan_slots (plan_id, position, starts_at, cinema_name, cinema_id, showtime_id, version, booking_url)
    values (
      v_plan, v_position, v_starts,
      nullif(left(btrim(regexp_replace(coalesce(v_slot ->> 'cinema_name', ''), '[[:cntrl:]<>]', '', 'g')), 120), ''),
      case when (v_slot ->> 'cinema_id') ~ '^[0-9]{1,6}$' then v_slot ->> 'cinema_id' end,
      case when (v_slot ->> 'showtime_id') ~ '^[A-Za-z0-9_-]{1,40}$' then v_slot ->> 'showtime_id' end,
      nullif(left(btrim(regexp_replace(coalesce(v_slot ->> 'version', ''), '[[:cntrl:]<>]', '', 'g')), 20), ''),
      case when (v_slot ->> 'booking_url') ~ '^https://www\.ugc\.fr/[A-Za-z0-9._/?=&%-]{1,250}$' then v_slot ->> 'booking_url' end
    );
  end loop;

  if v_position = 0 then
    raise exception 'invalid-slots';
  end if;
  return v_plan;
end;
$$;

/** La séance entre dans le calendrier d'une personne, rappels compris. */
create or replace function private.add_plan_screening(p_plan uuid, p_profile uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan public.watch_plans%rowtype;
  v_slot public.watch_plan_slots%rowtype;
  v_tmdb integer;
  v_others text;
begin
  select * into v_plan from public.watch_plans where id = p_plan;
  select * into v_slot from public.watch_plan_slots where id = v_plan.chosen_slot_id;
  if v_slot.id is null or v_slot.starts_at < now() then return; end if;

  select tmdb_id into v_tmdb from public.shared_movies where id = v_plan.shared_movie_id;
  if v_tmdb is null then
    select tmdb_id into v_tmdb from public.share_links where id = v_plan.share_link_id;
  end if;

  select string_agg(coalesce(nullif(btrim(p.first_name), ''), 'Membre'), ', ' order by p.first_name)
    into v_others
  from public.profiles p
  where p.id = any (v_plan.participant_ids) and p.id <> p_profile;

  insert into public.cinema_screenings (
    profile_id, tmdb_id, title, poster_url, starts_at, cinema_name, format, notes, status, plan_id, booking_url
  ) values (
    p_profile, v_tmdb, v_plan.title, v_plan.poster_url, v_slot.starts_at, v_slot.cinema_name, v_slot.version,
    case when v_others is not null then left('Avec ' || v_others, 1000) end,
    'scheduled', p_plan, v_slot.booking_url
  )
  on conflict (plan_id, profile_id) where plan_id is not null do nothing;
end;
$$;

/**
 * Remplace la notification d'une même sorte pour une même personne et un même
 * film : une contre-proposition doit repartir en push, ce qu'un simple
 * `on conflict do update` ne ferait pas (le trigger d'envoi est sur INSERT).
 */
create or replace function private.notify_plan(
  p_recipient uuid, p_actor uuid, p_kind text, p_plan uuid
)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan public.watch_plans%rowtype;
begin
  select * into v_plan from public.watch_plans where id = p_plan;
  if v_plan.id is null or p_recipient = p_actor then return; end if;

  delete from public.notifications
  where recipient_id = p_recipient and kind = p_kind
    and ((v_plan.shared_movie_id is not null and shared_movie_id = v_plan.shared_movie_id)
         or plan_id = p_plan);

  insert into public.notifications (
    recipient_id, actor_id, kind, space_id, shared_movie_id, share_link_id, plan_id, title, poster_url, payload
  ) values (
    p_recipient, p_actor, p_kind, v_plan.space_id, v_plan.shared_movie_id, v_plan.share_link_id, p_plan,
    v_plan.title, v_plan.poster_url, private.plan_payload(p_plan)
  )
  on conflict do nothing;
end;
$$;

/**
 * Arrête la proposition sur un créneau, ou y ajoute une personne si elle est
 * déjà arrêtée sur ce même créneau. `p_participant` nul : réponse sans compte,
 * seule la personne qui propose reçoit la séance.
 */
create or replace function private.agree_plan(p_plan uuid, p_slot uuid, p_participant uuid)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan public.watch_plans%rowtype;
  v_slot_start timestamptz;
begin
  select * into v_plan from public.watch_plans where id = p_plan for update;
  if v_plan.id is null then raise exception 'plan-not-found'; end if;
  select starts_at into v_slot_start from public.watch_plan_slots where id = p_slot and plan_id = p_plan;
  if v_slot_start is null then raise exception 'slot-not-found'; end if;
  if v_slot_start < now() then raise exception 'slot-past'; end if;

  if v_plan.status = 'open' then
    update public.watch_plans
      set status = 'agreed', chosen_slot_id = p_slot, updated_at = now(),
          participant_ids = case when p_participant is null or p_participant = any (participant_ids)
                                 then participant_ids else participant_ids || p_participant end
      where id = p_plan;
    perform private.add_plan_screening(p_plan, v_plan.proposer_id);
    if p_participant is not null then perform private.add_plan_screening(p_plan, p_participant); end if;
    -- La note de chacun dans le calendrier nomme les autres : on la réécrit
    -- pour la personne qui propose, maintenant qu'on sait qui vient.
    update public.cinema_screenings c set notes = left('Avec ' || (
        select string_agg(coalesce(nullif(btrim(p.first_name), ''), 'Membre'), ', ' order by p.first_name)
        from public.profiles p, public.watch_plans w
        where w.id = p_plan and p.id = any (w.participant_ids) and p.id <> c.profile_id
      ), 1000)
      where c.plan_id = p_plan and exists (
        select 1 from public.watch_plans w where w.id = p_plan and cardinality(w.participant_ids) > 1
      );
    return 'agreed';
  elsif v_plan.status = 'agreed' and v_plan.chosen_slot_id = p_slot then
    if p_participant is not null and not (p_participant = any (v_plan.participant_ids)) then
      update public.watch_plans set participant_ids = participant_ids || p_participant, updated_at = now()
        where id = p_plan;
      perform private.add_plan_screening(p_plan, p_participant);
    end if;
    return 'joined';
  else
    raise exception 'plan-closed';
  end if;
end;
$$;

-- ─── Fonctions appelées par l'app ───────────────────────────────────────────

/** Proposer une séance pour un film de l'espace, après un oui. */
create or replace function public.propose_plan(p_shared_movie_id uuid, p_slots jsonb)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_movie public.shared_movies%rowtype;
  v_plan uuid;
  v_other uuid;
begin
  if v_me is null then raise exception 'not-authenticated'; end if;
  select * into v_movie from public.shared_movies where id = p_shared_movie_id;
  if v_movie.id is null then raise exception 'movie-not-found'; end if;
  if not exists (
    select 1 from public.space_members
    where space_id = v_movie.space_id and profile_id = v_me and is_active
  ) then
    raise exception 'not-a-member';
  end if;
  if (select count(*) from public.watch_plans where proposer_id = v_me and created_at > now() - interval '1 day') >= 20 then
    raise exception 'rate-limited';
  end if;

  v_plan := private.insert_plan(v_me, v_movie.space_id, v_movie.id, null, v_movie.title, v_movie.poster_url, p_slots);

  insert into public.space_movie_votes (movie_id, profile_id, interested)
  values (v_movie.id, v_me, true)
  on conflict (movie_id, profile_id) do update set interested = true;

  -- Tout l'espace, sauf qui a déjà dit non au film et qui a bloqué.
  for v_other in
    select m.profile_id from public.space_members m
    where m.space_id = v_movie.space_id and m.is_active and m.profile_id <> v_me
      and private.not_blocked(v_me, m.profile_id)
      and not exists (
        select 1 from public.space_movie_votes v
        where v.movie_id = v_movie.id and v.profile_id = m.profile_id and not v.interested
      )
  loop
    perform private.notify_plan(v_other, v_me, 'plan_proposed', v_plan);
  end loop;

  update public.shared_spaces set updated_at = now() where id = v_movie.space_id;
  return private.plan_payload(v_plan);
end;
$$;

/** « Ça me va » sur un créneau : la séance est calée pour les deux. */
create or replace function public.accept_plan_slot(p_slot_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_plan public.watch_plans%rowtype;
  v_result text;
begin
  if v_me is null then raise exception 'not-authenticated'; end if;
  select p.* into v_plan from public.watch_plans p
    join public.watch_plan_slots s on s.plan_id = p.id
    where s.id = p_slot_id;
  if v_plan.id is null or v_plan.space_id is null then raise exception 'plan-not-found'; end if;
  if not exists (
    select 1 from public.space_members
    where space_id = v_plan.space_id and profile_id = v_me and is_active
  ) then
    raise exception 'not-a-member';
  end if;
  if v_plan.proposer_id = v_me then raise exception 'own-plan'; end if;

  v_result := private.agree_plan(v_plan.id, p_slot_id, v_me);

  -- Choisir un créneau, c'est aussi dire oui au film (et répondre à l'invitation).
  if v_plan.shared_movie_id is not null then
    insert into public.space_movie_votes (movie_id, profile_id, interested)
    values (v_plan.shared_movie_id, v_me, true)
    on conflict (movie_id, profile_id) do update set interested = true;
  end if;

  update public.notifications set read_at = coalesce(read_at, now())
  where recipient_id = v_me and plan_id = v_plan.id and kind = 'plan_proposed';

  perform private.notify_plan(v_plan.proposer_id, v_me, 'plan_agreed', v_plan.id);
  return private.plan_payload(v_plan.id) || jsonb_build_object('result', v_result);
end;
$$;

/** Annuler la séance : la personne qui propose, ou quelqu'un qui y allait. */
create or replace function public.cancel_plan(p_plan_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_plan public.watch_plans%rowtype;
  v_other uuid;
begin
  if v_me is null then raise exception 'not-authenticated'; end if;
  select * into v_plan from public.watch_plans where id = p_plan_id for update;
  if v_plan.id is null then raise exception 'plan-not-found'; end if;
  if v_plan.proposer_id <> v_me and not (v_me = any (v_plan.participant_ids)) then
    raise exception 'not-a-participant';
  end if;
  if v_plan.status not in ('open', 'agreed') then return private.plan_payload(p_plan_id); end if;

  update public.watch_plans set status = 'cancelled', updated_at = now() where id = p_plan_id;
  -- Le trigger des rappels range en « ignoré » tout ce qui n'était pas parti.
  update public.cinema_screenings set status = 'cancelled' where plan_id = p_plan_id and status <> 'cancelled';

  -- Prévenir qui y allait ; pour une proposition encore ouverte, personne n'a rien calé.
  if v_plan.status = 'agreed' then
    foreach v_other in array v_plan.participant_ids loop
      perform private.notify_plan(v_other, v_me, 'plan_cancelled', p_plan_id);
    end loop;
  end if;
  update public.notifications set read_at = coalesce(read_at, now())
    where plan_id = p_plan_id and kind = 'plan_proposed';
  return private.plan_payload(p_plan_id);
end;
$$;

-- ─── Invitations : la séance peut partir avec ───────────────────────────────

drop function if exists public.propose_to_people(text, jsonb, uuid[], jsonb);

create or replace function public.propose_to_people(
  p_kind text,
  p_movie jsonb,
  p_invitees uuid[],
  p_rating jsonb default null,
  p_slots jsonb default null
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
  v_plan uuid;
  v_payload jsonb;
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

  -- La séance part avec l'invitation : une seule notification la porte.
  if p_kind = 'watch' and p_slots is not null and jsonb_typeof(p_slots) = 'array' and jsonb_array_length(p_slots) > 0 then
    v_plan := private.insert_plan(v_me, v_space, v_movie, null, v_title, v_poster, p_slots);
    v_payload := private.plan_payload(v_plan);
  end if;

  foreach v_other in array v_others loop
    if v_plan is not null then
      delete from public.notifications
        where recipient_id = v_other and actor_id = v_me and kind = 'watch_invite' and shared_movie_id = v_movie;
    end if;
    insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, plan_id, title, poster_url, payload)
    values (v_other, v_me, case p_kind when 'watch' then 'watch_invite' else 'verdict_request' end,
            v_space, v_movie, v_plan, v_title, v_poster, v_payload)
    on conflict do nothing;
    get diagnostics v_rows = row_count;
    v_sent := v_sent + v_rows;
  end loop;

  update public.shared_spaces set updated_at = now() where id = v_space;

  return jsonb_build_object('space_id', v_space, 'shared_movie_id', v_movie, 'sent', v_sent, 'plan_id', v_plan);
end;
$$;

drop function if exists public.create_share_link(text, jsonb, jsonb);

create or replace function public.create_share_link(
  p_kind text, p_movie jsonb, p_rating jsonb default null, p_slots jsonb default null
)
returns text
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_me uuid := auth.uid();
  v_token text;
  v_link uuid;
  v_plan uuid;
  v_title text := left(btrim(coalesce(p_movie ->> 'title', '')), 240);
  v_poster text := case when (p_movie ->> 'poster_url') ~ '^https://image\.tmdb\.org/' then left(p_movie ->> 'poster_url', 300) end;
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
    v_poster,
    case when (p_movie ->> 'backdrop_url') ~ '^https://image\.tmdb\.org/' then left(p_movie ->> 'backdrop_url', 300) end,
    private.json_num(p_movie, 'runtime', 1, 1000)::integer,
    case when (p_movie ->> 'release_date') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$' then (p_movie ->> 'release_date')::date end,
    coalesce(p_movie, '{}'::jsonb),
    case when p_kind = 'verdict' then p_rating end
  )
  returning id into v_link;

  if p_kind = 'watch' and p_slots is not null and jsonb_typeof(p_slots) = 'array' and jsonb_array_length(p_slots) > 0 then
    v_plan := private.insert_plan(v_me, null, null, v_link, v_title, v_poster, p_slots);
    update public.share_links set plan_id = v_plan where id = v_link;
  end if;

  return v_token;
end;
$$;

-- ─── Page du lien : la séance proposée, et la réponse qui la choisit ────────

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
  v_plan jsonb;
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

  -- Sans les liens de réservation : ils ne servent qu'une fois le créneau arrêté.
  if v_link.plan_id is not null then
    select jsonb_build_object(
      'status', p.status,
      'chosen_slot_id', p.chosen_slot_id,
      'slots', coalesce((
        select jsonb_agg(jsonb_build_object('id', s.id, 'starts_at', s.starts_at, 'cinema_name', s.cinema_name, 'version', s.version)
          order by s.position)
        from public.watch_plan_slots s where s.plan_id = p.id and s.starts_at > now()
      ), '[]'::jsonb)
    ) into v_plan
    from public.watch_plans p where p.id = v_link.plan_id and p.status in ('open', 'agreed');
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
    'plan', v_plan,
    'response', case when v_response.id is null then null else jsonb_build_object(
      'name', v_response.guest_name,
      'interested', v_response.interested,
      'rating', v_response.rating,
      'slot_id', v_response.slot_id
    ) end,
    'inviter_rating', case when v_response.rating is not null
      then private.public_rating(v_link.inviter_rating) end
  );
end;
$$;

drop function if exists public.answer_share_link(text, uuid, text, boolean, numeric);

create or replace function public.answer_share_link(
  p_token text,
  p_guest_key uuid,
  p_name text,
  p_interested boolean default null,
  p_rating numeric default null,
  p_slot_id uuid default null
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
  v_slot uuid;
  v_payload jsonb;
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
  if v_name = '' then
    if v_rating is not null or p_interested is true then raise exception 'name-required'; end if;
    v_name := 'Anonyme';
  end if;

  -- Un créneau choisi doit appartenir à la séance de CE lien.
  if p_slot_id is not null and p_interested is true and v_link.plan_id is not null then
    select s.id into v_slot from public.watch_plan_slots s where s.id = p_slot_id and s.plan_id = v_link.plan_id;
  end if;

  select exists (
    select 1 from public.share_link_responses where link_id = v_link.id and guest_key = p_guest_key
  ) into v_existing;
  if not v_existing and (select count(*) from public.share_link_responses where link_id = v_link.id) >= 30 then
    raise exception 'rate-limited';
  end if;

  if v_slot is not null then
    -- Premier créneau choisi : la séance est calée pour la personne qui invite.
    -- Choisi ensuite par quelqu'un d'autre sur le même lien : rien ne change.
    begin
      perform private.agree_plan(v_link.plan_id, v_slot, null);
    exception when others then
      if sqlerrm not in ('plan-closed') then raise; end if;
      v_slot := null;
    end;
  end if;

  insert into public.share_link_responses (link_id, guest_key, guest_name, interested, rating, slot_id)
  values (v_link.id, p_guest_key, v_name, p_interested, v_rating, v_slot)
  on conflict (link_id, guest_key) do update
    set guest_name = excluded.guest_name,
        interested = excluded.interested,
        rating = coalesce(excluded.rating, public.share_link_responses.rating),
        slot_id = coalesce(excluded.slot_id, public.share_link_responses.slot_id),
        updated_at = now()
  returning id into v_response;

  if v_slot is not null then
    select jsonb_build_object('slots', jsonb_build_array(jsonb_build_object(
      'id', s.id, 'starts_at', s.starts_at, 'cinema_name', s.cinema_name, 'version', s.version)))
      into v_payload
    from public.watch_plan_slots s where s.id = v_slot;
  end if;

  if v_rating is not null or p_interested is true then
    insert into public.notifications (recipient_id, kind, share_link_id, share_response_id, plan_id, title, poster_url, guest_name, rating, payload)
    values (v_link.inviter_id, 'link_answered', v_link.id, v_response, v_link.plan_id, v_link.title, v_link.poster_url, v_name, v_rating, v_payload)
    on conflict (share_response_id) where kind = 'link_answered'
      do update set guest_name = excluded.guest_name,
                    rating = coalesce(excluded.rating, public.notifications.rating),
                    payload = coalesce(excluded.payload, public.notifications.payload);
  end if;

  return jsonb_build_object(
    'ok', true,
    'slot_id', v_slot,
    'inviter_rating', case when v_rating is not null then private.public_rating(v_link.inviter_rating) end
  );
end;
$$;

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
  v_plan public.watch_plans%rowtype;
  v_space uuid;
  v_movie uuid;
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

  v_space := private.ensure_space_for(v_link.inviter_id, array[v_me]);
  v_movie := private.upsert_shared_movie(
    v_space, v_link.inviter_id, v_link.movie || jsonb_build_object('title', v_link.title),
    case v_link.kind when 'watch' then 'watchlist' else 'watched' end);

  -- La séance du lien rejoint l'espace, maintenant qu'il existe.
  if v_link.plan_id is not null then
    select * into v_plan from public.watch_plans where id = v_link.plan_id for update;
    if v_plan.shared_movie_id is null then
      if v_plan.status = 'open' then
        update public.watch_plans set status = 'replaced', updated_at = now()
          where shared_movie_id = v_movie and status = 'open' and id <> v_plan.id;
      end if;
      update public.watch_plans set space_id = v_space, shared_movie_id = v_movie, updated_at = now()
        where id = v_plan.id;
    end if;
    select * into v_plan from public.watch_plans where id = v_link.plan_id;
  end if;

  if v_link.kind = 'watch' then
    insert into public.space_movie_votes (movie_id, profile_id, interested)
    values (v_movie, v_link.inviter_id, true)
    on conflict (movie_id, profile_id) do nothing;

    if v_response.interested is true then
      insert into public.space_movie_votes (movie_id, profile_id, interested)
      values (v_movie, v_me, true)
      on conflict (movie_id, profile_id) do update set interested = true;
    elsif v_response.id is null then
      insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, plan_id, title, poster_url, payload)
      values (v_me, v_link.inviter_id, 'watch_invite', v_space, v_movie, v_plan.id, v_link.title, v_link.poster_url,
              case when v_plan.id is not null and v_plan.status = 'open' then private.plan_payload(v_plan.id) end)
      on conflict do nothing;
    end if;

    -- Créneau choisi sur la page : la séance entre aussi dans son calendrier.
    if v_plan.id is not null and v_response.slot_id is not null then
      begin
        perform private.agree_plan(v_plan.id, v_response.slot_id, v_me);
      exception when others then
        null;
      end;
    elsif v_plan.id is not null and v_plan.status = 'open' and v_response.id is not null then
      perform private.notify_plan(v_me, v_link.inviter_id, 'plan_proposed', v_plan.id);
    end if;
  else
    perform private.put_rating(v_movie, v_link.inviter_id, v_link.inviter_rating);
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
    'interested', v_response.interested,
    'plan_id', v_plan.id
  );
end;
$$;

-- ─── Après la séance : « note-le pour découvrir sa note » ───────────────────

/** Verdict posé : le renvoyer à qui l'avait demandé, ou à qui était à la séance. */
create or replace function private.on_rating_answer_request()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, rating)
  select distinct on (n.actor_id) n.actor_id, new.profile_id, 'verdict_given', n.space_id, n.shared_movie_id, n.title, n.poster_url,
    private.overall_rating(new.story, new.visuals, new.acting, new.sound, new.adaptive_rating)
  from public.notifications n
  where n.kind in ('verdict_request', 'plan_rate') and n.shared_movie_id = new.movie_id
    and n.recipient_id = new.profile_id and n.actor_id is not null
  on conflict do nothing;

  update public.notifications set read_at = coalesce(read_at, now())
  where kind in ('verdict_request', 'plan_rate') and shared_movie_id = new.movie_id and recipient_id = new.profile_id;

  return new;
end;
$$;

/**
 * Chaque matin : les séances de la veille (ou des deux jours d'avant) dont la
 * note n'a pas encore été demandée. Chaque personne qui y était et n'a pas noté
 * reçoit « Vous avez vu X ? Note-le pour découvrir la note de Y ».
 */
create or replace function private.prompt_plan_ratings()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_plan record;
  v_person uuid;
  v_other uuid;
  v_count integer := 0;
begin
  for v_plan in
    select p.* from public.watch_plans p
    join public.watch_plan_slots s on s.id = p.chosen_slot_id
    where p.status = 'agreed' and p.rate_prompted_at is null and p.shared_movie_id is not null
      and s.starts_at < now() - interval '3 hours' and s.starts_at > now() - interval '3 days'
      and cardinality(p.participant_ids) > 1
  loop
    foreach v_person in array v_plan.participant_ids loop
      if exists (select 1 from public.movie_ratings where movie_id = v_plan.shared_movie_id and profile_id = v_person) then
        continue;
      end if;
      -- Pour chacun, « l'autre » : la personne qui a proposé, ou la première qui a dit oui.
      v_other := case when v_person = v_plan.proposer_id
        then (select x from unnest(v_plan.participant_ids) x where x <> v_person limit 1)
        else v_plan.proposer_id end;
      perform private.notify_plan(v_person, v_other, 'plan_rate', v_plan.id);
      v_count := v_count + 1;
    end loop;
    update public.watch_plans set rate_prompted_at = now() where id = v_plan.id;
  end loop;
  return v_count;
end;
$$;

-- ─── Droits ─────────────────────────────────────────────────────────────────

revoke execute on function private.plan_payload(uuid) from public, anon, authenticated;
revoke execute on function private.insert_plan(uuid, uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated;
revoke execute on function private.add_plan_screening(uuid, uuid) from public, anon, authenticated;
revoke execute on function private.notify_plan(uuid, uuid, text, uuid) from public, anon, authenticated;
revoke execute on function private.agree_plan(uuid, uuid, uuid) from public, anon, authenticated;
revoke execute on function private.prompt_plan_ratings() from public, anon, authenticated;
revoke execute on function private.on_rating_answer_request() from public, anon, authenticated;

revoke execute on function public.propose_plan(uuid, jsonb) from public, anon;
revoke execute on function public.accept_plan_slot(uuid) from public, anon;
revoke execute on function public.cancel_plan(uuid) from public, anon;
revoke execute on function public.propose_to_people(text, jsonb, uuid[], jsonb, jsonb) from public, anon;
revoke execute on function public.create_share_link(text, jsonb, jsonb, jsonb) from public, anon;
revoke execute on function public.claim_share_link(text, uuid) from public, anon;
grant execute on function public.propose_plan(uuid, jsonb) to authenticated;
grant execute on function public.accept_plan_slot(uuid) to authenticated;
grant execute on function public.cancel_plan(uuid) to authenticated;
grant execute on function public.propose_to_people(text, jsonb, uuid[], jsonb, jsonb) to authenticated;
grant execute on function public.create_share_link(text, jsonb, jsonb, jsonb) to authenticated;
grant execute on function public.claim_share_link(text, uuid) to authenticated;

revoke execute on function public.get_share_link(text, uuid) from public;
revoke execute on function public.answer_share_link(text, uuid, text, boolean, numeric, uuid) from public;
grant execute on function public.get_share_link(text, uuid) to anon, authenticated;
grant execute on function public.answer_share_link(text, uuid, text, boolean, numeric, uuid) to anon, authenticated;

-- ─── Temps réel et planification ────────────────────────────────────────────

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime')
     and not exists (
       select 1 from pg_publication_tables
       where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'watch_plans'
     ) then
    alter publication supabase_realtime add table public.watch_plans;
  end if;
end $$;

-- 8 h UTC : 10 h à Paris l'été, 9 h l'hiver. Le lendemain matin, pas en sortant de la salle.
select cron.schedule('bitter-note-apres-seance', '0 8 * * *', $$ select private.prompt_plan_ratings(); $$);
