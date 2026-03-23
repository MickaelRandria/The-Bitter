import { Movie, UserProfile, PacingType } from '../types';
import { getAdvancedArchetype } from './archetypes';

// ─── HELPER ───────────────────────────────────────────────────────────────────

export const getAvgRating = (m: Movie): number =>
  (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;

// ─── HYPE VS RÉALITÉ ──────────────────────────────────────────────────────────

export interface HypeRealityResult {
  globalDelta: number;
  profileLabel: string;
  description: string;
  highHypeAvgDelta: number | null;
  lowHypeAvgDelta: number | null;
  topSurprises: Array<{ movie: Movie; delta: number }>;
  topDisappointments: Array<{ movie: Movie; delta: number }>;
}

export const computeHypeReality = (watched: Movie[]): HypeRealityResult | null => {
  const withHype = watched.filter((m) => typeof m.hype === 'number');
  if (withHype.length < 3) return null;

  const withDelta = withHype.map((m) => ({
    movie: m,
    delta: Number((getAvgRating(m) - m.hype!).toFixed(2)),
  }));

  const globalDelta = Number(
    (withDelta.reduce((s, x) => s + x.delta, 0) / withDelta.length).toFixed(2)
  );

  let profileLabel: string;
  let description: string;

  if (globalDelta <= -1) {
    profileLabel = 'Optimiste chronique';
    description =
      "Tu t'emballe avant chaque film. Tes attentes sont souvent trop hautes et la réalité finit par décevoir.";
  } else if (globalDelta <= -0.3) {
    profileLabel = 'Légèrement déçu';
    description =
      'Tu tends à anticiper un peu mieux que ce que tu vas trouver. Calibre tes attentes à la baisse.';
  } else if (globalDelta <= 0.3) {
    profileLabel = 'Réaliste calibré';
    description =
      'Ton intuition avant un film est juste. Tu anticipes correctement ce que tu vas ressentir.';
  } else if (globalDelta <= 1) {
    profileLabel = 'Légèrement optimiste';
    description =
      'Les films te surprennent souvent en bien. Tu y vas avec mesure et tu en ressors content.';
  } else {
    profileLabel = 'Agréablement surpris';
    description =
      'Tu sous-estimes régulièrement les films que tu vas voir. Chaque séance est une bonne surprise.';
  }

  const highHype = withDelta.filter((x) => x.movie.hype! >= 7);
  const lowHype = withDelta.filter((x) => x.movie.hype! <= 4);

  const highHypeAvgDelta =
    highHype.length > 0
      ? Number((highHype.reduce((s, x) => s + x.delta, 0) / highHype.length).toFixed(2))
      : null;
  const lowHypeAvgDelta =
    lowHype.length > 0
      ? Number((lowHype.reduce((s, x) => s + x.delta, 0) / lowHype.length).toFixed(2))
      : null;

  const sorted = [...withDelta].sort((a, b) => b.delta - a.delta);
  const topSurprises = sorted.filter((x) => x.delta > 0).slice(0, 3);
  const topDisappointments = [...withDelta]
    .sort((a, b) => a.delta - b.delta)
    .filter((x) => x.delta < 0)
    .slice(0, 3);

  return {
    globalDelta,
    profileLabel,
    description,
    highHypeAvgDelta,
    lowHypeAvgDelta,
    topSurprises,
    topDisappointments,
  };
};

// ─── PACING IDEAL ─────────────────────────────────────────────────────────────

export interface PacingGroupData {
  pacing: PacingType;
  label: string;
  avg: number;
  count: number;
}

export interface PacingInsightResult {
  idealPacing: PacingType;
  label: string;
  emoji: string;
  description: string;
  spread: number;
  groups: PacingGroupData[];
}

export const computePacingInsight = (watched: Movie[]): PacingInsightResult | null => {
  const withPacing = watched.filter((m) => m.pacing);
  if (withPacing.length < 3) return null;

  const pacingLabels: Record<PacingType, string> = {
    slow: 'Contemplatif',
    perfect: 'Équilibré',
    fast: 'Intense',
  };

  const pacingEmojis: Record<PacingType, string> = {
    slow: '🐌',
    perfect: '⚖️',
    fast: '⚡',
  };

  const pacingDescriptions: Record<PacingType, string> = {
    slow: "Tu t'épanouis dans les films qui respirent. La lenteur est une invitation à la profondeur, pas un défaut.",
    perfect:
      "Tu apprécies un cinéma bien équilibré — ni trop pressé ni trop contemplatif. L'harmonie avant tout.",
    fast: 'Tu aimes quand ça bouge. Le rythme effréné te tient en éveil et amplifie ton engagement.',
  };

  const groupMap: Partial<Record<PacingType, { sum: number; count: number }>> = {};
  withPacing.forEach((m) => {
    if (!m.pacing) return;
    if (!groupMap[m.pacing]) groupMap[m.pacing] = { sum: 0, count: 0 };
    groupMap[m.pacing]!.sum += getAvgRating(m);
    groupMap[m.pacing]!.count++;
  });

  const groups: PacingGroupData[] = (
    Object.entries(groupMap) as [PacingType, { sum: number; count: number }][]
  )
    .map(([pacing, data]) => ({
      pacing,
      label: pacingLabels[pacing],
      avg: Number((data.sum / data.count).toFixed(1)),
      count: data.count,
    }))
    .sort((a, b) => b.avg - a.avg);

  if (groups.length === 0) return null;

  const idealPacing = groups[0].pacing;
  const spread =
    groups.length > 1 ? Number((groups[0].avg - groups[groups.length - 1].avg).toFixed(1)) : 0;

  return {
    idealPacing,
    label: pacingLabels[idealPacing],
    emoji: pacingEmojis[idealPacing],
    description: pacingDescriptions[idealPacing],
    spread,
    groups,
  };
};

// ─── ÉVOLUTION ARCHÉTYPE ──────────────────────────────────────────────────────

export interface ArchetypeSnapshot {
  movieCount: number;
  title: string;
  icon: string;
  tag: string;
  timestamp: number;
  isCurrent?: boolean;
}

export interface ArchetypeEvolutionResult {
  snapshots: ArchetypeSnapshot[];
  hasEvolved: boolean;
  transitionMessage: string | null;
}

const MILESTONES = [5, 10, 15, 20, 30, 50, 75, 100];

export const computeArchetypeEvolution = (
  watched: Movie[],
  userProfile: UserProfile | null
): ArchetypeEvolutionResult | null => {
  if (watched.length < 5) return null;

  const sorted = [...watched].sort((a, b) => {
    const ta = a.dateWatched || a.dateAdded;
    const tb = b.dateWatched || b.dateAdded;
    return ta - tb;
  });

  const count = sorted.length;

  const computeAt = (n: number): ArchetypeSnapshot => {
    const subset = sorted.slice(0, n);
    const sums = { cerebral: 0, emotion: 0, fun: 0, visual: 0, tension: 0 };
    const qSums = { scenario: 0, acting: 0, visual: 0, sound: 0 };
    let smartphoneSum = 0;
    const genres = new Set<string>();

    subset.forEach((m) => {
      sums.cerebral += m.vibe?.story || 5;
      sums.emotion += m.vibe?.emotion || 5;
      sums.fun += m.vibe?.fun || 5;
      sums.visual += m.vibe?.visual || 5;
      sums.tension += m.vibe?.tension || 5;
      qSums.scenario += m.ratings.story;
      qSums.acting += m.ratings.acting;
      qSums.visual += m.ratings.visuals;
      qSums.sound += m.ratings.sound;
      smartphoneSum += m.smartphoneFactor || 0;
      if (m.genre) genres.add(m.genre);
    });

    const result = getAdvancedArchetype({
      vibes: {
        cerebral: sums.cerebral / n,
        emotion: sums.emotion / n,
        fun: sums.fun / n,
        visual: sums.visual / n,
        tension: sums.tension / n,
      },
      quality: {
        scenario: qSums.scenario / n,
        acting: qSums.acting / n,
        visual: qSums.visual / n,
        sound: qSums.sound / n,
      },
      smartphone: smartphoneSum / n,
      distinctGenreCount: genres.size,
      severityIndex: userProfile?.severityIndex || 5,
      rhythmIndex: userProfile?.patienceLevel || 5,
    });

    const last = subset[subset.length - 1];
    return {
      movieCount: n,
      title: result.title,
      icon: result.icon,
      tag: result.tag,
      timestamp: last.dateWatched || last.dateAdded,
    };
  };

  const milestonesToShow = MILESTONES.filter((n) => n <= count);
  const snapshots: ArchetypeSnapshot[] = milestonesToShow.map((n) => computeAt(n));

  if (!milestonesToShow.includes(count)) {
    const current = computeAt(count);
    current.isCurrent = true;
    snapshots.push(current);
  } else if (snapshots.length > 0) {
    snapshots[snapshots.length - 1].isCurrent = true;
  }

  const titles = snapshots.map((s) => s.title);
  const hasEvolved = new Set(titles).size > 1;

  let transitionMessage: string | null = null;
  if (hasEvolved) {
    const firstTitle = titles[0];
    const lastTitle = titles[titles.length - 1];
    if (firstTitle !== lastTitle) {
      transitionMessage = `Ton profil a évolué : de ${firstTitle} à ${lastTitle}`;
    }
  }

  return { snapshots, hasEvolved, transitionMessage };
};
