import type { Movie, UserProfile } from '../types';
import { getAdvancedArchetype, getArchetypeFromOnboarding, inferDepthFromGenres } from './archetypes';
import { uniqueCollection } from './collectionRules';
import { ratingOf } from './ratingHistory';
import { criteriaOf } from './verdict';

export const PORTRAIT_MIN_FILMS = 10;
export const PORTRAIT_AXES = ['cerebral', 'emotion', 'fun', 'visual', 'tension'] as const;
export type PortraitAxis = typeof PORTRAIT_AXES[number];
export const PORTRAIT_TYPES = [
  { id: 'decoder', title: 'Le Déchiffreur', axes: ['cerebral'] },
  { id: 'emotional', title: "L'Éponge Émotionnelle", axes: ['emotion'] },
  { id: 'hedonist', title: "L'Hédoniste", axes: ['fun'] },
  { id: 'aesthete', title: "L'Esthète", axes: ['visual'] },
  { id: 'adrenaline', title: "L'Adrénaline Junkie", axes: ['tension'] },
  { id: 'strategist', title: 'Le Stratège Noir', axes: ['cerebral', 'tension'] },
  { id: 'romantic', title: 'Le Romantique Visionnaire', axes: ['emotion', 'visual'] },
  { id: 'philosopher', title: 'Le Philosophe Sensible', axes: ['cerebral', 'emotion'] },
  { id: 'omnivore', title: "L'Omnivore", axes: [] },
] as const;

const aliases: Record<string, string> = {
  sciencefiction: 'Science-fiction', scifi: 'Science-fiction', documentary: 'Documentaire', documentaire: 'Documentaire',
  drama: 'Drame', drame: 'Drame', comedy: 'Comédie', comedie: 'Comédie', adventure: 'Aventure', aventure: 'Aventure',
  horror: 'Horreur', horreur: 'Horreur', romance: 'Romance', thriller: 'Thriller', action: 'Action',
  animation: 'Animation', fantasy: 'Fantastique', fantastique: 'Fantastique', family: 'Familial', familial: 'Familial',
  history: 'Histoire', histoire: 'Histoire', war: 'Guerre', guerre: 'Guerre', mystery: 'Mystère', mystere: 'Mystère',
  music: 'Musique', musique: 'Musique', western: 'Western', tvmovie: 'Téléfilm', telefilm: 'Téléfilm',
};
export function portraitGenres(value?: string): string[] {
  return [...new Set((value ?? '').split(/[,;/]/).map(part => part.trim()).filter(Boolean).map(part => {
    const key = part.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
    return aliases[key] ?? part.toLocaleLowerCase('fr-FR');
  }))];
}
export function portraitFilms(movies: readonly Movie[]): Movie[] {
  return uniqueCollection([...movies]).filter(m => {
    const score = ratingOf(m);
    return (m.mediaType ?? 'movie') === 'movie' && m.seasonNumber == null && score != null && Number.isFinite(score);
  });
}
const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const bounded = (value: number, max = 10) => Math.max(0, Math.min(max, value));
export function portraitVibe(movie: Movie, axis: PortraitAxis): number | undefined {
  const value = movie.vibe?.[axis === 'cerebral' ? 'story' : axis];
  return finite(value) ? bounded(value) : undefined;
}

/** Même calcul à la notation, dans le compte, les stats et le détail du portrait. */
export function cinemaArchetype(movies: readonly Movie[], profile?: Pick<UserProfile, 'severityIndex' | 'patienceLevel'> | null) {
  const films = portraitFilms(movies);
  const observed = films.filter(m => PORTRAIT_AXES.every(axis => portraitVibe(m, axis) != null));
  const genres = [...new Set(films.flatMap(m => portraitGenres(m.genre)))];
  const severity = finite(profile?.severityIndex) ? bounded(profile.severityIndex) : 5;
  const rhythm = finite(profile?.patienceLevel) ? bounded(profile.patienceLevel) : 5;
  const smartphone = films.map(m => m.smartphoneFactor).filter(finite).map(value => bounded(value, 100));
  const result = observed.length ? getAdvancedArchetype({
    vibes: Object.fromEntries(PORTRAIT_AXES.map(axis => [axis, mean(observed.map(m => portraitVibe(m, axis)!))])) as Record<PortraitAxis, number>,
    quality: { scenario: 5, acting: 5, visual: 5, sound: 5 },
    smartphone: smartphone.length ? mean(smartphone) : rhythm * 10,
    distinctGenreCount: genres.length, severityIndex: severity, rhythmIndex: rhythm,
  }) : getArchetypeFromOnboarding(severity, rhythm, inferDepthFromGenres(genres));
  return { ...result, type: PORTRAIT_TYPES.find(type => type.title === result.title)!, films, genres,
    observedCount: observed.length, confirmed: films.length >= PORTRAIT_MIN_FILMS && observed.length >= 5 };
}

