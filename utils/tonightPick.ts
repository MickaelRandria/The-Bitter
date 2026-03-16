import { Movie, VibeCriteria } from '../types';

// ============================================
// 🎲 TONIGHT PICK INTELLIGENT — The Bitter V2
// ============================================
// Scoring pondéré : hype + anti-répétition genre + mood match + durée
// Le pick final est un weighted random dans le top 5 pour garder la surprise

export type MoodPreset = 'detente' | 'intense' | 'reflexion' | 'emotion' | 'fun' | 'esthetique' | null;

export interface MoodConfig {
  id: MoodPreset;
  label: string;
  emoji: string;
  description: string;
  // Poids sur chaque axe vibe (0 = ignore, 1 = priorité max)
  vibeWeights: {
    story: number;
    emotion: number;
    fun: number;
    visual: number;
    tension: number;
  };
}

export const MOOD_PRESETS: MoodConfig[] = [
  {
    id: 'detente',
    label: 'Détente',
    emoji: '🛋️',
    description: 'Chill, léger, sans prise de tête',
    vibeWeights: { story: 0.2, emotion: 0.3, fun: 1.0, visual: 0.5, tension: 0.0 }
  },
  {
    id: 'intense',
    label: 'Intense',
    emoji: '🔥',
    description: 'Adrénaline, suspense, action',
    vibeWeights: { story: 0.5, emotion: 0.3, fun: 0.4, visual: 0.6, tension: 1.0 }
  },
  {
    id: 'reflexion',
    label: 'Réflexion',
    emoji: '🧠',
    description: 'Cérébral, complexe, stimulant',
    vibeWeights: { story: 1.0, emotion: 0.4, fun: 0.0, visual: 0.5, tension: 0.3 }
  },
  {
    id: 'emotion',
    label: 'Émotion',
    emoji: '💧',
    description: 'Touchant, bouleversant, humain',
    vibeWeights: { story: 0.5, emotion: 1.0, fun: 0.0, visual: 0.4, tension: 0.2 }
  },
  {
    id: 'fun',
    label: 'Fun',
    emoji: '🎉',
    description: 'Rire, comédie, bonne humeur',
    vibeWeights: { story: 0.1, emotion: 0.2, fun: 1.0, visual: 0.3, tension: 0.0 }
  },
  {
    id: 'esthetique',
    label: 'Esthétique',
    emoji: '👁️',
    description: 'Beau, contemplatif, artistique',
    vibeWeights: { story: 0.4, emotion: 0.5, fun: 0.0, visual: 1.0, tension: 0.1 }
  }
];

// --- HELPERS ---

