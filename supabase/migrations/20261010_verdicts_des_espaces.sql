-- Verdicts des espaces : qui doit noter, relances, verdict tombé, paris,
-- réactions et débat.
--
-- Jusqu'ici un film « vu ensemble » n'avait pas de fin : la moyenne s'affichait
-- dès la première note, et rien ne disait qui manquait ni quand le verdict était
-- complet. Ce fichier ajoute :
--
-- 0. la correction de `notifications_kind_check`, qui ne connaissait pas
--    `vote_reminder` : depuis le 9 octobre, la relance automatique des votes
--    échoue à chaque passage (« violates check constraint »), et la relance à la
--    main renvoyait une erreur. Les nouvelles sortes y sont ajoutées ;
-- 1. `space_movie_skips` : « Je ne l'ai pas vu », qui sort quelqu'un du compte ;
-- 2. `private.expected_raters` : qui doit noter un film. Les participants de la
--    séance calée s'il y en a une, sinon les membres actifs ; plus quiconque a
--    noté ; moins ceux qui ne l'ont pas vu. L'app fait le même calcul
--    (utils/verdict.ts) ;
-- 3. `rating_reminders` et `remind_rating` : relancer une note, au plus une fois
--    tous les 5 jours par film et par personne, comme les votes ;
-- 4. `space_verdicts` : la date à laquelle le verdict est tombé, et la
--    notification « Le verdict de X est tombé » à ceux qui ont noté ;
-- 5. `verdict_guesses` : parier sur la note d'un autre avant de la connaître ;
-- 6. `review_reactions` : 😂 🔥 🤝 🙄 sur un avis, l'auteur est prévenu ;
-- 7. `verdict_messages` : un court débat (160 caractères) sous un verdict,
--    signalable comme un avis.
--
-- Les textes des notifications sont dans supabase/functions/notify/messages.ts.

-- ─── 0. Sortes de notifications ──────────────────────────────────────────────
alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'watch_invite', 'watch_accepted', 'verdict_request', 'verdict_given', 'link_answered', 'link_joined',
  'plan_proposed', 'plan_agreed', 'plan_cancelled', 'plan_rate', 'common_wish', 'release_today',
  'now_streaming', 'tv_episode', 'tv_season', 'tv_season_soon',
  'vote_reminder', 'rating_reminder', 'verdict_complete', 'review_reaction', 'verdict_debate'
]::text[]));

-- Un message du débat se signale comme un avis.
alter table public.content_reports drop constraint if exists content_reports_content_type_check;
alter table public.content_reports add constraint content_reports_content_type_check check (content_type = any (array[
  'review', 'feed_item', 'profile', 'space_movie', 'debate_message'
]::text[]));

-- Membre actif de l'espace d'un film. `is_member_of_space` existe déjà pour
-- l'utilisateur courant ; celle-ci sert pour n'importe qui.
create or replace function private.is_active_member_of_movie(p_movie uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (
    select 1
      from public.shared_movies sm
      join public.space_members m on m.space_id = sm.space_id
     where sm.id = p_movie and m.profile_id = p_profile and m.is_active
  );
$$;

create or replace function private.has_rated(p_movie uuid, p_profile uuid)
returns boolean
language sql
stable
security definer
set search_path to ''
as $$
  select exists (select 1 from public.movie_ratings r where r.movie_id = p_movie and r.profile_id = p_profile);
$$;

-- ─── 1. « Je ne l'ai pas vu » ────────────────────────────────────────────────
create table if not exists public.space_movie_skips (
  movie_id uuid not null references public.shared_movies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (movie_id, profile_id)
);

alter table public.space_movie_skips enable row level security;

drop policy if exists "skips: members read" on public.space_movie_skips;
create policy "skips: members read" on public.space_movie_skips
  for select to authenticated
  using (exists (select 1 from public.shared_movies sm where sm.id = movie_id and public.is_member_of_space(sm.space_id)));

-- On ne se déclare « pas vu » que tant qu'on n'a pas noté.
drop policy if exists "skips: own insert" on public.space_movie_skips;
create policy "skips: own insert" on public.space_movie_skips
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (select 1 from public.shared_movies sm where sm.id = movie_id and public.is_member_of_space(sm.space_id))
    and not private.has_rated(movie_id, profile_id)
  );

