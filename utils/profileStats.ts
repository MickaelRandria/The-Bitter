/**
 * Les chiffres de l'onglet Profil des statistiques : la signature (moyenne par
 * critère), le podium et l'année.
 *
 * Module pur. Les notes par critère sont lues dans la grille Bitter+
 * (`adaptiveRating.criteria`) d'abord : les colonnes plates ne contiennent
 * souvent que la note globale recopiée, et on n'en tient compte que quand
 * elles diffèrent vraiment (voir `criteriaOf`).
 */
import { CRITERIA, CriterionKey, criteriaOf } from './verdict';

/** En dessous, une moyenne par critère dépend d'un ou deux films. */
export const MIN_DETAILED = 3;

export interface SignatureFilm {
  adaptiveRating?: { criteria?: { key: string; value: number }[] } | null;
  ratings: { story: number; visuals: number; acting: number; sound: number };
}

export interface Signature {
  /** Films dont le détail par critère est connu. */
  count: number;
  values: Record<CriterionKey, number>;
  /** Moyenne des quatre critères : le repère des barres. */
  overall: number;
  /** Du mieux au moins bien noté. */
  order: CriterionKey[];
  /** Le critère le plus bas, et son écart à la moyenne des quatre (négatif). */
  harshest: { key: CriterionKey; gap: number };
}

export function signatureOf(films: SignatureFilm[]): Signature | null {
  const detailed = films
    .map((f) =>
      criteriaOf({
        adaptive_rating: f.adaptiveRating ?? null,
        story: f.ratings?.story,
        visuals: f.ratings?.visuals,
        acting: f.ratings?.acting,
        sound: f.ratings?.sound,
      } as never)
    )
    .filter((c): c is Record<CriterionKey, number> => !!c && CRITERIA.every((k) => Number.isFinite(c[k]) && c[k] > 0));
  if (detailed.length < MIN_DETAILED) return null;
  const values = {} as Record<CriterionKey, number>;
  for (const key of CRITERIA) values[key] = detailed.reduce((a, c) => a + c[key], 0) / detailed.length;
  const overall = CRITERIA.reduce((a, k) => a + values[k], 0) / CRITERIA.length;
  const order = [...CRITERIA].sort((a, b) => values[b] - values[a]);
  const low = order[order.length - 1];
  return { count: detailed.length, values, overall, order, harshest: { key: low, gap: values[low] - overall } };
}

/** Les trois mieux notés, du premier au troisième ; à égalité, le plus récent d'abord. */
export function podiumOf<T>(films: T[], score: (f: T) => number, date: (f: T) => number = () => 0): T[] {
  return [...films]
    .filter((f) => Number.isFinite(score(f)) && score(f) > 0)
    .sort((a, b) => score(b) - score(a) || date(b) - date(a))
    .slice(0, 3);
}

export interface YearReading {
  total: number;
  /** Indice du mois record dans les 12, null si aucun film. */
  record: number | null;
  recordCount: number;
  /** Films par semaine pendant le mois record, arrondi au demi. */
  perWeek: number;
}

/** Les 12 derniers mois, du plus ancien au mois en cours (le dernier). */
export function yearOf(counts: number[]): YearReading {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return { total, record: null, recordCount: 0, perWeek: 0 };
  // À égalité, le plus récent : c'est celui dont on se souvient.
  let record = 0;
  counts.forEach((c, i) => {
    if (c >= counts[record]) record = i;
  });
  const recordCount = counts[record];
  return { total, record, recordCount, perWeek: Math.round((recordCount / 4.35) * 2) / 2 };
}
