import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';

/**
 * Bande originale d'un film : albums Deezer et extraits de 30 s.
 *
 * TMDB donne ce qui permet de reconnaître l'album (titre original, titre
 * anglais, compositeur) ; `api/soundtrack` cherche sur Deezer, qui n'accepte
 * pas les appels directs du navigateur. Le relais n'existe qu'une fois déployé :
 * en local, la fiche n'affiche simplement pas de bande originale.
 */

export interface SoundtrackTrack {
  id: number;
  title: string;
  /** En secondes, pour le morceau entier. */
  duration: number;
  /** Popularité Deezer : sert à montrer « les plus écoutés ». */
  rank: number;
  /** Lien signé de l'extrait ; il expire en un quart d'heure environ. */
  preview: string | null;
}

export interface SoundtrackAlbum {
  id: number;
  /** `score` : la musique composée. `songs` : les chansons du film. */
  kind: 'score' | 'songs';
  title: string;
  artist: string;
  cover: string;
  link: string;
  trackCount: number;
  duration: number;
  tracks: SoundtrackTrack[];
}

/**
 * Les extraits expirent en un quart d'heure environ : au-delà de dix minutes,
 * on recharge plutôt que de compter sur la reprise après erreur, qu'iOS peut
 * bloquer faute de geste.
 */
const FRESH_MS = 10 * 60_000;
const cache = new Map<number, { at: number; pending: Promise<SoundtrackAlbum[]> }>();

const COMPOSER_JOBS = new Set(['Original Music Composer', 'Music', 'Composer']);

async function filmHints(tmdbId: number, localTitle?: string) {
  const response = await fetch(
    `${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=en-US&append_to_response=credits`
  );
  if (!response.ok) throw Error('tmdb');
  const movie = await response.json();
  const composers: string[] = [
    ...new Set<string>(
      (movie.credits?.crew ?? [])
        .filter((person: { job?: string }) => COMPOSER_JOBS.has(person.job ?? ''))
        .map((person: { name: string }) => person.name)
    ),
  ];
  return {
    titles: [...new Set([movie.original_title, movie.title, localTitle].filter(Boolean) as string[])],
    year: Number(String(movie.release_date ?? '').slice(0, 4)) || undefined,
    composers: composers.slice(0, 3),
  };
}

async function load(tmdbId: number, localTitle?: string): Promise<SoundtrackAlbum[]> {
  const hints = await filmHints(tmdbId, localTitle);
  const params = new URLSearchParams({ tmdb: String(tmdbId) });
  hints.titles.slice(0, 3).forEach((title) => params.append('t', title));
  hints.composers.forEach((name) => params.append('c', name));
  if (hints.year) params.set('y', String(hints.year));
  const response = await fetch(`/api/soundtrack?${params}`);
  if (!response.ok) throw Error('soundtrack');
  const body = await response.json();
  return Array.isArray(body?.albums) ? body.albums : [];
}

/** Les albums du film, la musique composée d'abord. Vide quand rien ne correspond. */
export function getSoundtrack(tmdbId: number, localTitle?: string): Promise<SoundtrackAlbum[]> {
  const known = cache.get(tmdbId);
  if (known && Date.now() - known.at < FRESH_MS) return known.pending;
  const pending = load(tmdbId, localTitle).catch((error) => {
    // Un échec réseau ne doit pas condamner le film pour toute la session.
    cache.delete(tmdbId);
    throw error;
  });
  cache.set(tmdbId, { at: Date.now(), pending });
  return pending;
}

/** Un lien d'extrait frais, quand celui de la liste a expiré. */
export async function freshPreview(trackId: number): Promise<string | null> {
  const response = await fetch(`/api/soundtrack?track=${trackId}`);
  if (!response.ok) return null;
  const body = await response.json();
  return typeof body?.preview === 'string' ? body.preview : null;
}

/**
 * « The Odyssey (Original Motion Picture Soundtrack) » → « The Odyssey ». La
 * mention entre parenthèses répète ce que dit déjà l'en-tête « Bande originale »
 * et coupait le titre sur une ligne.
 */
export const albumDisplayTitle = (album: SoundtrackAlbum) => album.title.split(/\s[(\[]/)[0].trim() || album.title;

/** Les morceaux les plus écoutés, pour l'aperçu de la fiche. */
export const topTracks = (album: SoundtrackAlbum, count = 3) =>
  [...album.tracks].sort((a, b) => b.rank - a.rank).slice(0, count);

/** « 1 h 58 » ou « 42 min ». */
export const albumLength = (seconds: number) => {
  const minutes = Math.round(seconds / 60);
  return minutes >= 60 ? `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')}` : `${minutes} min`;
};

/** « 3:35 ». */
export const trackLength = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`;

export const spotifySearchUrl = (album: SoundtrackAlbum) =>
  `https://open.spotify.com/search/${encodeURIComponent(album.title)}`;

export const appleMusicSearchUrl = (album: SoundtrackAlbum) =>
  `https://music.apple.com/fr/search?term=${encodeURIComponent(album.title)}`;
