export type RatingProfileId =
  | 'standard'
  | 'horror'
  | 'comedy'
  | 'animation'
  | 'action'
  | 'romance'
  | 'science_fiction'
  | 'thriller'
  | 'music'
  | 'documentary'
  | 'custom';

/** Available weight levels for a custom profile. */
export const CUSTOM_WEIGHT_LEVELS = [
  { weight: 0.7, label: 'Secondaire' as const },
  { weight: 1.0, label: 'Standard' as const },
  { weight: 1.4, label: 'Important' as const },
  { weight: 1.8, label: 'Essentiel' as const },
];

/** Default weights for a freshly created custom profile (all Standard). */
export const DEFAULT_CUSTOM_WEIGHTS: Record<string, number> = {
  scenario: 1.0,
  image: 1.0,
  interpretation: 1.0,
  sound: 1.0,
};

export type LegacyProfileId = 'standard_legacy';
export type AnyProfileId = RatingProfileId | LegacyProfileId;

export type CriterionGroup = 'base' | 'specific';
export type WeightLabel = 'Essentiel' | 'Important' | 'Standard' | 'Secondaire';

export const ADAPTIVE_RATING_VERSION = 1;

export interface CriterionDefinition {
  key: string;
  label: string;
  description: string;
  group: CriterionGroup;
  weight: number;
}

export interface RatingProfileDefinition {
  id: RatingProfileId;
  label: string;
  criteria: CriterionDefinition[];
}

const BASE_CRITERIA: Omit<CriterionDefinition, 'weight'>[] = [
  {
    key: 'scenario',
    label: 'Scénario',
    description: 'Histoire, structure, dialogues, cohérence narrative',
    group: 'base',
  },
  {
    key: 'image',
    label: 'Image',
    description: 'Photographie, cadrage, esthétique, direction artistique',
    group: 'base',
  },
  {
    key: 'interpretation',
    label: 'Interprétation',
    description: 'Jeu d’acteur, présence, crédibilité émotionnelle',
    group: 'base',
  },
  {
    key: 'sound',
    label: 'Sonore',
    description: 'Musique, mixage, sound design, ambiance',
    group: 'base',
  },
];

function buildBase(weights: { scenario: number; image: number; interpretation: number; sound: number }) {
  return BASE_CRITERIA.map<CriterionDefinition>((c) => ({
    ...c,
    weight: weights[c.key as keyof typeof weights],
  }));
}

