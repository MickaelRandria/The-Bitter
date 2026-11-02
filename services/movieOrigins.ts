import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';

/**
 * Pays de production et langue d'origine des films, lus chez TMDB une fois puis
 * gardés sur le téléphone : un film ne change pas d'origine. Pour « Tes pays et
 * tes langues » dans l'onglet Goûts.
 */
export interface Origin {
  countries: string[];
  language?: string;
}

const KEY = 'bitter_movie_origins_v1';
/** Au-delà, la première visite ferait trop d'appels d'un coup : le reste viendra ensuite. */
const MAX_PER_VISIT = 250;
const BATCH = 6;

const readCache = (): Record<string, Origin> => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};

const writeCache = (cache: Record<string, Origin>) => {
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Stockage plein : les origines seront redemandées.
  }
};

export const cachedOrigins = (): Record<string, Origin> => readCache();

/** Lit les origines manquantes, par petits lots ; `onProgress` reçoit le cache à jour. */
export async function loadOrigins(tmdbIds: number[], onProgress: (cache: Record<string, Origin>) => void): Promise<void> {
  if (!TMDB_API_KEY) return;
  const cache = readCache();
  const missing = [...new Set(tmdbIds)].filter((id) => !cache[id]).slice(0, MAX_PER_VISIT);
  for (let i = 0; i < missing.length; i += BATCH) {
    const batch = missing.slice(i, i + BATCH);
    await Promise.all(
      batch.map(async (id) => {
        try {
          const res = await fetch(`${TMDB_BASE_URL}/movie/${id}?api_key=${TMDB_API_KEY}`);
          if (!res.ok) return;
          const data = await res.json();
          cache[id] = {
            countries: (data.production_countries ?? []).map((c: { iso_3166_1: string }) => c.iso_3166_1).filter(Boolean),
            language: data.original_language || undefined,
          };
        } catch {
          // Hors ligne : on réessaiera à la prochaine visite.
        }
      })
    );
    writeCache(cache);
    onProgress({ ...cache });
  }
}