drop policy if exists "skips: own delete" on public.space_movie_skips;
create policy "skips: own delete" on public.space_movie_skips
  for delete to authenticated
  using (profile_id = (select auth.uid()));

grant select, insert, delete on public.space_movie_skips to authenticated;

-- ─── 2. Qui doit noter ───────────────────────────────────────────────────────
create or replace function private.expected_raters(p_movie uuid)
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  with movie as (
    select id, space_id from public.shared_movies where id = p_movie
  ),
  active as (
    select m.profile_id from public.space_members m join movie on movie.space_id = m.space_id where m.is_active
  ),
  plan as (
    select p.participant_ids
      from public.watch_plans p
     where p.shared_movie_id = p_movie and p.status = 'agreed' and coalesce(cardinality(p.participant_ids), 0) > 0
     order by p.updated_at desc nulls last
     limit 1
  ),
  base as (
    select unnest(participant_ids) as profile_id from plan
    union
    select profile_id from active where not exists (select 1 from plan)
    union
    select r.profile_id from public.movie_ratings r where r.movie_id = p_movie
  )
  select distinct b.profile_id
    from base b
   where b.profile_id in (select profile_id from active)
     and not exists (select 1 from public.space_movie_skips s where s.movie_id = p_movie and s.profile_id = b.profile_id);
$$;

-- ─── 3. Relancer une note ────────────────────────────────────────────────────
create table if not exists public.rating_reminders (
  id uuid primary key default gen_random_uuid(),
  shared_movie_id uuid not null references public.shared_movies(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  sender_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('push', 'message')),
  created_at timestamptz not null default now()
);

create index if not exists rating_reminders_movie_target_idx
  on public.rating_reminders (shared_movie_id, target_id, created_at desc);

alter table public.rating_reminders enable row level security;

drop policy if exists "rating reminders: members read" on public.rating_reminders;
create policy "rating reminders: members read" on public.rating_reminders
  for select to authenticated
  using (exists (select 1 from public.shared_movies sm where sm.id = shared_movie_id and public.is_member_of_space(sm.space_id)));

grant select on public.rating_reminders to authenticated;

create or replace function public.remind_rating(p_movie_id uuid, p_targets uuid[], p_channel text)
returns table(target_id uuid, status text)
language plpgsql
security definer
set search_path to ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_movie public.shared_movies;
  v_space text;
  v_target uuid;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if p_channel not in ('push', 'message') then
    raise exception 'invalid channel';
  end if;

  select * into v_movie from public.shared_movies where id = p_movie_id;
  if v_movie.id is null or v_movie.status <> 'watched' or not private.is_active_member_of_movie(v_movie.id, v_me) then
    raise exception 'not allowed';
  end if;
  select name into v_space from public.shared_spaces where id = v_movie.space_id;

  foreach v_target in array coalesce(p_targets, '{}') loop
    target_id := v_target;
    if v_target = v_me or v_target not in (select private.expected_raters(v_movie.id)) then
      status := 'not_expected';
    elsif private.has_rated(v_movie.id, v_target) then
      status := 'already_rated';
    elsif exists (
      select 1 from public.rating_reminders r
       where r.shared_movie_id = v_movie.id and r.target_id = v_target and r.created_at > now() - interval '5 days'
    ) then
      status := 'too_soon';
    else
      insert into public.rating_reminders (shared_movie_id, target_id, sender_id, channel)
      values (v_movie.id, v_target, v_me, p_channel);
      -- Par message, la personne n'a pas les notifications : rien à pousser.
      if p_channel = 'push' then
        delete from public.notifications
         where recipient_id = v_target and kind = 'rating_reminder'
           and shared_movie_id = v_movie.id and actor_id = v_me;
        insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, payload)
        values (v_target, v_me, 'rating_reminder', v_movie.space_id, v_movie.id, v_movie.title, v_movie.poster_url,
                jsonb_build_object('space', coalesce(v_space, '')));
      end if;
      status := 'sent';
    end if;
    return next;
  end loop;