export const RATING_PROFILES: Record<RatingProfileId, RatingProfileDefinition> = {
  standard: {
    id: 'standard',
    label: 'Standard',
    criteria: buildBase({ scenario: 1.0, image: 1.0, interpretation: 1.0, sound: 1.0 }),
  },
  horror: {
    id: 'horror',
    label: 'Horreur',
    criteria: [
      ...buildBase({ scenario: 1.0, image: 1.4, interpretation: 1.0, sound: 1.8 }),
      {
        key: 'fear',
        label: 'Facteur peur',
        description: 'Tension, malaise, atmosphère, capacité à te mettre mal à l’aise.',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  comedy: {
    id: 'comedy',
    label: 'Comédie',
    criteria: [
      ...buildBase({ scenario: 1.0, image: 0.7, interpretation: 1.4, sound: 0.7 }),
      {
        key: 'humor',
        label: 'Humour',
        description: 'Est-ce que le film est vraiment drôle, bien rythmé et efficace dans ses blagues ?',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  animation: {
    id: 'animation',
    label: 'Animation',
    criteria: [
      ...buildBase({ scenario: 1.0, image: 1.4, interpretation: 1.0, sound: 1.0 }),
      {
        key: 'animation',
        label: 'Animation',
        description: 'Fluidité, style visuel, expressivité et créativité de l’animation.',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  action: {
    id: 'action',
    label: 'Action',
    criteria: [
      ...buildBase({ scenario: 0.7, image: 1.4, interpretation: 1.0, sound: 1.4 }),
      {
        key: 'action',
        label: 'Action',
        description: 'Intensité, lisibilité, chorégraphie et efficacité des scènes d’action.',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  romance: {
    id: 'romance',
    label: 'Romance',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.0, interpretation: 1.8, sound: 1.0 }),
      {
        key: 'chemistry',
        label: 'Alchimie',
        description: 'Est-ce que la relation fonctionne, touche et paraît crédible ?',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  science_fiction: {
    id: 'science_fiction',
    label: 'Science-fiction',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.8, interpretation: 1.0, sound: 1.0 }),
      {
        key: 'universe',
        label: 'Univers',
        description: 'Force du concept, cohérence du monde et capacité à faire voyager.',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  thriller: {
    id: 'thriller',
    label: 'Thriller',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.0, interpretation: 1.0, sound: 1.4 }),
      {
        key: 'suspense',
        label: 'Suspense',
        description: 'Tension, rythme, imprévisibilité et montée dramatique.',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  music: {
    id: 'music',
    label: 'Musical / Musique',
    criteria: [
      ...buildBase({ scenario: 0.7, image: 1.0, interpretation: 1.4, sound: 1.8 }),
      {
        key: 'songs',
        label: 'Musique',
        description: 'Impact des chansons, performances musicales et émotion sonore.',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  documentary: {
    id: 'documentary',
    label: 'Documentaire',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.0, interpretation: 0.7, sound: 1.0 }),
      {
        key: 'impact',
        label: 'Impact',
        description: 'Est-ce que le documentaire informe, marque ou change ton regard sur le sujet ?',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  custom: {
    id: 'custom',
    label: 'Profil perso',
    // Default weights — all Standard. The user overrides them at rating time and
    // the chosen weights are persisted alongside the criteria. See buildCriteriaForProfile.
    criteria: buildBase({ scenario: 1.0, image: 1.0, interpretation: 1.0, sound: 1.0 }),
  },
};

export const PROFILE_OPTIONS: { id: RatingProfileId; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'horror', label: 'Horreur' },
  { id: 'comedy', label: 'Comédie' },
  { id: 'animation', label: 'Animation' },
  { id: 'action', label: 'Action' },
  { id: 'romance', label: 'Romance' },
  { id: 'science_fiction', label: 'Science-fiction' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'music', label: 'Musical / Musique' },
  { id: 'documentary', label: 'Documentaire' },
  { id: 'custom', label: 'Profil perso' },
];

// Ordre de priorité : Documentary > Horror > Animation > Comedy > Action > SF > Thriller > Romance > Music
const TMDB_GENRE_TO_PROFILE: { match: RegExp; profile: RatingProfileId }[] = [
  { match: /documentary|documentaire/i, profile: 'documentary' },
  { match: /horror|horreur|épouvante|epouvante/i, profile: 'horror' },
  { match: /animation|animé|anime/i, profile: 'animation' },
  { match: /comedy|comédie|comedie/i, profile: 'comedy' },
  { match: /action/i, profile: 'action' },
  { match: /science[- ]?fiction|sci[- ]?fi/i, profile: 'science_fiction' },
  { match: /thriller|suspense/i, profile: 'thriller' },
  { match: /romance|romantique/i, profile: 'romance' },
  { match: /music|musical|musique/i, profile: 'music' },
];

export function detectRatingProfile(genres: string | string[] | undefined | null): RatingProfileId {
  if (!genres) return 'standard';
  const list = Array.isArray(genres)
    ? genres
    : String(genres)
        .split(/[,/]/)
        .map((s) => s.trim());
  for (const rule of TMDB_GENRE_TO_PROFILE) {
    if (list.some((g) => rule.match.test(g))) return rule.profile;
  }
  return 'standard';
}

export function getRatingProfile(id: RatingProfileId): RatingProfileDefinition {
  return RATING_PROFILES[id];
}
