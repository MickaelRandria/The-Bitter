/**
 * Verdicts d'un espace : qui doit noter, où en est le film, à quel point le
 * groupe est d'accord.
 *
 * Module pur, sans import : la fiche, la liste, le récap du mois et « Nos stats »
 * s'en servent, et les tests le chargent tel quel. Le serveur fait le même calcul
 * des personnes attendues (`private.expected_raters`, migration
 * 20261010_verdicts_des_espaces) : les deux doivent rester d'accord, sinon l'app
 * annoncerait un verdict que la notification ne confirme pas.
 */

/** Ce dont on a besoin d'une note, quelle que soit sa provenance. */
export interface VerdictRating {
  id: string;
  movie_id: string;
  profile_id: string;
  story: number | string;
  visuals: number | string;
  acting: number | string;
  sound: number | string;
  review?: string | null;
  rated_at?: string | null;
  adaptive_rating?: {
    weightedRating?: number;
    criteria?: { key: string; value: number }[];
  } | null;
}

const num = (value: unknown): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

/**
 * Note d'un membre. La note pondérée Bitter+ prime : c'est celle que son auteur a
 * vue à l'écran. Sinon, la moyenne des quatre colonnes.
 */
export const ratingValue = (r: VerdictRating): number => {
  const weighted = r.adaptive_rating?.weightedRating;
  if (typeof weighted === 'number' && Number.isFinite(weighted)) return weighted;
  return (num(r.story) + num(r.visuals) + num(r.acting) + num(r.sound)) / 4;
};

/**
 * Qui doit noter : les participants de la séance calée s'il y en a une, sinon
 * les membres actifs ; plus quiconque a noté ; moins ceux qui ne l'ont pas vu.
 * Seuls les membres actifs comptent.
 */
export const expectedRaters = (input: {
  activeIds: string[];
  planParticipants?: string[] | null;
  raterIds: string[];
  skipIds: string[];
}): string[] => {
  const active = new Set(input.activeIds);
  const skips = new Set(input.skipIds);
  const base = input.planParticipants && input.planParticipants.length ? input.planParticipants : input.activeIds;
  const all = new Set([...base, ...input.raterIds]);
  return [...all].filter((id) => active.has(id) && !skips.has(id));
};

/**
 * Où en est un film, de mon point de vue.
 *
 * - `turn` : on attend ma note ; celles des autres restent scellées ;
 * - `wait` : il manque des notes ; celles déjà données me sont dévoilées si
 *   j'ai noté (ou si on ne m'attend pas), la moyenne reste cachée ;
 * - `done` : tout le monde a noté, le verdict est tombé ;
 * - `skip` : j'ai dit ne pas l'avoir vu, le verdict se fait sans moi.
 */
export type VerdictState = 'turn' | 'wait' | 'done' | 'skip';

export const verdictState = (input: {
  me: string;
  expected: string[];
  raterIds: string[];
  skipIds: string[];
}): VerdictState => {
  const rated = new Set(input.raterIds);
  const missing = input.expected.filter((id) => !rated.has(id));
  const raters = input.expected.filter((id) => rated.has(id));
  if (missing.length === 0 && raters.length >= 2) return 'done';
  if (input.skipIds.includes(input.me)) return 'skip';
  if (input.expected.includes(input.me) && !rated.has(input.me)) return 'turn';
  return 'wait';
};

/** Écart maximal entre deux notes. */
export const spreadOf = (values: number[]): number =>
  values.length < 2 ? 0 : Math.max(...values) - Math.min(...values);

export type Agreement = 'agree' | 'close' | 'split';

/** Accord parfait jusqu'à 1 point d'écart, proches jusqu'à 2,5, au-delà ça divise. */
export const agreementOf = (spread: number): Agreement => (spread <= 1 ? 'agree' : spread <= 2.5 ? 'close' : 'split');

export type BetResult = 'hit' | 'near' | 'miss';

/** Dans le mille à 0,5 près, pas loin à 1,5 près. */
export const betResult = (guess: number, actual: number): BetResult => {
  const gap = Math.abs(guess - actual);
  return gap <= 0.5 ? 'hit' : gap <= 1.5 ? 'near' : 'miss';
};

