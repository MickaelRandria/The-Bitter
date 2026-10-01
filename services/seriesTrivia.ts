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

/**
 * `ready` : il y a de quoi montrer. `missing` : rien n'a encore été préparé
 * pour cette série, il faut un geste pour le lancer. `empty` : préparé, mais
 * rien de montrable (Wikipédia trop maigre, ou tout est au-delà de ta saison).
 */
export type TriviaStatus = 'ready' | 'missing' | 'empty';

export interface SeriesTrivia {
  status: TriviaStatus;
  items: TriviaItem[];
  /** Les articles Wikipédia d'où viennent les anecdotes. */
  sources: { fr?: string; en?: string };
}

export type TriviaResult = SeriesTrivia | { error: string };

const key = (tmdbId: number, season: number, language: string) => `${tmdbId}:${season}:${language}`;
const peeks = new Map<string, Promise<SeriesTrivia | null>>();
const generations = new Map<string, Promise<TriviaResult>>();

async function call(
  tmdbId: number,
  season: number,
  language: 'fr' | 'en',
  generate: boolean
): Promise<TriviaResult | null> {
  const client = supabase;
  if (!client) return null;
  const { data: auth } = await client.auth.getSession();
  if (!auth.session) return null;
  const { data, error } = await client.functions.invoke<SeriesTrivia>('series-trivia', {
    body: { tmdbId, season, language, generate },
  });
  if (error) {
    // Le message de la fonction (quota atteint, panne) est fait pour être lu tel quel.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    return { error: typeof body?.message === 'string' ? body.message : 'unavailable' };
  }
  if (!data || !Array.isArray(data.items)) return { error: 'unavailable' };
  return { status: data.status ?? (data.items.length ? 'ready' : 'empty'), items: data.items, sources: data.sources ?? {} };
}

/**
 * Ce qui est déjà prêt pour cette série, sans rien générer ni rien dépenser :
 * de quoi afficher « 6 anecdotes · 3 questions » sur le bouton, ou proposer de
 * les préparer. `null` sans compte ou si la fonction ne répond pas.
 */
export function peekSeriesTrivia(tmdbId: number, season: number, language: 'fr' | 'en') {
  const k = key(tmdbId, season, language);
  let peek = peeks.get(k);
  if (!peek) {
    peek = call(tmdbId, season, language, false)
      .then((result) => (result && 'status' in result ? result : null))
      .catch(() => null);
    peeks.set(k, peek);
  }
  return peek;
}

/**
 * Les anecdotes et le quiz, préparés au besoin. C'est le seul chemin qui
 * appelle Mistral, et il ne part que d'un geste (« Le saviez-vous + »). Une
 * génération en cours est partagée : rouvrir l'écran ne la relance pas.
 */
export function generateSeriesTrivia(tmdbId: number, season: number, language: 'fr' | 'en'): Promise<TriviaResult> {
  const k = key(tmdbId, season, language);
  let generation = generations.get(k);
  if (!generation) {
    generation = call(tmdbId, season, language, true)
      .then((result) => result ?? { error: 'unauthenticated' })
      .catch(() => ({ error: 'unavailable' }));
    generations.set(k, generation);
    generation.then((result) => {
      if ('error' in result) generations.delete(k);
      // Le coup d'œil suivant doit voir ce qui vient d'être préparé.
      else peeks.set(k, Promise.resolve(result));
    });
  }
  return generation;
}
