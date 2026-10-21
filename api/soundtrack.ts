import { confirmYear, pickAlbums, searchQueries } from './_soundtrack-match.js';
import type { AlbumKind, DeezerAlbumHit, FilmHints } from './_soundtrack-match.js';

/**
 * Bande originale d'un film, relayée depuis Deezer.
 *
 * L'API Deezer est ouverte et sans clé, mais sans CORS : le navigateur passe
 * par ici. L'appli fournit ce qu'elle sait déjà du film par TMDB (titres,
 * année, compositeur), ce qui évite de dépendre d'une clé côté serveur.
 *
 * Les liens d'extraits de 30 s sont signés et expirent en un quart d'heure
 * environ : seul le choix de l'album se garde longtemps. `?track=` rend un lien
 * frais quand l'appli en trouve un périmé.
 */

const DEEZER = 'https://api.deezer.com';
const ALBUM_TTL_MS = 6 * 3600_000;
const MAX_TRACKS = 120;

type Choice = { id: number; kind: AlbumKind } | null;
const choices = new Map<number, { at: number; albums: { id: number; kind: AlbumKind }[] }>();

async function deezer<T>(path: string): Promise<T> {
  const response = await fetch(DEEZER + path, { signal: AbortSignal.timeout(6000) });
  if (!response.ok) throw Error(`deezer ${response.status}`);
  const body = (await response.json()) as T & { error?: unknown };
  if (body && (body as { error?: unknown }).error) throw Error('deezer error');
  return body;
}

interface DeezerTrack {
  id: number;
  title: string;
  title_short?: string;
  duration: number;
  rank?: number;
  preview?: string;
  readable?: boolean;
}

interface DeezerAlbum {
  id: number;
  title: string;
  link: string;
  cover_medium?: string;
  cover_big?: string;
  release_date?: string;
  nb_tracks?: number;
  duration?: number;
  artist?: { name?: string };
}

const list = (value: unknown): string[] =>
  (Array.isArray(value) ? value : value == null ? [] : [value])
    .map((item) => String(item).trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 3);

async function chooseAlbums(film: FilmHints) {
  const hits: DeezerAlbumHit[] = [];
  for (const query of searchQueries(film)) {
    const found = await deezer<{ data?: DeezerAlbumHit[] }>(`/search/album?limit=25&q=${encodeURIComponent(query)}`);
    hits.push(...(found.data ?? []));
  }
  const kept: { id: number; kind: AlbumKind }[] = [];
  for (const candidate of pickAlbums(hits, film)) {
    if (kept.some((album) => album.kind === candidate.kind)) continue;
    if (candidate.needsYear) {
      const album = await deezer<DeezerAlbum>(`/album/${candidate.id}`);
      if (!confirmYear(album.release_date, film.year)) continue;
    }
    kept.push({ id: candidate.id, kind: candidate.kind });
    if (kept.length === 2) break;
  }
  return kept;
}

async function loadAlbum(choice: NonNullable<Choice>) {
  const [album, tracks] = await Promise.all([
    deezer<DeezerAlbum>(`/album/${choice.id}`),
    deezer<{ data?: DeezerTrack[] }>(`/album/${choice.id}/tracks?limit=${MAX_TRACKS}`),
  ]);
  return {
    id: album.id,
    kind: choice.kind,
    title: album.title,
    artist: album.artist?.name ?? '',
    cover: album.cover_big || album.cover_medium || '',
    link: album.link,
    releaseDate: album.release_date ?? null,
    trackCount: album.nb_tracks ?? tracks.data?.length ?? 0,
    duration: album.duration ?? 0,
    tracks: (tracks.data ?? [])
      .filter((track) => track.readable !== false)
      .map((track) => ({
        id: track.id,
        title: track.title_short || track.title,
        duration: track.duration,
        rank: track.rank ?? 0,
        preview: track.preview || null,
      })),
  };
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ error: 'method-not-allowed' });
  }
  const query = req.query ?? {};

  // Un lien d'extrait frais pour un morceau dont le lien a expiré.
  if (query.track != null) {
    const id = Number(query.track);
    if (!Number.isSafeInteger(id) || id <= 0) return res.status(400).json({ error: 'bad-track' });
    try {
      const track = await deezer<DeezerTrack>(`/track/${id}`);
      res.setHeader('Cache-Control', 'public, s-maxage=300');
      return res.status(200).json({ id, preview: track.preview || null });
    } catch {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(502).json({ error: 'deezer-unavailable' });
    }
  }

  const tmdb = Number(query.tmdb);
  if (!Number.isSafeInteger(tmdb) || tmdb <= 0) return res.status(400).json({ error: 'bad-tmdb' });
  const film: FilmHints = {
    titles: list(query.t),
    year: Number(query.y) || undefined,
    composers: list(query.c),
  };
  if (film.titles.length === 0) return res.status(400).json({ error: 'missing-title' });

  try {
    const cached = choices.get(tmdb);
    const albums =
      cached && Date.now() - cached.at < ALBUM_TTL_MS ? cached.albums : await chooseAlbums(film);
    choices.set(tmdb, { at: cached?.at && cached.albums === albums ? cached.at : Date.now(), albums });
    const loaded = await Promise.all(albums.map(loadAlbum));
    // Les extraits expirent vite : le cache partagé reste court.
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json({ albums: loaded });
  } catch {
    res.setHeader('Cache-Control', 'no-store');
    return res.status(502).json({ albums: [], error: 'deezer-unavailable' });
  }
}
