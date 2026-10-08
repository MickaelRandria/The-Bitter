import type { Movie } from '../types';
import { getDisplayWeightedRating, hasVerdict } from './rating';
import { getPublicRating } from './publicRating';

/**
 * « Tes constats » : ce que les notes disent de la personne, en phrases.
 *
 * Chaque constat part d'une observation que seules ses données permettent —
 * pas un camembert de genres. Il se lit à deux niveaux : une phrase et un
 * petit visuel pour tout le monde, un graphique complet pour qui ouvre le
 * détail. Il n'apparaît qu'avec assez de films pour dire quelque chose ; avant,
 * il reste « à débloquer », avec ce qu'il manque.
 *
 * Le calcul (`computeConstats`) ne dépend que de `FilmPoint` : il se teste sans
 * l'app (tests/constats.test.mjs). `filmPointsFrom` fait le lien avec `Movie`.
 */

export type CriterionKey = 'scenario' | 'image' | 'interpretation' | 'sound';
export const CRITERIA: CriterionKey[] = ['scenario', 'image', 'interpretation', 'sound'];

export interface FilmPoint {
  id: string;
  title: string;
  year?: number;
  genre?: string;
  rating: number;
  publicRating?: number;
  /** Année où le film a été vu. */
  watchedYear?: number;
  runtime?: number;
  /** Part du film passée sur le téléphone, en %. 0 vaut aussi « non renseigné ». */
  phone?: number;
  /** Scénario, image, jeu, son — absent si la note n'a pas été posée critère par critère. */
  criteria?: [number, number, number, number];
  imprints?: string[];
  /** Première note posée, quand elle a été modifiée depuis. */
  firstRating?: number;
}

/** Un film vu et noté, ramené à ce que les constats regardent. Les séries n'y entrent pas. */
export const filmPointsFrom = (movies: Movie[]): FilmPoint[] =>
  movies
    .filter((m) => m.status === 'watched' && (m.mediaType ?? 'movie') !== 'tv' && hasVerdict(m))
    .map((m) => {
      const byKey = new Map((m.adaptiveRating?.criteria ?? []).map((c) => [c.key, Number(c.value)]));
      const qm = m.qualityMetrics as { scenario?: number; visual?: number; acting?: number; sound?: number } | undefined;
      // En Bitter+, `ratings` porte quatre fois la note pondérée : les vrais
      // critères sont dans la grille, sinon dans qualityMetrics.
      const criteria: [number, number, number, number] | undefined = m.adaptiveRating
        ? [
            byKey.get('scenario') ?? qm?.scenario ?? NaN,
            byKey.get('image') ?? qm?.visual ?? NaN,
            byKey.get('interpretation') ?? qm?.acting ?? NaN,
            byKey.get('sound') ?? qm?.sound ?? NaN,
          ]
        : [m.ratings.story, m.ratings.visuals, m.ratings.acting, m.ratings.sound];
      const watched = m.dateWatched ?? m.dateAdded;
      return {
        id: m.id,
        title: m.title,
        year: m.year || undefined,
        genre: m.genre || undefined,
        rating: getDisplayWeightedRating(m),
        publicRating: getPublicRating(m)?.value,
        watchedYear: watched ? new Date(watched).getFullYear() : undefined,
        runtime: m.runtime && m.runtime > 0 ? m.runtime : undefined,
        phone: typeof m.smartphoneFactor === 'number' ? m.smartphoneFactor : undefined,
        criteria: criteria.every(Number.isFinite) ? criteria : undefined,
        imprints: m.adaptiveRating?.imprints?.length ? m.adaptiveRating.imprints : undefined,
        firstRating: m.ratingHistory?.length ? m.ratingHistory[0].rating : undefined,
      };
    });

const mean = (values: number[]) => values.reduce((s, v) => s + v, 0) / values.length;

/** En deçà, l'écart n'est pas un trait de caractère, c'est du bruit. */
const SIGNAL = 0.5;

export type ConstatId = 'public' | 'phone' | 'maillon' | 'emotions' | 'duree' | 'classiques' | 'revirements';

interface Locked {
  unlocked: false;
  /** Combien de films il manque, quand ça se compte. */
  missing: number;
}

export interface PublicConstat {
  unlocked: true;
  you: number;
  crowd: number;
  /** Ta note moins celle du public, en moyenne. */
  gap: number;
  tone: 'below' | 'above' | 'same';
  /** Le genre où l'écart est le plus marqué dans le même sens (4 films au moins). */
  genre?: { name: string; gap: number };
  points: { id: string; title: string; you: number; crowd: number }[];
}

export interface PhoneConstat {
  unlocked: true;
  buckets: { key: 'never' | 'low' | 'mid' | 'high'; avg: number | null; count: number; titles: string[] }[];
  tone: 'strong' | 'flat';
}

export interface MaillonConstat {
  unlocked: true;
  /** Nombre de films où chaque critère est le plus bas (ex æquo partagés). */
  weakest: Record<CriterionKey, number>;
  lead: CriterionKey;
  total: number;
  /** Note moyenne quand le critère faible passe sous 5 — absent si moins de 2 films. */
  crash?: { avg: number; count: number };
}

