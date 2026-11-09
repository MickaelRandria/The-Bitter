-- Campagnes du cockpit : consentement et journal des envois.
--
-- `marketing_consent` est distinct de `email_notifications`, activé par défaut
-- pour tout le monde : null = question pas encore posée, et seul un « oui »
-- explicite ouvre les relances. Une désinscription (`email_notifications` à
-- false) les coupe aussi.
alter table public.profiles add column if not exists marketing_consent boolean;
alter table public.profiles add column if not exists marketing_consent_at timestamptz;

-- RLS activée sans politique : seule la clé de service de `cockpit` y accède.
create table if not exists public.cockpit_campaigns (
  id uuid primary key default gen_random_uuid(),
  segment text not null,
  subject text not null,
  body text not null,
  recipients integer not null default 0,
  failed integer not null default 0,
  created_at timestamptz not null default now()
);
alter table public.cockpit_campaigns enable row level security;

create table if not exists public.cockpit_campaign_sends (
  campaign_id uuid not null references public.cockpit_campaigns (id) on delete cascade,
  profile_id uuid not null references auth.users (id) on delete cascade,
  sent_at timestamptz not null default now(),
  primary key (campaign_id, profile_id)
);
create index if not exists cockpit_campaign_sends_profile_idx
  on public.cockpit_campaign_sends (profile_id, sent_at desc);
alter table public.cockpit_campaign_sends enable row level security;
