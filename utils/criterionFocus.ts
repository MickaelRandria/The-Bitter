/**
 * Le critère qui pèse le plus dans mes notes, pour « Pour toi » dans le résumé
 * des avis d'Internet.
 *
 * Module pur. On lit `adaptiveRating.criteria` par clé, jamais les colonnes
 * story/visuals/acting/sound, souvent recopiées de la note globale. D'abord le
 * poids que je donne moi-même aux critères ; s'ils se valent, le critère dont
 * la valeur suit le mieux ma note finale. Sans écart net, pas de réponse : mieux
 * vaut ne rien dire qu'une phrase au hasard.
 */

export type FocusKey = 'scenario' | 'image' | 'interpretation' | 'sound';
export const FOCUS_KEYS: FocusKey[] = ['scenario', 'image', 'interpretation', 'sound'];

interface RatedLike {
  status?: string;
  adaptiveRating?: {
    weightedRating?: number;
    criteria?: { key: string; value: number; weight: number }[];
  };
}

const MIN_FILMS = 5;
const MIN_FILMS_FOR_TREND = 8;

const pearson = (xs: number[], ys: number[]) => {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    dx += (xs[i] - mx) ** 2;
    dy += (ys[i] - my) ** 2;
  }
  return dx === 0 || dy === 0 ? 0 : num / Math.sqrt(dx * dy);
};

export function criterionFocus(movies: RatedLike[]): FocusKey | null {
  const rated = movies.filter((m) => m.status === 'watched' && Array.isArray(m.adaptiveRating?.criteria) && m.adaptiveRating!.criteria!.length > 0);
  if (rated.length < MIN_FILMS) return null;

  // 1. Les poids que je règle moi-même.
  const weights = FOCUS_KEYS.map((key) => {
    const ws = rated.map((m) => m.adaptiveRating!.criteria!.find((c) => c.key === key)?.weight).filter((w): w is number => typeof w === 'number' && w > 0);
    return { key, mean: ws.length ? ws.reduce((a, b) => a + b, 0) / ws.length : 0, n: ws.length };
  }).filter((w) => w.n >= MIN_FILMS);
  if (weights.length >= 2) {
    const sorted = [...weights].sort((a, b) => b.mean - a.mean);
    const average = weights.reduce((a, w) => a + w.mean, 0) / weights.length;
    if (sorted[0].mean >= average * 1.12 && sorted[0].mean > sorted[1].mean * 1.05) return sorted[0].key;
  }

  // 2. Sinon, le critère dont la valeur suit le mieux ma note finale.
  const trends = FOCUS_KEYS.map((key) => {
    const pairs = rated
      .map((m) => ({ x: m.adaptiveRating!.criteria!.find((c) => c.key === key)?.value, y: m.adaptiveRating!.weightedRating }))
      .filter((p): p is { x: number; y: number } => typeof p.x === 'number' && typeof p.y === 'number');
    return { key, r: pairs.length >= MIN_FILMS_FOR_TREND ? pearson(pairs.map((p) => p.x), pairs.map((p) => p.y)) : 0 };
  }).sort((a, b) => b.r - a.r);
  if (trends[0].r >= 0.4 && trends[0].r - trends[1].r >= 0.1) return trends[0].key;
  return null;
}
