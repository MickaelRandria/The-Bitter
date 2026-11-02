/**
 * « Tes salles » et « Ton objectif » dans les stats. Module pur : les séances
 * et les films arrivent déjà chargés.
 */

export interface StatScreening {
  startsAt: number;
  cinemaName?: string;
  format?: string;
  tmdbId?: number;
}

export interface CinemaRow {
  name: string;
  count: number;
  /** Ta moyenne sur les films vus dans cette salle, s'il y en a au moins deux de notés. */
  average: number | null;
}

export interface CinemaReport {
  sessions: number;
  cinemas: CinemaRow[];
  /** VOST, VF, IMAX… : séances par version, des plus fréquentes aux plus rares. */
  formats: { label: string; count: number }[];
  /** La salle où tu notes le mieux. */
  best: CinemaRow | null;
}

/** Les versions telles qu'on les écrit, quel que soit le libellé saisi. */
export function formatLabels(raw?: string): string[] {
  if (!raw) return [];
  const s = raw.toUpperCase();
  const out: string[] = [];
  if (/VOST|VO\b|V\.O/.test(s)) out.push('VOST');
  else if (/\bVF\b|FRAN/.test(s)) out.push('VF');
  if (/IMAX/.test(s)) out.push('IMAX');
  if (/4DX/.test(s)) out.push('4DX');
  if (/DOLBY|ATMOS/.test(s)) out.push('Dolby');
  if (/3D/.test(s) && !/4DX/.test(s)) out.push('3D');
  return out;
}

export function cinemaStats(screenings: StatScreening[], ratingOf: (tmdbId: number) => number | undefined): CinemaReport {
  const byCinema = new Map<string, { count: number; ratings: number[] }>();
  const formats = new Map<string, number>();
  for (const s of screenings) {
    const name = s.cinemaName?.trim();
    if (name) {
      const row = byCinema.get(name) ?? { count: 0, ratings: [] };
      row.count += 1;
      const rating = s.tmdbId != null ? ratingOf(s.tmdbId) : undefined;
      if (typeof rating === 'number') row.ratings.push(rating);
      byCinema.set(name, row);
    }
    for (const label of formatLabels(s.format)) formats.set(label, (formats.get(label) ?? 0) + 1);
  }
  const cinemas: CinemaRow[] = [...byCinema.entries()]
    .map(([name, row]) => ({
      name,
      count: row.count,
      average: row.ratings.length >= 2 ? row.ratings.reduce((a, b) => a + b, 0) / row.ratings.length : null,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  const best = [...cinemas].filter((c) => c.average != null).sort((a, b) => (b.average ?? 0) - (a.average ?? 0))[0] ?? null;
  return {
    sessions: screenings.length,
    cinemas,
    formats: [...formats.entries()].map(([label, count]) => ({ label, count })).sort((a, b) => b.count - a.count),
    best: cinemas.filter((c) => c.average != null).length >= 2 ? best : null,
  };
}

/** Où tu en es de ton objectif : l'avance (ou le retard) sur le rythme, et la projection. */
export function goalProgress(count: number, goal: number, now: Date) {
  const start = new Date(now.getFullYear(), 0, 1).getTime();
  const end = new Date(now.getFullYear() + 1, 0, 1).getTime();
  const elapsed = Math.min(1, Math.max(1 / 365, (now.getTime() - start) / (end - start)));
  const expected = goal * elapsed;
  return {
    ahead: Math.round(count - expected),
    projection: Math.round(count / elapsed),
    left: Math.max(0, goal - count),
    weeksLeft: Math.max(1, (end - now.getTime()) / (7 * 86_400_000)),
  };
}