end;
$$;

grant execute on function public.remind_rating(uuid, uuid[], text) to authenticated;

-- ─── 4. Le verdict tombe ─────────────────────────────────────────────────────
create table if not exists public.space_verdicts (
  movie_id uuid primary key references public.shared_movies(id) on delete cascade,
  completed_at timestamptz not null default now()
);

alter table public.space_verdicts enable row level security;

drop policy if exists "verdicts: members read" on public.space_verdicts;
create policy "verdicts: members read" on public.space_verdicts
  for select to authenticated
  using (exists (select 1 from public.shared_movies sm where sm.id = movie_id and public.is_member_of_space(sm.space_id)));

grant select on public.space_verdicts to authenticated;

-- Appelée après chaque note et chaque « pas vu ». `p_actor` est la personne qui
-- vient d'agir : elle voit la révélation dans l'app, inutile de la prévenir.
create or replace function private.check_verdict(p_movie uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_movie public.shared_movies;
  v_space text;
  v_expected int;
  v_rated int;
  v_avg numeric;
begin
  if exists (select 1 from public.space_verdicts where movie_id = p_movie) then
    return;
  end if;
  select * into v_movie from public.shared_movies where id = p_movie;
  if v_movie.id is null or v_movie.status <> 'watched' then
    return;
  end if;

  select count(*), count(*) filter (where private.has_rated(p_movie, e))
    into v_expected, v_rated
    from private.expected_raters(p_movie) e;
  -- Une seule note n'est pas un verdict.
  if v_rated < 2 or v_rated < v_expected then
    return;
  end if;

  insert into public.space_verdicts (movie_id) values (p_movie) on conflict do nothing;
  if not found then
    return;
  end if;

  select round(avg(private.overall_rating(r.story, r.visuals, r.acting, r.sound, r.adaptive_rating)), 1)
    into v_avg
    from public.movie_ratings r
   where r.movie_id = p_movie and r.profile_id in (select private.expected_raters(p_movie));
  select name into v_space from public.shared_spaces where id = v_movie.space_id;

  -- « X a mis 7 » arrive au même moment : le verdict complet le remplace.
  update public.notifications set read_at = coalesce(read_at, now())
   where kind = 'verdict_given' and shared_movie_id = p_movie and read_at is null;

  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, rating, payload)
  select e, null, 'verdict_complete', v_movie.space_id, p_movie, v_movie.title, v_movie.poster_url, v_avg,
         jsonb_build_object('space', coalesce(v_space, ''), 'count', v_rated)
    from private.expected_raters(p_movie) e
   where e is distinct from p_actor;
end;
$$;

create or replace function private.on_rating_verdict()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.notifications set read_at = coalesce(read_at, now())
   where kind = 'rating_reminder' and shared_movie_id = new.movie_id and recipient_id = new.profile_id;
  -- Avoir noté annule un « pas vu » posé avant.
  delete from public.space_movie_skips where movie_id = new.movie_id and profile_id = new.profile_id;
  perform private.check_verdict(new.movie_id, new.profile_id);
  return new;
end;
$$;

-- Le nom compte : les triggers d'une table partent par ordre alphabétique, et
-- celui-ci doit passer après `movie_ratings_answer_request`, qui crée les
-- « X a mis 7 » que le verdict complet marque comme lus.
drop trigger if exists movie_ratings_verdict on public.movie_ratings;
create trigger movie_ratings_verdict
  after insert on public.movie_ratings
  for each row execute function private.on_rating_verdict();

create or replace function private.on_skip_verdict()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  update public.notifications set read_at = coalesce(read_at, now())
   where kind in ('rating_reminder', 'plan_rate', 'verdict_request')
     and shared_movie_id = new.movie_id and recipient_id = new.profile_id;
  perform private.check_verdict(new.movie_id, new.profile_id);
  return new;
end;
$$;

