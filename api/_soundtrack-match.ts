/**
 * Retrouver la bande originale d'un film parmi les albums Deezer.
 *
 * Mesuré le 21 octobre 2026 sur 84 films vus : une recherche naïve (« titre +
 * soundtrack ») se trompe une fois sur six — le jeu vidéo Avatar, Matrix
 * Resurrections pour Matrix, un « Unofficial Soundtrack ». Une recherche qui
 * exige l'année de sortie rate à l'inverse les classiques, dont l'album a été
 * réédité depuis. Le compositeur crédité par TMDB tranche les deux cas : il
 * signe l'album, réédité ou non.
 *
 * Module sans dépendance : le préfixe « _ » le tient hors des routes Vercel, et
 * `tests/soundtrack.test.mjs` le transpile tel quel.
 */

export interface DeezerAlbumHit {
  id: number;
  title: string;
  artist?: { name?: string } | null;
  record_type?: string;
}

export interface FilmHints {
  /** Titre original, titre anglais, titre français : les albums sortent sous l'un d'eux. */
  titles: string[];
  year?: number;
  composers: string[];
}

export type AlbumKind = 'score' | 'songs';

export interface AlbumChoice {
  id: number;
  kind: AlbumKind;
  score: number;
  /** Vrai quand l'année de l'album doit encore confirmer le choix. */
  needsYear: boolean;
}

/** Minuscules, sans accents, « & » lu « and », articles retirés. */
export const normalize = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9\p{L}]+/gu, ' ')
    .replace(/\b(the|le|la|les|l|a|an)\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

/**
 * Les titres de film qu'un nom d'album peut porter : « Dune (Original Motion
 * Picture Soundtrack) » → « Dune ». Plusieurs découpes, parce que le tiret sert
 * tantôt de séparateur (« Peaky Blinders - The Immortal Man (Soundtrack…) »),
 * tantôt de titre (« La Bataille de Gaulle - J'écris ton nom »).
 */
export const baseTitles = (title: string) => {
  const beforeParen = title.split(/\s[(\[]/)[0];
  return [
    beforeParen,
    beforeParen.split(/\s[-–—]\s/)[0],
    beforeParen.split(/:\s(?=original|music|songs|the original|bande|musique)/i)[0],
  ].map((part) => part.trim());
};

const SOUNDTRACK = /(soundtrack|score|bande originale|musique originale|musique du film|music from|songs from|motion picture|du film|\bost\b)/i;
const SONGS = /(songs from|music from|inspired by|music inspired)/i;
const FILM_WORDING = /(motion picture|bande originale du film|musique (originale )?du film|from the ([a-z+ ]+ )?film|songs from|music from|\((original )?(soundtrack|score)\)\s*$)/i;
const EXCLUDED = /(unofficial|video ?game|game soundtrack|jeu vid[eé]o|tribute|karaok|cover|lullab|piano version|8[- ]?bit|orchestral version)/i;

const surname = (name: string) => normalize(name).split(' ').filter(Boolean).pop() ?? '';

/**
 * Le compositeur signe-t-il l'album ? On compare le nom de famille, parce que
 * Deezer écrit « Ludwig Goransson » et TMDB « Ludwig Göransson », et qu'un
 * album crédite souvent « Hans Zimmer & Lisa Gerrard ».
 */
export const composerSigns = (artist: string | undefined, composers: string[]) => {
  if (!artist) return false;
  const signed = ` ${normalize(artist)} `;
  return composers.some((name) => {
    const last = surname(name);
    return last.length >= 3 && signed.includes(` ${last} `);
  });
};

/**
 * Note un album trouvé par la recherche, ou l'écarte (null).
 *
 * Le titre de base doit être exactement l'un des titres du film : c'est ce qui
 * écarte « Son of the Mask » pour « The Mask » et « The Amazing Spider-Man 2 »
 * pour « Spider-Man: Brand New Day ». Sans compositeur qui signe, l'année devra
 * confirmer (voir `confirmYear`).
 */
export function rateAlbum(hit: DeezerAlbumHit, film: FilmHints): AlbumChoice | null {
  const title = hit.title ?? '';
  if (EXCLUDED.test(title)) return null;
  const keys = film.titles.map(normalize).filter(Boolean);
  if (!baseTitles(title).some((base) => keys.includes(normalize(base)))) return null;
  const signed = composerSigns(hit.artist?.name, film.composers);
  if (!SOUNDTRACK.test(title) && !signed) return null;
  // Le compositeur est connu et ne signe pas : il faut au moins que l'album se
  // dise celui d'un film. « KARMA (… Original Soundtrack Part.10) » est celui
  // d'une série coréenne, pas du film Karma.
  if (!signed && film.composers.length > 0 && !FILM_WORDING.test(title)) return null;
  const kind: AlbumKind = SONGS.test(title) && !signed ? 'songs' : 'score';
  let score = 1;
  if (signed) score += 3;
  if (/original (motion picture )?(soundtrack|score)|bande originale/i.test(title)) score += 1;
  if (/deluxe|expanded|complete/i.test(title)) score += 0.5;
  return { id: hit.id, kind, score, needsYear: !signed };
}

/** Sans compositeur pour le garantir, un album sorti loin du film n'est pas le sien. */
export const confirmYear = (releaseDate: string | undefined, filmYear: number | undefined) => {
  if (!filmYear) return true;
  const year = Number((releaseDate ?? '').slice(0, 4));
  return Number.isFinite(year) && year >= filmYear - 1 && year <= filmYear + 2;
};

/** Le meilleur album par sorte : la musique composée, et les chansons s'il y en a. */
export function pickAlbums(hits: DeezerAlbumHit[], film: FilmHints): AlbumChoice[] {
  const seen = new Set<number>();
  const rated: AlbumChoice[] = [];
  for (const hit of hits) {
    if (seen.has(hit.id)) continue;
    seen.add(hit.id);
    const choice = rateAlbum(hit, film);
    if (choice) rated.push(choice);
  }
  rated.sort((a, b) => b.score - a.score);
  const byKind = new Map<AlbumKind, AlbumChoice[]>();
  for (const choice of rated) byKind.set(choice.kind, [...(byKind.get(choice.kind) ?? []), choice]);
  return [...(byKind.get('score') ?? []), ...(byKind.get('songs') ?? [])];
}

/** Les recherches à lancer, des plus précises aux plus larges. */
export function searchQueries(film: FilmHints): string[] {
  const titles = [...new Set(film.titles.map((t) => t.trim()).filter(Boolean))];
  const composer = film.composers[0];
  const queries: string[] = [];
  if (composer && titles[0]) queries.push(`${composer} ${titles[0]}`);
  for (const title of titles.slice(0, 3)) queries.push(`${title} soundtrack`);
  // Le titre local en dernier : c'est sous lui que sortent les albums français.
  const local = titles[titles.length - 1];
  if (local) queries.push(`${local} bande originale`);
  return [...new Set(queries)].slice(0, 6);
}
