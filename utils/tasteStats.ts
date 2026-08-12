import { Movie } from '../types';

/** Une observation chiffrée, prête à être mise en mots. */
export interface CriterionStat {
  label: string;
  average: number;
  /** Combien la note globale suit ce critère, de -1 à 1. */
  correlation: number;
}

export interface TasteStats {
  count: number;
  averageScore: number;
  /** Écart moyen avec la note TMDB. Positif : plus généreux que la foule. */
  vsTmdb: number | null;
  criteria: CriterionStat[];
  /** Celui dont la note décide de la note globale. */
  decisive: CriterionStat | null;
  /** Celui qu'il note le plus sévèrement. */
  harshest: CriterionStat | null;
  /** Celui qu'il note le plus généreusement. */
  kindest: CriterionStat | null;
  genres: { name: string; average: number; count: number }[];
  /** Moyenne au-delà de 2h20, et en dessous de 1h40. */
  longFilms: { average: number; count: number } | null;
  shortFilms: { average: number; count: number } | null;
  /** Distraction déclarée, et son lien avec la durée. */
  phoneAverage: number | null;
  phoneVsRuntime: number | null;
  rewatches: number;
}

const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((s, v) => s + v, 0) / values.length;

/**
 * Coefficient de corrélation de Pearson.
 *
 * Sert à répondre à une question que personne ne peut se poser seul : parmi les
 * critères, lequel décide vraiment de la note finale ? Une moyenne haute ne le
 * dit pas — un critère peut être noté généreusement partout sans jamais faire
 * pencher la balance. C'est la variation conjointe qui trahit ce qui compte.
 *
 * Rend 0 quand un des deux ensembles est constant : sans variation, il n'y a
 * rien à corréler, et prétendre le contraire serait inventer un lien.
 */
const correlation = (xs: number[], ys: number[]): number => {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;

  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));

  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }

  if (dx === 0 || dy === 0) return 0;
  return Math.round((num / Math.sqrt(dx * dy)) * 100) / 100;
};

const round = (value: number, digits = 1): number => {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
};

/** Les quatre notes d'un film, quel que soit le mode de notation employé. */
const criteriaOf = (movie: Movie): { label: string; value: number }[] => {
  if (movie.adaptiveRating?.criteria?.length) {
    return movie.adaptiveRating.criteria.map((c) => ({ label: c.label, value: Number(c.value) }));
  }
  return [
    { label: 'Scénario', value: Number(movie.ratings.story) },
    { label: 'Image', value: Number(movie.ratings.visuals) },
    { label: 'Jeu', value: Number(movie.ratings.acting) },
    { label: 'Son', value: Number(movie.ratings.sound) },
  ];
};

