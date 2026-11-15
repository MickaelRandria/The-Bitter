-- Le QR code du billet, pour l'afficher à l'entrée du cinéma le jour J.
--
-- On ne garde jamais la capture : seulement le contenu du QR, lu sur le
-- téléphone (« b:<base64> » pour ses octets exacts). Ce contenu EST le billet :
-- `cinema_screenings` reste lisible par sa seule propriétaire (policy « owners
-- manage their own »), et le code est effacé le lendemain de la séance.
--
-- Rejouable.

alter table public.cinema_screenings add column if not exists ticket_code text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.cinema_screenings'::regclass
      and conname = 'cinema_screenings_ticket_code_check'
  ) then
    alter table public.cinema_screenings
      add constraint cinema_screenings_ticket_code_check
      check (ticket_code is null or char_length(ticket_code) <= 4000);
  end if;
end $$;

comment on column public.cinema_screenings.ticket_code is
  'Contenu du QR code du billet (b:<base64> des octets), lu sur l''appareil. Effacé le lendemain de la séance.';

create or replace function public.purge_past_ticket_codes()
returns integer
language sql
security definer
set search_path = ''
as $$
  with purged as (
    update public.cinema_screenings
    set ticket_code = null
    where ticket_code is not null
      and starts_at < now() - interval '1 day'
    returning 1
  )
  select count(*)::integer from purged;
$$;

revoke all on function public.purge_past_ticket_codes() from public, anon, authenticated;

-- Chaque nuit à 4 h 10 (UTC), quand pg_cron est là.
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.unschedule(jobid) from cron.job where jobname = 'purge-past-ticket-codes';
    perform cron.schedule('purge-past-ticket-codes', '10 4 * * *', 'select public.purge_past_ticket_codes()');
  end if;
end $$;
