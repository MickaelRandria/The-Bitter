/**
 * Rapprochement d'un billet lu sur une capture avec le vrai programme UGC.
 *
 * Module pur, sans Deno ni réseau : la fonction Edge l'importe, et les tests de
 * `tests/` chargent ce même fichier. Ce qui est vérifié est donc bien ce qui
 * tourne en production.
 *
 * Le billet vient d'une lecture d'image : un titre peut perdre un accent, une
 * heure peut être mal lue, le cinéma peut être abrégé (« Les Halles » pour
 * « UGC Ciné Cité Les Halles »). Rien de tout cela n'est corrigé par
 * supposition : on cherche la séance correspondante dans la grille publiée, et
 * seule une séance qui y figure est déclarée retrouvée.
 */

export interface DirectoryCinema {
  id: string;
  name: string;
  city: string;
}

export interface ProgrammeShowing {
  id: string;
  title: string;
  filmId: string;
  version: string;
  room: string;
  /** jj/mm/aaaa, tel qu'UGC l'écrit. */
  date: string;
  /** hh:mm à l'heure de Paris. */
  time: string;
  endTime: string;
}

export interface TicketToMatch {
  title: string;
  cinema: string;
  /** aaaa-mm-jj */
  date: string;
  /** hh:mm */
  time: string;
  version: string;
}

export type ShowingMatch =
  | { status: 'matched'; showing: ProgrammeShowing; alternatives: ProgrammeShowing[] }
  | { status: 'time-mismatch'; showing: null; alternatives: ProgrammeShowing[] }
  | { status: 'not-found'; showing: null; alternatives: ProgrammeShowing[] };

export const normalizeText = (value: string) =>
  value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('fr')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Les mots qui ne distinguent aucun cinéma : l'enseigne et ses formules. Sans
 * ce filtre, « UGC Ciné Cité Bercy » ressemblerait autant à « UGC Ciné Cité
 * Les Halles » qu'à « Bercy » — trois mots sur quatre en commun.
 */
const CINEMA_STOPWORDS = new Set([
  'ugc', 'cine', 'cite', 'cinema', 'cinemas', 'le', 'la', 'les', 'l', 'de', 'du', 'des', 'd',
]);

const distinctiveTokens = (value: string) =>
  new Set(normalizeText(value).split(' ').filter((token) => token && !CINEMA_STOPWORDS.has(token)));

/**
 * « UGC », « UGC Ciné Cité » : un nom qui ne désigne aucun lieu précis. Le
 * billet est alors traité comme s'il n'en portait pas.
 */
export const isGenericCinemaName = (read: string) => distinctiveTokens(read).size === 0;

/** Vrai si les deux mots ne diffèrent que d'une lettre remplacée, ajoutée ou retirée. */
const oneEditApart = (a: string, b: string): boolean => {
  if (Math.abs(a.length - b.length) > 1) return false;
  let i = 0;
  let j = 0;
  let edits = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      i += 1;
      j += 1;
      continue;
    }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) i += 1;
    else if (b.length > a.length) j += 1;
    else {
      i += 1;
      j += 1;
    }
  }
  return edits + (a.length - i) + (b.length - j) <= 1;
};

/**
 * Deux mots désignent le même lieu s'ils sont identiques, ou — à partir de cinq
 * lettres — s'ils ne diffèrent que d'une lettre : « Talance » lu sur la capture
 * reste Talence. En dessous, une lettre change trop souvent le mot entier.
 */
const sameToken = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && oneEditApart(a, b));

/** Jaccard sur les mots distinctifs : 1 quand les deux noms désignent le même lieu. */
export const cinemaNameScore = (read: string, candidate: string): number => {
  if (!read.trim() || !candidate.trim()) return 0;
  if (normalizeText(read) === normalizeText(candidate)) return 1;
  const a = [...distinctiveTokens(read)];
  const b = [...distinctiveTokens(candidate)];
  if (a.length === 0 || b.length === 0) return 0;
  const shared = a.filter((token) => b.some((other) => sameToken(token, other))).length;
  return shared / (a.length + b.length - shared);
};

/**
 * Le cinéma de l'annuaire que désigne le nom lu, ou `null` s'il n'y en a pas
 * de crédible — un billet Pathé ou MK2 ne doit pas atterrir dans un UGC voisin.
 * À égalité, le cinéma habituel de la personne l'emporte.
 */
