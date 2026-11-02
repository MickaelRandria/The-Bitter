import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';

/**
 * Les photos des acteurs de « Tes acteurs » (onglet Goûts) : le portrait TMDB,
 * lu une fois puis gardé sur le téléphone. Par l'identifiant TMDB quand le film
 * l'a gardé, sinon par une recherche sur le nom.
 */
const KEY = 'bitter_actor_photos_v1';

/** Chemin TMDB du portrait, ou null quand TMDB n'en a pas. */
type Cache = Record<string, string | null>;

const readCache = (): Cache => {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
};

export const cachedActorPhotos = (): Cache => readCache();

export async function loadActorPhotos(names: string[], idsByName: Map<string, number>): Promise<Cache> {
  const cache = readCache();
  const missing = names.filter((name) => !(name in cache));
  if (!missing.length || !TMDB_API_KEY) return cache;
  await Promise.all(
    missing.map(async (name) => {
      try {
        const id = idsByName.get(name);
        const url = id
          ? `${TMDB_BASE_URL}/person/${id}?api_key=${TMDB_API_KEY}`
          : `${TMDB_BASE_URL}/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(name)}`;
        const res = await fetch(url);
        if (!res.ok) return;
        const data = await res.json();
        cache[name] = (id ? data.profile_path : data.results?.[0]?.profile_path) ?? null;
      } catch {
        // Hors ligne : on réessaiera à la prochaine visite.
      }
    })
  );
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // Stockage plein : les photos seront redemandées.
  }
  return cache;
}
