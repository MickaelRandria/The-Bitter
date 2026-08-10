import { UserProfile, Movie } from '../types';

// --- TYPES & INTERFACES ---

export interface ArchetypeResult {
  title: string;
  description: string;
  icon: string;
  tag: string;
  secondaryTrait?: string;
  matchScore?: number; // Pour debug ou affichage de la certitude
}

// Le vecteur à 7 dimensions définissant un profil cinéphile
// Toutes les valeurs sont normalisées entre 0 et 1
type ArchetypeVector = {
  cerebral: number;
  emotion: number;
  fun: number;
  visual: number;
  tension: number;
  severity: number;
  rhythm: number; // 0 = Contemplatif, 1 = Intense
};

type ArchetypeDefinition = ArchetypeResult & {
  vector: ArchetypeVector;
};

// --- DÉFINITION DES 9 ARCHÉTYPES ---

const ARCHETYPES: ArchetypeDefinition[] = [
  {
    title: 'Le Déchiffreur',
    icon: '🔍',
    tag: 'CÉRÉBRAL',
    description:
      'Tu ne regardes pas un film, tu le résous. Les scénarios complexes et les sous-textes cachés sont ton terrain de jeu favori.',
    vector: {
      cerebral: 1.0,
      emotion: 0.3,
      fun: 0.2,
      visual: 0.5,
      tension: 0.6,
      severity: 0.8,
      rhythm: 0.4,
    },
  },
  {
    title: "L'Éponge Émotionnelle",
    icon: '🥀',
    tag: 'ÉMOTION PURE',
    description:
      'Tu cherches la catharsis. Un bon film doit te traverser, te bouleverser et laisser une trace indélébile sur ton cœur.',
    vector: {
      cerebral: 0.4,
      emotion: 1.0,
      fun: 0.3,
      visual: 0.6,
      tension: 0.4,
      severity: 0.3,
      rhythm: 0.5,
    },
  },
  {
    title: "L'Hédoniste",
    icon: '🍿',
    tag: 'PLAISIR BRUT',
    description:
      "Le cinéma est une fête. Tu fuis l'ennui et le prétentieux pour privilégier l'efficacité, le rire et le spectacle immédiat.",
    vector: {
      cerebral: 0.1,
      emotion: 0.4,
      fun: 1.0,
      visual: 0.5,
      tension: 0.6,
      severity: 0.1,
      rhythm: 0.9,
    },
  },
  {
    title: "L'Esthète",
    icon: '👁️',
    tag: 'ESTHÉTIQUE',
    description:
      'La forme prime sur le fond. Une photographie sublime ou une direction artistique audacieuse suffisent à ton bonheur.',
    vector: {
      cerebral: 0.6,
      emotion: 0.5,
      fun: 0.2,
      visual: 1.0,
      tension: 0.3,
      severity: 0.7,
      rhythm: 0.2,
    },
  },
  {
    title: "L'Adrénaline Junkie",
    icon: '🎢',
    tag: 'HAUTE TENSION',
    description:
      "Tu vis pour le frisson. Thrillers, horreur, action effrénée : tu as besoin que ton rythme cardiaque s'accélère.",
    vector: {
      cerebral: 0.3,
      emotion: 0.2,
      fun: 0.7,
      visual: 0.4,
      tension: 1.0,
      severity: 0.4,
      rhythm: 1.0,
    },
  },
  {
    title: 'Le Stratège Noir',
    icon: '🕵️',
    tag: 'THRILLER CÉRÉBRAL',
    description:
      "Tu aimes quand l'intelligence rencontre la noirceur. Les polars psychologiques et les intrigues tortueuses sont ta spécialité.",
    vector: {
      cerebral: 0.9,
      emotion: 0.2,
      fun: 0.3,
      visual: 0.6,
      tension: 0.9,
      severity: 0.7,
      rhythm: 0.6,
    },
  },
  {
    title: 'Le Romantique Visionnaire',
    icon: '🌅',
    tag: 'POÉSIE VISUELLE',
    description:
      "Tu cherches la beauté qui émeut. L'alliance parfaite entre une esthétique soignée et des sentiments profonds.",
    vector: {
      cerebral: 0.4,
      emotion: 0.9,
      fun: 0.2,
      visual: 0.9,
      tension: 0.2,
      severity: 0.5,
      rhythm: 0.3,
    },
  },
  {
    title: 'Le Philosophe Sensible',
    icon: '🎭',
    tag: 'PROFONDEUR',
    description:
      'Tu veux comprendre ET ressentir. Les œuvres qui stimulent autant ton intellect que ton empathie sont celles qui te marquent.',
    vector: {
      cerebral: 0.9,
      emotion: 0.9,
      fun: 0.1,
      visual: 0.4,
      tension: 0.3,
      severity: 0.6,
      rhythm: 0.3,
    },
  },
  {
    title: "L'Omnivore",
    icon: '🌍',
    tag: 'ÉCLECTIQUE',
    description:
      "Ta force est ta curiosité. Du blockbuster au film d'auteur, tu trouves de la valeur partout grâce à ton esprit ouvert.",
    vector: {
      cerebral: 0.5,
      emotion: 0.5,
      fun: 0.5,
      visual: 0.5,
      tension: 0.5,
      severity: 0.5,
      rhythm: 0.5,
    },
  },
];

