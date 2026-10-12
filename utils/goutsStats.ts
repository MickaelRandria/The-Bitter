/**
 * Les chiffres de l'onglet Goûts : genres, avis contraires, réalisateurs,
 * époques, répartition des notes, attente et réalité, classement.
 *
 * Module pur : l'appelant fournit les films mis à plat, note déjà calculée.
 */

export interface GoutFilm {
  id: string;
  title: string;
  posterUrl?: string;
  score: number;
  genre?: string;
  director?: string;
  directorId?: number;
  year?: number;
  publicScore?: number;
  /** Attente déclarée avant le film, sur 10. */
  hype?: number;
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const firstGenre = (g?: string) => (g || '').split(',')[0].trim();
const rated = (films: GoutFilm[]) => films.filter((f) => Number.isFinite(f.score) && f.score > 0);
const best = (films: GoutFilm[]) => [...films].sort((a, b) => b.score - a.score)[0];

export interface GenreBlock {
  name: string;
  count: number;
  average: number;
  /** Ton film préféré du genre : son affiche remplit le bloc. */
  favorite?: GoutFilm;
  films: GoutFilm[];
  /** Le bloc « Autres » regroupe ce qui dépasse les premiers genres. */
  others: boolean;
}

/** Les genres principaux (au moins 2 films), le reste regroupé dans « Autres ». */
export function genreBlocks(films: GoutFilm[], keep = 5): GenreBlock[] {
  const by = new Map<string, GoutFilm[]>();
  for (const f of rated(films)) {
    const g = firstGenre(f.genre);
    if (g) by.set(g, [...(by.get(g) ?? []), f]);
  }
  const all = [...by.entries()]
    .map(([name, list]) => ({ name, list }))
    .sort((a, b) => b.list.length - a.list.length || mean(b.list.map((f) => f.score)) - mean(a.list.map((f) => f.score)));
  const main = all.filter((g) => g.list.length >= 2).slice(0, keep);
  const rest = all.filter((g) => !main.includes(g)).flatMap((g) => g.list);
  const blocks: GenreBlock[] = main.map((g) => ({
    name: g.name,
    count: g.list.length,
    average: mean(g.list.map((f) => f.score)),
    favorite: best(g.list.filter((f) => f.posterUrl)) ?? best(g.list),
    films: [...g.list].sort((a, b) => b.score - a.score),
    others: false,
  }));
  if (rest.length) {
    blocks.push({
      name: 'Autres',
      count: rest.length,
      average: mean(rest.map((f) => f.score)),
      favorite: undefined,
      films: [...rest].sort((a, b) => b.score - a.score),
      others: true,
    });
  }
  return blocks;
}

export interface Tile {
  index: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Treemap « carré » (Bruls, Huizing, van Wijk) : la surface de chaque bloc est
 * proportionnelle à sa valeur, avec des blocs proches du carré, faciles à
 * comparer. Coordonnées en pourcentage d'un cadre 100 × 100.
 */
export function squarify(values: number[]): Tile[] {
  const total = values.reduce((a, b) => a + b, 0);
  if (!total) return [];
  let items = values.map((v, index) => ({ v: (v / total) * 10000, index }));
  let x = 0;
  let y = 0;
  let w = 100;
  let h = 100;
  const out: Tile[] = [];
  const worst = (row: typeof items, side: number) => {
    const s = row.reduce((a, r) => a + r.v, 0);
    const mx = Math.max(...row.map((r) => r.v));
    const mn = Math.min(...row.map((r) => r.v));
    return Math.max((side * side * mx) / (s * s), (s * s) / (side * side * mn));
  };
  while (items.length) {
    const horizontal = w >= h;
    const side = horizontal ? h : w;
    const row = [items[0]];
    items = items.slice(1);
    while (items.length && worst([...row, items[0]], side) <= worst(row, side)) {
      row.push(items[0]);
      items = items.slice(1);
    }
    const thick = row.reduce((a, r) => a + r.v, 0) / side;
    let pos = horizontal ? y : x;
    for (const r of row) {
      const len = r.v / thick;
      out.push(horizontal ? { index: r.index, x, y: pos, w: thick, h: len } : { index: r.index, x: pos, y, w: len, h: thick });
      pos += len;
    }
    if (horizontal) {
      x += thick;
      w -= thick;
    } else {
      y += thick;
      h -= thick;
    }
  }
  return out;
}

/** Ta plus grande surprise et ta plus grande déception face au public (écart d'au moins 0,5). */
export function contrarian(films: GoutFilm[]): { surprise?: GoutFilm & { gap: number }; disappointment?: GoutFilm & { gap: number } } {
  const withPublic = rated(films)
    .filter((f) => (f.publicScore ?? 0) > 0)
    .map((f) => ({ ...f, gap: f.score - f.publicScore! }));
  const up = [...withPublic].sort((a, b) => b.gap - a.gap)[0];
  const down = [...withPublic].sort((a, b) => a.gap - b.gap)[0];
  return {
    surprise: up && up.gap >= 0.5 ? up : undefined,
    disappointment: down && down.gap <= -0.5 ? down : undefined,
  };
}

export interface DirectorRow {
  name: string;
  id?: number;
  count: number;
  average: number;
  films: GoutFilm[];
}

/** Les réalisateurs dont tu as vu au moins 3 films, du mieux au moins bien noté. */
export function topDirectors(films: GoutFilm[], keep = 3): DirectorRow[] {
  const by = new Map<string, GoutFilm[]>();
  for (const f of rated(films)) {
    const name = (f.director || '').trim();
    if (name) by.set(name, [...(by.get(name) ?? []), f]);
  }
  return [...by.entries()]
    .filter(([, list]) => list.length >= 3)
    .map(([name, list]) => ({
      name,
      id: list.find((f) => f.directorId)?.directorId,
      count: list.length,
      average: mean(list.map((f) => f.score)),
      films: [...list].sort((a, b) => b.score - a.score),
    }))
    .sort((a, b) => b.average - a.average || b.count - a.count)
    .slice(0, keep);
}

export interface DecadeColumn {
  decade: number;
  count: number;
  average: number;
  best?: GoutFilm;
}

/** Les décennies, des plus anciennes aux plus récentes ; au plus les six dernières où tu as vu des films. */
export function decades(films: GoutFilm[], keep = 6): DecadeColumn[] {
  const by = new Map<number, GoutFilm[]>();
  for (const f of rated(films)) {
    if (!f.year || f.year < 1900) continue;
    const d = Math.floor(f.year / 10) * 10;
    by.set(d, [...(by.get(d) ?? []), f]);
  }
  return [...by.entries()]
    .sort((a, b) => a[0] - b[0])
    .slice(-keep)
    .map(([decade, list]) => ({
      decade,
      count: list.length,
      average: mean(list.map((f) => f.score)),
      best: best(list.filter((f) => f.posterUrl)) ?? best(list),
    }));
}

export interface Distribution {
  /** Nombre de films par note arrondie, de 0 à 10. */
  buckets: number[];
  average: number;
  /** Les deux notes que tu mets le plus, de la plus basse à la plus haute. */
  common: number[];
  /** Films notés 9 ou plus. */
  nines: number;
  total: number;
}

export function distribution(films: GoutFilm[]): Distribution {
  const list = rated(films);
  const buckets = Array.from({ length: 11 }, () => 0);
  for (const f of list) buckets[Math.max(0, Math.min(10, Math.round(f.score)))] += 1;
  const common = buckets
    .map((n, note) => ({ n, note }))
    .sort((a, b) => b.n - a.n || b.note - a.note)
    .slice(0, 2)
    .filter((b) => b.n > 0)
    .map((b) => b.note)
    .sort((a, b) => a - b);
  return {
    buckets,
    average: mean(list.map((f) => f.score)),
    common,
    nines: list.filter((f) => f.score >= 8.95).length,
    total: list.length,
  };
}

/** Les plus grands écarts entre l'attente avant le film et la note après (au moins 3 films avec attente). */
export function hypeGaps(films: GoutFilm[], keep = 3): (GoutFilm & { gap: number })[] {
  const list = rated(films)
    .filter((f) => typeof f.hype === 'number' && f.hype! > 0)
    .map((f) => ({ ...f, gap: f.score - f.hype! }));
  if (list.length < 3) return [];
  return list
    .filter((f) => Math.abs(f.gap) >= 0.5)
    .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
    .slice(0, keep);
}

/** Tous les films notés, du mieux au moins bien noté. */
export const ranking = (films: GoutFilm[]): GoutFilm[] => [...rated(films)].sort((a, b) => b.score - a.score);
