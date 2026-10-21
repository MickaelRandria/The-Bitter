import type { Movie } from '../types';

/**
 * La note Son d'un film, quand elle existe vraiment.
 *
 * La note détaillée la porte sous la clé `sound`. Les colonnes plates
 * (`ratings`) ne valent que si elles diffèrent : une ancienne note simple
 * recopiait la note globale dans les quatre critères, et lire son « Son »
 * reviendrait à relire la note globale. Un Son écarté (« Sans objet ») n'en
 * est pas un.
 */
export function soundScore(movie: Pick<Movie, 'adaptiveRating' | 'ratings'>): number | null {
  const adaptive = movie.adaptiveRating;
  const criterion = adaptive?.criteria?.find((c) => c.key === 'sound');
  if (criterion && Number.isFinite(criterion.value)) return criterion.value;
  if (adaptive?.skipped?.includes('sound')) return null;
  const r = movie.ratings;
  if (!r || !Number.isFinite(r.sound)) return null;
  if (r.story === r.visuals && r.visuals === r.acting && r.acting === r.sound) return null;
  return r.sound;
}

/**
 * Coupe un avis en fragments de longueur voisine, pour le dérouler pendant un
 * extrait de 30 s. Coupe aux mots, jamais au milieu d'un mot.
 */
export function reviewFragments(review: string | undefined, count = 4): string[] {
  const words = (review ?? '').trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const parts = Math.max(1, Math.min(count, Math.ceil(words.length / 4)));
  const size = Math.ceil(words.length / parts);
  const out: string[] = [];
  for (let i = 0; i < words.length; i += size) out.push(words.slice(i, i + size).join(' '));
  return out;
}
