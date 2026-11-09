-- Mode admin du cockpit : compteur d'essais de mot de passe.
--
-- Vit en base pour survivre aux redémarrages de la fonction : un compteur en
-- mémoire se remettrait à zéro et laisserait deviner le mot de passe sans limite.
-- RLS activée sans politique : seule la clé de service de `cockpit` y accède.
create table if not exists public.cockpit_unlock_attempts (
  user_id uuid primary key references auth.users (id) on delete cascade,
  failures integer not null default 0,
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.cockpit_unlock_attempts enable row level security;
