/**
 * Tes affinités : à quel point tu notes comme chacun de tes amis, d'après les
 * films que vous avez notés tous les deux dans vos espaces.
 *
 * L'accord vaut 100 moins dix fois l'écart moyen : un point d'écart en moyenne,
 * c'est 90 %. Un ami ne compte qu'à partir de `MIN_COMMON` films en commun.
 * Module pur : les notes arrivent déjà mises à plat (voir services/affinities.ts).
 */

export const MIN_COMMON = 3;
/** Pour « vous êtes d'accord sur » : deux bonnes notes, presque égales. */
const LIKED = 7.5;
const CLOSE = 0.5;

export interface RatingEntry {
  /** Le film, le même d'un espace à l'autre (tmdb, sinon titre et année). */
  key: string;
  title: string;
  posterUrl?: string;
  spaceName: string;
  personId: string;
  name: string;
  avatarUrl?: string | null;
  value: number;
}

export interface Affinity {
  personId: string;
  name: string;
  avatarUrl?: string | null;
  common: number;
  /** 0 à 100. */
  score: number;
  /** Écart moyen, en points. */
  gap: number;
  /** Sa moyenne moins la tienne sur vos films communs : positif, il est plus généreux. */
  generosity: number;
}

export interface SharedFilm {
  key: string;
  title: string;
  posterUrl?: string;
  spaceName: string;
  friend: { id: string; name: string; avatarUrl?: string | null };
  mine: number;
  theirs: number;
}

export interface AffinityReport {
  friends: Affinity[];
  /** Le film où l'écart avec un ami est le plus grand. */
  divider: SharedFilm | null;
  /** Vos plus belles notes communes. */
  agreed: SharedFilm[];
}

export function computeAffinities(me: string, entries: RatingEntry[]): AffinityReport {
  // Une note par personne et par film (moyenne si notée dans plusieurs espaces).
  const byFilm = new Map<string, Map<string, { sum: number; n: number; entry: RatingEntry }>>();
  for (const e of entries) {
    if (!Number.isFinite(e.value)) continue;
    const film = byFilm.get(e.key) ?? new Map();
    const prev = film.get(e.personId);
    film.set(e.personId, prev ? { ...prev, sum: prev.sum + e.value, n: prev.n + 1 } : { sum: e.value, n: 1, entry: e });
    byFilm.set(e.key, film);
  }
  const pairs = new Map<string, SharedFilm[]>();
  for (const film of byFilm.values()) {
    const mine = film.get(me);
    if (!mine) continue;
    for (const [id, other] of film) {
      if (id === me) continue;
      const list = pairs.get(id) ?? [];
      list.push({
        key: mine.entry.key,
        title: mine.entry.title,
        posterUrl: mine.entry.posterUrl ?? other.entry.posterUrl,
        spaceName: other.entry.spaceName,
        friend: { id, name: other.entry.name, avatarUrl: other.entry.avatarUrl },
        mine: mine.sum / mine.n,
        theirs: other.sum / other.n,
      });
      pairs.set(id, list);
    }
  }
  const friends: Affinity[] = [];
  const all: SharedFilm[] = [];
  for (const [id, list] of pairs) {
    if (list.length < MIN_COMMON) continue;
    all.push(...list);
    const gap = list.reduce((s, f) => s + Math.abs(f.mine - f.theirs), 0) / list.length;
    const generosity = list.reduce((s, f) => s + f.theirs - f.mine, 0) / list.length;
    friends.push({
      personId: id,
      name: list[0].friend.name,
      avatarUrl: list[0].friend.avatarUrl,
      common: list.length,
      score: Math.max(0, Math.min(100, Math.round(100 - gap * 10))),
      gap,
      generosity,
    });
  }
  friends.sort((a, b) => b.score - a.score || b.common - a.common);
  const divider = [...all].sort((a, b) => Math.abs(b.mine - b.theirs) - Math.abs(a.mine - a.theirs))[0] ?? null;
  const seen = new Set<string>();
  const agreed = all
    .filter((f) => f.mine >= LIKED && f.theirs >= LIKED && Math.abs(f.mine - f.theirs) <= CLOSE)
    .sort((a, b) => b.mine + b.theirs - (a.mine + a.theirs))
    .filter((f) => (seen.has(f.key) ? false : (seen.add(f.key), true)))
    .slice(0, 3);
  return { friends, divider: divider && Math.abs(divider.mine - divider.theirs) >= 2 ? divider : null, agreed };
}
