import { supabase, type SharedMovie } from './supabase';
import { getSoundtrack, type SoundtrackTrack } from './soundtrack';

/**
 * Blind test BO d'un espace : un extrait de bande originale, quatre films de
 * l'espace, un seul est le bon.
 *
 * Personne ne connaît les BO par cœur : des indices arrivent pendant l'écoute
 * (`HINT_SECONDS`), et répondre avant eux rapporte plus (`pointsFor`).
 *
 * Les extraits viennent du relais Deezer de la fiche film (`api/soundtrack`).
 * Les séries sont écartées : le relais ne cherche que des BO de films.
 */

/** Six questions à trois points : 18, sous le plafond de 20 de la table et du ping. */
export const QUESTION_COUNT = 6;
export const QUESTION_SECONDS = 20;
/** Premier indice (réalisateur, année), puis deux mauvaises réponses écartées. */
export const HINT_SECONDS = [7, 14] as const;
export const MAX_POINTS = 3;

/** 3 points avant tout indice, 2 après le premier, 1 après le second. */
export const pointsFor = (spentMs: number): number =>
  MAX_POINTS - HINT_SECONDS.filter((s) => spentMs >= s * 1000).length;
/** En dessous, un quiz à quatre choix n'a pas de sens. */
export const MIN_FILMS = 4;
/** Moins de questions jouables que ça : on ne lance pas une partie. */
const MIN_QUESTIONS = 3;

export interface BlindQuestion {
  answer: SharedMovie;
  track: SoundtrackTrack;
  options: SharedMovie[];
  /** Les deux mauvaises réponses écartées au second indice. */
  dropped: number[];
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

/** Un titre de thème : « Main Theme », « Suite », « Opening », ou le nom du film. */
const THEME = /\b(main|theme|th[eè]me|suite|opening|title|titles|prologue|end credits)\b/i;

const normalize = (text: string) =>
  text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** Le morceau le plus écouté l'emporte, un titre de thème compte double. */
export function trackWeight(track: Pick<SoundtrackTrack, 'title' | 'rank'>, filmTitle: string): number {
  const film = normalize(filmTitle);
  const themed = THEME.test(track.title) || (film.length > 2 && normalize(track.title).includes(film));
  return (track.rank || 0) * (themed ? 2 : 1) + (themed ? 1 : 0);
}

/**
 * Le morceau le plus reconnaissable de la BO : le thème, ou le plus écouté.
 * Une piste d'ambiance obscure ne fait que frustrer. La musique composée passe
 * avant les chansons, comme sur la fiche.
 */
async function pickTrack(movie: SharedMovie): Promise<SoundtrackTrack | null> {
  try {
    const albums = await getSoundtrack(movie.tmdb_id!, movie.title);
    for (const album of albums) {
      const top = album.tracks
        .filter((track) => track.preview)
        .sort((a, b) => trackWeight(b, movie.title) - trackWeight(a, movie.title))
        .slice(0, 2);
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

  return found.map(({ movie, track }) => {
    const options = shuffle([movie, ...shuffle(films.filter((film) => film.tmdb_id !== movie.tmdb_id)).slice(0, 3)]);
    const wrong = options.map((option, i) => (option.tmdb_id === movie.tmdb_id ? -1 : i)).filter((i) => i >= 0);
    return { answer: movie, track, options, dropped: shuffle(wrong).slice(0, 2) };
  });
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

/**
 * La meilleure partie de chaque membre, du meilleur score au moins bon ; le plus
 * rapide départage. Comparé en proportion : les premières parties se jouaient
 * sur 10 questions à un point.
 */
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
  const ratio = (s: { score: number; total: number }) => s.score / Math.max(1, s.total);
  const better = (a: BlindScore, b: BlindScore) => ratio(b) - ratio(a) || a.durationMs - b.durationMs;
  const best = new Map<string, BlindScore>();
  for (const row of data) {
    const entry: BlindScore = {
      profileId: row.profile_id,
      score: row.score,
      total: row.total,
      durationMs: row.duration_ms,
      createdAt: row.created_at,
    };
    const known = best.get(row.profile_id);
    if (!known || better(entry, known) < 0) best.set(row.profile_id, entry);
  }
  return [...best.values()].sort(better);
}