// --- LOGIQUE MATHÉMATIQUE ---

// Calcul de la similarité Cosinus entre deux vecteurs
// Retourne une valeur entre -1 (opposés) et 1 (identiques)
const cosineSimilarity = (vecA: ArchetypeVector, vecB: ArchetypeVector): number => {
  const keys = Object.keys(vecA) as (keyof ArchetypeVector)[];

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const key of keys) {
    const valA = vecA[key];
    const valB = vecB[key];
    dotProduct += valA * valB;
    magA += valA * valA;
    magB += valB * valB;
  }

  magA = Math.sqrt(magA);
  magB = Math.sqrt(magB);

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (magA * magB);
};

// --- PHASE 1 : ONBOARDING (DÉCLARATIF) ---

export const getArchetypeFromOnboarding = (
  severityIndex: number, // 0-10
  rhythmIndex: number, // 0-10 (anciennement patienceLevel)
  depthIndex: number // 0-10 (inféré des genres)
): ArchetypeResult => {
  // Normalisation des entrées utilisateur [0, 1]
  const userSeverity = severityIndex / 10;
  const userRhythm = rhythmIndex / 10;
  const userDepth = depthIndex / 10;

  // Projection des archétypes sur les 3 axes disponibles à l'onboarding
  // On compare le vecteur utilisateur (3D) aux sous-vecteurs des archétypes
  let bestMatch = ARCHETYPES[0];
  let maxSimilarity = -1;

  for (const archetype of ARCHETYPES) {
    // On approxime la "Profondeur" (Depth) par une moyenne de Cerebral + Emotion
    // Un film profond est souvent soit intellectuel, soit émotionnel, rarement juste "Fun" ou "Tension"
    const archetypeDepth = (archetype.vector.cerebral + archetype.vector.emotion) / 2;

    // Vecteur 3D simplifié pour la comparaison
    const archetypeVector3D = [archetype.vector.severity, archetype.vector.rhythm, archetypeDepth];
    const userVector3D = [userSeverity, userRhythm, userDepth];

    // Calcul de distance euclidienne inversée (plus simple ici que le cosinus sur 3 axes biaisés)
    // Distance au carré pour éviter les racines
    const distSq =
      Math.pow(archetypeVector3D[0] - userVector3D[0], 2) +
      Math.pow(archetypeVector3D[1] - userVector3D[1], 2) +
      Math.pow(archetypeVector3D[2] - userVector3D[2], 2);

    // On cherche la distance minimale
    if (distSq < 100) {
      // Juste une initialisation, max dist est 3
      // On inverse la logique ici : on veut minimiser la distance, donc maximiser le score
      const similarity = 1 - Math.sqrt(distSq); // Score approximatif
      if (similarity > maxSimilarity) {
        maxSimilarity = similarity;
        bestMatch = archetype;
      }
    }
  }

  // Fallback de sécurité (ne devrait jamais arriver mathématiquement si la liste est pleine)
  return bestMatch || ARCHETYPES[8]; // Omnivore par défaut
};

// --- PHASE 2 : ANALYTIQUE (COMPORTEMENTAL) ---

