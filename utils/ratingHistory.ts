import type { Movie, RatingRevision } from '../types';

/**
 * L'historique des notes d'un film.
 *
 * Modifier une note l'écrasait : la première impression, souvent la plus
 * franche, disparaissait au premier réajustement. On garde désormais chaque
 * note remplacée, avec son profil — « 8,5 en Drame » et « 8,5 en Action » ne
 * disent pas la même chose — et la date où elle a cessé d'être la bonne.
 *
 * Module sans dépendance, pour être testé tel quel (tests/ratingHistory.test.mjs).
 */

/** Au-delà, les plus anciennes modifications sortent ; la toute première note reste. */
export const RATING_HISTORY_LIMIT = 20;

type Rated = Pick<Movie, 'status' | 'ratings' | 'adaptiveRating'>;

/** La note telle qu'affichée, au dixième — même calcul que `getDisplayWeightedRating`. */
export function ratingOf(movie: Rated): number | null {
  if (movie.status !== 'watched') return null;
  if (movie.adaptiveRating) return movie.adaptiveRating.weightedRating;
  const r = movie.ratings;
  if (!r) return null;
  const sum = r.story + r.visuals + r.acting + r.sound;
  // L'ancienne notation ne distingue pas « pas noté » de « zéro partout » : un
  // film sans aucune valeur n'a pas de note à archiver.
  if (!(sum > 0)) return null;
  return Math.round((sum / 4) * 10) / 10;
}

const profileOf = (movie: Rated): string | undefined => {
  const id = movie.adaptiveRating?.profile?.id;
  // Une note d'avant Bitter+ est, de fait, une grille Standard.
  if (!id || id === 'standard_legacy') return movie.adaptiveRating || ratingOf(movie) != null ? 'standard' : undefined;
  return id;
};

/**
 * L'historique après enregistrement de `next` à la place de `previous`.
 *
 * Rien n'est ajouté si la note et le profil n'ont pas bougé : corriger une date
 * ou écrire son avis n'est pas changer d'avis. Un film qui passe de « à voir » à
 * « vu » n'avait pas de note à remplacer.
 */
export function withRatingRevision(
  previous: Rated & { ratingHistory?: RatingRevision[] },
  next: Rated,
  replacedAt: string = new Date().toISOString()
): RatingRevision[] | undefined {
  const history = previous.ratingHistory;
  const before = ratingOf(previous);
  if (before == null) return history;

  const after = ratingOf(next);
  const sameRating = after != null && Math.abs(after - before) < 0.05;
  if (sameRating && profileOf(previous) === profileOf(next)) return history;

  const revision: RatingRevision = { rating: before, replacedAt };
  const profileId = profileOf(previous);
  if (profileId) revision.profileId = profileId;

  const list = [...(history ?? []), revision];
  if (list.length <= RATING_HISTORY_LIMIT) return list;
  // On garde la première note et les plus récentes : c'est l'écart entre les
  // deux qui raconte quelque chose, pas les retouches du milieu.
  return [list[0], ...list.slice(list.length - RATING_HISTORY_LIMIT + 1)];
}

/** La toute première note posée, s'il y en a eu d'autres depuis. */
export function firstRating(movie: { ratingHistory?: RatingRevision[] }): RatingRevision | null {
  return movie.ratingHistory?.length ? movie.ratingHistory[0] : null;
}
