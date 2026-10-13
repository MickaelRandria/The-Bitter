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
  | 'series'
  | 'standup'
  | 'concert'
  | 'documentary_legacy'
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

/** 2 : grilles Documentaire et Spectacle, critères « Sans objet » (14 octobre 2026). */
export const ADAPTIVE_RATING_VERSION = 2;

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
  /**
   * Les quatre critères de la notation Bitter (sans le +), dans l'ordre
   * d'affichage, quand ils diffèrent de Scénario / Image / Jeu / Son.
   *
   * Un documentaire noté en quatre critères ne doit pas retomber sur « Jeu des
   * acteurs » : il garde un critère par famille, pris dans sa propre grille.
   */
  simpleKeys?: string[];
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
  /**
   * Le documentaire n'a ni intrigue ni acteurs.
   *
   * L'ancienne grille lui appliquait Scénario et Jeu des acteurs : on laissait
   * le second au milieu faute de mieux, et il tirait la note vers 5. Celle-ci
   * juge ce qui fait un documentaire — son propos, la parole qu'il donne, ses
   * images, sa construction. Le propos porte aussi la question de la confiance,
   * formulée sans exiger de neutralité : un film engagé n'a pas à être neutre.
   */
  documentary: {
    id: 'documentary',
    label: 'Documentaire',
    simpleKeys: ['propos', 'parole', 'doc_images', 'sound'],
    criteria: [
      {
        key: 'propos',
        label: 'Le propos',
        description:
          'Le film sait ce qu’il veut dire, il assume son point de vue, et il te donne de quoi le comprendre ?',
        group: 'base',
        weight: 1.8,
      },
      {
        key: 'parole',
        label: 'La parole',
        description: 'Les gens qu’on entend comptent, et le film leur laisse la place ?',
        group: 'base',
        weight: 1.4,
      },
      {
        key: 'doc_images',
        label: 'Les images',
        description: 'Ce qu’on te montre, archives ou terrain, est fort et nécessaire ?',
        group: 'base',
        weight: 1.4,
      },
      {
        key: 'construction',
        label: 'La construction',
        description: 'Tu suis le fil sans te perdre ni décrocher ?',
        group: 'base',
        weight: 1.0,
      },
      {
        key: 'sound',
        label: 'Son & musique',
        description: 'La musique et le son servent le film, ou ils appuient trop ?',
        group: 'base',
        weight: 0.7,
      },
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
  /**
   * La grille Documentaire d'avant le 14 octobre 2026.
   *
   * Absente du sélecteur : elle ne sert qu'à rouvrir une note posée avec elle
   * sans lui ajouter des critères jamais notés (voir `resolveStoredProfileId`).
   */
  documentary_legacy: {
    id: 'documentary_legacy',
    label: 'Documentaire (ancienne grille)',
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
  /**
   * Spectacle filmé : stand-up, concert.
   *
   * Même base pour tous — la performance, ce qu'on entend, la façon dont c'est
   * filmé, le son —, c'est le genre qui change le critère qui compte le plus et
   * les poids. TMDB ne range pas les spectacles à part : ces grilles se
   * choisissent à la main.
   */
  standup: {
    id: 'standup',
    label: 'Spectacle · Stand-up',
    simpleKeys: ['contenu', 'captation', 'performance', 'sound'],
    criteria: [
      {
        key: 'performance',
        label: 'La performance',
        description: 'Sur scène, ça tient : présence, rythme, énergie ?',
        group: 'base',
        weight: 1.8,
      },
      {
        key: 'contenu',
        label: 'Le contenu',
        description: 'Ce qu’on entend vaut le coup : le texte, les blagues ?',
        group: 'base',
        weight: 1.4,
      },
      {
        key: 'captation',
        label: 'La captation',
        description: 'On te fait sentir la salle, ou tu regardes une caméra posée au fond ?',
        group: 'base',
        weight: 1.0,
      },
      {
        key: 'sound',
        label: 'Son & musique',
        description: 'Le son est propre, et la musique ajoute quelque chose ?',
        group: 'base',
        weight: 0.7,
      },
      {
        key: 'humor',
        label: 'Humour',
        description: 'Tu as ri ? Vraiment ri, pas juste souri poliment.',
        group: 'specific',
        weight: 1.8,
      },
    ],
  },
  concert: {
    id: 'concert',
    label: 'Spectacle · Concert',
    simpleKeys: ['contenu', 'captation', 'performance', 'sound'],
    criteria: [
      {
        key: 'performance',
        label: 'La performance',
        description: 'Sur scène, ça tient : présence, rythme, énergie ?',
        group: 'base',
        weight: 1.8,
      },
      {
        key: 'contenu',
        label: 'Le contenu',
        description: 'Ce qu’on entend vaut le coup : les morceaux, l’ordre, les versions ?',
        group: 'base',
        weight: 1.0,
      },
      {
        key: 'captation',
        label: 'La captation',
        description: 'On te fait sentir la salle, ou tu regardes une caméra posée au fond ?',
        group: 'base',
        weight: 1.4,
      },
      {
        key: 'sound',
        label: 'Son & musique',
        description:
          'Le mixage te met au milieu du groupe, ou on dirait un enregistrement de téléphone ?',
        group: 'base',
        weight: 1.8,
      },
      {
        key: 'live',
        label: 'L’effet live',
        description: 'Tu avais l’impression d’y être ?',
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
  /**
   * Le profil d'une SAISON, pas d'une série entière.
   *
   * Il reprend la forme commune — quatre critères de base plus un spécifique —
   * ce qui lui évite tout code de notation dédié. Le critère propre est le
   * rythme : c'est ce qui distingue vraiment une saison d'un film, où la
   * question du remplissage ne se pose pas de la même manière.
   *
   * Scénario et interprétation pèsent plus lourd que sur le profil standard :
   * sur huit à dix heures, c'est l'écriture et les personnages qui tiennent, et
   * c'est aussi ce dont on parle en sortant d'une saison.
   */
  series: {
    id: 'series',
    label: 'Série',
    criteria: [
      ...buildBase({ scenario: 1.4, image: 1.0, interpretation: 1.4, sound: 1.0 }),
      {
        key: 'pacing',
        label: 'Rythme',
        description:
          'La saison utilise bien ses épisodes, ou tu as senti du remplissage ?',
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
  { id: 'standup', label: 'Spectacle · Stand-up' },
  { id: 'concert', label: 'Spectacle · Concert' },
  { id: 'series', label: 'Série' },
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

/**
 * Genres qui restent prioritaires sur le profil « Série ».
 *
 * Un documentaire ou une série d'animation se jugent d'abord sur ce qu'ils
 * sont : ce qu'on y apprend, la qualité de l'animation. Pour tout le reste —
 * drame, comédie, thriller… — la question du rythme sur huit épisodes est plus
 * utile que le critère de genre, et c'est le profil Série qui gagne.
 */
const GENRES_OVER_SERIES: RatingProfileId[] = ['documentary', 'animation'];

/**
 * @param mediaType Sert à orienter vers le profil Série. Absent = un film,
 *   c'est-à-dire le comportement historique, inchangé.
 */
export function detectRatingProfile(
  genres: string | string[] | undefined | null,
  mediaType?: 'movie' | 'tv'
): RatingProfileId {
  const fromGenres = ((): RatingProfileId => {
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
  })();

  if (mediaType !== 'tv') return fromGenres;
  return GENRES_OVER_SERIES.includes(fromGenres) ? fromGenres : 'series';
}

export function getRatingProfile(id: RatingProfileId): RatingProfileDefinition {
  return RATING_PROFILES[id];
}

/**
 * Les quatre familles historiques : Scénario, Image, Jeu, Son.
 *
 * Les stats, le portrait et les colonnes plates de Supabase raisonnent sur ces
 * quatre axes. Les grilles Documentaire et Spectacle ont leurs propres critères ;
 * chacun est rattaché à la famille dont il tient le rôle, sinon un documentaire
 * disparaîtrait des stats par critère, ou y compterait pour zéro. Les critères
 * propres à un genre (Peur, Humour…) n'ont pas de famille.
 */
export type CriterionFamily = 'scenario' | 'image' | 'interpretation' | 'sound';

const FAMILY_BY_KEY: Record<string, CriterionFamily> = {
  scenario: 'scenario',
  propos: 'scenario',
  construction: 'scenario',
  contenu: 'scenario',
  image: 'image',
  doc_images: 'image',
  captation: 'image',
  interpretation: 'interpretation',
  parole: 'interpretation',
  performance: 'interpretation',
  sound: 'sound',
};

export const criterionFamily = (key: string): CriterionFamily | undefined => FAMILY_BY_KEY[key];

/**
 * La valeur d'une famille dans une note détaillée : la moyenne des critères
 * qui en relèvent (Propos et Construction pour un documentaire), ou `undefined`
 * si aucun n'a été noté — un critère mis « Sans objet » n'est pas enregistré.
 */
export function familyValue(
  criteria: readonly { key: string; value: unknown }[] | null | undefined,
  family: CriterionFamily
): number | undefined {
  const values = (criteria ?? [])
    .filter((c) => FAMILY_BY_KEY[c.key] === family)
    .map((c) => Number(c.value))
    .filter(Number.isFinite);
  if (values.length === 0) return undefined;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

/**
 * Le profil sous lequel rouvrir une note enregistrée.
 *
 * Une note « documentary » posée avant la nouvelle grille porte Scénario et Jeu
 * des acteurs : la rouvrir dans la grille actuelle afficherait des critères
 * jamais notés et changerait la note sans que rien ait été touché. On la rend à
 * sa grille d'origine.
 */
export function resolveStoredProfileId(
  storedId: string | null | undefined,
  criteria?: readonly { key: string }[] | null
): RatingProfileId | null {
  if (!storedId) return null;
  if (storedId === 'standard_legacy') return 'standard';
  if (
    storedId === 'documentary' &&
    (criteria ?? []).some((c) => c.key === 'scenario' || c.key === 'interpretation')
  )
    return 'documentary_legacy';
  return storedId in RATING_PROFILES ? (storedId as RatingProfileId) : 'standard';
}

/** Les clés de la notation Bitter à quatre critères pour ce profil. */
export function simpleCriteriaKeys(id: RatingProfileId): string[] {
  return RATING_PROFILES[id]?.simpleKeys ?? ['scenario', 'image', 'interpretation', 'sound'];
}
