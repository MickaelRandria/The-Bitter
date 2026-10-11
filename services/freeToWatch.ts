/**
 * « Gratuit et légal » : ce qui se regarde gratuitement en France, sans abonnement.
 *
 * TMDB (données JustWatch) sait filtrer les œuvres proposées gratuitement ou
 * gratuitement avec publicité dans un pays : arte.tv, france.tv, Pluto TV,
 * Rakuten TV gratuit… On ne diffuse rien : la fiche du film dit où regarder.
 *
 * `discover` ne dit pas quelle plateforme : on lit les offres de chaque titre
 * (même lecture que la fiche), et on écarte ceux dont l'offre gratuite a disparu
 * entre-temps. Le tout est gardé douze heures : la liste bouge peu, et ces appels
 * se comptent par dizaines.
 */
import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';
import { getWatchOffers } from './tv';
import { groupWatchOffers } from '../utils/watchOffers';

export type FreeKind = 'doc' | 'film' | 'serie';

export interface FreeProvider {
  id: number;
  name: string;
  logoPath: string;
  access: 'free' | 'ads';
}

export interface FreeTitle {
  tmdbId: number;
  mediaType: 'movie' | 'tv';
  title: string;
  year?: number;
  posterPath: string;
  overview: string;
  providers: FreeProvider[];
}

const DOCUMENTARY = 99;
const TTL_MS = 12 * 60 * 60 * 1000;
const MAX_TITLES = 24;
const cacheKey = (kind: FreeKind) => `bitter_free_to_watch_v1_${kind}`;

const readCache = (kind: FreeKind): FreeTitle[] | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(cacheKey(kind)) || 'null');
    return raw && Date.now() - raw.at < TTL_MS ? (raw.items as FreeTitle[]) : null;
  } catch {
    return null;
  }
};

const writeCache = (kind: FreeKind, items: FreeTitle[]) => {
  try {
    localStorage.setItem(cacheKey(kind), JSON.stringify({ at: Date.now(), items }));
  } catch {
    // Stockage plein : on servira la liste sans la garder.
  }
};

const discover = async (mediaType: 'movie' | 'tv', genre: { with?: number; without?: number }, page: number) => {
  const params = new URLSearchParams({
    api_key: TMDB_API_KEY,
    language: 'fr-FR',
    watch_region: 'FR',
    with_watch_monetization_types: 'free|ads',
    sort_by: 'popularity.desc',
    include_adult: 'false',
    page: String(page),
  });
  if (genre.with) params.set('with_genres', String(genre.with));
  if (genre.without) params.set('without_genres', String(genre.without));
  const res = await fetch(`${TMDB_BASE_URL}/discover/${mediaType}?${params}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  return (data.results ?? []) as any[];
};

export async function getFreeToWatch(kind: FreeKind, { force = false } = {}): Promise<FreeTitle[]> {
  if (!force) {
    const cached = readCache(kind);
    if (cached) return cached;
  }
  const mediaType = kind === 'serie' ? 'tv' : 'movie';
  const genre = kind === 'doc' ? { with: DOCUMENTARY } : kind === 'film' ? { without: DOCUMENTARY } : {};
  // Deux pages : la première suffit rarement une fois les offres vérifiées.
  const pages = await Promise.all([discover(mediaType, genre, 1), discover(mediaType, genre, 2).catch(() => [])]);
  const candidates = pages
    .flat()
    .filter((r) => r.poster_path)
    .slice(0, MAX_TITLES + 12);

  const checked = await Promise.all(
    candidates.map(async (r): Promise<FreeTitle | null> => {
      try {
        const offers = groupWatchOffers(await getWatchOffers(mediaType, r.id));
        const providers = offers.streaming
          .filter((o) => o.access === 'free' || o.access === 'ads')
          .map((o) => ({ id: o.id, name: o.name, logoPath: o.logoPath, access: o.access as 'free' | 'ads' }));
        if (!providers.length) return null;
        const date = (mediaType === 'tv' ? r.first_air_date : r.release_date) as string | undefined;
        return {
          tmdbId: r.id,
          mediaType,
          title: (mediaType === 'tv' ? r.name : r.title) as string,
          year: date ? Number(date.slice(0, 4)) || undefined : undefined,
          posterPath: r.poster_path as string,
          overview: (r.overview as string) || '',
          providers,
        };
      } catch {
        return null;
      }
    })
  );
  const items = checked.filter((x): x is FreeTitle => !!x).slice(0, MAX_TITLES);
  if (items.length) writeCache(kind, items);
  return items;
}

/**
 * « À regarder ici » : quelques documentaires lisibles dans l'app.
 *
 * Seulement des œuvres du domaine public, dans le lecteur officiel d'Internet
 * Archive (vérifiés le 12 octobre 2026 : en ligne, intégrables). Jamais de
 * vidéo hébergée ou recopiée. La politique de sécurité du site (vercel.json,
 * `frame-src`) n'autorise que ce lecteur.
 */
export interface EmbeddedFilm {
  id: string;
  title: string;
  by: string;
  year: number;
  minutes: number;
  pitch: string;
}

export const WATCH_HERE: EmbeddedFilm[] = [
  {
    id: 'nanookOfTheNorth1922',
    title: 'Nanouk l’Esquimau',
    by: 'Robert Flaherty',
    year: 1922,
    minutes: 78,
    pitch: 'Le premier grand documentaire : une famille inuit dans le Grand Nord canadien.',
  },
  {
    id: 'ChelovekskinoapparatomManWithAMovieCamera',
    title: 'L’Homme à la caméra',
    by: 'Dziga Vertov',
    year: 1929,
    minutes: 67,
    pitch: 'Une journée dans une ville soviétique, filmée sans acteurs ni intertitres.',
  },
  {
    id: 'BerlinSymphonyofaGreatCity',
    title: 'Berlin, symphonie d’une grande ville',
    by: 'Walter Ruttmann',
    year: 1927,
    minutes: 62,
    pitch: 'Vingt-quatre heures de Berlin, de l’aube à la nuit, montées comme une partition.',
  },
];

export const archiveEmbed = (id: string) => `https://archive.org/embed/${id}?autoplay=1`;
export const archiveThumb = (id: string) => `https://archive.org/services/img/${id}`;
