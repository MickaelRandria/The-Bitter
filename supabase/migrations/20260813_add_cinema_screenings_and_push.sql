-- Séances à venir + infrastructure de rappels Web Push.
--
-- Les séances sont volontairement séparées de user_movies : planifier un film ne
-- signifie pas encore l'avoir mis dans « À voir », ni l'avoir vu. Cela permet aussi
-- de saisir un titre libre sans fiche TMDB.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.cinema_screenings (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  tmdb_id integer,
  title text not null check (char_length(btrim(title)) between 1 and 240),
  poster_url text,
  starts_at timestamp with time zone not null,
  cinema_name text,
  cinema_address text,
  format text,
  notes text,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'cancelled', 'completed')),
  -- 2880 min = J-2 ; 30 min = juste avant le départ. Les valeurs restent
  -- modifiables par la suite, sans devoir changer le planificateur serveur.
  reminder_offsets_minutes integer[] not null default array[2880, 30],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  check (cardinality(reminder_offsets_minutes) between 1 and 4)
);

create index if not exists cinema_screenings_profile_starts_at_idx
  on public.cinema_screenings (profile_id, starts_at);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null check (endpoint like 'https://%'),
  p256dh text not null check (char_length(p256dh) between 40 and 300),
  auth text not null check (char_length(auth) between 10 and 100),
  user_agent text,
  active boolean not null default true,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  last_success_at timestamp with time zone,
  unique (profile_id, endpoint)
);

create index if not exists push_subscriptions_active_profile_idx
  on public.push_subscriptions (profile_id)
  where active;

-- Une ligne par rappel logique, jamais une ligne par téléphone : une séance peut
-- être reçue sur plusieurs appareils, mais doit être considérée comme envoyée une
-- seule fois.
create table if not exists public.notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  screening_id uuid not null references public.cinema_screenings(id) on delete cascade,
  profile_id uuid not null references public.profiles(id) on delete cascade,
  reminder_offset_minutes integer not null check (reminder_offset_minutes between 1 and 10080),
  scheduled_for timestamp with time zone not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'skipped', 'failed')),
  attempts integer not null default 0 check (attempts between 0 and 3),
  processing_started_at timestamp with time zone,
  sent_at timestamp with time zone,
  last_error text,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (screening_id, reminder_offset_minutes, scheduled_for)
);

create index if not exists notification_deliveries_pending_idx
  on public.notification_deliveries (scheduled_for)
  where status = 'pending';

-- Jeton aléatoire créé par la base et jamais lisible depuis le Data API. Le Cron
-- l'envoie à la fonction Edge ; celle-ci le vérifie avec service_role. Une requête
-- publique ne peut donc ni déclencher ni accélérer les rappels.
create table if not exists public.push_worker_credentials (
  singleton boolean primary key default true check (singleton),
  worker_token text not null unique,
  created_at timestamp with time zone not null default now()
);

-- La clé privée VAPID reste côté serveur. La fonction Edge la génère à sa
-- première configuration, puis seul service_role peut la relire ; elle n'est
-- jamais renvoyée à l'application (seule la clé publique l'est).
create table if not exists public.push_vapid_keys (
  singleton boolean primary key default true check (singleton),
  public_key text not null,
  private_key text not null,
  created_at timestamp with time zone not null default now()
);

alter table public.cinema_screenings enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_deliveries enable row level security;
alter table public.push_worker_credentials enable row level security;
alter table public.push_vapid_keys enable row level security;

drop policy if exists "screenings: owners manage their own" on public.cinema_screenings;
create policy "screenings: owners manage their own"
  on public.cinema_screenings
  for all to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

drop policy if exists "push subscriptions: owners manage their own" on public.push_subscriptions;
create policy "push subscriptions: owners manage their own"
  on public.push_subscriptions
  for all to authenticated
  using ((select auth.uid()) = profile_id)
  with check ((select auth.uid()) = profile_id);

-- Le client peut lire l'état de ses rappels pour un futur écran de diagnostic,
-- mais seul le worker serveur les écrit.
drop policy if exists "deliveries: owners can read their own" on public.notification_deliveries;
create policy "deliveries: owners can read their own"
  on public.notification_deliveries
  for select to authenticated
  using ((select auth.uid()) = profile_id);

revoke all on table public.push_worker_credentials from anon, authenticated;
revoke all on table public.notification_deliveries from anon, authenticated;
revoke all on table public.push_vapid_keys from anon, authenticated;

