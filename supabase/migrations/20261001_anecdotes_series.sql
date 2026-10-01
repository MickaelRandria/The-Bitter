-- « Le saviez-vous ? » : les anecdotes et quiz de coulisses d'une série.
--
-- Générés une fois par série et par langue par la fonction Edge `series-trivia`
-- (Wikipédia + Mistral), puis servis à tout le monde depuis cette table. Le
-- filtre anti-spoiler (saison atteinte, noms qui n'arrivent que plus tard)
-- s'applique à la lecture, dans la fonction : la table garde tout, avec de
-- quoi filtrer (`introduced` : pour chaque saison, les noms qui y apparaissent
-- pour la première fois).
--
-- Aucune politique RLS : seule la fonction, avec la clé de service, y lit et
-- y écrit. Le navigateur ne voit jamais la liste complète, seulement ce que la
-- fonction juge montrable à la saison de chacun.

create table if not exists public.series_trivia (
  tmdb_id integer not null,
  language text not null check (language in ('fr', 'en')),
  items jsonb not null default '[]'::jsonb,
  introduced jsonb not null default '{}'::jsonb,
  sources jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (tmdb_id, language)
);

alter table public.series_trivia enable row level security;

comment on table public.series_trivia is
  'Anecdotes et quiz de coulisses par série (fonction series-trivia). Lecture et écriture réservées à la clé de service.';
