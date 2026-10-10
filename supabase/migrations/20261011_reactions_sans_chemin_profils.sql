-- Les notes des espaces ne s'affichaient plus (11 octobre 2026).
--
-- `review_reactions` (migration 20261010) pointait vers `movie_ratings` ET vers
-- `profiles` : PostgREST y voyait un second chemin entre les notes et les profils,
-- et refusait `movie_ratings?select=*,profile:profiles(...)` (PGRST201). La
-- lecture des notes de l'espace échouait, tous les films semblaient non notés.
-- Aucune donnée n'était perdue.
--
-- La réaction pointe désormais vers le compte (`auth.users`) : plus de second
-- chemin, et les versions de l'app restées en cache refonctionnent sans mise à
-- jour. L'app nomme aussi la relation (`profiles!movie_ratings_profile_id_fkey`).
--
-- Règle : une table qui référence à la fois `profiles` et une autre table déjà
-- liée à `profiles` crée ce genre d'ambiguïté. Lier la personne à `auth.users`.
alter table public.review_reactions drop constraint if exists review_reactions_profile_id_fkey;
alter table public.review_reactions
  add constraint review_reactions_profile_id_fkey foreign key (profile_id) references auth.users(id) on delete cascade;
notify pgrst, 'reload schema';
