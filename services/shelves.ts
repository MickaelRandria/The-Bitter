/**
 * Les rangées personnelles de Découvrir : ce qui est sur mes plateformes, et de
 * quoi démarrer d'après mes genres préférés quand je n'ai encore rien noté.
 *
 * Données TMDB (offres JustWatch pour la France). Gardées six heures.
 */
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_GENRE_MAP } from '../constants';
import { providerQuery } from '../utils/platforms';
import { toTvGenreIds } from './tv';

export interface ShelfItem {
  id: number;
  title: string;
  posterPath: string | null;
  year?: number;
}

const TTL = 6 * 60 * 60 * 1000;

const read = (key: string): ShelfItem[] | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw && Date.now() - raw.at < TTL ? raw.data : null;
  } catch {
    return null;
  }
};
const write = (key: string, data: ShelfItem[]) => {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Stockage plein : la rangée se recharge à la prochaine ouverture.
  }
};

async function discover(mediaType: 'movie' | 'tv', params: Record<string, string>, cacheKey: string): Promise<ShelfItem[]> {
  const cached = read(cacheKey);
  if (cached) return cached;
  const query = new URLSearchParams({ api_key: TMDB_API_KEY, language: 'fr-FR', page: '1', ...params });
  const res = await fetch(`${TMDB_BASE_URL}/discover/${mediaType}?${query}`);
  if (!res.ok) throw new Error(`TMDB ${res.status}`);
  const data = await res.json();
  const items: ShelfItem[] = (data.results ?? [])
    .filter((r: any) => r.poster_path)
    .map((r: any) => {
      const date: string | undefined = mediaType === 'tv' ? r.first_air_date : r.release_date;
      return {
        id: r.id,
        title: (mediaType === 'tv' ? r.name : r.title) ?? '',
        posterPath: r.poster_path,
        year: date ? Number(date.slice(0, 4)) || undefined : undefined,
      };
    });
  write(cacheKey, items);
  return items;
}

/** Les titres populaires inclus dans mes abonnements, en France. */
export function getOnMyPlatforms(mediaType: 'movie' | 'tv', platformIds: string[]): Promise<ShelfItem[]> {
  const providers = providerQuery(platformIds);
  if (!providers) return Promise.resolve([]);
  return discover(
    mediaType,
    {
      watch_region: 'FR',
      with_watch_providers: providers,
      with_watch_monetization_types: 'flatrate',
      sort_by: 'popularity.desc',
      'vote_count.gte': '30',
    },
    `bitter_shelf_platforms_${mediaType}_${providers}`
  );
}

/** Des valeurs sûres de mes genres préférés, pour un compte qui n'a encore rien noté. */
export function getStarterPicks(mediaType: 'movie' | 'tv', genres: string[]): Promise<ShelfItem[]> {
  const movieIds = genres.map((g) => TMDB_GENRE_MAP[g]).filter((id): id is number => !!id);
  const ids = mediaType === 'tv' ? toTvGenreIds(movieIds) : movieIds;
  if (!ids.length) return Promise.resolve([]);
  return discover(
    mediaType,
    {
      with_genres: ids.join('|'),
      sort_by: 'vote_count.desc',
      'vote_average.gte': '7',
    },
    `bitter_shelf_starter_${mediaType}_${ids.join('-')}`
  );
}
