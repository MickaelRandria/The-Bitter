/**
 * Les grandes images de fond des films d'un espace, lues chez TMDB.
 *
 * `shared_movies` ne garde que l'affiche. Plutôt qu'une colonne de plus à
 * remplir à chaque ajout (et à rattraper pour les films déjà là), on demande
 * l'image à TMDB à l'affichage. Le chemin rendu est gardé trente jours sur
 * l'appareil : un espace rouvert ne refait aucune requête, et un film sans
 * image de fond n'est pas redemandé à chaque visite.
 */
import { useEffect, useState } from 'react';
import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';

export interface WorkRef {
  tmdbId?: number | null;
  mediaType?: string | null;
}

type Entry = { p: string | null; t: number };

const STORE_KEY = 'bitter_backdrops_v1';
const TTL = 30 * 24 * 3600 * 1000;

let memory: Record<string, Entry> | null = null;
const inflight = new Map<string, Promise<string | null>>();

const keyOf = (w: WorkRef) => `${w.mediaType === 'tv' ? 'tv' : 'movie'}:${w.tmdbId}`;

const store = (): Record<string, Entry> => {
  if (memory) return memory;
  try {
    memory = JSON.parse(localStorage.getItem(STORE_KEY) || '{}') as Record<string, Entry>;
  } catch {
    memory = {};
  }
  return memory;
};

const persist = () => {
  try {
    localStorage.setItem(STORE_KEY, JSON.stringify(store()));
  } catch {
    // Stockage plein ou bloqué : l'image sera simplement redemandée.
  }
};

/** Adresse d'une image de fond TMDB, à la taille d'un écran de téléphone en haute densité. */
export const backdropUrl = (path: string | null | undefined, size: 'w780' | 'w1280' = 'w780') =>
  path ? `https://image.tmdb.org/t/p/${size}${path}` : null;

const fetchPath = (w: WorkRef): Promise<string | null> => {
  const key = keyOf(w);
  const pending = inflight.get(key);
  if (pending) return pending;
  const type = w.mediaType === 'tv' ? 'tv' : 'movie';
  const request = fetch(`${TMDB_BASE_URL}/${type}/${w.tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR`)
    .then((res) => (res.ok ? res.json() : null))
    .then((data) => {
      const path = (data?.backdrop_path as string | undefined) ?? null;
      store()[key] = { p: path, t: Date.now() };
      persist();
      return path;
    })
    // Réseau coupé : rien n'est retenu, on retentera à la prochaine visite.
    .catch(() => null)
    .finally(() => inflight.delete(key));
  inflight.set(key, request);
  return request;
};

/**
 * Les images de fond des œuvres données, par clé `movie:603` / `tv:1396`.
 * Une œuvre absente de la table n'a pas encore répondu ; `null` veut dire
 * « pas d'image », et l'appelant retombe alors sur l'affiche.
 */
export function useBackdrops(works: WorkRef[]): Map<string, string | null> {
  const valid = works.filter((w) => w.tmdbId);
  const signature = valid.map(keyOf).sort().join('|');

  const read = () => {
    const map = new Map<string, string | null>();
    const now = Date.now();
    for (const w of valid) {
      const entry = store()[keyOf(w)];
      if (entry && now - entry.t < TTL) map.set(keyOf(w), backdropUrl(entry.p));
    }
    return map;
  };

  const [map, setMap] = useState<Map<string, string | null>>(read);

  useEffect(() => {
    setMap(read());
    if (!TMDB_API_KEY) return;
    const now = Date.now();
    const missing = valid.filter((w) => {
      const entry = store()[keyOf(w)];
      return !entry || now - entry.t >= TTL;
    });
    if (!missing.length) return;
    let cancelled = false;
    Promise.all(missing.map(fetchPath)).then(() => {
      if (!cancelled) setMap(read());
    });
    return () => {
      cancelled = true;
    };
    // `signature` résume la liste : la relire à chaque rendu relancerait tout.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return map;
}

export const backdropKey = keyOf;
