-- Historique des notes d'un film.
--
-- Modifier sa note l'écrasait : la première impression disparaissait au premier
-- réajustement. L'app garde désormais chaque note remplacée — sa valeur, le
-- profil de la grille d'alors, la date du changement — dans cette colonne
-- (voir utils/ratingHistory.ts).
--
-- À appliquer AVANT de fusionner le front : la synchro envoie `rating_history`
-- dans chaque upsert, et une colonne absente ferait échouer l'enregistrement
-- de toute la collection.

alter table public.user_movies
  add column if not exists rating_history jsonb;

comment on column public.user_movies.rating_history is
  'Notes remplacées, de la plus ancienne à la plus récente : [{ rating, profileId?, replacedAt }]. Null tant que la note n''a jamais changé.';