export interface PortraitTrait {
  key: PortraitAxis | 'story' | 'acting' | 'sound';
  value: number;
  count: number;
  evidence: Movie[];
  source: 'feeling' | 'criterion';
}
export function buildCinemaPortrait(movies: readonly Movie[], profile?: UserProfile | null) {
  const archetype = cinemaArchetype(movies, profile);
  const { films } = archetype;
  const rated = [...films].sort((a, b) => ratingOf(b)! - ratingOf(a)! || a.id.localeCompare(b.id));
  const axes = archetype.type.axes as readonly PortraitAxis[];
  const evidence = archetype.type.id === 'omnivore' ? rated.filter((m, i, rows) => {
    const genre = portraitGenres(m.genre)[0];
    return genre && rows.findIndex(other => portraitGenres(other.genre)[0] === genre) === i;
  }).slice(0, 3) : rated.filter(m => axes.every(axis => (portraitVibe(m, axis) ?? -1) >= 7)).slice(0, 3);
  const traits: PortraitTrait[] = [];
  for (const axis of PORTRAIT_AXES) {
    const sample = films.filter(m => portraitVibe(m, axis) != null);
    if (sample.length < 5) continue;
    const value = mean(sample.map(m => portraitVibe(m, axis)!));
    if (value < 7) continue;
    const candidates = sample.filter(m => portraitVibe(m, axis)! >= 7)
      .sort((a, b) => portraitVibe(b, axis)! - portraitVibe(a, axis)! || ratingOf(b)! - ratingOf(a)!);
    if (candidates.length >= 2) traits.push({ key: axis, value, count: sample.length, evidence: candidates.slice(0, 2), source: 'feeling' });
  }
  const detailed = films.map(movie => ({ movie, grid: criteriaOf({ adaptive_rating: movie.adaptiveRating,
    story: movie.ratings.story, visuals: movie.ratings.visuals, acting: movie.ratings.acting, sound: movie.ratings.sound } as never) }))
    .filter(item => item.grid != null);
  if (detailed.length >= 6) {
    for (const key of ['story', 'acting', 'sound'] as const) {
      const sample = detailed.filter(item => finite(item.grid?.[key]));
      if (sample.length < 6) continue;
      const value = mean(sample.map(item => item.grid![key]));
      if (value < 7) continue;
      const examples = [...sample].sort((a, b) => b.grid![key] - a.grid![key]).slice(0, 2).map(item => item.movie);
      traits.push({ key, value, count: sample.length, evidence: examples, source: 'criterion' });
    }
  }
  traits.sort((a, b) => b.value - a.value || b.count - a.count);
  const dated = films.filter(m => finite(m.dateWatched)).sort((a, b) => a.dateWatched! - b.dateWatched! || a.id.localeCompare(b.id));
  let evolution: { kind: 'genre'; genre: string; current: number; previous: number; evidence: Movie[] } |
    { kind: 'rating'; gap: number; evidence: Movie[] } | { kind: 'stable'; evidence: Movie[] } | null = null;
  if (dated.length >= 20) {
    const recent = dated.slice(-10), previous = dated.slice(-20, -10);
    const changes = [...new Set(recent.flatMap(m => portraitGenres(m.genre)))].map(genre => ({ genre,
      current: recent.filter(m => portraitGenres(m.genre).includes(genre)).length,
      previous: previous.filter(m => portraitGenres(m.genre).includes(genre)).length,
    })).filter(change => change.current >= 4 && change.current - change.previous >= 3)
      .sort((a, b) => (b.current - b.previous) - (a.current - a.previous));
    if (changes[0]) evolution = { kind: 'genre', ...changes[0], evidence: recent.filter(m => portraitGenres(m.genre).includes(changes[0].genre)).slice(-2) };
    else {
      const gap = mean(recent.map(m => ratingOf(m)!)) - mean(previous.map(m => ratingOf(m)!));
      evolution = Math.abs(gap) >= .7 ? { kind: 'rating', gap, evidence: recent.slice(-2) } : { kind: 'stable', evidence: recent.slice(-2) };
    }
  }
  return { archetype, evidence, traits: traits.slice(0, 2), evolution, favorites: rated.filter(m => m.tmdbId != null).slice(0, 3) };
}
