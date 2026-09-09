import { Movie } from '../types';

/**
 * Identité d'une œuvre dans l'historique d'un profil.
 *
 * POURQUOI CE MODULE EXISTE
 * Tout indexait sur le seul `tmdbId` : la fusion local/serveur, les
 * suppressions douces, le jeu des identifiants déjà synchronisés. Or les
 * espaces de nommage TMDB des films, des séries et des saisons sont
 * indépendants et se recoupent : rien n'empêche un film et une série de porter
 * le même numéro, et deux saisons d'une même série ont chacune le leur. Un seul
 * nombre ne suffit donc plus à désigner une ligne.
 *
 * La clé est une chaîne et non un objet : elle sert de clé de `Map` et de `Set`,
 * où l'égalité structurelle n'existe pas.
 */
export type WorkKey = string;

/** Ce qu'il faut d'une œuvre pour l'identifier. */
export type WorkIdentity = Pick<Movie, 'mediaType' | 'tmdbId' | 'seasonNumber'>;

/**
 * `movie:603:` — un film. `tv:1396:` — une série. `tv:3572:2` — sa saison 2.
 *
 * Les œuvres sans `tmdbId` (saisies à la main) reçoivent une clé `local` : elles
 * ne peuvent pas être dédoublonnées entre appareils, faute de référence
 * commune. Les appelants qui synchronisent les écartent déjà pour cette raison ;
 * `isSyncable` rend ce test explicite plutôt que de le réécrire à chaque fois.
 */
export const workKey = (work: WorkIdentity): WorkKey =>
  `${work.mediaType ?? 'movie'}:${work.tmdbId ?? 'local'}:${work.seasonNumber ?? ''}`;

/** Vrai quand l'œuvre a une référence TMDB, donc une clé stable entre appareils. */
export const isSyncable = (work: WorkIdentity): boolean => work.tmdbId != null;

/** Une ligne-série : l'œuvre entière, par opposition à une de ses saisons. */
export const isSeries = (work: Pick<Movie, 'mediaType' | 'seasonNumber'>): boolean =>
  work.mediaType === 'tv' && work.seasonNumber == null;

/** Une ligne-saison, l'objet réellement noté dans la partie Séries. */
export const isSeason = (work: Pick<Movie, 'mediaType' | 'seasonNumber'>): boolean =>
  work.mediaType === 'tv' && work.seasonNumber != null;

/** Les saisons d'une série donnée, dans l'ordre de diffusion. */
export const seasonsOf = (movies: Movie[], seriesTmdbId: number | undefined): Movie[] => {
  if (seriesTmdbId == null) return [];
  return movies
    .filter((m) => isSeason(m) && m.seriesTmdbId === seriesTmdbId)
    .sort((a, b) => (a.seasonNumber ?? 0) - (b.seasonNumber ?? 0));
};
