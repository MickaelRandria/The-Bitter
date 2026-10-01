import { supabase } from './supabase';

/** Une anecdote ou une question de quiz, telle que la fonction `series-trivia` la rend. */
export type TriviaItem =
  | { type: 'fact'; season: number | null; text: string; source: 'fr' | 'en' }
  | {
      type: 'quiz';
      season: number | null;
      question: string;
      options: string[];
      answer: number;
      explanation: string;
      source: 'fr' | 'en';
    };

export interface SeriesTrivia {
  items: TriviaItem[];
  /** Les articles Wikipédia d'où viennent les anecdotes. */
  sources: { fr?: string; en?: string };
}

/** Une demande par série, saison et langue : le mode épisode la lance tôt et la relit plus tard. */
const lookups = new Map<string, Promise<SeriesTrivia | null>>();

/**
 * « Le saviez-vous ? » : les anecdotes de coulisses montrables à qui en est à
 * cette saison. Le tri anti-spoiler est fait côté serveur ; ici on ne fait que
 * demander. Sans compte, rien : la génération passe par Mistral et son quota.
 *
 * La première demande pour une série peut prendre une demi-minute (la
 * fonction lit Wikipédia et fait écrire Mistral) : le mode épisode la lance
 * dès son ouverture, pour qu'elle soit prête quand l'épisode démarre.
 */
export function getSeriesTrivia(tmdbId: number, season: number, language: 'fr' | 'en'): Promise<SeriesTrivia | null> {
  const key = `${tmdbId}:${season}:${language}`;
  let lookup = lookups.get(key);
  if (!lookup) {
    const client = supabase;
    lookup = (async () => {
      if (!client) return null;
      const { data: auth } = await client.auth.getSession();
      if (!auth.session) return null;
      const { data, error } = await client.functions.invoke<SeriesTrivia>('series-trivia', {
        body: { tmdbId, season, language },
      });
      if (error || !data || !Array.isArray(data.items)) throw error ?? new Error('series-trivia');
      return { items: data.items, sources: data.sources ?? {} };
    })().catch(() => {
      // Une panne passagère ne se retient pas : on redemandera à la prochaine séance.
      lookups.delete(key);
      return null;
    });
    lookups.set(key, lookup);
  }
  return lookup;
}