/** Les quatre critères communs à toutes les grilles, dans l'ordre d'affichage. */
export const CRITERIA = ['story', 'visuals', 'acting', 'sound'] as const;
export type CriterionKey = (typeof CRITERIA)[number];

/** Clés de la grille Bitter+ pour chacun des quatre critères communs. */
const ADAPTIVE_KEYS: Record<CriterionKey, string[]> = {
  story: ['scenario', 'story'],
  visuals: ['image', 'visuals'],
  acting: ['interpretation', 'acting'],
  sound: ['sound'],
};

/**
 * Le détail d'une note par critère, ou null s'il n'en dit rien.
 *
 * Les colonnes ne contiennent souvent que la note globale recopiée quatre fois ;
 * le vrai détail est dans `adaptive_rating.criteria`. Une note dont les quatre
 * critères sont identiques et sans grille ne nous apprend rien : on l'écarte
 * plutôt que de conclure que tout le monde est d'accord sur tout.
 */
export const criteriaOf = (r: VerdictRating): Record<CriterionKey, number> | null => {
  const list = r.adaptive_rating?.criteria;
  if (Array.isArray(list) && list.length) {
    const out = {} as Record<CriterionKey, number>;
    for (const key of CRITERIA) {
      const hit = list.find((c) => ADAPTIVE_KEYS[key].includes(c.key));
      if (!hit || !Number.isFinite(Number(hit.value))) return null;
      out[key] = Number(hit.value);
    }
    return out;
  }
  const cols = { story: num(r.story), visuals: num(r.visuals), acting: num(r.acting), sound: num(r.sound) };
  const values = Object.values(cols);
  if (values.every((v) => v === values[0])) return null;
  return cols;
};

/**
 * Le critère qui sépare le plus le groupe, et son écart. Null si moins de deux
 * notes détaillées.
 */
export const criteriaGap = (
  detailed: Record<CriterionKey, number>[]
): { key: CriterionKey; gap: number; gaps: Record<CriterionKey, number> } | null => {
  if (detailed.length < 2) return null;
  const gaps = {} as Record<CriterionKey, number>;
  for (const key of CRITERIA) gaps[key] = spreadOf(detailed.map((d) => d[key]));
  const key = [...CRITERIA].sort((a, b) => gaps[b] - gaps[a])[0];
  return { key, gap: gaps[key], gaps };
};

/** « 6.5 » → « 6,5 », toujours une décimale : les notes du verdict s'alignent. */
export const fmt1 = (n: number): string => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');

/** Moyenne, ou null pour une liste vide. */
export const mean = (values: number[]): number | null =>
  values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;

/**
 * Qui connaît le mieux qui : l'erreur moyenne des paris résolus, par binôme
 * (celui qui parie → celui sur qui il parie).
 */
export const guessLeaderboard = (
  guesses: { movie_id: string; guesser_id: string; target_id: string; guess: number | string }[],
  actual: (movieId: string, profileId: string) => number | null
): { guesser: string; target: string; error: number; count: number }[] => {
  const pairs = new Map<string, number[]>();
  for (const g of guesses) {
    const real = actual(g.movie_id, g.target_id);
    if (real == null || actual(g.movie_id, g.guesser_id) == null) continue;
    const key = `${g.guesser_id}|${g.target_id}`;
    pairs.set(key, [...(pairs.get(key) ?? []), Math.abs(num(g.guess) - real)]);
  }
  return [...pairs.entries()]
    .map(([key, errors]) => {
      const [guesser, target] = key.split('|');
      return { guesser, target, error: mean(errors) ?? 0, count: errors.length };
    })
    .sort((a, b) => a.error - b.error || b.count - a.count);
};

/** Libellés français des genres TMDB vers leurs identifiants, pour `discover`. */
export const TMDB_GENRE_IDS: Record<string, number> = {
  Action: 28,
  Aventure: 12,
  Animation: 16,
  Comédie: 35,
  Crime: 80,
  Documentaire: 99,
  Drame: 18,
  Familial: 10751,
  Fantastique: 14,
  Histoire: 36,
  Horreur: 27,
  Musique: 10402,
  Mystère: 9648,
  Romance: 10749,
  'Science-Fiction': 878,
  Thriller: 53,
  Guerre: 10752,
  Western: 37,
};

/** « toi » → « Toi », en tête d'étiquette. */
export const cap = (s: string): string => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
