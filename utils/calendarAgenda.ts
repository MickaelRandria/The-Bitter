/** Le calendrier compte les séances, y compris les rewatches, à la date de Paris. */
export interface AgendaMovie {
  id: string;
  status: string;
  mediaType?: string;
  seasonNumber?: number;
  dateWatched?: number;
  ratings: { story: number; visuals: number; acting: number; sound: number };
  adaptiveRating?: { weightedRating: number };
  watches?: {
    id: string;
    watched_at: string;
    ratings: AgendaMovie['ratings'];
    adaptiveRating?: { weightedRating: number };
  }[];
}

export interface CalendarWatch {
  id: string;
  movieId: string;
  watchId?: string;
  day: string;
  rating: number;
}

export type AgendaKind = 'watched' | 'screening' | 'plan' | 'watchlist-release' | 'release';
export interface AgendaEvent {
  id: string;
  day: string;
  kind: AgendaKind;
  title: string;
  posterUrl?: string;
  tmdbId?: number;
  movieId?: string;
  screeningId?: string;
  planId?: string;
  slotId?: string;
  startsAt?: number;
  cinemaName?: string;
  spaceName?: string;
  participants?: number;
  ownPlan?: boolean;
  joined?: boolean;
  pending?: boolean;
  declined?: boolean;
}

export const calendarDay = (value: number | string | Date): string => {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Paris',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
};

/** Les jours civils avancent en UTC : le passage à l'heure d'été n'ajoute aucun trou. */
export const shiftCalendarDay = (day: string, offset: number): string => {
  const date = new Date(`${day}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : '';
};
export const daysUntil = (day: string, today: string) =>
  Math.round((Date.parse(`${day}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);

const score = (item: Pick<AgendaMovie, 'ratings' | 'adaptiveRating'>): number => {
  const weighted = item.adaptiveRating?.weightedRating;
  if (typeof weighted === 'number' && Number.isFinite(weighted)) return weighted;
  const r = item.ratings;
  return [r.story, r.visuals, r.acting, r.sound].reduce((sum, n) => sum + (Number(n) || 0), 0) / 4;
};

export function calendarHistory(movies: readonly AgendaMovie[]): CalendarWatch[] {
  const result: CalendarWatch[] = [];
  for (const movie of movies) {
    if (movie.status !== 'watched' || movie.mediaType === 'tv' || movie.seasonNumber != null)
      continue;
    const watches = (movie.watches ?? []).filter((watch) => calendarDay(watch.watched_at));
    if (watches.length) {
      const seen = new Set<string>();
      for (const watch of watches) {
        if (seen.has(watch.id)) continue;
        seen.add(watch.id);
        result.push({
          id: `${movie.id}:${watch.id}`,
          movieId: movie.id,
          watchId: watch.id,
          day: calendarDay(watch.watched_at),
          rating: score(watch),
        });
      }
    } else if (movie.dateWatched != null && calendarDay(movie.dateWatched)) {
      result.push({
        id: movie.id,
        movieId: movie.id,
        day: calendarDay(movie.dateWatched),
        rating: score(movie),
      });
    }
  }
  return result.sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id));
}

export function calendarYear(history: readonly CalendarWatch[], year: number) {
  const entries = history.filter((watch) => watch.day.startsWith(`${year}-`));
  const days = new Map<string, CalendarWatch[]>();
  const monthCounts = Array<number>(12).fill(0);
  const weekdayCounts = Array<number>(7).fill(0);
  const best: (CalendarWatch | null)[] = Array(12).fill(null);
  for (const watch of entries) {
    days.set(watch.day, [...(days.get(watch.day) ?? []), watch]);
    const month = Number(watch.day.slice(5, 7)) - 1;
    monthCounts[month]++;
    weekdayCounts[(new Date(`${watch.day}T12:00:00Z`).getUTCDay() + 6) % 7]++;
    if (!best[month] || watch.rating > best[month]!.rating) best[month] = watch;
  }
  let longestStreak = 0;
  let streak = 0;
  let previous = '';
  for (const day of [...days.keys()].sort()) {
    streak = day === shiftCalendarDay(previous, 1) ? streak + 1 : 1;
    longestStreak = Math.max(longestStreak, streak);
    previous = day;
  }
  const maximumIndex = (counts: number[]) =>
    entries.length ? counts.indexOf(Math.max(...counts)) : null;
  const heatmap = Array.from({ length: 12 }, (_, month) =>
    Array.from({ length: 31 }, (_, index) => {
      const day = `${year}-${String(month + 1).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`;
      if (index >= new Date(Date.UTC(year, month + 1, 0)).getUTCDate()) return null;
      return {
        day,
        count: days.get(day)?.length ?? 0,
        intensity: Math.min(3, days.get(day)?.length ?? 0),
      };
    })
  );
  return {
    entries,
    days,
    heatmap,
    best,
    monthCounts,
    weekdayCounts,
    longestStreak,
    bestMonth: maximumIndex(monthCounts),
    favoriteWeekday: maximumIndex(weekdayCounts),
    total: entries.length,
    average: entries.length ? entries.reduce((sum, w) => sum + w.rating, 0) / entries.length : 0,
  };
}