drop trigger if exists space_movie_skips_verdict on public.space_movie_skips;
create trigger space_movie_skips_verdict
  after insert on public.space_movie_skips
  for each row execute function private.on_skip_verdict();

-- ─── 5. Paris ────────────────────────────────────────────────────────────────
create table if not exists public.verdict_guesses (
  movie_id uuid not null references public.shared_movies(id) on delete cascade,
  guesser_id uuid not null references public.profiles(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  guess numeric(3, 1) not null check (guess >= 0 and guess <= 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (movie_id, guesser_id, target_id),
  check (guesser_id <> target_id)
);

alter table public.verdict_guesses enable row level security;

-- Son propre pari, toujours ; celui des autres une fois les deux notes posées :
-- avant, il ne dirait rien, et après, il nourrit « qui connaît le mieux qui ».
drop policy if exists "guesses: read" on public.verdict_guesses;
create policy "guesses: read" on public.verdict_guesses
  for select to authenticated
  using (
    guesser_id = (select auth.uid())
    or (
      exists (select 1 from public.shared_movies sm where sm.id = movie_id and public.is_member_of_space(sm.space_id))
      and private.has_rated(movie_id, target_id)
      and private.has_rated(movie_id, guesser_id)
    )
  );

-- On parie tant qu'on ignore la note : soit on n'a pas encore noté (les notes
-- des autres restent scellées), soit l'autre n'a pas encore noté.
drop policy if exists "guesses: own insert" on public.verdict_guesses;
create policy "guesses: own insert" on public.verdict_guesses
  for insert to authenticated
  with check (
    guesser_id = (select auth.uid())
    and private.is_active_member_of_movie(movie_id, guesser_id)
    and private.is_active_member_of_movie(movie_id, target_id)
    and not (private.has_rated(movie_id, guesser_id) and private.has_rated(movie_id, target_id))
  );

drop policy if exists "guesses: own update" on public.verdict_guesses;
create policy "guesses: own update" on public.verdict_guesses
  for update to authenticated
  using (guesser_id = (select auth.uid()))
  with check (
    guesser_id = (select auth.uid())
    and not (private.has_rated(movie_id, guesser_id) and private.has_rated(movie_id, target_id))
  );

grant select, insert, update on public.verdict_guesses to authenticated;

-- ─── 6. Réactions aux avis ───────────────────────────────────────────────────
create table if not exists public.review_reactions (
  rating_id uuid not null references public.movie_ratings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  emoji text not null check (emoji in ('😂', '🔥', '🤝', '🙄')),
  created_at timestamptz not null default now(),
  primary key (rating_id, profile_id, emoji)
);

alter table public.review_reactions enable row level security;

drop policy if exists "reactions: members read" on public.review_reactions;
create policy "reactions: members read" on public.review_reactions
  for select to authenticated
  using (exists (
    select 1 from public.movie_ratings r join public.shared_movies sm on sm.id = r.movie_id
     where r.id = rating_id and public.is_member_of_space(sm.space_id)
  ));

-- On réagit à l'avis d'un autre, et seulement après avoir noté : avant, il est scellé.
drop policy if exists "reactions: own insert" on public.review_reactions;
create policy "reactions: own insert" on public.review_reactions
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and exists (
      select 1 from public.movie_ratings r join public.shared_movies sm on sm.id = r.movie_id
       where r.id = rating_id and r.profile_id <> (select auth.uid())
         and public.is_member_of_space(sm.space_id)
         and private.has_rated(r.movie_id, (select auth.uid()))
    )
  );

drop policy if exists "reactions: own delete" on public.review_reactions;
create policy "reactions: own delete" on public.review_reactions
  for delete to authenticated
  using (profile_id = (select auth.uid()));

grant select, insert, delete on public.review_reactions to authenticated;

create or replace function private.on_review_reaction()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_rating public.movie_ratings;
  v_movie public.shared_movies;
begin
  select * into v_rating from public.movie_ratings where id = new.rating_id;
  select * into v_movie from public.shared_movies where id = v_rating.movie_id;
  if v_rating.id is null or v_movie.id is null then
    return new;
  end if;
  -- Une notification par personne et par film : une rafale d'émojis n'en fait qu'une.
  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, payload)
  values (v_rating.profile_id, new.profile_id, 'review_reaction', v_movie.space_id, v_movie.id, v_movie.title,
          v_movie.poster_url, jsonb_build_object('emoji', new.emoji))
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists review_reactions_notify on public.review_reactions;
create trigger review_reactions_notify
  after insert on public.review_reactions
  for each row execute function private.on_review_reaction();