export interface AdvancedArchetypeInput {
  vibes: {
    cerebral: number; // 0-10
    emotion: number;
    fun: number;
    visual: number;
    tension: number;
  };
  quality: {
    scenario: number; // 0-10
    acting: number;
    visual: number;
    sound: number;
  };
  smartphone: number; // 0-100 (Attention inversée : haut = distrait, bas = focus)
  distinctGenreCount: number; // Nombre de genres uniques regardés
  severityIndex: number; // 0-10 (Profil déclaré ou recalibré)
  rhythmIndex: number; // 0-10 (Profil déclaré ou recalibré)
}

export const getAdvancedArchetype = (input: AdvancedArchetypeInput): ArchetypeResult => {
  // 1. Construction du Vecteur Utilisateur Normalisé [0, 1]

  // Normalisation des vibes (Input 0-10 -> 0-1)
  const normVibes = {
    cerebral: input.vibes.cerebral / 10,
    emotion: input.vibes.emotion / 10,
    fun: input.vibes.fun / 10,
    visual: input.vibes.visual / 10,
    tension: input.vibes.tension / 10,
  };

  // Normalisation Sévérité (Input 0-10 -> 0-1)
  const normSeverity = input.severityIndex / 10;

  // Normalisation Rythme
  // Ici c'est subtil : le rythme déclaré est une bonne base, mais on peut le nuancer par le smartphone factor
  // Si smartphone est élevé (>40%), l'utilisateur a probablement besoin de rythme élevé (attention faible)
  const attentionSpan = 1 - input.smartphone / 100; // 1 = Focus total, 0 = Distrait
  // On mixe le rythme déclaré (50%) et l'attention réelle (50%)
  // Si attention faible (0.2) -> Rythme nécessaire élevé (0.8)
  const inferredRhythm = (input.rhythmIndex / 10) * 0.6 + (1 - attentionSpan) * 0.4;

  const userVector: ArchetypeVector = {
    ...normVibes,
    severity: normSeverity,
    rhythm: inferredRhythm,
  };

  // 2. Comparaison Vectorielle
  let bestMatch = ARCHETYPES[0];
  let maxSimilarity = -2; // Cosine va de -1 à 1

  // Règle Spéciale "Omnivore" :
  // Nécessite une diversité réelle. Si pas assez de genres, on exclut l'Omnivore des candidats.
  const candidates =
    input.distinctGenreCount >= 4 ? ARCHETYPES : ARCHETYPES.filter((a) => a.title !== "L'Omnivore");

  for (const archetype of candidates) {
    const similarity = cosineSimilarity(userVector, archetype.vector);

    // Bonus léger pour l'Omnivore si la diversité est très haute, pour favoriser ce profil "équilibré"
    // qui sinon perd souvent contre des profils plus typés mathématiquement
    let adjustedSimilarity = similarity;
    if (archetype.title === "L'Omnivore" && input.distinctGenreCount >= 6) {
      adjustedSimilarity += 0.05;
    }

    if (adjustedSimilarity > maxSimilarity) {
      maxSimilarity = adjustedSimilarity;
      bestMatch = archetype;
    }
  }

  return {
    ...bestMatch,
    matchScore: maxSimilarity,
  };
};

// Helper pour l'inférence des genres (utilisé dans l'onboarding)
export const inferDepthFromGenres = (genres: string[]): number => {
  if (!genres || genres.length === 0) return 5;

  const deepGenres = ['Drame', 'Documentaire', 'Biopic', 'Histoire', 'Guerre'];
  const midGenres = ['Thriller', 'Science-Fiction', 'Romance', 'Mystère', 'Western', 'Musique'];
  const lightGenres = [
    'Action',
    'Comédie',
    'Horreur',
    'Animation',
    'Aventure',
    'Familial',
    'Fantastique',
  ];

  let score = 0;
  let count = 0;

  genres.forEach((g) => {
    if (deepGenres.includes(g)) score += 9;
    else if (midGenres.includes(g)) score += 6;
    else if (lightGenres.includes(g)) score += 3;
    else score += 5; // Genre inconnu
    count++;
  });

  return Math.min(10, Math.max(0, Math.round(score / count)));
};
