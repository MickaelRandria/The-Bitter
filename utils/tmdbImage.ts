/**
 * Construction et redimensionnement des URLs d'images TMDB.
 *
 * `TMDB_IMAGE_URL` (constants.ts) reste en `w780` : c'est la taille stockée dans
 * `movie.posterUrl`. Ces helpers servent à demander la taille réellement affichée,
 * une vignette de 64px n'ayant pas besoin d'un poster de 780px de large.
 */

export type TmdbImageSize = 'w92' | 'w154' | 'w185' | 'w342' | 'w500' | 'w780' | 'original';

const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p';

/** Construit une URL TMDB à partir d'un `poster_path` / `profile_path` / `logo_path`. */
export const tmdbImage = (
  path: string | null | undefined,
  size: TmdbImageSize = 'w342'
): string => {
  if (!path) return '';
  // Certains avatars TMDB contiennent une URL absolue préfixée d'un "/"
  if (path.startsWith('/http')) return path.slice(1);
  if (path.startsWith('http')) return path;
  return `${TMDB_IMAGE_BASE}/${size}${path.startsWith('/') ? path : `/${path}`}`;
};

/**
 * Réécrit une URL TMDB déjà stockée (ex. `posterUrl` en w780) vers une autre taille.
 * Les URLs non-TMDB sont renvoyées telles quelles.
 */
export const resizeTmdbImage = (
  url: string | null | undefined,
  size: TmdbImageSize
): string | undefined => {
  if (!url) return undefined;
  return url.replace(/\/t\/p\/[^/]+\//, `/t/p/${size}/`);
};
