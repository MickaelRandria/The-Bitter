import { Movie } from '../types';

/**
 * Statistiques partagées entre les écrans.
 *
 * Le but est qu'un même chiffre ne soit jamais calculé deux fois différemment :
 * le feed, les analytics et le profil doivent afficher la même valeur pour les
 * mêmes films.
 */

/** Durée totale de visionnage, en heures arrondies. */
export const totalWatchHours = (movies: Movie[]): number =>
  Math.round(movies.reduce((acc, m) => acc + (m.runtime || 0), 0) / 60);

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
