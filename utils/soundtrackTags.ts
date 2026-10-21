/**
 * Ce qu'on pense de la bande originale d'un film, rangé dans `Movie.tags`.
 *
 * La colonne `tags` de `user_movies` est déjà synchronisée et ne sert à rien
 * d'autre : y écrire évite une migration. Deux préfixes, que rien d'autre
 * n'emploie : `bo:` pour le verdict, `bo-fav:` pour chaque morceau aimé
 * (identifiant Deezer). Les autres tags restent intacts.
 */

export type SoundtrackVerdict = 'unnoticed' | 'good' | 'memorable';

const VERDICTS: SoundtrackVerdict[] = ['unnoticed', 'good', 'memorable'];
const VERDICT_PREFIX = 'bo:';
const FAVORITE_PREFIX = 'bo-fav:';

export interface SoundtrackOpinion {
  verdict: SoundtrackVerdict | null;
  favorites: number[];
}

export function readSoundtrack(tags: readonly string[] | undefined | null): SoundtrackOpinion {
  let verdict: SoundtrackVerdict | null = null;
  const favorites: number[] = [];
  for (const tag of tags ?? []) {
    if (tag.startsWith(VERDICT_PREFIX)) {
      const value = tag.slice(VERDICT_PREFIX.length) as SoundtrackVerdict;
      if (VERDICTS.includes(value)) verdict = value;
    } else if (tag.startsWith(FAVORITE_PREFIX)) {
      const id = Number(tag.slice(FAVORITE_PREFIX.length));
      if (Number.isSafeInteger(id) && id > 0 && !favorites.includes(id)) favorites.push(id);
    }
  }
  return { verdict, favorites };
}

export function withVerdict(tags: readonly string[] | undefined | null, verdict: SoundtrackVerdict | null): string[] {
  const rest = (tags ?? []).filter((tag) => !tag.startsWith(VERDICT_PREFIX));
  return verdict ? [...rest, VERDICT_PREFIX + verdict] : rest;
}

export function toggleFavorite(tags: readonly string[] | undefined | null, trackId: number): string[] {
  const tag = FAVORITE_PREFIX + trackId;
  const list = [...(tags ?? [])];
  return list.includes(tag) ? list.filter((item) => item !== tag) : [...list, tag];
}
