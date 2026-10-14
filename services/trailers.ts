/**
 * Le fil des bandes-annonces : des vidéos officielles, choisies pour toi.
 *
 * Les vidéos sont celles que TMDB référence sur YouTube (bandes-annonces,
 * teasers, extraits, making-of publiés par les studios). On ne les héberge pas :
 * elles se lisent dans le lecteur YouTube officiel, en mode sans cookies.
 *
 * Chaque titre est d'abord cherché en français, puis dans sa langue d'origine.
 * Les listes sont gardées six heures, les vidéos d'un titre une semaine.
 */
import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';
import { getTheatreReleases, getRecommendations } from './tmdb';
import { providerQuery } from '../utils/platforms';

export type TrailerCategory = 'foryou' | 'platforms' | 'cinema' | 'soon' | 'series';
export type VideoKind = 'Trailer' | 'Teaser' | 'Clip' | 'Featurette' | 'Behind the Scenes';

export interface TrailerItem {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year?: number;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate?: string;
  /** Clé YouTube de la vidéo retenue. */
  videoKey: string;
  videoKind: VideoKind;
  /** Pourquoi ce titre est dans le fil. */
  reason: { kind: 'because'; from: string } | { kind: 'list' } | { kind: 'showing' } | { kind: 'soon'; date: string } | { kind: 'airing' } | { kind: 'following' } | { kind: 'platforms' };
}

/** Les films de ma collection dont le fil a besoin. */
export interface TrailerSeed {
  tmdbId: number;
  title: string;
  rating?: number;
  status: 'watched' | 'watchlist' | string;
}

const KIND_RANK: Record<string, number> = { Trailer: 0, Teaser: 1, Clip: 2, Featurette: 3, 'Behind the Scenes': 4 };
const DAY = 24 * 60 * 60 * 1000;

const readStore = <T>(key: string, ttl: number): T | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw && Date.now() - raw.at < ttl ? (raw.data as T) : null;
  } catch {
    return null;
  }
};
const writeStore = (key: string, data: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Stockage plein : le fil marche sans mémoire.
  }
};

