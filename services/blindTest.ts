import { supabase, type SharedMovie } from './supabase';
import { getSoundtrack, type SoundtrackTrack } from './soundtrack';

/**
 * Blind test BO d'un espace : un extrait de bande originale, quatre films de
 * l'espace, un seul est le bon.
 *
 * Les extraits viennent du relais Deezer de la fiche film (`api/soundtrack`).
 * Les séries sont écartées : le relais ne cherche que des BO de films.
 */

export const QUESTION_COUNT = 10;
export const QUESTION_SECONDS = 20;
/** En dessous, un quiz à quatre choix n'a pas de sens. */
export const MIN_FILMS = 4;
/** Moins de questions jouables que ça : on ne lance pas une partie. */
const MIN_QUESTIONS = 3;

export interface BlindQuestion {
  answer: SharedMovie;
  track: SoundtrackTrack;
  options: SharedMovie[];
}

export interface BlindScore {
  profileId: string;
  score: number;
  total: number;
  durationMs: number;
  createdAt: string;
}

const shuffle = <T,>(list: T[]): T[] => {
  const copy = [...list];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

/** Les films de l'espace qui peuvent servir : des films, avec un identifiant TMDB, sans doublon. */
export function playableFilms(movies: SharedMovie[]): SharedMovie[] {
  const seen = new Set<number>();
  return movies.filter((movie) => {
    if (movie.tmdb_id == null || movie.media_type === 'tv' || seen.has(movie.tmdb_id)) return false;
    seen.add(movie.tmdb_id);
    return true;
  });
}

/**
 * Un morceau de la BO, tiré parmi les plus écoutés : un thème connu se
 * reconnaît, une piste d'ambiance obscure ne fait que frustrer. La musique
 * composée passe avant les chansons, comme sur la fiche.
 */
async function pickTrack(movie: SharedMovie): Promise<SoundtrackTrack | null> {
  try {
    const albums = await getSoundtrack(movie.tmdb_id!, movie.title);
    for (const album of albums) {
      const top = album.tracks
        .filter((track) => track.preview)
        .sort((a, b) => b.rank - a.rank)
        .slice(0, 5);
      if (top.length) return top[Math.floor(Math.random() * top.length)];
    }
  } catch {
    // Pas de BO trouvée pour ce film : il sert seulement de leurre.
  }
  return null;
}

/**
 * Prépare une partie. Les films sont essayés au hasard, quatre à la fois,
 * jusqu'à avoir assez de questions. Rend une liste vide quand l'espace n'a pas
 * assez de BO trouvables.
 */
export async function buildQuestions(
  movies: SharedMovie[],
  onProgress?: (ready: number) => void
): Promise<BlindQuestion[]> {
  const films = playableFilms(movies);
  if (films.length < MIN_FILMS) return [];
  const queue = shuffle(films);
  const found: { movie: SharedMovie; track: SoundtrackTrack }[] = [];

  while (queue.length && found.length < QUESTION_COUNT) {
    const batch = queue.splice(0, 4);
    const tracks = await Promise.all(batch.map(pickTrack));
    batch.forEach((movie, i) => {
      const track = tracks[i];
      if (track && found.length < QUESTION_COUNT) found.push({ movie, track });
    });
    onProgress?.(found.length);
  }
  if (found.length < MIN_QUESTIONS) return [];

  return found.map(({ movie, track }) => ({
    answer: movie,
    track,
    options: shuffle([movie, ...shuffle(films.filter((film) => film.tmdb_id !== movie.tmdb_id)).slice(0, 3)]),
  }));
}

export async function saveBlindScore(
  spaceId: string,
  profileId: string,
  score: number,
  total: number,
  durationMs: number
): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.from('blind_test_scores').insert({
    space_id: spaceId,
    profile_id: profileId,
    score,
    total,
    duration_ms: Math.max(0, Math.round(durationMs)),
  });
  return !error;
}

/** La meilleure partie de chaque membre, du meilleur score au moins bon ; le plus rapide départage. */
export async function getBlindLeaderboard(spaceId: string): Promise<BlindScore[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('blind_test_scores')
    .select('profile_id, score, total, duration_ms, created_at')
    .eq('space_id', spaceId)
    .order('score', { ascending: false })
    .order('duration_ms', { ascending: true })
    .limit(200);
  if (error || !data) return [];
  const best = new Map<string, BlindScore>();
  for (const row of data) {
    if (best.has(row.profile_id)) continue;
    best.set(row.profile_id, {
      profileId: row.profile_id,
      score: row.score,
      total: row.total,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    });
  }
  return [...best.values()];
}
