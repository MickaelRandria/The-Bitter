-- Les titres d'épisodes de chaque saison (TMDB, anglais et français), pour
-- qu'aucune anecdote ne cite celui d'un épisode d'une saison pas encore atteinte.
-- Rempli par la fonction series-trivia ; null pour une ligne préparée avant,
-- complété au prochain « Le saviez-vous + », sans Mistral.

alter table public.series_trivia add column if not exists episode_titles jsonb;
