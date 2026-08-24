-- Cinéma favori : un seul établissement, porté par le profil.
--
-- Comme `cinema_subscription`, cette configuration ne mérite pas de table :
-- c'est une préférence unique, lue à chaque ouverture d'une fiche film pour
-- savoir où en chercher les horaires. Une liste de cinémas suivis viendrait
-- avec un modèle relationnel ; la v1 n'en a pas besoin.
--
-- Forme attendue : { "id": "10", "name": "UGC Ciné Cité Les Halles", "city": "Paris" }
-- L'identifiant est celui d'UGC : c'est lui que l'Edge Function `cinema-directory`
-- envoie au site pour obtenir la grille horaire.
--
-- Migration additive et nullable : les anciens profils et les anciens backups
-- restent valides sans reprise de données.

alter table public.profiles
  add column if not exists favorite_cinema jsonb;

comment on column public.profiles.favorite_cinema is
  'Cinéma UGC favori du profil ({id, name, city}), utilisé pour afficher les séances sur la fiche film.';
