import { useEffect, useMemo, useState } from 'react';
import { supabase } from './supabase';

/**
 * Notes IMDb, via l'Edge Function `imdb-ratings`.
 *
 * La clé OMDb ne quitte jamais le serveur : l'app ne connaît que la fonction,
 * qui répond depuis un cache partagé par tous les utilisateurs et ne dépense le
 * quota OMDb (1 000 requêtes par jour pour toute l'app) que pour un compte
 * connecté. Une œuvre absente de la réponse garde simplement sa note TMDB.
 */

export type RatingMediaType = 'movie' | 'tv';

export interface ImdbLookup {
  mediaType: RatingMediaType;
  tmdbId: number;
  /** Fourni quand on l'a déjà (fiche TMDB) : le serveur n'a pas à le chercher. */
  imdbId?: string;
}

export interface ImdbRating {
  imdbId: string | null;
  /** Nul quand IMDb n'a pas de note pour cette œuvre. */
  rating: number | null;
  votes: number | null;
}

/**
 * `high` : la collection et les fiches, qui peuvent aller jusqu'au plafond.
 * `low` : les listes d'exploration, qui s'arrêtent avant pour ne pas le vider.
 */
export type ImdbPriority = 'high' | 'low';

/** Ce que le serveur traite au plus par appel : au-delà, il laisse pour la fois suivante. */
const CHUNK_SIZE: Record<ImdbPriority, number> = { high: 30, low: 10 };
const PARALLEL_CHUNKS = 3;

export const imdbKey = (mediaType: RatingMediaType, tmdbId: number) => `${mediaType}:${tmdbId}`;

/** Réponses obtenues pendant la session, pour ne jamais redemander la même œuvre. */
const known = new Map<string, ImdbRating>();
/** Œuvres demandées restées sans réponse (quota, visiteur, panne) : retentées à la session suivante. */
const attempted = new Set<string>();
const inflight = new Map<string, Promise<void>>();

// Un visiteur qui se connecte peut désormais compléter ce qu'il n'avait que
// consulté : ses tentatives anonymes ne doivent pas l'en priver.
supabase?.auth.onAuthStateChange((event) => {
  if (event === 'SIGNED_IN') attempted.clear();
});

export const peekImdbRating = (mediaType: RatingMediaType, tmdbId: number): ImdbRating | undefined =>
  known.get(imdbKey(mediaType, tmdbId));

const IMDB_ID = /^tt\d{6,10}$/;

/** Identifiant IMDb tel que TMDB le rend (`imdb_id` d'un film, `external_ids.imdb_id` d'une série). */
export const readImdbId = (tmdbData: any): string | undefined => {
  const id = tmdbData?.imdb_id ?? tmdbData?.external_ids?.imdb_id;
  return typeof id === 'string' && IMDB_ID.test(id) ? id : undefined;
};

const askServer = async (chunk: ImdbLookup[], priority: ImdbPriority) => {
  try {
    const { data, error } = await supabase!.functions.invoke('imdb-ratings', {
      body: { items: chunk, priority },
    });
    if (error || !Array.isArray(data?.items)) throw error ?? new Error('réponse inattendue');
    for (const item of data.items) {
      if (item?.mediaType !== 'movie' && item?.mediaType !== 'tv') continue;
      known.set(imdbKey(item.mediaType, Number(item.tmdbId)), {
        imdbId: typeof item.imdbId === 'string' ? item.imdbId : null,
        rating: typeof item.rating === 'number' ? item.rating : null,
        votes: typeof item.votes === 'number' ? item.votes : null,
      });
    }
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[IMDb] Notes indisponibles :', e);
  } finally {
    chunk.forEach(({ mediaType, tmdbId }) => {
      const key = imdbKey(mediaType, tmdbId);
      if (!known.has(key)) attempted.add(key);
    });
  }
};

/**
 * Les notes IMDb connues pour ces œuvres, clé `imdbKey`.
 *
 * Ne rejette jamais : une œuvre absente du résultat n'a pas de note IMDb
 * disponible pour l'instant, et l'appelant retombe sur TMDB.
 */
export const fetchImdbRatings = async (
  lookups: ImdbLookup[],
  priority: ImdbPriority = 'high'
): Promise<Map<string, ImdbRating>> => {
  const wanted = new Map<string, ImdbLookup>();
  lookups.forEach((lookup) => {
    if (lookup.tmdbId > 0) wanted.set(imdbKey(lookup.mediaType, lookup.tmdbId), lookup);
  });

  if (supabase) {
    const toAsk = [...wanted.entries()]
      .filter(([key]) => !known.has(key) && !attempted.has(key) && !inflight.has(key))
      .map(([, lookup]) => lookup);

    const size = CHUNK_SIZE[priority];
    const chunks: ImdbLookup[][] = [];
    for (let i = 0; i < toAsk.length; i += size) chunks.push(toAsk.slice(i, i + size));

    let cursor = 0;
    const run = async () => {
      while (cursor < chunks.length) await askServer(chunks[cursor++], priority);
    };
    const pending = Promise.all(Array.from({ length: Math.min(PARALLEL_CHUNKS, chunks.length) }, run)).then(
      () => undefined
    );
    toAsk.forEach(({ mediaType, tmdbId }) => inflight.set(imdbKey(mediaType, tmdbId), pending));

    const waits = new Set<Promise<void>>([pending]);
    wanted.forEach((_, key) => {
      const other = inflight.get(key);
      if (other) waits.add(other);
    });
    await Promise.all(waits);
    toAsk.forEach(({ mediaType, tmdbId }) => inflight.delete(imdbKey(mediaType, tmdbId)));
  }

  const result = new Map<string, ImdbRating>();
  wanted.forEach((_, key) => {
    const rating = known.get(key);
    if (rating) result.set(key, rating);
  });
  return result;
};

/**
 * Les notes IMDb d'une liste d'œuvres, pour un composant d'affichage.
 *
 * Rend tout de suite ce que la session connaît déjà, puis complète.
 */
export const useImdbRatings = (
  lookups: ImdbLookup[],
  priority: ImdbPriority = 'low'
): Map<string, ImdbRating> => {
  // La liste est souvent recréée à chaque rendu : on ne réagit qu'à son contenu.
  const signature = lookups.map((l) => `${imdbKey(l.mediaType, l.tmdbId)}:${l.imdbId ?? ''}`).join(',');
  const stable = useMemo(() => lookups, [signature]); // eslint-disable-line react-hooks/exhaustive-deps

  const [ratings, setRatings] = useState<Map<string, ImdbRating>>(() => {
    const initial = new Map<string, ImdbRating>();
    stable.forEach(({ mediaType, tmdbId }) => {
      const rating = peekImdbRating(mediaType, tmdbId);
      if (rating) initial.set(imdbKey(mediaType, tmdbId), rating);
    });
    return initial;
  });

  useEffect(() => {
    if (stable.length === 0) return;
    let cancelled = false;
    fetchImdbRatings(stable, priority).then((result) => {
      if (!cancelled) setRatings(result);
    });
    return () => {
      cancelled = true;
    };
  }, [stable, priority]);

  return ratings;
};