const scoreOf = (movie: Movie): number =>
  movie.adaptiveRating?.weightedRating ??
  (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4;

/**
 * Ce que la collection dit de celui qui l'a notée.
 *
 * Tout est calculé ici, et rien n'est laissé au modèle : il ne recevra que des
 * nombres et n'aura qu'à les mettre en phrases. C'est la différence entre un
 * portrait et un horoscope — un motif inventé se lit tout aussi bien qu'un motif
 * réel, et rien à l'écran ne permettrait de les distinguer.
 */
export const computeTasteStats = (movies: Movie[]): TasteStats => {
  const watched = movies.filter((m) => m.status === 'watched');

  const scores = watched.map(scoreOf);
  const averageScore = round(mean(scores), 2);

  // Un critère ne peut être comparé que s'il revient assez souvent : les grilles
  // adaptatives ajoutent des critères propres à un genre, présents trois fois.
  const byLabel = new Map<string, { values: number[]; scores: number[] }>();
  watched.forEach((movie, index) => {
    for (const c of criteriaOf(movie)) {
      if (!Number.isFinite(c.value)) continue;
      const entry = byLabel.get(c.label) ?? { values: [], scores: [] };
      entry.values.push(c.value);
      entry.scores.push(scores[index]);
      byLabel.set(c.label, entry);
    }
  });

  const criteria: CriterionStat[] = [...byLabel.entries()]
    .filter(([, e]) => e.values.length >= Math.min(5, watched.length))
    .map(([label, e]) => ({
      label,
      average: round(mean(e.values), 1),
      correlation: correlation(e.values, e.scores),
    }))
    .sort((a, b) => b.average - a.average);

  const ranked = [...criteria].sort((a, b) => b.correlation - a.correlation);

  // L'écart avec TMDB est une mesure de sévérité que rien d'autre ne donne :
  // une moyenne de 6 ne dit pas si l'on est dur, elle dit qu'on a vu des films
  // moyens. La comparaison au public, elle, tranche.
  const rated = watched.filter((m) => Number(m.tmdbRating) > 0);
  const vsTmdb =
    rated.length >= 5
      ? round(mean(rated.map((m) => scoreOf(m) - Number(m.tmdbRating))), 2)
      : null;

  const genreTotals = new Map<string, number[]>();
  watched.forEach((movie, index) => {
    const name = (movie.genre || '').split(',')[0].trim();
    if (!name) return;
    genreTotals.set(name, [...(genreTotals.get(name) ?? []), scores[index]]);
  });

  const genres = [...genreTotals.entries()]
    .filter(([, values]) => values.length >= 3)
    .map(([name, values]) => ({ name, average: round(mean(values), 1), count: values.length }))
    .sort((a, b) => b.average - a.average);

  const withRuntime = watched.filter((m) => Number(m.runtime) > 0);
  const longOnes = withRuntime.filter((m) => Number(m.runtime) >= 140);
  const shortOnes = withRuntime.filter((m) => Number(m.runtime) <= 100);

  const withPhone = watched.filter((m) => Number.isFinite(m.smartphoneFactor));
  const phoneAverage =
    withPhone.length >= 5 ? round(mean(withPhone.map((m) => Number(m.smartphoneFactor))), 1) : null;

  const phonePairs = withPhone.filter((m) => Number(m.runtime) > 0);
  const phoneVsRuntime =
    phonePairs.length >= 5
      ? correlation(
          phonePairs.map((m) => Number(m.runtime)),
          phonePairs.map((m) => Number(m.smartphoneFactor))
        )
      : null;

  return {
    count: watched.length,
    averageScore,
    vsTmdb,
    criteria,
    decisive: ranked[0] ?? null,
    harshest: criteria[criteria.length - 1] ?? null,
    kindest: criteria[0] ?? null,
    genres,
    longFilms:
      longOnes.length >= 3
        ? { average: round(mean(longOnes.map(scoreOf)), 1), count: longOnes.length }
        : null,
    shortFilms:
      shortOnes.length >= 3
        ? { average: round(mean(shortOnes.map(scoreOf)), 1), count: shortOnes.length }
        : null,
    phoneAverage,
    phoneVsRuntime,
    rewatches: watched.filter((m) => (m.watch_count ?? 1) > 1).length,
  };
};

/** Met les statistiques sous une forme que le modèle peut lire sans deviner. */
export const describeStats = (stats: TasteStats): string => {
  const lines: string[] = [
    `Films notés : ${stats.count}`,
    `Note moyenne : ${stats.averageScore}/10`,
  ];

  if (stats.vsTmdb != null) {
    const verb = stats.vsTmdb >= 0 ? 'au-dessus' : 'en dessous';
    lines.push(`Écart avec la note TMDB : ${Math.abs(stats.vsTmdb)} point ${verb} du public`);
  }

  lines.push(
    '',
    'MOYENNE PAR CRITÈRE, et corrélation avec la note finale',
    '(la corrélation dit lequel décide vraiment de la note, de -1 à 1) :',
    ...stats.criteria.map(
      (c) => `- ${c.label} : ${c.average}/10 · corrélation ${c.correlation}`
    )
  );

  if (stats.genres.length > 0) {
    lines.push(
      '',
      'PAR GENRE (au moins 3 films) :',
      ...stats.genres.map((g) => `- ${g.name} : ${g.average}/10 sur ${g.count} films`)
    );
  }

  if (stats.longFilms && stats.shortFilms) {
    lines.push(
      '',
      `Films de 2h20 et plus : ${stats.longFilms.average}/10 sur ${stats.longFilms.count} films`,
      `Films de 1h40 et moins : ${stats.shortFilms.average}/10 sur ${stats.shortFilms.count} films`
    );
  }

  if (stats.phoneAverage != null) {
    lines.push('', `Distraction téléphone déclarée : ${stats.phoneAverage}/10 en moyenne`);
    if (stats.phoneVsRuntime != null) {
      lines.push(`Lien entre durée du film et distraction : ${stats.phoneVsRuntime}`);
    }
  }

  if (stats.rewatches > 0) lines.push('', `Films revus au moins une fois : ${stats.rewatches}`);

  return lines.join('\n');
};