/**
 * Ce que le calendrier montre : tout, ou une seule famille d'événements.
 *
 * Le mois mélangeait films vus, séances et sorties : pratique pour voir sa
 * semaine, illisible pour retrouver « quand ai-je vu ce film » ou « qu'est-ce qui
 * sort ». Chaque filtre garde une famille entière, jamais un événement isolé.
 */
export type CalendarFilter = 'all' | 'watched' | 'sessions' | 'releases';
export const CALENDAR_FILTERS: CalendarFilter[] = ['all', 'watched', 'sessions', 'releases'];
const FILTER_KINDS: Record<Exclude<CalendarFilter, 'all'>, AgendaKind[]> = {
  watched: ['watched'],
  sessions: ['screening', 'plan'],
  releases: ['watchlist-release', 'release'],
};

export const matchesCalendarFilter = (kind: AgendaKind, filter: CalendarFilter): boolean =>
  filter === 'all' || FILTER_KINDS[filter].includes(kind);

export function filterCalendarDays(
  days: ReadonlyMap<string, AgendaEvent[]>,
  filter: CalendarFilter
): Map<string, AgendaEvent[]> {
  if (filter === 'all') return new Map(days);
  const result = new Map<string, AgendaEvent[]>();
  for (const [day, events] of days) {
    const kept = events.filter((event) => matchesCalendarFilter(event.kind, filter));
    if (kept.length) result.set(day, kept);
  }
  return result;
}

/** Une séance à venir qu'on peut encore retirer : la sienne, ou une séance d'espace où l'on est. */
export const isRemovableSession = (event: AgendaEvent, today: string): boolean =>
  event.day >= today &&
  (event.kind === 'screening' || (event.kind === 'plan' && !!(event.ownPlan || event.joined)));

/** Une séance calée et son invitation ne doivent pas occuper deux fois le même jour. */
export function mergeCalendarEvents(events: readonly AgendaEvent[]): Map<string, AgendaEvent[]> {
  const rank: Record<AgendaKind, number> = {
    watched: 0,
    screening: 1,
    plan: 2,
    'watchlist-release': 3,
    release: 4,
  };
  const ordered = [...events]
    .filter((event) => /^\d{4}-\d{2}-\d{2}$/.test(event.day))
    .sort(
      (a, b) =>
        rank[a.kind] - rank[b.kind] ||
        (a.startsAt ?? 0) - (b.startsAt ?? 0) ||
        a.id.localeCompare(b.id)
    );
  const seen = new Set<string>();
  const days = new Map<string, AgendaEvent[]>();
  for (const event of ordered) {
    const key = event.planId
      ? `plan:${event.planId}:${event.startsAt}`
      : ['release', 'watchlist-release'].includes(event.kind)
        ? `release:${event.tmdbId}:${event.day}`
        : event.id;
    if (seen.has(key)) continue;
    seen.add(key);
    days.set(event.day, [...(days.get(event.day) ?? []), event]);
  }
  return days;
}

export function majorCalendarReleases<
  T extends { id: number; releaseDate: string; popularity?: number },
>(releases: readonly T[], today: string, horizon = 90): T[] {
  const end = shiftCalendarDay(today, horizon);
  const seen = new Set<number>();
  return [...releases]
    .filter((film) => {
      if (seen.has(film.id) || film.releaseDate < today || film.releaseDate > end) return false;
      seen.add(film.id);
      return true;
    })
    .sort(
      (a, b) =>
        (b.popularity ?? 0) - (a.popularity ?? 0) || a.releaseDate.localeCompare(b.releaseDate)
    );
}
