-- « Tu as bien tes places ? » : la veille d'une séance encore « à confirmer ».
--
-- Toucher un horaire ouvre UGC et note la séance `pending`. L'app pose la
-- question au retour ; si personne n'y a répondu, une notification la repose la
-- veille à 18 h (heure de Paris). Une séance `pending` ne déclenche aucun rappel
-- de séance (`sync_screening_reminders` ne programme que les `scheduled`).

alter table public.notifications drop constraint if exists notifications_kind_check;
alter table public.notifications add constraint notifications_kind_check check (kind = any (array[
  'watch_invite', 'watch_accepted', 'verdict_request', 'verdict_given', 'link_answered', 'link_joined',
  'plan_proposed', 'plan_agreed', 'plan_cancelled', 'plan_rate', 'common_wish', 'release_today',
  'now_streaming', 'tv_episode', 'tv_season', 'tv_season_soon', 'vote_reminder', 'rating_reminder',
  'verdict_complete', 'review_reaction', 'verdict_debate', 'running_late', 'space_ping',
  'booking_check'
]::text[]));

create or replace function private.booking_checks()
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_count integer;
  v_tomorrow date := (now() at time zone 'Europe/Paris')::date + 1;
begin
  -- Deux passages (16 h et 17 h UTC) couvrent l'heure d'hiver et l'heure d'été :
  -- seul celui qui tombe à 18 h à Paris envoie.
  if extract(hour from now() at time zone 'Europe/Paris') <> 18 then
    return 0;
  end if;

  insert into public.notifications (recipient_id, kind, title, poster_url, payload)
  select s.profile_id, 'booking_check', s.title, s.poster_url,
    jsonb_build_object('screening_id', s.id, 'starts_at', s.starts_at, 'cinema_name', s.cinema_name)
  from public.cinema_screenings s
  where s.status = 'pending'
    and (s.starts_at at time zone 'Europe/Paris')::date = v_tomorrow
    and not exists (
      select 1 from public.notifications n
      where n.kind = 'booking_check' and n.recipient_id = s.profile_id
        and n.payload->>'screening_id' = s.id::text
    );
  get diagnostics v_count = row_count;
  return v_count;
end;
$function$;

revoke all on function private.booking_checks() from public, anon, authenticated;

select cron.unschedule('bitter-places-a-confirmer')
where exists (select 1 from cron.job where jobname = 'bitter-places-a-confirmer');
select cron.schedule('bitter-places-a-confirmer', '0 16,17 * * *', 'select private.booking_checks();');
