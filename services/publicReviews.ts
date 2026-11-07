/**
 * Les avis du public : commentaires YouTube d'une bande-annonce, posts Bluesky
 * sur un film, et leur traduction au tap.
 *
 * Tout passe par l'Edge Function `public-reviews` (clé YouTube et Mistral
 * restent secrètes). Les listes sont gardées six heures sur l'appareil, les
 * traductions une semaine. Rien ne rejette : sans réseau ou sans clé, la liste
 * est vide et la section ne s'affiche pas.
 */
import { supabase } from './supabase';
import { plainText } from '../utils/plainText';

export type ReviewCriterion = 'story' | 'visuals' | 'acting' | 'sound';
export type ReviewOrder = 'relevance' | 'recent';

export interface PublicReview {
  id: string;
  source: 'youtube' | 'bluesky';
  author: string;
  handle?: string;
  avatar?: string;
  url: string;
  text: string;
  likes: number;
  replies: number;
  at: string;
  lang: string;
  criteria: ReviewCriterion[];
}

export interface ReviewList {
  items: PublicReview[];
  /** Nombre total de commentaires sur YouTube, quand on le connaît. */
  total?: number | null;
  /** Commentaires fermés sur la vidéo. */
  disabled?: boolean;
}

export interface Translation {
  text: string;
  /** Langue d'origine selon le traducteur (ISO 639-1), `und` sinon. */
  source: string;
}

const HOUR = 3600_000;
const LIST_TTL = 6 * HOUR;
const TRANSLATION_TTL = 7 * 24 * HOUR;
const TRANSLATIONS_KEY = 'bitter:review-translations:v1';
const MAX_TRANSLATIONS = 300;

const listKey = (parts: string[]) => `bitter:public-reviews:v1:${parts.join(':')}`;

const readList = (key: string): ReviewList | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || 'null');
    return raw && Date.now() - raw.at < LIST_TTL ? (raw.data as ReviewList) : null;
  } catch {
    return null;
  }
};
const writeList = (key: string, data: ReviewList) => {
  try {
    localStorage.setItem(key, JSON.stringify({ at: Date.now(), data }));
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
    if (import.meta.env.DEV) console.warn('[avis du public]', body.action, e);
    return null;
  }
};

const asList = (data: any): ReviewList | null =>
  data && Array.isArray(data.items)
    ? { items: data.items as PublicReview[], total: typeof data.total === 'number' ? data.total : null, disabled: data.disabled === true }
    : null;

/** Les commentaires d'une vidéo YouTube, triés. */
export async function fetchYoutubeReviews(videoKey: string, order: ReviewOrder): Promise<ReviewList> {
  const key = listKey(['yt', videoKey, order]);
  const cached = readList(key);
  if (cached) return cached;
  const list = asList(await call({ action: 'youtube', videoKey, order }));
  if (!list) return { items: [] };
  if (!(list as any).unavailable) writeList(key, list);
  return list;
}

export interface FilmLookup {
  titles: string[];
  director?: string;
  year?: string;
  /** Date de sortie (AAAA-MM-JJ) : pour un film récent, on ne cherche que depuis. */
  since?: string;
}

/** Les posts Bluesky qui parlent du film, toutes langues. */
export async function fetchBlueskyReviews(film: FilmLookup, order: ReviewOrder): Promise<ReviewList> {
  const titles = [...new Set(film.titles.map((t) => t.trim()).filter(Boolean))].slice(0, 2);
  if (titles.length === 0) return { items: [] };
  const key = listKey(['bsky', titles.join('|'), film.year ?? '', order]);
  const cached = readList(key);
  if (cached) return cached;
  const list = asList(await call({ action: 'bluesky', titles, director: film.director, year: film.year, since: film.since, order }));
  if (!list) return { items: [] };
  writeList(key, list);
  return list;
}

type TranslationStore = Record<string, { at: number; text: string; source: string }>;

const readTranslations = (): TranslationStore => {
  try {
    return JSON.parse(localStorage.getItem(TRANSLATIONS_KEY) || '{}') ?? {};
  } catch {
    return {};
  }
};

/** Une traduction déjà faite sur cet appareil, sans appel. */
export const knownTranslation = (id: string, target: string): Translation | null => {
  const hit = readTranslations()[`${target}:${id}`];
  return hit && Date.now() - hit.at < TRANSLATION_TTL ? { text: plainText(hit.text, false), source: hit.source } : null;
};

/** Traduit un avis dans la langue de l'app. `null` si la traduction échoue. */
export async function translateReview(review: Pick<PublicReview, 'id' | 'text'>, target: 'fr' | 'en'): Promise<Translation | null> {
  const known = knownTranslation(review.id, target);
  if (known) return known;
  const data = await call({ action: 'translate', target, items: [{ id: review.id, text: review.text }] });
  const hit = Array.isArray(data?.items) ? data.items.find((item: any) => item?.id === review.id) : null;
  if (!hit || typeof hit.text !== 'string') return null;
  const translation = { text: plainText(hit.text, false), source: typeof hit.source === 'string' ? hit.source : 'und' };
  try {
    const store = readTranslations();
    store[`${target}:${review.id}`] = { at: Date.now(), ...translation };
    const entries = Object.entries(store).sort((a, b) => b[1].at - a[1].at).slice(0, MAX_TRANSLATIONS);
    localStorage.setItem(TRANSLATIONS_KEY, JSON.stringify(Object.fromEntries(entries)));
  } catch {
    // Stockage plein : la traduction s'affiche quand même.
  }
  return translation;
}

/** « 2,3 k », « 860 » : les compteurs des plateformes, en court. */
export const compactCount = (n: number, locale: string) =>
  new Intl.NumberFormat(locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n);
