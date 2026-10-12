/**
 * Le Fil du jour : ce qui est le même pour tout le monde, tiré de la date.
 *
 * Pas de tâche planifiée côté serveur : le numéro du jour, le film mystère, ses
 * trois propositions trompeuses et les deux questions se déduisent de la date
 * de Paris et d'une réserve fixe (config/dailyFilms). Deux personnes qui ouvrent
 * le Fil le même jour voient donc exactement le même.
 *
 * Module pur.
 */

export interface PoolFilm {
  id: number;
  t: string;
  y: number;
  p: string;
  g: number[];
}

/** Le Fil n° 1 : le jour de sa sortie. */
export const FIL_EPOCH = '2026-10-13';

/** La date du jour à Paris, AAAA-MM-JJ : le Fil change à minuit pour tout le monde. */
export const parisDay = (at: number): string => new Date(at).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });

/** Le numéro du Fil pour une date (1 le jour du lancement). */
export const filNumber = (day: string): number =>
  Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${FIL_EPOCH}T12:00:00Z`)) / 864e5) + 1;

/** Le jour d'avant, au même format. */
export const previousDay = (day: string): string => new Date(Date.parse(`${day}T12:00:00Z`) - 864e5).toISOString().slice(0, 10);

/** Générateur pseudo-aléatoire à graine (mulberry32) : même graine, même suite. */
export const seeded = (seed: number) => {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** Un ordre fixe de la réserve : le film mystère n'y revient qu'après un tour complet. */
const order = (pool: PoolFilm[], seed: number): PoolFilm[] => {
  const rnd = seeded(seed);
  const out = [...pool];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

const decade = (y: number) => Math.floor(y / 10) * 10;

export interface Mystery {
  film: PoolFilm;
  /** Les quatre propositions, mélangées ; la bonne est `film`. */
  options: PoolFilm[];
}

export interface Question {
  key: 'q1' | 'q2';
  prompt: string;
  a: PoolFilm;
  b: PoolFilm;
}

export interface DailyPlan {
  day: string;
  number: number;
  mystery: Mystery;
  questions: Question[];
  /** La décennie du film mystère de demain : l'aperçu de la fin. */
  tomorrowDecade: number;
}

const mysteryFor = (pool: PoolFilm[], n: number): Mystery => {
  const film = order(pool, 142)[((n % pool.length) + pool.length) % pool.length];
  const rnd = seeded(n * 7919);
  // Des leurres plausibles : même genre principal ou même décennie, jamais trop loin.
  const close = pool.filter((f) => f.id !== film.id && (f.g[0] === film.g[0] || decade(f.y) === decade(film.y)));
  const others = (close.length >= 3 ? close : pool.filter((f) => f.id !== film.id))
    .map((f) => ({ f, k: rnd() }))
    .sort((x, y) => x.k - y.k)
    .slice(0, 3)
    .map((x) => x.f);
  const options = [film, ...others].map((f) => ({ f, k: rnd() })).sort((x, y) => x.k - y.k).map((x) => x.f);
  return { film, options };
};

export function planFor(pool: PoolFilm[], day: string): DailyPlan {
  const number = filNumber(day);
  const mystery = mysteryFor(pool, number);
  // Les questions : deux duels, sans le film mystère.
  const rest = order(pool.filter((f) => f.id !== mystery.film.id), 9000 + number);
  const sameGenre = rest.find((f, i) => i > 0 && f.g[0] === rest[0].g[0]) ?? rest[1];
  const q2a = rest.find((f) => f.id !== rest[0].id && f.id !== sameGenre.id)!;
  const q2b = rest.find((f) => ![rest[0].id, sameGenre.id, q2a.id].includes(f.id) && decade(f.y) !== decade(q2a.y)) ?? rest[5];
  const next = mysteryFor(pool, number + 1);
  return {
    day,
    number,
    mystery,
    questions: [
      { key: 'q1', prompt: 'keep', a: rest[0], b: sameGenre },
      { key: 'q2', prompt: 'tonight', a: q2a, b: q2b },
    ],
    tomorrowDecade: decade(next.film.y),
  };
}

/**
 * La série : le nombre de jours consécutifs terminés, en partant d'aujourd'hui,
 * ou d'hier si le Fil du jour n'est pas encore fait (la série n'est pas perdue
 * avant minuit).
 */
export function streakOf(doneDays: Set<string>, today: string): number {
  let day = doneDays.has(today) ? today : previousDay(today);
  let n = 0;
  while (doneDays.has(day)) {
    n += 1;
    day = previousDay(day);
  }
  return n;
}