export const resolveCinema = (
  read: string,
  cinemas: DirectoryCinema[],
  preferredId?: string
): DirectoryCinema | null => {
  let best: DirectoryCinema | null = null;
  let bestScore = 0;
  for (const cinema of cinemas) {
    const score = cinemaNameScore(read, cinema.name);
    const better = score > bestScore || (score === bestScore && score > 0 && cinema.id === preferredId);
    if (better) {
      best = cinema;
      bestScore = score;
    }
  }
  return bestScore >= 0.5 ? best : null;
};

const bigrams = (value: string) => {
  const compact = value.replace(/ /g, '');
  const grams = new Map<string, number>();
  for (let index = 0; index < compact.length - 1; index += 1) {
    const gram = compact.slice(index, index + 2);
    grams.set(gram, (grams.get(gram) ?? 0) + 1);
  }
  return grams;
};

/**
 * Proximité de deux titres, de 0 à 1.
 *
 * L'inclusion couvre les suffixes qu'UGC ajoute ou retire (« - Avant-première »,
 * « (VOSTF) ») ; le coefficient de Dice sur les paires de lettres couvre une
 * lettre mal lue sur la capture. Un titre de moins de quatre lettres ne compte
 * pas comme inclus : « Up » est contenu dans trop de titres.
 */
export const titleSimilarity = (a: string, b: string): number => {
  const left = normalizeText(a);
  const right = normalizeText(b);
  if (!left || !right) return 0;
  if (left === right) return 1;
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left];
  if (shorter.length >= 4 && ` ${longer} `.includes(` ${shorter} `)) return 0.9;

  const gramsA = bigrams(left);
  const gramsB = bigrams(right);
  let total = 0;
  let shared = 0;
  gramsA.forEach((count, gram) => {
    total += count;
    shared += Math.min(count, gramsB.get(gram) ?? 0);
  });
  gramsB.forEach((count) => {
    total += count;
  });
  return total === 0 ? 0 : (2 * shared) / total;
};

/** « 9:05 », « 9h05 », « 21H30 » → « 09:05 », « 21:30 » ; `null` si ce n'est pas une heure. */
export const normalizeTime = (value: string): string | null => {
  const match = value.trim().match(/^(\d{1,2})\s*[:hH]\s*(\d{2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) return null;
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
};

/** aaaa-mm-jj → jj/mm/aaaa, la forme qu'attend la grille UGC. */
export const isoToUgcDate = (iso: string): string | null => {
  const match = iso.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : null;
};

const minutesOf = (time: string) => {
  const normalized = normalizeTime(time);
  if (!normalized) return Number.NaN;
  const [hour, minute] = normalized.split(':').map(Number);
  return hour * 60 + minute;
};

const TITLE_THRESHOLD = 0.6;

/**
 * La séance du billet dans la grille d'un jour.
 *
 * Retrouvée : même film, même heure. Si le film passe ce jour-là mais pas à
 * cette heure, on rend ses autres horaires du jour, du plus proche au plus
 * lointain : l'heure a probablement été mal lue, et c'est à la personne de
 * trancher, pas à nous.
 */
export const findShowing = (ticket: TicketToMatch, showings: ProgrammeShowing[]): ShowingMatch => {
  const sameFilm = showings
    .map((showing) => ({ showing, score: titleSimilarity(ticket.title, showing.title) }))
    .filter((entry) => entry.score >= TITLE_THRESHOLD);
  if (sameFilm.length === 0) return { status: 'not-found', showing: null, alternatives: [] };

  const bestScore = Math.max(...sameFilm.map((entry) => entry.score));
  const film = sameFilm.filter((entry) => entry.score === bestScore).map((entry) => entry.showing);
  const wanted = minutesOf(ticket.time);
  const atTime = film.filter((showing) => minutesOf(showing.time) === wanted);

  if (atTime.length > 0) {
    // Deux versions du même film peuvent partir à la même heure : la version
    // lue sur le billet départage, sinon la première publiée.
    const version = normalizeText(ticket.version);
    const showing = atTime.find((candidate) => version && normalizeText(candidate.version) === version) ?? atTime[0];
    return { status: 'matched', showing, alternatives: [] };
  }

  const alternatives = [...film]
    .sort((a, b) => Math.abs(minutesOf(a.time) - wanted) - Math.abs(minutesOf(b.time) - wanted))
    .slice(0, 6);
  return { status: 'time-mismatch', showing: null, alternatives };
};