create or replace function public.sync_screening_reminders()
returns trigger
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  new.updated_at := now();

  if new.status <> 'scheduled' then
    update public.notification_deliveries
      set status = 'skipped', updated_at = now()
      where screening_id = new.id and status in ('pending', 'processing');
    return new;
  end if;

  -- Un changement d'heure ou de rappels ne touche jamais l'audit déjà envoyé,
  -- mais remplace tout ce qui n'était pas encore parti.
  delete from public.notification_deliveries
    where screening_id = new.id and status <> 'sent';

  insert into public.notification_deliveries (
    screening_id, profile_id, reminder_offset_minutes, scheduled_for
  )
  select
    new.id,
    new.profile_id,
    offset_minutes,
    new.starts_at - make_interval(mins => offset_minutes)
  from unnest(new.reminder_offsets_minutes) as offset_minutes
  where offset_minutes between 1 and 10080
    and new.starts_at - make_interval(mins => offset_minutes) > now()
  on conflict (screening_id, reminder_offset_minutes, scheduled_for) do nothing;

  return new;
end;
$$;

revoke all on function public.sync_screening_reminders() from public;

drop trigger if exists sync_screening_reminders_before_write on public.cinema_screenings;
create trigger sync_screening_reminders_before_write
  before insert or update of starts_at, reminder_offsets_minutes, status
  on public.cinema_screenings
  for each row execute function public.sync_screening_reminders();

-- Réserver les rappels dans la même transaction évite qu'un second passage Cron
-- envoie la même notification pendant que le premier appelle le navigateur. Les
-- réservations abandonnées par une fonction arrêtée redeviennent disponibles après
-- cinq minutes ; les rappels trop vieux sont silencieusement écartés.
create or replace function public.claim_due_notification_deliveries(p_limit integer default 25)
returns table (
  delivery_id uuid,
  attempt_number integer,
  profile_id uuid,
  screening_id uuid,
  reminder_offset_minutes integer,
  title text,
  starts_at timestamp with time zone,
  cinema_name text,
  cinema_address text,
  format text
)
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  update public.notification_deliveries d
    set status = 'skipped', processing_started_at = null,
        last_error = 'Séance annulée ou terminée', updated_at = now()
    from public.cinema_screenings s
    where d.screening_id = s.id
      and d.status in ('pending', 'processing')
      and s.status <> 'scheduled';

  update public.notification_deliveries
    set status = 'pending', processing_started_at = null, updated_at = now()
    where status = 'processing'
      and processing_started_at < now() - interval '5 minutes';

  update public.notification_deliveries
    set status = 'skipped', last_error = 'Rappel expiré avant son envoi', updated_at = now()
    where status = 'pending'
      and scheduled_for < now() - interval '15 minutes';

  return query
  with due as (
    select id
      from public.notification_deliveries
      where status = 'pending' and scheduled_for <= now()
      order by scheduled_for asc
      limit least(greatest(p_limit, 1), 50)
      for update skip locked
  ), claimed as (
    update public.notification_deliveries d
      set status = 'processing',
          processing_started_at = now(),
          attempts = d.attempts + 1,
          updated_at = now()
      from due
      where d.id = due.id
      returning d.*
  )
  select
    d.id,
    d.attempts,
    d.profile_id,
    d.screening_id,
    d.reminder_offset_minutes,
    s.title,
    s.starts_at,
    s.cinema_name,
    s.cinema_address,
    s.format
  from claimed d
  join public.cinema_screenings s on s.id = d.screening_id
  where s.status = 'scheduled';
end;
$$;

revoke all on function public.claim_due_notification_deliveries(integer) from public;

-- Fait exister le secret sans jamais le faire transiter dans une migration ou un
-- navigateur. Il sera seulement lu par le Cron dans son propre SQL.
insert into public.push_worker_credentials (singleton, worker_token)
values (true, encode(extensions.gen_random_bytes(32), 'hex'))
on conflict (singleton) do nothing;

-- Le worker refuse toute requête sans le jeton ci-dessus. Aucun JWT n'est requis
-- ici, car le Cron PostgreSQL n'a pas de session utilisateur ; les routes appelées
-- par l'app valident, elles, auth.getUser() dans la fonction Edge.
select cron.schedule(
  'bitter-push-reminders-every-minute',
  '* * * * *',
  $cron$
    select net.http_post(
      url := 'https://tnvnmsevddvcklkitnpa.supabase.co/functions/v1/push',
      headers := jsonb_build_object('Content-Type', 'application/json'),
      body := jsonb_build_object(
        'action', 'process',
        'workerToken', (select worker_token from public.push_worker_credentials where singleton)
      )
    );
  $cron$
);

comment on table public.cinema_screenings is
  'Séances futures personnelles, indépendantes de la watchlist et de l historique de films vus.';
comment on table public.push_subscriptions is
  'Abonnements Web Push par appareil ; endpoint supprimé dès qu il est invalide.';
comment on table public.notification_deliveries is
  'Rappels de séances planifiés et journalisés pour empêcher les doublons.';
