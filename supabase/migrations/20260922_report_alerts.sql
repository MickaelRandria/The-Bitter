-- Alerte push à chaque nouveau signalement.
--
-- Sans elle, un signalement arrive en silence et dépend de la mémoire de
-- quelqu'un qui pense à ouvrir le tableau de bord. L'alerte part vers les
-- appareils des modérateurs, par la même mécanique que les rappels de séance
-- (jeton de worker, clés VAPID), mais par une fonction distincte pour ne pas
-- toucher aux rappels : `report-alert`.

-- Qui reçoit les alertes. Aucune politique : invisible depuis l'app.
create table if not exists public.moderators (
  profile_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.moderators enable row level security;
revoke all on public.moderators from anon, authenticated;

alter table public.content_reports add column if not exists alerted_at timestamptz;

create or replace function private.alert_new_report()
returns trigger
language plpgsql
security definer
set search_path to ''
as $$
begin
  -- Un signalement doit toujours être enregistré, même si l'alerte échoue :
  -- toute erreur ici est avalée. pg_net est asynchrone, l'insertion n'attend pas.
  begin
    perform net.http_post(
      url := 'https://tnvnmsevddvcklkitnpa.supabase.co/functions/v1/report-alert',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'reportId', new.id,
        'workerToken', (select worker_token from public.push_worker_credentials where singleton)
      )
    );
  exception when others then
    raise warning '[report-alert] appel impossible : %', sqlerrm;
  end;
  return new;
end;
$$;

revoke execute on function private.alert_new_report() from public, anon, authenticated;

drop trigger if exists content_reports_alert on public.content_reports;
create trigger content_reports_alert
  after insert on public.content_reports
  for each row execute function private.alert_new_report();
