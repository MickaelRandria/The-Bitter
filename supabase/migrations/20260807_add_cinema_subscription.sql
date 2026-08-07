-- Abonnement cinéma : aucun nouveau modèle relationnel n'est nécessaire.
-- Le profil porte sa configuration active et chaque film conserve son tableau
-- de séances, qui inclut le viewingContext propre à chaque visionnage.
--
-- Cette migration est additive : les anciennes données et les anciens backups
-- restent compatibles car les deux colonnes sont nullables.

alter table public.profiles
  add column if not exists cinema_subscription jsonb;

alter table public.user_movies
  add column if not exists watches jsonb;

comment on column public.profiles.cinema_subscription is
  'CinemaSubscription active du profil, stockée en JSONB.';

comment on column public.user_movies.watches is
  'MovieWatch[] avec viewingContext par séance, incluant les rewatches.';