-- ─── 7. Le débat ─────────────────────────────────────────────────────────────
create table if not exists public.verdict_messages (
  id uuid primary key default gen_random_uuid(),
  movie_id uuid not null references public.shared_movies(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (char_length(btrim(body)) between 1 and 160),
  created_at timestamptz not null default now()
);

create index if not exists verdict_messages_movie_idx on public.verdict_messages (movie_id, created_at);

alter table public.verdict_messages enable row level security;

drop policy if exists "debate: members read" on public.verdict_messages;
create policy "debate: members read" on public.verdict_messages
  for select to authenticated
  using (exists (select 1 from public.shared_movies sm where sm.id = movie_id and public.is_member_of_space(sm.space_id)));

-- On défend une note qu'on a donnée.
drop policy if exists "debate: own insert" on public.verdict_messages;
create policy "debate: own insert" on public.verdict_messages
  for insert to authenticated
  with check (
    profile_id = (select auth.uid())
    and private.is_active_member_of_movie(movie_id, profile_id)
    and private.has_rated(movie_id, profile_id)
  );

drop policy if exists "debate: own delete" on public.verdict_messages;
create policy "debate: own delete" on public.verdict_messages
  for delete to authenticated
  using (profile_id = (select auth.uid()));

grant select, insert, delete on public.verdict_messages to authenticated;

create or replace function private.on_verdict_message()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_movie public.shared_movies;
begin
  -- Un débat court, pas une messagerie : vingt messages par personne et par film.
  if (select count(*) from public.verdict_messages where movie_id = new.movie_id and profile_id = new.profile_id) > 20 then
    raise exception 'too many messages';
  end if;
  select * into v_movie from public.shared_movies where id = new.movie_id;

  -- Une notification non lue suffit ; une fois lue, le message suivant la remplace.
  delete from public.notifications
   where kind = 'verdict_debate' and shared_movie_id = new.movie_id and actor_id = new.profile_id and read_at is not null;
  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, payload)
  select r.profile_id, new.profile_id, 'verdict_debate', v_movie.space_id, v_movie.id, v_movie.title, v_movie.poster_url,
         jsonb_build_object('text', left(btrim(new.body), 90))
    from public.movie_ratings r
   where r.movie_id = new.movie_id and r.profile_id <> new.profile_id
     and private.is_active_member_of_movie(new.movie_id, r.profile_id)
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists verdict_messages_notify on public.verdict_messages;
create trigger verdict_messages_notify
  after insert on public.verdict_messages
  for each row execute function private.on_verdict_message();

-- ─── Temps réel ──────────────────────────────────────────────────────────────
do $$
declare
  t text;
begin
  foreach t in array array['space_movie_skips', 'verdict_messages', 'review_reactions', 'space_verdicts'] loop
    if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = t) then
      execute format('alter publication supabase_realtime add table public.%I', t);
    end if;
  end loop;
end;
$$;

-- ─── Reprise de l'existant ───────────────────────────────────────────────────
-- Les verdicts déjà complets avant ce fichier : datés de leur dernière note,
-- sans notification (ils ne « tombent » pas aujourd'hui).
insert into public.space_verdicts (movie_id, completed_at)
select sm.id, coalesce((select max(r.rated_at) from public.movie_ratings r where r.movie_id = sm.id), now())
  from public.shared_movies sm
 where sm.status = 'watched'
   and (select count(*) from private.expected_raters(sm.id) e where private.has_rated(sm.id, e)) >= 2
   and not exists (select 1 from private.expected_raters(sm.id) e where not private.has_rated(sm.id, e))
on conflict do nothing;
