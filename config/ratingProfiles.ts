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
  | 'drama'
  | 'fantasy'
  | 'crime'
  | 'adventure'
  | 'historical'
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

/**
 * Les libellés et les explications, en français de tous les jours.
 *
 * Les premières versions parlaient de « mise en scène », de « direction
 * artistique » et de « sound design ». C'est le vocabulaire du métier, et il
 * demande de savoir ce qu'on note avant de pouvoir noter — exactement l'inverse
 * de ce qu'il faut. Chaque explication est donc une question à laquelle on peut
 * répondre par oui ou non, à la deuxième personne, sur une ligne.
 */
const BASE_CRITERIA: Omit<CriterionDefinition, 'weight'>[] = [
  {
    key: 'scenario',
    label: 'Scénario',
    description:
      "L'histoire tient debout ? Tu comprends où on t'emmène, et les dialogues sonnent juste.",
    group: 'base',
  },
  {
    key: 'image',
    label: 'Image',
    description:
      'Tout ce que tu vois : les plans, la lumière, les décors, les costumes. C’est beau, ou au moins réussi ?',
    group: 'base',
  },
  {
    key: 'interpretation',
    label: 'Jeu des acteurs',
    description:
      'Tu crois aux personnages, ou tu vois des acteurs en train de jouer ?',
    group: 'base',
  },
  {
    key: 'sound',
    label: 'Son & musique',
    description:
      'La musique, les bruits, les voix. Ça ajoute quelque chose au film, ou tu ne l’as pas remarqué ?',
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
        label: 'Peur',
        description:
          'Tu as eu peur, ou au moins été mal à l’aise ? C’est tout ce qu’on demande à un film d’horreur.',
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
        description:
          'Tu as ri ? Vraiment ri, pas juste souri poliment.',
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
        description:
          'Les mouvements sont fluides, et le film a un style à lui plutôt que celui de tout le monde ?',
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
        label: 'Scènes d’action',
        description:
          'Tu comprends ce qui se passe pendant les bagarres et les poursuites, et ça te fait de l’effet ?',
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
        label: 'Le couple',
        description:
          'Tu y crois, à cette histoire entre eux ? Sans ça, une romance ne tient pas.',
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
        label: 'L’univers',
        description:
          'Le monde inventé tient debout, et tu aurais envie d’y passer du temps ?',
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
        description:
          'Tu avais hâte de savoir la suite, ou tu regardais l’heure ?',
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
        label: 'Les chansons',
        description:
          'Les morceaux sont bons, et ils font avancer le film au lieu de l’arrêter ?',
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
        label: 'Ce que ça t’apprend',
        description:
          'Tu vois le sujet autrement qu’avant d’avoir regardé ?',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  drama: {
    id: 'drama',
    label: 'Drame',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.0, interpretation: 1.8, sound: 1.0 }),
      {
        key: 'emotional_truth',
        label: 'Émotion',
        description:
          'Ça t’a touché sans en faire trop, ou tu as senti qu’on tirait sur la corde ?',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  fantasy: {
    id: 'fantasy',
    label: 'Fantastique',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.8, interpretation: 1.0, sound: 1.4 }),
      {
        key: 'imaginary',
        label: 'Magie',
        description:
          'Le film croit assez à son monde pour que tu y croies aussi ?',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  crime: {
    id: 'crime',
    label: 'Polar / Crime',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.0, interpretation: 1.0, sound: 1.4 }),
      {
        key: 'investigation',
        label: 'L’enquête',
        description:
          'La solution tient la route, ou le film triche pour s’en sortir ?',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  adventure: {
    id: 'adventure',
    label: 'Aventure',
    criteria: [
      ...buildBase({ scenario: 1.0, image: 1.4, interpretation: 0.7, sound: 1.4 }),
      {
        key: 'adventure',
        label: 'Le voyage',
        description:
          'Tu avais envie de partir avec eux, et le voyage valait le coup ?',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  historical: {
    id: 'historical',
    label: 'Historique / Guerre',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.4, interpretation: 1.0, sound: 1.0 }),
      {
        key: 'historical_scope',
        label: 'L’époque',
        description:
          'Tu y es vraiment, et le film a quelque chose à dire au-delà du décor ?',
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

/**
 * Le nom actuel de chaque critère, indexé par sa clé.
 *
 * Le libellé est enregistré avec la note, et il a déjà changé trois fois : la
 * base contient « Sonore » (34 fois), « Son & musique » (5) et bientôt le
 * troisième, tous sous la même clé `sound`. Chercher par libellé obligerait à
 * énumérer chaque variante historique, et il en manquerait toujours une.
 *
 * La table se construit depuis les profils eux-mêmes : renommer un critère plus
 * haut suffit, il n'y a rien à tenir à jour ici.
 */
const LABEL_BY_KEY: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  for (const profile of Object.values(RATING_PROFILES)) {
    for (const criterion of profile.criteria) out[criterion.key] = criterion.label;
  }
  return out;
})();

/**
 * Rend le nom actuel d'un critère, quel que soit celui sous lequel il a été
 * enregistré. Sans la clé, on ne peut rien deviner : le libellé est rendu tel quel.
 */
export const currentCriterionLabel = (label: string, key?: string): string =>
  (key && LABEL_BY_KEY[key]) || label;

export const PROFILE_OPTIONS: { id: RatingProfileId; label: string }[] = [
  { id: 'standard', label: 'Standard' },
  { id: 'drama', label: 'Drame' },
  { id: 'comedy', label: 'Comédie' },
  { id: 'romance', label: 'Romance' },
  { id: 'action', label: 'Action' },
  { id: 'adventure', label: 'Aventure' },
  { id: 'thriller', label: 'Thriller' },
  { id: 'crime', label: 'Polar / Crime' },
  { id: 'horror', label: 'Horreur' },
  { id: 'fantasy', label: 'Fantastique' },
  { id: 'science_fiction', label: 'Science-fiction' },
  { id: 'animation', label: 'Animation' },
  { id: 'music', label: 'Musical / Musique' },
  { id: 'historical', label: 'Historique / Guerre' },
  { id: 'documentary', label: 'Documentaire' },
  { id: 'custom', label: 'Profil perso' },
];

// Ordre de priorité : les expériences les plus structurantes passent avant les genres compagnons.
const TMDB_GENRE_TO_PROFILE: { match: RegExp; profile: RatingProfileId }[] = [
  { match: /documentary|documentaire/i, profile: 'documentary' },
  { match: /horror|horreur|épouvante|epouvante/i, profile: 'horror' },
  { match: /animation|animé|anime/i, profile: 'animation' },
  { match: /fantasy|fantastique/i, profile: 'fantasy' },
  { match: /science[- ]?fiction|sci[- ]?fi/i, profile: 'science_fiction' },
  { match: /crime|polar|mystery|mystère|mystere/i, profile: 'crime' },
  { match: /thriller|suspense/i, profile: 'thriller' },
  { match: /war|guerre|history|historique/i, profile: 'historical' },
  { match: /adventure|aventure/i, profile: 'adventure' },
  { match: /drama|drame/i, profile: 'drama' },
  { match: /comedy|comédie|comedie/i, profile: 'comedy' },
  { match: /action/i, profile: 'action' },
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
