/**
 * Un seul verdict par film, qu'on le donne seul ou en groupe.
 *
 * POURQUOI CE MODULE EXISTE
 * Le verdict personnel vit dans `user_movies`, celui d'un espace dans
 * `movie_ratings`, et rien ne reliait les deux. Une note donnée dans un espace
 * n'apparaissait pas sur l'accueil de la personne ; une note donnée depuis
 * l'accueil n'arrivait jamais dans l'espace où le film attendait, et le groupe
 * relançait quelqu'un qui avait déjà tout dit. Relevé en prod le 5 octobre 2026 :
 * dix verdicts personnels sur des films d'un espace de leur auteur, sans aucune
 * note dans l'espace.
 *
 * Le sens espace → accueil est automatique : noter dans un espace, c'est noter.
 * Le sens accueil → espace l'est aussi pour un film **vu ensemble** : c'est le
 * serveur qui s'en charge (migration 20261008_note_perso_dans_espace), d'où
 * que vienne la note. Pour un film encore **à voir**, il se demande : un verdict
 * le ferait passer en « vu » pour tout le groupe, alors qu'on l'a peut-être vu seul.
 */
import { supabase, upsertMovieRating, markMovieAsWatched } from './supabase';
import { AdaptiveRatingData, Movie } from '../types';
import { getDisplayWeightedRating } from '../utils/rating';

/** Le même film dans un de mes espaces, et ce que j'y ai déjà dit. */
export interface SpaceCopy {
  sharedMovieId: string;
  spaceId: string;
  spaceName: string;
  status: 'watched' | 'watchlist';
  /** Mon verdict dans cet espace, nul si je n'y ai pas encore noté le film. */
  myRating: SpaceVerdict | null;
}

/** Un verdict tel que `movie_ratings` le stocke. */
export interface SpaceVerdict {
  story: number;
  visuals: number;
  acting: number;
  sound: number;
  review?: string;
  adaptive_rating?: AdaptiveRatingData | null;
  rating_mode?: 'bitter' | 'bitter_plus' | null;
}

/** Note finale d'un verdict d'espace, dans l'unité de `getDisplayWeightedRating`. */
export const spaceVerdictScore = (v: SpaceVerdict): number => {
  const weighted = v.adaptive_rating?.weightedRating;
  if (typeof weighted === 'number' && Number.isFinite(weighted)) return weighted;
  const avg = (Number(v.story) + Number(v.visuals) + Number(v.acting) + Number(v.sound)) / 4;
  return Math.round(avg * 10) / 10;
};

/**
 * Le verdict personnel, sous la forme d'un verdict d'espace.
 *
 * `comment` et non `review` : dans `Movie`, `review` porte le synopsis TMDB.
 */
export const verdictFromMovie = (movie: Movie): SpaceVerdict => ({
  story: Number(movie.ratings?.story) || 0,
  visuals: Number(movie.ratings?.visuals) || 0,
  acting: Number(movie.ratings?.acting) || 0,
  sound: Number(movie.ratings?.sound) || 0,
  review: movie.comment?.trim() || undefined,
  adaptive_rating: movie.adaptiveRating ?? null,
  rating_mode: movie.adaptiveRating ? 'bitter_plus' : 'bitter',
});

/**
 * L'espace a-t-il déjà exactement ce verdict ?
 *
 * On compare ce que le groupe lit : la note au dixième et le commentaire. Les
 * critères détaillés suivent la note ; les comparer un à un ferait reposer la
 * question pour un arrondi.
 */
const sameVerdict = (space: SpaceVerdict, movie: Movie): boolean =>
  Math.abs(spaceVerdictScore(space) - getDisplayWeightedRating(movie)) < 0.05 &&
  (space.review?.trim() || '') === (movie.comment?.trim() || '');

/**
 * Les espaces où ce film attend mon verdict, ou en porte un autre que le mien.
 *
 * Une œuvre entière seulement : une saison n'a pas de place dans un espace.
 * La RLS ne rend que les espaces dont je suis membre actif.
 */
export async function findSpacesToUpdate(movie: Movie, userId: string): Promise<SpaceCopy[]> {
  if (!supabase || !userId || !movie.tmdbId || movie.seasonNumber != null) return [];
  const mediaType = movie.mediaType === 'tv' ? 'tv' : 'movie';

  let query = supabase
    .from('shared_movies')
    .select('id, space_id, status, space:shared_spaces(name)')
    .eq('tmdb_id', movie.tmdbId);
  // Les toutes premières lignes n'avaient pas de type : ce sont des films.
  query = mediaType === 'movie' ? query.or('media_type.eq.movie,media_type.is.null') : query.eq('media_type', 'tv');
  const { data: copies, error } = await query;
  if (error || !copies?.length) {
    if (error && import.meta.env.DEV) console.warn('[Espaces] Recherche du film', error);
    return [];
  }

  const { data: mine } = await supabase
    .from('movie_ratings')
    .select('movie_id, story, visuals, acting, sound, review, adaptive_rating, rating_mode')
    .eq('profile_id', userId)
    .in(
      'movie_id',
      copies.map((c: any) => c.id)
    );
  const byMovie = new Map<string, SpaceVerdict>((mine ?? []).map((r: any) => [r.movie_id, r]));

  return copies
    .map((c: any) => ({
      sharedMovieId: c.id,
      spaceId: c.space_id,
      spaceName: (Array.isArray(c.space) ? c.space[0]?.name : c.space?.name) ?? '',
      status: c.status === 'watched' ? 'watched' : 'watchlist',
      myRating: byMovie.get(c.id) ?? null,
    }) as SpaceCopy)
    // Vu ensemble : le serveur y publie déjà la note, il n'y a rien à demander.
    .filter((c) => c.status === 'watchlist' && (!c.myRating || !sameVerdict(c.myRating, movie)));
}

/**
 * Publie le verdict personnel dans les espaces choisis.
 *
 * Le film bascule en « vu » s'il attendait encore : c'est la même règle que
 * dans l'espace, où la bascule suit la note. Le serveur la fait aussi (trigger
 * `movie_ratings_marks_watched`), parce que seul l'auteur de la proposition ou
 * un admin peut modifier la ligne `shared_movies` : l'appel d'ici ne vaut que
 * pour eux, et son échec ne retire rien au verdict.
 *
 * Rend les noms des espaces où le verdict est bien arrivé.
 */
export async function publishVerdictToSpaces(movie: Movie, userId: string, copies: SpaceCopy[]): Promise<string[]> {
  const verdict = verdictFromMovie(movie);
  const done: string[] = [];
  for (const copy of copies) {
    const published = await upsertMovieRating(copy.sharedMovieId, userId, verdict);
    if (!published.rating) continue;
    done.push(copy.spaceName);
    if (copy.status === 'watchlist') await markMovieAsWatched(copy.sharedMovieId);
  }
  return done;
}

/** « Ciné pote », « Ciné pote et Famille », « Ciné pote, Famille et Boulot ». */
export const joinSpaceNames = (names: string[], and: string): string => {
  const quoted = names.map((n) => `« ${n} »`);
  if (quoted.length <= 1) return quoted[0] ?? '';
  return `${quoted.slice(0, -1).join(', ')} ${and} ${quoted[quoted.length - 1]}`;
};
