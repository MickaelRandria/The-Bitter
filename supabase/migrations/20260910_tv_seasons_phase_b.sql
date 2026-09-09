-- Séries TV, phase B — retrait de l'ancienne clé d'unicité.
--
-- ⚠️ NE PAS APPLIQUER AVANT QUE LE NOUVEAU CODE SOIT DÉPLOYÉ ET VÉRIFIÉ EN
-- PRODUCTION (§6.7 de la passation : le statut GitHub ne prouve rien).
--
-- La nouvelle contrainte `user_movies_work_key` a déjà été posée en phase A,
-- à côté de l'ancienne. Les deux cohabitent depuis, ce qui a permis à l'ancien
-- code et au nouveau d'écrire pendant toute la recette sans fenêtre de rupture.
--
-- Cette phase-ci ne fait plus qu'une chose : retirer `UNIQUE (profile_id,
-- tmdb_id)`. Tant qu'elle est là, elle refuse qu'un film et une série portent
-- le même numéro TMDB pour un même profil — c'est le dernier cas que la
-- fonctionnalité Séries n'ait pas encore débloqué.
--
-- Condition à vérifier avant de jouer ceci : plus aucun appelant n'utilise
-- `onConflict: 'profile_id,tmdb_id'`.
--
--   grep -rn "profile_id,tmdb_id" services/
--
-- doit ne rien rendre. Sinon, l'écriture concernée tombera en erreur 42P10 dès
-- le retrait, silencieusement — c'est exactement le mode de panne que la
-- découpe en deux phases sert à éviter.

alter table public.user_movies
  drop constraint if exists user_movies_profile_id_tmdb_id_key;
