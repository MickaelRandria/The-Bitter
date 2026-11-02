import { searchCinemaCities, searchCinemasNearCity } from './cinemaDirectory';
import { brandOf, canonicalName, normalizeName, similarity } from '../utils/cinemaNames';

/**
 * Les cinémas qu'on a déjà saisis, gardés sur le téléphone (le plus récent en
 * tête), et la recherche dans l'annuaire officiel UGC quand on tape « UGC … ».
 * Pour les autres enseignes, il n'y a pas d'annuaire : la mémoire suffit.
 */
const KEY = 'bitter_known_cinemas';
const MAX = 20;

export function knownCinemas(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) || '[]');
    return Array.isArray(list) ? list.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function rememberCinema(name: string | undefined) {
  const clean = canonicalName(name ?? '');
  if (!clean) return;
  try {
    const rest = knownCinemas().filter((n) => normalizeName(n) !== normalizeName(clean));
    localStorage.setItem(KEY, JSON.stringify([clean, ...rest].slice(0, MAX)));
  } catch {
    // Sans stockage, le cinéma sera retapé la prochaine fois.
  }
}

/** « UGC rosny » → les cinémas UGC des villes qui ressemblent à « rosny ». */
export async function searchUgc(typed: string): Promise<string[]> {
  const found = brandOf(typed);
  if (!found || found.brand !== 'UGC') return [];
  const word = found.rest.split(' ').sort((a, b) => b.length - a.length)[0];
  if (!word || word.length < 3) return [];
  const { data: cities } = await searchCinemaCities(word);
  const lists = await Promise.all(cities.slice(0, 3).map((c) => searchCinemasNearCity(c)));
  return lists
    .flatMap((r) => r.data.map((c) => c.name))
    .map((name) => ({ name, score: similarity(typed, name) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 4)
    .map((r) => r.name);
}
