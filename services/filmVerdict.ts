/**
 * « Ce qu'en dit Internet » : les chiffres d'un film et le résumé de ses avis.
 *
 * Deux appels à l'Edge Function `public-reviews` : `facts` (rapide, les notes
 * et les volumes) et `summary` (Mistral, quelques secondes au premier lecteur,
 * puis gardé un jour côté serveur). Côté appareil, les chiffres sont gardés
 * douze heures et le résumé trois jours. Rien ne rejette : sans réseau, la
 * carte ne s'affiche pas.
 */
import { supabase } from './supabase';

export type VerdictCriterion = 'scenario' | 'image' | 'interpretation' | 'sound';
export type VerdictTone = 'unanime' | 'apprecie' | 'divise' | 'critique';

export interface VerdictFacts {
  sensCritique: { rating: number | null; ratings: number; reviews: number; positiveShare: number | null; sampled: number; url: string } | null;
  imdb: { rating: number | null; votes: number | null } | null;
  press: { rottenTomatoes: number | null; metacritic: number | null } | null;
  bluesky: number;
  readable: number;
}

export interface VerdictSummary {
  verdict: string;
  overview: string;
  loved: string[];
  divides: string[];
  disappoints: string[];
  criteria: Partial<Record<VerdictCriterion, { tone: VerdictTone; text: string }>>;
  quotes: { text: string; author: string; origin: 'senscritique' | 'bluesky'; url: string }[];
}

export interface VerdictFilm {
  tmdbId: number;
  imdbId?: string;
  titles: string[];
  director?: string;
  year?: string;
}

export interface VerdictResult {
  facts: VerdictFacts | null;
  summary: VerdictSummary | null;
  /** Moins de 30 avis lisibles : trop tôt pour un verdict. */
  few?: boolean;
  /** Quand le résumé a été écrit (pour « mis à jour il y a… »). */
  at?: number;
}

const HOUR = 3600_000;
const FACTS_TTL = 12 * HOUR;
const SUMMARY_TTL = 3 * 24 * HOUR;
const key = (kind: string, tmdbId: number, lang = '') => `bitter:verdict:v1:${kind}:${tmdbId}${lang ? `:${lang}` : ''}`;

const read = <T>(k: string, ttl: number): { at: number; data: T } | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(k) || 'null');
    return raw && Date.now() - raw.at < ttl ? raw : null;
  } catch {
    return null;
  }
};
const write = (k: string, data: unknown) => {
  try {
    localStorage.setItem(k, JSON.stringify({ at: Date.now(), data }));
  } catch {
    // Stockage plein : on refera l'appel.
  }
};

const call = async (body: Record<string, unknown>): Promise<any | null> => {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.functions.invoke('public-reviews', { body });
    if (error) throw error;
    return data ?? null;
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[ce qu’en dit Internet]', body.action, e);
    return null;
  }
};

const payload = (film: VerdictFilm) => ({
  tmdbId: film.tmdbId,
  imdbId: film.imdbId,
  titles: [...new Set(film.titles.map((t) => t.trim()).filter(Boolean))].slice(0, 2),
  director: film.director,
  year: film.year,
});

/** Les notes et les volumes, vite. */
export async function fetchVerdictFacts(film: VerdictFilm): Promise<VerdictFacts | null> {
  const cached = read<VerdictFacts>(key('facts', film.tmdbId), FACTS_TTL);
  if (cached) return cached.data;
  const data = await call({ action: 'facts', ...payload(film) });
  const facts = (data?.facts ?? null) as VerdictFacts | null;
  if (facts) write(key('facts', film.tmdbId), facts);
  return facts;
}

/** Le résumé déjà lu sur cet appareil, sans appel : pour le fil. */
export function cachedVerdict(tmdbId: number, lang: 'fr' | 'en'): VerdictResult | null {
  const hit = read<VerdictResult>(key('summary', tmdbId, lang), SUMMARY_TTL);
  return hit ? { ...hit.data, at: hit.at } : null;
}

/** Le résumé complet, avec ses chiffres. */
export async function fetchVerdict(film: VerdictFilm, lang: 'fr' | 'en'): Promise<VerdictResult> {
  const cached = cachedVerdict(film.tmdbId, lang);
  if (cached) return cached;
  const data = await call({ action: 'summary', target: lang, ...payload(film) });
  const result: VerdictResult = { facts: data?.facts ?? null, summary: data?.summary ?? null, few: data?.few === true };
  if (result.summary || result.few) {
    write(key('summary', film.tmdbId, lang), result);
    if (result.facts) write(key('facts', film.tmdbId), result.facts);
  }
  return { ...result, at: Date.now() };
}

/** Le résumé est-il assez nourri pour qu'on l'affiche ? */
export const hasEnoughFacts = (facts: VerdictFacts | null) =>
  !!facts && (facts.sensCritique?.rating != null || facts.imdb?.rating != null || facts.press != null);
