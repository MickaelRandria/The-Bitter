-- Séries TV, phase A — colonnes seules, sans toucher aux contraintes.
--
-- POURQUOI DEUX PHASES, ET POURQUOI LES DEUX CONTRAINTES COEXISTENT
-- PostgREST traduit `onConflict: 'a,b'` en `ON CONFLICT (a, b)`, qui EXIGE un
-- index unique portant exactement ces colonnes. Il y a donc deux façons de tout
-- casser :
--   - supprimer l'ancienne contrainte avant que le nouveau code soit en ligne
--     → l'ancien code tombe en erreur 42P10 ;
--   - déployer le nouveau code avant que la nouvelle contrainte existe
--     → le nouveau code tombe en 42P10 de la même manière.
--
-- Les deux contraintes peuvent parfaitement cohabiter : cette phase A ajoute la
-- nouvelle SANS toucher à l'ancienne. L'ancien code et le nouveau écrivent alors
-- tous les deux, chacun sur la contrainte qu'il nomme, et il n'existe aucune
-- fenêtre de rupture. La phase B ne fait plus que retirer l'ancienne, une fois
-- le nouveau code partout.
--
-- Aucun risque de conflit à l'ajout : toutes les lignes existantes ont
-- `season_number` nul, et elles sont déjà uniques sur (profile_id, tmdb_id),
-- dont la nouvelle clé est un sur-ensemble.
--
-- Tant que l'ancienne contrainte est là, un film et une série partageant un
-- numéro TMDB restent refusés — c'est la phase B qui débloque ce cas, et lui
-- seul. Tout le reste de la fonctionnalité est utilisable dès la phase A.
--
-- MODÈLE RETENU : une saison EST un film.
-- Une saison est une ligne `user_movies` de plus, avec `media_type='tv'` et un
-- `season_number`. Elle hérite ainsi de Bitter/Bitter+, des cartes, de la
-- synchronisation et des sauvegardes sans code dédié. La série n'est qu'un
-- dossier au-dessus, porteur de la progression.
--
-- `tmdb_id` d'une ligne-saison est l'identifiant TMDB DE LA SAISON
-- (`/tv/{id}/season/{n}` renvoie son propre `id`), pas celui de la série :
-- `series_tmdb_id` porte le lien vers la série. C'est ce qui permet aux saisons
-- de cohabiter sous l'ancienne contrainte, et donc de scinder la migration.
--
-- `season_number` nul signifie « l'œuvre entière » : un film, ou la ligne-série
-- qui porte la progression. TMDB réservant la saison 0 aux épisodes spéciaux,
-- 0 n'était pas disponible comme valeur neutre.

alter table public.user_movies
  add column if not exists season_number     integer,
  add column if not exists series_tmdb_id    integer,
  add column if not exists series_title      text,
  add column if not exists number_of_seasons integer,
  add column if not exists tv_progress       jsonb;

comment on column public.user_movies.season_number is
  'Numéro de saison. Nul = l''œuvre entière (un film, ou la ligne-série qui porte la progression). La saison 0 existe chez TMDB : ce sont les épisodes spéciaux.';

comment on column public.user_movies.series_tmdb_id is
  'Identifiant TMDB de la série parente. Présent sur les lignes-saisons ; c''est lui qui les regroupe.';

comment on column public.user_movies.tv_progress is
  'Progression personnelle, portée par la ligne-série uniquement : { state, lastSeason, lastEpisode, seasonsWatched, updatedAt }. Distincte de `status` : « à jour » n''est pas « série terminée ».';

-- `shared_movies` : la colonne manquait alors que components/AddMovieModal.tsx
-- l'envoyait déjà. PostgREST rejetait donc l'insert, et **ajouter une série à un
-- espace échouait** — ce qui explique les 0 lignes `media_type='tv'` de cette
-- table. On ajoute la colonne plutôt que de retirer le champ : l'intention du
-- code était juste, c'est le schéma qui était en retard.
alter table public.shared_movies
  add column if not exists number_of_seasons integer,
  add column if not exists season_number     integer,
  add column if not exists series_tmdb_id    integer;

-- La nouvelle clé d'identité, POSÉE À CÔTÉ de l'ancienne (voir l'en-tête).
-- `nulls not distinct` demande PostgreSQL 15 ou plus ; la base est en 17.6.
-- Sans lui, deux lignes à `season_number` nul seraient considérées distinctes
-- et la contrainte ne protégerait plus les films.
alter table public.user_movies
  drop constraint if exists user_movies_work_key;

alter table public.user_movies
  add constraint user_movies_work_key
  unique nulls not distinct (profile_id, media_type, tmdb_id, season_number);

comment on constraint user_movies_work_key on public.user_movies is
  'Identité d''une œuvre dans l''historique d''un profil. Destinée à remplacer UNIQUE(profile_id, tmdb_id), qui confond un film et une série partageant un numéro TMDB.';