export interface EmotionsConstat {
  unlocked: true;
  items: { key: string; avg: number; count: number }[];
  /** Ta moyenne générale : la frontière. */
  split: number;
  top: { key: string; avg: number };
  low: { key: string; avg: number };
}

export interface DureeConstat {
  unlocked: true;
  bands: { key: 'short' | 'mid1' | 'mid2' | 'long'; avg: number | null; count: number }[];
  tone: 'long' | 'short' | 'flat';
}

export interface ClassiquesConstat {
  unlocked: true;
  old: number;
  fresh: number;
  tone: 'old' | 'new' | 'flat';
  points: { id: string; title: string; year: number; age: number; rating: number }[];
}

export interface RevirementsConstat {
  unlocked: true;
  changes: { id: string; title: string; from: number; to: number }[];
}

export interface Constats {
  public: PublicConstat | Locked;
  phone: PhoneConstat | Locked;
  maillon: MaillonConstat | Locked;
  emotions: EmotionsConstat | Locked;
  duree: DureeConstat | Locked;
  classiques: ClassiquesConstat | Locked;
  revirements: RevirementsConstat | Locked;
}

export const CONSTAT_ORDER: ConstatId[] = ['public', 'phone', 'maillon', 'emotions', 'duree', 'classiques', 'revirements'];

export const MIN_PUBLIC = 10;
export const MIN_PHONE = 12;
export const MIN_MAILLON = 15;
export const MIN_DUREE = 15;
const MIN_PER_GROUP = 3;
const MIN_CLASSIC_GROUP = 5;

const lock = (missing: number): Locked => ({ unlocked: false, missing: Math.max(1, Math.ceil(missing)) });

function publicConstat(films: FilmPoint[]): PublicConstat | Locked {
  const rated = films.filter((f) => f.publicRating != null);
  if (rated.length < MIN_PUBLIC) return lock(MIN_PUBLIC - rated.length);
  const you = mean(rated.map((f) => f.rating));
  const crowd = mean(rated.map((f) => f.publicRating as number));
  const gap = you - crowd;
  const tone = gap <= -0.3 ? 'below' : gap >= 0.3 ? 'above' : 'same';
  const byGenre = new Map<string, number[]>();
  for (const f of rated) if (f.genre) byGenre.set(f.genre, [...(byGenre.get(f.genre) ?? []), f.rating - (f.publicRating as number)]);
  const genres = [...byGenre.entries()].filter(([, gaps]) => gaps.length >= 4).map(([name, gaps]) => ({ name, gap: mean(gaps) }));
  const strongest = tone === 'same' ? undefined : genres.sort((a, b) => (tone === 'below' ? a.gap - b.gap : b.gap - a.gap))[0];
  return {
    unlocked: true,
    you,
    crowd,
    gap,
    tone,
    // Le genre n'est cité que s'il accentue le trait, pas s'il le contredit.
    genre: strongest && Math.sign(strongest.gap) === Math.sign(gap) && Math.abs(strongest.gap) > Math.abs(gap) ? strongest : undefined,
    points: rated.map((f) => ({ id: f.id, title: f.title, you: f.rating, crowd: f.publicRating as number })),
  };
}

function phoneConstat(films: FilmPoint[]): PhoneConstat | Locked {
  const withPhone = films.filter((f) => f.phone != null);
  if (withPhone.length < MIN_PHONE) return lock(MIN_PHONE - withPhone.length);
  const defs = [
    { key: 'never' as const, test: (p: number) => p === 0 },
    { key: 'low' as const, test: (p: number) => p > 0 && p <= 20 },
    { key: 'mid' as const, test: (p: number) => p > 20 && p <= 40 },
    { key: 'high' as const, test: (p: number) => p > 40 },
  ];
  const buckets = defs.map(({ key, test }) => {
    const fs = withPhone.filter((f) => test(f.phone as number));
    return { key, count: fs.length, avg: fs.length ? mean(fs.map((f) => f.rating)) : null, titles: fs.slice(0, 3).map((f) => f.title) };
  });
  // Sans au moins deux groupes fournis, il n'y a rien à comparer.
  const filled = buckets.filter((b) => b.count >= MIN_PER_GROUP);
  if (filled.length < 2) return lock(MIN_PER_GROUP);
  const first = filled[0].avg as number;
  const last = filled[filled.length - 1].avg as number;
  return { unlocked: true, buckets, tone: first - last >= SIGNAL ? 'strong' : 'flat' };
}

