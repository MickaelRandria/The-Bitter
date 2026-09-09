import { Movie } from '../types';
import { isSeason, isSeries } from './workKey';

/**
 * Statistiques partagées entre les écrans.
 *
 * Le but est qu'un même chiffre ne soit jamais calculé deux fois différemment :
 * le feed, les analytics et le profil doivent afficher la même valeur pour les
 * mêmes films.
 */

/**
 * Durée totale de visionnage, en heures arrondies.
 *
 * Les lignes-séries sont **écartées** : leur `runtime` est celui d'un seul
 * épisode, et les compter reviendrait soit à ajouter huit minutes pour une
 * saison entière, soit — si on les additionnait aux saisons — à compter deux
 * fois le même temps passé. Ce sont les saisons qui portent la durée, estimée à
 * partir du nombre d'épisodes.
 */
export const totalWatchHours = (movies: Movie[]): number =>
  Math.round(
    movies.filter((m) => !isSeries(m)).reduce((acc, m) => acc + (m.runtime || 0), 0) / 60
  );

/**
 * La durée affichée repose-t-elle en partie sur une estimation ?
 *
 * Une saison n'a pas de durée relevée : on multiplie la durée d'un épisode par
 * leur nombre. C'est une approximation raisonnable, mais l'écran doit le dire
 * plutôt que de présenter le total comme un chiffre mesuré.
 */
export const hasEstimatedRuntime = (movies: Movie[]): boolean => movies.some(isSeason);

/** Séries suivies : les lignes-séries, quel que soit leur état d'avancement. */
export const countSeries = (movies: Movie[]): number => movies.filter(isSeries).length;

/** Saisons terminées, d'après la progression déclarée sur chaque série. */
export const countSeasonsCompleted = (movies: Movie[]): number =>
  movies.filter(isSeries).reduce((acc, s) => acc + (s.tvProgress?.seasonsWatched?.length ?? 0), 0);

/**
 * Genre favori = le genre le plus vu (et non le mieux noté).
 * Départage les ex æquo par ordre alphabétique pour rester stable d'un rendu à l'autre.
 */
export const dominantGenre = (movies: Movie[]): string | null => {
  const counts = new Map<string, number>();
  movies.forEach((m) => {
    if (m.genre) counts.set(m.genre, (counts.get(m.genre) ?? 0) + 1);
  });
  const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return sorted[0]?.[0] ?? null;
};

/**
 * Un film compte comme « ambiance renseignée » si ses vibes ont été touchées.
 * Le formulaire initialise tous les axes à 5 : un film resté à 5 partout n'apporte
 * aucune information et ne doit pas alimenter le radar ADN ni le moteur de mood.
 */
export const hasCustomVibe = (movie: Movie): boolean =>
  !!movie.vibe && Object.values(movie.vibe).some((v) => v !== 5);

/** Nombre de films dont l'ambiance a réellement été renseignée. */
export const countCustomVibes = (movies: Movie[]): number => movies.filter(hasCustomVibe).length;

/** Seuil à partir duquel le radar ADN et les moods deviennent exploitables. */
export const MIN_MOVIES_FOR_VIBES = 3;

/** Un film nourrit le nouvel ADN dès qu'au moins une empreinte Bitter+ a été choisie. */
export const hasEmotionalImprints = (movie: Movie): boolean =>
  (movie.adaptiveRating?.imprints?.length ?? 0) > 0;

/** Nombre de films qui peuvent alimenter la signature d'empreintes. */
export const countMoviesWithImprints = (movies: Movie[]): number =>
  movies.filter(hasEmotionalImprints).length;

/** Cinq films évitent qu'une signature repose sur une seule soirée de cinéma. */
export const MIN_MOVIES_FOR_IMPRINTS = 5;