const tmdb = async (path: string, params: Record<string, string> = {}) => {
  const query = new URLSearchParams({ api_key: TMDB_API_KEY, ...params });
  const res = await fetch(`${TMDB_BASE_URL}/${path}?${query}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  return res.json();
};

/** La meilleure vidéo officielle d'un titre : bande-annonce d'abord, en français d'abord. */
export async function bestVideo(mediaType: 'movie' | 'tv', id: number, options: { officialOnly?: boolean } = {}): Promise<{ key: string; kind: VideoKind; publishedAt?: string } | null> {
  const cacheKey = `bitter_${options.officialOnly ? 'official_' : ''}trailer_video_${mediaType}_${id}`;
  const cached = readStore<{ key: string; kind: VideoKind; publishedAt?: string } | 'none'>(cacheKey, 7 * DAY);
  if (cached) return cached === 'none' ? null : cached;
  const pick = (results: any[]) =>
    results
      .filter((v) => v.site === 'YouTube' && v.key && KIND_RANK[v.type] != null && (!options.officialOnly || v.official === true))
      .sort((a, b) => KIND_RANK[a.type] - KIND_RANK[b.type] || Number(b.official) - Number(a.official) || (b.size ?? 0) - (a.size ?? 0))[0];
  let found: any = null;
  try {
    found = pick((await tmdb(`${mediaType}/${id}/videos`, { language: 'fr-FR' })).results ?? []);
    if (!found) found = pick((await tmdb(`${mediaType}/${id}/videos`)).results ?? []);
  } catch {
    return null;
  }
  const value = found ? { key: found.key as string, kind: found.type as VideoKind,
    publishedAt: typeof found.published_at === 'string' && Number.isFinite(Date.parse(found.published_at)) ? found.published_at : undefined } : null;
  writeStore(cacheKey, value ?? 'none');
  return value;
}

interface Candidate {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  posterPath: string | null;
  backdropPath: string | null;
  releaseDate?: string;
  reason: TrailerItem['reason'];
}

const fromRow = (row: any, mediaType: 'movie' | 'tv', reason: TrailerItem['reason']): Candidate => ({
  tmdbId: row.id,
  mediaType,
  title: (mediaType === 'tv' ? row.name : row.title) ?? '',
  posterPath: row.poster_path ?? row.posterPath ?? null,
  backdropPath: row.backdrop_path ?? null,
  releaseDate: (mediaType === 'tv' ? row.first_air_date : row.release_date ?? row.releaseDate) || undefined,
  reason,
});

/** Les titres d'une catégorie, avant le choix des vidéos. */
async function candidates(category: TrailerCategory, mediaType: 'movie' | 'tv', seeds: TrailerSeed[], platformIds: string[]): Promise<Candidate[]> {
  if (category === 'platforms') {
    // Ce qui est inclus dans mes abonnements, en France, du plus regardé au moins regardé.
    const providers = providerQuery(platformIds);
    if (!providers) return [];
    const data = await tmdb(`discover/${mediaType}`, {
      language: 'fr-FR',
      watch_region: 'FR',
      with_watch_providers: providers,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'popularity.desc',
      'vote_count.gte': '30',
    });
    return (data.results ?? []).filter((r: any) => r.poster_path).map((r: any) => fromRow(r, mediaType, { kind: 'platforms' }));
  }
  if (category === 'cinema' || category === 'soon') {
    const releases = await getTheatreReleases('FR');
    const list = category === 'cinema' ? releases.thisWeek : releases.upcoming;
    return list.map((r) =>
      fromRow({ id: r.id, title: r.title, poster_path: r.posterPath, backdrop_path: r.backdropPath, release_date: r.releaseDate }, 'movie', category === 'cinema' ? { kind: 'showing' } : { kind: 'soon', date: r.releaseDate })
    );
  }
  if (category === 'series') {
    const data = await tmdb('tv/on_the_air', { language: 'fr-FR', page: '1' });
    return (data.results ?? []).filter((r: any) => r.poster_path).map((r: any) => fromRow(r, 'tv', { kind: 'airing' }));
  }
  // Pour toi : ma liste, puis ce qui ressemble à mes films les mieux notés.
  const list = seeds.filter((s) => s.status === 'watchlist').slice(0, 8);
  const top = seeds
    .filter((s) => s.status === 'watched' && (s.rating ?? 0) >= 7.5)
    .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
    .slice(0, 4);
  const out: Candidate[] = [];
  const listDetails = await Promise.all(
    list.map((s) => tmdb(`${mediaType}/${s.tmdbId}`, { language: 'fr-FR' }).catch(() => null))
  );
  listDetails.forEach((row) => row && out.push(fromRow(row, mediaType, { kind: 'list' })));
  const recos = await Promise.all(
    top.map(async (s) => {
      const rows =
        mediaType === 'movie'
          ? await getRecommendations(s.tmdbId)
          : ((await tmdb(`tv/${s.tmdbId}/recommendations`, { language: 'fr-FR' }).catch(() => ({ results: [] }))).results ?? []);
      return rows.slice(0, 6).map((r: any) => fromRow(r, mediaType, { kind: 'because', from: s.title }));
    })
  );
  // On alterne les sources : pas six films d'affilée « parce que tu as aimé Dune ».
  const max = Math.max(0, ...recos.map((r) => r.length));
  for (let i = 0; i < max; i++) for (const group of recos) if (group[i]) out.push(group[i]);
  return out;
}

/** Le fil d'une catégorie : titres pas encore vus, avec une vidéo officielle. */
export async function getTrailerFeed(
  category: TrailerCategory,
  mediaType: 'movie' | 'tv',
  seeds: TrailerSeed[],
  platformIds: string[] = []
): Promise<TrailerItem[]> {
  const known = new Set(seeds.filter((s) => s.status === 'watched').map((s) => s.tmdbId));
  const cacheKey = `bitter_trailer_feed_v2_${category}_${mediaType}${category === 'platforms' ? `_${providerQuery(platformIds)}` : ''}`;
  const cached = category === 'foryou' ? null : readStore<TrailerItem[]>(cacheKey, 6 * 60 * 60 * 1000);
  if (cached) return cached.filter((i) => !known.has(i.tmdbId));

  const seen = new Set<string>();
  const list = (await candidates(category, mediaType, seeds, platformIds)).filter((c) => {
    const key = `${c.mediaType}:${c.tmdbId}`;
    if (seen.has(key) || known.has(c.tmdbId) || !c.title) return false;
    seen.add(key);
    return true;
  });
  const withVideos = await Promise.all(
    list.slice(0, 24).map(async (c): Promise<TrailerItem | null> => {
      const video = await bestVideo(c.mediaType, c.tmdbId);
      if (!video) return null;
      return {
        ...c,
        year: c.releaseDate ? Number(c.releaseDate.slice(0, 4)) || undefined : undefined,
        videoKey: video.key,
        videoKind: video.kind,
      };
    })
  );
  const items = withVideos.filter((x): x is TrailerItem => !!x);
  if (category !== 'foryou' && items.length) writeStore(cacheKey, items);
  return items;
}

/** Le lecteur officiel, sans cookies, piloté par l'API iframe (son, erreurs). */
export const youtubeEmbed = (key: string, opts: { controls?: boolean; muted?: boolean } = {}) => {
  const params = new URLSearchParams({
    autoplay: '1',
    mute: opts.muted === false ? '0' : '1',
    playsinline: '1',
    controls: opts.controls ? '1' : '0',
    rel: '0',
    loop: '1',
    playlist: key,
    enablejsapi: '1',
    iv_load_policy: '3',
    origin: typeof window !== 'undefined' ? window.location.origin : 'https://thebitter.watch',
  });
  return `https://www.youtube-nocookie.com/embed/${key}?${params}`;
};
export const youtubeThumb = (key: string) => `https://i.ytimg.com/vi/${key}/hqdefault.jpg`;