function maillonConstat(films: FilmPoint[]): MaillonConstat | Locked {
  // Un film noté pareil partout ne désigne aucun maillon faible.
  const real = films.filter((f) => f.criteria && !f.criteria.every((v) => v === f.criteria![0]));
  if (real.length < MIN_MAILLON) return lock(MIN_MAILLON - real.length);
  const weakest: Record<CriterionKey, number> = { scenario: 0, image: 0, interpretation: 0, sound: 0 };
  for (const f of real) {
    const c = f.criteria!;
    const lo = Math.min(...c);
    const ties = c.filter((v) => v === lo).length;
    c.forEach((v, i) => {
      if (v === lo) weakest[CRITERIA[i]] += 1 / ties;
    });
  }
  const lead = CRITERIA.reduce((best, k) => (weakest[k] > weakest[best] ? k : best), CRITERIA[0]);
  const crashing = real.filter((f) => f.criteria![CRITERIA.indexOf(lead)] < 5);
  return {
    unlocked: true,
    weakest,
    lead,
    total: real.length,
    crash: crashing.length >= 2 ? { avg: mean(crashing.map((f) => f.rating)), count: crashing.length } : undefined,
  };
}

function emotionsConstat(films: FilmPoint[]): EmotionsConstat | Locked {
  const byImprint = new Map<string, number[]>();
  for (const f of films) for (const k of f.imprints ?? []) byImprint.set(k, [...(byImprint.get(k) ?? []), f.rating]);
  const items = [...byImprint.entries()]
    .filter(([, r]) => r.length >= MIN_PER_GROUP)
    .map(([key, r]) => ({ key, avg: mean(r), count: r.length }))
    .sort((a, b) => a.avg - b.avg);
  const withImprints = films.filter((f) => f.imprints?.length);
  const split = withImprints.length ? mean(withImprints.map((f) => f.rating)) : 0;
  const top = items[items.length - 1];
  const low = items[0];
  // Il faut une frontière : des empreintes de part et d'autre de ta moyenne, assez écartées.
  if (items.length < 4 || !top || !low || top.avg - low.avg < SIGNAL * 2 || top.avg < split || low.avg > split) {
    return lock(Math.max(4, 10 - withImprints.length));
  }
  return { unlocked: true, items, split, top: { key: top.key, avg: top.avg }, low: { key: low.key, avg: low.avg } };
}

function dureeConstat(films: FilmPoint[]): DureeConstat | Locked {
  const timed = films.filter((f) => f.runtime != null);
  const defs = [
    { key: 'short' as const, test: (r: number) => r < 95 },
    { key: 'mid1' as const, test: (r: number) => r >= 95 && r < 115 },
    { key: 'mid2' as const, test: (r: number) => r >= 115 && r < 135 },
    { key: 'long' as const, test: (r: number) => r >= 135 },
  ];
  const bands = defs.map(({ key, test }) => {
    const fs = timed.filter((f) => test(f.runtime as number));
    return { key, count: fs.length, avg: fs.length ? mean(fs.map((f) => f.rating)) : null };
  });
  const short = bands[0], long = bands[3];
  if (timed.length < MIN_DUREE || short.count < MIN_PER_GROUP || long.count < MIN_PER_GROUP) {
    return lock(Math.max(MIN_DUREE - timed.length, MIN_PER_GROUP - short.count, MIN_PER_GROUP - long.count));
  }
  const delta = (long.avg as number) - (short.avg as number);
  return { unlocked: true, bands, tone: delta >= SIGNAL ? 'long' : delta <= -SIGNAL ? 'short' : 'flat' };
}

function classiquesConstat(films: FilmPoint[]): ClassiquesConstat | Locked {
  const dated = films
    .filter((f) => f.year && f.watchedYear)
    .map((f) => ({ id: f.id, title: f.title, year: f.year as number, age: Math.max(0, (f.watchedYear as number) - (f.year as number)), rating: f.rating }));
  const old = dated.filter((f) => f.age >= 5), fresh = dated.filter((f) => f.age <= 1);
  if (old.length < MIN_CLASSIC_GROUP || fresh.length < MIN_CLASSIC_GROUP) {
    return lock(Math.max(MIN_CLASSIC_GROUP - old.length, MIN_CLASSIC_GROUP - fresh.length));
  }
  const o = mean(old.map((f) => f.rating)), n = mean(fresh.map((f) => f.rating));
  return { unlocked: true, old: o, fresh: n, tone: o - n >= SIGNAL ? 'old' : n - o >= SIGNAL ? 'new' : 'flat', points: dated };
}

function revirementsConstat(films: FilmPoint[]): RevirementsConstat | Locked {
  const changes = films
    .filter((f) => f.firstRating != null && Math.abs((f.firstRating as number) - f.rating) >= 0.05)
    .map((f) => ({ id: f.id, title: f.title, from: f.firstRating as number, to: f.rating }))
    .sort((a, b) => Math.abs(b.to - b.from) - Math.abs(a.to - a.from));
  return changes.length ? { unlocked: true, changes } : lock(1);
}

export function computeConstats(films: FilmPoint[]): Constats {
  return {
    public: publicConstat(films),
    phone: phoneConstat(films),
    maillon: maillonConstat(films),
    emotions: emotionsConstat(films),
    duree: dureeConstat(films),
    classiques: classiquesConstat(films),
    revirements: revirementsConstat(films),
  };
}
