/**
 * « Tes salles » en détail : salle ou canapé, habitudes, effet de la version,
 * le pass en vrai, les records, et la fiche d'un cinéma. Module pur : séances et
 * notes arrivent déjà chargées (voir utils/cinemaStats.ts pour la vue courte).
 */
import { formatLabels } from './cinemaStats';
import { APPROX_NOTE } from './seance';

export interface DetailScreening {
  id: string;
  startsAt: number;
  title: string;
  posterUrl?: string;
  cinemaName?: string;
  cinemaAddress?: string;
  format?: string;
  tmdbId?: number;
  /** Séance calée à plusieurs. */
  planId?: string;
  /** `APPROX_NOTE` : une heure tirée d'un moment, pas du programme. */
  notes?: string;
}

/** Les séances à l'heure exacte : les seules qui disent un jour, un créneau, un record. */
const exact = (screenings: DetailScreening[]) => screenings.filter((s) => s.notes !== APPROX_NOTE);

export interface RatedFilm {
  tmdbId?: number;
  score: number;
}

const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
const DAY = 86_400_000;

/** Tes notes des films vus en séance, contre les autres. Il faut au moins 2 films de chaque côté. */
export function salleVsCanape(films: RatedFilm[], screenings: DetailScreening[]) {
  const seen = new Set(screenings.map((s) => s.tmdbId).filter((id): id is number => id != null));
  const salle = films.filter((f) => f.tmdbId != null && seen.has(f.tmdbId)).map((f) => f.score);
  const canape = films.filter((f) => f.tmdbId == null || !seen.has(f.tmdbId)).map((f) => f.score);
  if (salle.length < 2 || canape.length < 2) return null;
  return { salle: mean(salle)!, canape: mean(canape)!, salleCount: salle.length, canapeCount: canape.length };
}

export interface Habits {
  /** Séances par jour, lundi en tête. */
  byWeekday: number[];
  topWeekday: number;
  /** Le créneau de deux heures le plus fréquent : son heure de début. */
  topSlot: number;
  together: number;
  /** Jours entre deux séances, en moyenne ; null pour une seule séance. */
  everyDays: number | null;
}

export function habitsOf(all: DetailScreening[]): Habits {
  const screenings = exact(all);
  const byWeekday = Array(7).fill(0);
  const slots = new Map<number, number>();
  for (const s of screenings) {
    const d = new Date(s.startsAt);
    byWeekday[(d.getDay() + 6) % 7] += 1;
    const slot = Math.floor(d.getHours() / 2) * 2;
    slots.set(slot, (slots.get(slot) ?? 0) + 1);
  }
  const topWeekday = byWeekday.indexOf(Math.max(...byWeekday));
  const topSlot = [...slots.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0] ?? 20;
  const times = screenings.map((s) => s.startsAt).sort((a, b) => a - b);
  const everyDays = times.length > 1 ? Math.max(1, Math.round((times[times.length - 1] - times[0]) / DAY / (times.length - 1))) : null;
  return { byWeekday, topWeekday, topSlot, together: screenings.filter((s) => s.planId).length, everyDays };
}

/** Ta moyenne par version, sur au moins 2 films notés. */
export function formatEffect(screenings: DetailScreening[], ratingOf: (tmdbId: number) => number | undefined) {
  const map = new Map<string, number[]>();
  const counts = new Map<string, number>();
  for (const s of screenings) {
    const rating = s.tmdbId != null ? ratingOf(s.tmdbId) : undefined;
    for (const label of formatLabels(s.format)) {
      counts.set(label, (counts.get(label) ?? 0) + 1);
      if (typeof rating === 'number') map.set(label, [...(map.get(label) ?? []), rating]);
    }
  }
  return [...map.entries()]
    .filter(([, values]) => values.length >= 2)
    .map(([label, values]) => ({ label, count: counts.get(label) ?? values.length, average: mean(values)! }))
    .sort((a, b) => b.average - a.average);
}

/**
 * Le pass sur la période : chaque mois entre la première et la dernière séance
 * (depuis le début de l'abonnement) est payé ; chaque séance vaut une place au
 * tarif de référence.
 */
export function passReality(screenings: DetailScreening[], sub: { monthlyPrice: number; referenceTicketPrice: number; startDate: string }) {
  const start = new Date(sub.startDate).getTime();
  const counted = screenings.filter((s) => !Number.isFinite(start) || s.startsAt >= start);
  if (!counted.length || sub.monthlyPrice <= 0) return null;
  const monthKey = (ts: number) => {
    const d = new Date(ts);
    return d.getFullYear() * 12 + d.getMonth();
  };
  const keys = counted.map((s) => monthKey(s.startsAt));
  const months = Math.max(...keys) - Math.min(...keys) + 1;
  const paid = months * sub.monthlyPrice;
  const perMonth = new Map<number, number>();
  for (const k of keys) perMonth.set(k, (perMonth.get(k) ?? 0) + 1);
  const [bestKey, bestCount] = [...perMonth.entries()].sort((a, b) => b[1] - a[1])[0];
  return {
    perSession: paid / counted.length,
    saved: counted.length * sub.referenceTicketPrice - paid,
    bestMonth: new Date(Math.floor(bestKey / 12), bestKey % 12, 1),
    bestMonthSaved: bestCount * sub.referenceTicketPrice - sub.monthlyPrice,
  };
}

/** Le numéro de semaine continu (lundi en tête), pour compter les séries. */
const weekIndex = (ts: number) => {
  const d = new Date(ts);
  const monday = new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7));
  return Math.round(monday.getTime() / (7 * DAY));
};

export function recordsOf(all: DetailScreening[]) {
  const screenings = exact(all);
  if (!screenings.length) return null;
  const minutes = (ts: number) => {
    const d = new Date(ts);
    // Une séance après minuit compte comme la plus tardive de la soirée.
    return (d.getHours() < 5 ? d.getHours() + 24 : d.getHours()) * 60 + d.getMinutes();
  };
  const latest = [...screenings].sort((a, b) => minutes(b.startsAt) - minutes(a.startsAt))[0];
  const first = [...screenings].sort((a, b) => a.startsAt - b.startsAt)[0];
  const weeks = [...new Set(screenings.map((s) => weekIndex(s.startsAt)))].sort((a, b) => a - b);
  let streak = 1;
  let best = 1;
  for (let i = 1; i < weeks.length; i++) {
    streak = weeks[i] === weeks[i - 1] + 1 ? streak + 1 : 1;
    best = Math.max(best, streak);
  }
  return { latest, first, streakWeeks: best };
}

/** La fiche d'un cinéma. */
export function cinemaCard(name: string, screenings: DetailScreening[], ratingOf: (tmdbId: number) => number | undefined) {
  const here = screenings.filter((s) => s.cinemaName?.trim() === name).sort((a, b) => b.startsAt - a.startsAt);
  const ratings = here.map((s) => (s.tmdbId != null ? ratingOf(s.tmdbId) : undefined)).filter((r): r is number => typeof r === 'number');
  const formats = new Map<string, number>();
  for (const s of here) for (const label of formatLabels(s.format)) formats.set(label, (formats.get(label) ?? 0) + 1);
  return {
    count: here.length,
    average: ratings.length ? mean(ratings) : null,
    address: here.find((s) => s.cinemaAddress)?.cinemaAddress,
    first: here[here.length - 1]?.startsAt,
    last: here[0]?.startsAt,
    screenings: here,
    formats: [...formats.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    together: here.filter((s) => s.planId).length,
  };
}