/** Note moyenne d'un film (évite le copier-coller partout) */
export const getAvgRating = (movie: Movie): number => {
  return (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;
};

/** Genres des N derniers films vus, du plus récent au plus ancien */
const getRecentGenres = (watchedMovies: Movie[], n: number = 3): string[] => {
  return watchedMovies
    .filter(m => (m.status || 'watched') === 'watched')
    .sort((a, b) => (b.dateWatched || b.dateAdded) - (a.dateWatched || a.dateAdded))
    .slice(0, n)
    .map(m => m.genre)
    .filter(Boolean);
};

// --- SCORING ---

interface ScoringContext {
  recentGenres: string[];
  mood: MoodPreset;
  currentHour?: number; // 0-23, pour pondérer la durée
}

/**
 * Score un film de la watchlist pour le Tonight Pick.
 * Retourne un score entre 0 et 100.
 */
const scoreMovie = (movie: Movie, ctx: ScoringContext): number => {
  let score = 0;
  const weights = {
    hype: 30,        // Le hype déclaré par l'utilisateur
    antiRepeat: 25,  // Pénalité si genre déjà vu récemment
    mood: 35,        // Match avec le mood sélectionné
    duration: 10,    // Bonus/malus selon l'heure
  };

  // 1. HYPE (0-10 → 0-30 points)
  const hype = movie.hype ?? 5;
  score += (hype / 10) * weights.hype;

  // 2. ANTI-RÉPÉTITION GENRE (0 ou 25 points)
  // Pénalité progressive : genre vu en dernier = -100%, avant-dernier = -50%, etc.
  const genreIndex = ctx.recentGenres.indexOf(movie.genre);
  if (genreIndex === -1) {
    // Genre pas vu récemment → bonus plein
    score += weights.antiRepeat;
  } else {
    // Plus c'est récent, plus la pénalité est forte
    const penalty = 1 - (genreIndex / ctx.recentGenres.length);
    score += weights.antiRepeat * (1 - penalty * 0.8); // Garde 20% minimum
  }

  // 3. MOOD MATCH (0-35 points)
  if (ctx.mood && movie.vibe) {
    const moodConfig = MOOD_PRESETS.find(m => m.id === ctx.mood);
    if (moodConfig) {
      const vibeKeys: (keyof VibeCriteria)[] = ['story', 'emotion', 'fun', 'visual', 'tension'];
      let moodScore = 0;
      let totalWeight = 0;

      for (const key of vibeKeys) {
        const weight = moodConfig.vibeWeights[key];
        if (weight > 0) {
          // Normalise la vibe du film (0-10) en (0-1) et multiplie par le poids
          moodScore += (movie.vibe[key] / 10) * weight;
          totalWeight += weight;
        }
      }

      if (totalWeight > 0) {
        score += (moodScore / totalWeight) * weights.mood;
      }
    }
  } else if (!ctx.mood) {
    // Pas de mood sélectionné → on donne les points proportionnellement au hype
    score += (hype / 10) * weights.mood * 0.5;
  }

  // 4. DURÉE VS HEURE (0-10 points)
  const hour = ctx.currentHour ?? new Date().getHours();
  const runtime = movie.runtime || 0;

  if (runtime > 0) {
    if (hour >= 22) {
      // Après 22h : favoriser les courts (< 100 min)
      score += runtime <= 100 ? weights.duration : weights.duration * 0.3;
    } else if (hour >= 20) {
      // 20h-22h : tous les formats passent, léger bonus pour 90-140 min
      score += (runtime >= 90 && runtime <= 140) ? weights.duration : weights.duration * 0.7;
    } else {
      // Avant 20h : favoriser les longs formats
      score += runtime >= 120 ? weights.duration : weights.duration * 0.6;
    }
  } else {
    // Pas de durée connue → points neutres
    score += weights.duration * 0.5;
  }

  return Math.min(100, Math.max(0, score));
};

/**
 * 🎯 Algorithme principal : retourne le film recommandé pour ce soir.
 * Utilise un weighted random parmi le top 5 pour garder l'effet surprise.
 */
export const getSmartTonightPick = (
  watchlist: Movie[],
  allMovies: Movie[],
  mood: MoodPreset
): Movie | null => {
  if (watchlist.length === 0) return null;
  if (watchlist.length === 1) return watchlist[0];

  const recentGenres = getRecentGenres(allMovies, 3);

  const ctx: ScoringContext = {
    recentGenres,
    mood,
    currentHour: new Date().getHours(),
  };

  // Scorer chaque film
  const scored = watchlist.map(movie => ({
    movie,
    score: scoreMovie(movie, ctx),
  }));

  // Trier par score décroissant
  scored.sort((a, b) => b.score - a.score);

  // Weighted random parmi le top 5 (ou moins si watchlist < 5)
  const topN = scored.slice(0, Math.min(5, scored.length));
  const totalScore = topN.reduce((sum, item) => sum + item.score, 0);

  if (totalScore === 0) {
    // Fallback : random pur
    return watchlist[Math.floor(Math.random() * watchlist.length)];
  }

  // Weighted random selection
  let random = Math.random() * totalScore;
  for (const item of topN) {
    random -= item.score;
    if (random <= 0) return item.movie;
  }

  return topN[0].movie;
};

// --- FILTRES VIBES POUR LA WATCHLIST ---

export type VibeAxis = keyof VibeCriteria;

/**
 * Filtre la watchlist par axe vibe dominant (valeur >= seuil).
 */
export const filterByVibeAxis = (
  movies: Movie[],
  axis: VibeAxis,
  threshold: number = 7
): Movie[] => {
  return movies.filter(m => m.vibe && m.vibe[axis] >= threshold);
};

/**
 * Filtre la watchlist par mood preset.
 * Retourne les films triés par pertinence décroissante.
 */
export const filterByMoodPreset = (
  movies: Movie[],
  moodId: MoodPreset
): Movie[] => {
  if (!moodId) return movies;

  const moodConfig = MOOD_PRESETS.find(m => m.id === moodId);
  if (!moodConfig) return movies;

  // Scorer et trier
  const scored = movies
    .filter(m => m.vibe) // Seulement les films avec vibes renseignées
    .map(movie => {
      const vibeKeys: (keyof VibeCriteria)[] = ['story', 'emotion', 'fun', 'visual', 'tension'];
      let moodScore = 0;
      let totalWeight = 0;

      for (const key of vibeKeys) {
        const weight = moodConfig.vibeWeights[key];
        if (weight > 0 && movie.vibe) {
          moodScore += (movie.vibe[key] / 10) * weight;
          totalWeight += weight;
        }
      }

      return {
        movie,
        relevance: totalWeight > 0 ? moodScore / totalWeight : 0,
      };
    })
    .sort((a, b) => b.relevance - a.relevance);

  // Retourner les films triés + ceux sans vibes à la fin
  const withVibes = scored.map(s => s.movie);
  const withoutVibes = movies.filter(m => !m.vibe);

  return [...withVibes, ...withoutVibes];
};

/**
 * Tri de la watchlist par score d'un axe vibe spécifique (décroissant).
 */
export const sortByVibeAxis = (
  movies: Movie[],
  axis: VibeAxis
): Movie[] => {
  return [...movies].sort((a, b) => {
    const scoreA = a.vibe ? a.vibe[axis] : 0;
    const scoreB = b.vibe ? b.vibe[axis] : 0;
    return scoreB - scoreA;
  });
};