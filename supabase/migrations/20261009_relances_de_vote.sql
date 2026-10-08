-- Relances de vote dans les espaces.
--
-- Une proposition « à voir ensemble » attendait parfois des semaines sans que
-- personne ne le sache : le billet de l'accueil disait « à jour » dès que
-- soi-même on avait voté. Relevé le 8 octobre 2026 : dans « Ciné pote »,
-- L'Invitation et Primetime, proposés le 12 août, n'avaient reçu aucune réponse
-- de Mirana ni de Nakib — qui, de plus, n'avaient pas activé les notifications.
--
-- Ce fichier ajoute :
-- 1. `vote_reminders` : chaque relance envoyée, pour en limiter la fréquence ;
-- 2. `remind_vote` : relancer un ou plusieurs membres sur un film, au plus une
--    fois tous les 5 jours par film et par personne (quel que soit l'expéditeur) ;
-- 3. une relance automatique, une seule fois, 72 h après la proposition, à ceux
--    qui n'ont pas répondu (tâche planifiée horaire) ;
-- 4. `members_with_push` : quels co-membres reçoivent les notifications, pour
--    proposer la relance par message aux autres ;
-- 5. un vote marque la relance comme lue, comme il le fait déjà pour l'invitation.
--
-- Le texte de la notification (`vote_reminder`) est dans
-- supabase/functions/notify/messages.ts.

create table if not exists public.vote_reminders (
  id uuid primary key default gen_random_uuid(),
  shared_movie_id uuid not null references public.shared_movies(id) on delete cascade,
  target_id uuid not null references public.profiles(id) on delete cascade,
  -- Nul pour la relance automatique.
  sender_id uuid references public.profiles(id) on delete set null,
  channel text not null check (channel in ('push', 'message', 'auto')),
  created_at timestamptz not null default now()
);

create index if not exists vote_reminders_movie_target_idx
  on public.vote_reminders (shared_movie_id, target_id, created_at desc);

alter table public.vote_reminders enable row level security;

-- Lisible par les membres de l'espace du film : le talon du billet affiche
-- « relancés » à tout le groupe, pas seulement à qui a relancé.
drop policy if exists "vote reminders: members read" on public.vote_reminders;
create policy "vote reminders: members read" on public.vote_reminders
  for select to authenticated
  using (exists (
    select 1 from public.shared_movies s
      join public.space_members m on m.space_id = s.space_id and m.is_active
     where s.id = vote_reminders.shared_movie_id
       and m.profile_id = (select auth.uid())
  ));
-- Aucune écriture directe : tout passe par `remind_vote` ou la relance automatique.

grant select on public.vote_reminders to authenticated;

-- La notification elle-même. Un index unique limite déjà `notifications` à une
-- ligne par destinataire, sorte, film et auteur : la relance précédente est
-- donc remplacée, ce qui la fait remonter en tête et repartir en push.
create or replace function private.send_vote_reminder(p_movie public.shared_movies, p_target uuid, p_actor uuid)
returns void
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_space text;
begin
  select name into v_space from public.shared_spaces where id = p_movie.space_id;
  delete from public.notifications
   where recipient_id = p_target and kind = 'vote_reminder'
     and shared_movie_id = p_movie.id and actor_id is not distinct from p_actor;
  insert into public.notifications (recipient_id, actor_id, kind, space_id, shared_movie_id, title, poster_url, payload)
  values (p_target, p_actor, 'vote_reminder', p_movie.space_id, p_movie.id, p_movie.title, p_movie.poster_url,
          jsonb_build_object('space', coalesce(v_space, '')));
end;
$$;

-- 2. Relance manuelle.
create or replace function public.remind_vote(p_movie_id uuid, p_targets uuid[], p_channel text)
returns table (target_id uuid, status text)
language plpgsql
security definer
set search_path to ''
as $$
#variable_conflict use_column
declare
  v_me uuid := auth.uid();
  v_movie public.shared_movies;
  v_target uuid;
begin
  if v_me is null then
    raise exception 'authentication required';
  end if;
  if p_channel not in ('push', 'message') then
    raise exception 'invalid channel';
  end if;

  select * into v_movie from public.shared_movies where id = p_movie_id;
  if v_movie.id is null or v_movie.status <> 'watchlist' or not exists (
    select 1 from public.space_members m where m.space_id = v_movie.space_id and m.profile_id = v_me and m.is_active
  ) then
    raise exception 'not allowed';
  end if;

  foreach v_target in array coalesce(p_targets, '{}') loop
    target_id := v_target;
    if v_target = v_me or not exists (
      select 1 from public.space_members m where m.space_id = v_movie.space_id and m.profile_id = v_target and m.is_active
    ) then
      status := 'not_member';
    elsif exists (select 1 from public.space_movie_votes v where v.movie_id = v_movie.id and v.profile_id = v_target) then
      status := 'already_voted';
    elsif exists (
      select 1 from public.vote_reminders r
       where r.shared_movie_id = v_movie.id and r.target_id = v_target and r.created_at > now() - interval '5 days'
    ) then
      status := 'too_soon';
    else
      insert into public.vote_reminders (shared_movie_id, target_id, sender_id, channel)
      values (v_movie.id, v_target, v_me, p_channel);
      perform private.send_vote_reminder(v_movie, v_target, v_me);
      status := 'sent';
    end if;
    return next;
  end loop;
end;
$$;

revoke all on function public.remind_vote(uuid, uuid[], text) from public, anon;
grant execute on function public.remind_vote(uuid, uuid[], text) to authenticated;

-- 3. Relance automatique : 72 h après la proposition, une seule fois par film et
-- par membre. Les propositions de plus de 30 jours ne sont pas concernées : la
-- question « toujours d'actualité ? » prend le relais auprès de qui a proposé.
create or replace function private.auto_vote_reminders()
returns integer
language plpgsql
security definer
set search_path to ''
as $$
declare
  v_row record;
  v_count integer := 0;
begin
  for v_row in
    select s as movie, m.profile_id as target
      from public.shared_movies s
      join public.space_members m on m.space_id = s.space_id and m.is_active
     where s.status = 'watchlist'
       and s.added_by is not null
       and s.added_at <= now() - interval '72 hours'
       and s.added_at > now() - interval '30 days'
       and m.profile_id <> s.added_by
       -- Arrivé dans l'espace après la proposition : il n'a pas « laissé traîner ».
       and m.joined_at <= s.added_at + interval '24 hours'
       and not exists (select 1 from public.space_movie_votes v where v.movie_id = s.id and v.profile_id = m.profile_id)
       and not exists (select 1 from public.vote_reminders r where r.shared_movie_id = s.id and r.target_id = m.profile_id)
       and private.not_blocked(s.added_by, m.profile_id)
  loop
    insert into public.vote_reminders (shared_movie_id, target_id, sender_id, channel)
    values ((v_row.movie).id, v_row.target, null, 'auto');
    perform private.send_vote_reminder(v_row.movie, v_row.target, (v_row.movie).added_by);
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

revoke all on function private.auto_vote_reminders() from public, anon, authenticated;

select cron.unschedule('bitter-relance-votes') where exists (select 1 from cron.job where jobname = 'bitter-relance-votes');
select cron.schedule('bitter-relance-votes', '25 8-21 * * *', $cron$ select private.auto_vote_reminders(); $cron$);

-- 4. Qui, parmi mes co-membres, reçoit les notifications.
create or replace function public.members_with_push()
returns setof uuid
language sql
stable
security definer
set search_path to ''
as $$
  select distinct s.profile_id
    from public.push_subscriptions s
   where s.active
     and s.profile_id <> (select auth.uid())
     and private.are_co_members((select auth.uid()), s.profile_id);
$$;

revoke all on function public.members_with_push() from public, anon;
grant execute on function public.members_with_push() to authenticated;

-- 5. Un vote, oui ou non, répond aussi aux relances.
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

  -- Oui ou non, l'invitation et les relances ont trouvé leur réponse.
  update public.notifications set read_at = coalesce(read_at, now())
  where kind in ('watch_invite', 'vote_reminder') and shared_movie_id = new.movie_id and recipient_id = new.profile_id;

  return new;
end;
$$;
