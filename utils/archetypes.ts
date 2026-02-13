
export interface ArchetypeResult {
  title: string;
  description: string;
  icon: string;
}

export const getArchetype = (severity: number, patience: number): ArchetypeResult => {
  // Matrice de décision
  
  // 1. Haute Sévérité (> 7)
  if (severity > 7) {
    if (patience > 7) {
      return {
        title: 'Esthète Radical',
        description: "La pureté artistique avant tout. Vous ne pardonnez aucune médiocrité, mais vous savez honorer les œuvres qui prennent leur temps pour atteindre la perfection.",
        icon: '💎'
      };
    } else if (patience < 4) {
      return {
        title: 'Censeur Efficace',
        description: "Impitoyable et direct. Vous exigez l'excellence immédiate. Le cinéma doit être une démonstration de maîtrise, sans gras ni temps mort.",
        icon: '⚖️'
      };
    }
  }

  // 2. Basse Sévérité (< 4)
  if (severity < 4) {
    if (patience > 7) {
      return {
        title: 'Explorateur Immersif',
        description: "Une bienveillance rare. Vous laissez à chaque œuvre le temps de s'installer et de vous convaincre. Vous cherchez le voyage avant la critique.",
        icon: '🔭'
      };
    } else if (patience < 4) {
      return {
        title: "Chercheur d'Intensité",
        description: "Le cinéma doit être une injection d'adrénaline ou d'émotion pure. Si le film ne vous attrape pas aux tripes, c'est terminé.",
        icon: '⚡'
      };
    }
  }

  // 3. Cas par défaut (Le milieu)
  return {
    title: 'Analyste Équilibré',
    description: "La voie de la raison. Vous cherchez l'harmonie entre le fond et la forme, capable d'apprécier la technique sans perdre de vue l'émotion.",
    icon: '🧠'
  };
};

export interface AdvancedArchetypeInput {
  vibes: {
    cerebral: number;   // moyenne /10
    emotion: number;
    fun: number;
    visuel: number;
    tension: number;
  };
  quality: {
    scenario: number;   // moyenne /10
    acting: number;
    visual: number;
    sound: number;
  };
  smartphone: number;   // moyenne 0-100
  topGenres: string[];  // top 3 genres par nb de films
  movieCount: number;
}

export interface AdvancedArchetypeResult {
  title: string;
  description: string;
  icon: string;        // emoji
  tag: string;         // mot-clé court uppercase
  secondaryTrait?: string; // trait secondaire optionnel
}

export const getAdvancedArchetype = (input: AdvancedArchetypeInput): AdvancedArchetypeResult => {
  const { vibes, quality, smartphone, topGenres, movieCount } = input;
  
  // Calcul du score dominant parmi les vibes
  const vibeEntries = Object.entries(vibes) as [string, number][];
  const dominantVibe = vibeEntries.reduce((a, b) => b[1] > a[1] ? b : a);
  const dominantVibeKey = dominantVibe[0];
  const dominantVibeValue = dominantVibe[1];
  
  // Calcul du critère qualité le plus valorisé
  const qualityEntries = Object.entries(quality) as [string, number][];
  const dominantQuality = qualityEntries.reduce((a, b) => b[1] > a[1] ? b : a);
  const dominantQualityKey = dominantQuality[0];
  
  // Score d'exigence (note moyenne de quality vs 5 = neutre)
  const avgQuality = (quality.scenario + quality.acting + quality.visual + quality.sound) / 4;
  const isExigeant = avgQuality >= 7;
  const isIndulgent = avgQuality <= 4;
  
  // Diversité des genres
  const genreCount = topGenres.length;
  
  // Addiction au téléphone
  const isDistrait = smartphone >= 40;
  const isImmersif = smartphone <= 10;
  
  // --- LOGIQUE DE CLASSIFICATION ---
  
  // 1. Ultra-spécialisés (vibe dominante très forte)
  if (dominantVibeValue >= 8) {
    if (dominantVibeKey === 'tension') {
      return {
        title: "L'Adrénaline Junkie",
        description: "Tu vis pour les montées de tension. Chaque film est un défi nerveux. Plus c'est intense, plus tu en redemandes.",
        icon: "🎢",
        tag: "HAUTE TENSION",
        secondaryTrait: isExigeant ? "Exigeant sur la mise en scène" : undefined
      };
    }
    if (dominantVibeKey === 'emotion') {
      return {
        title: "L'Éponge Émotionnelle",
        description: "Tu absorbes chaque émotion comme une éponge. Un bon film te ravage, et c'est exactement ce que tu cherches.",
        icon: "🥀",
        tag: "ÉMOTION PURE",
        secondaryTrait: isImmersif ? "Zéro distraction, immersion totale" : undefined
      };
    }
    if (dominantVibeKey === 'cerebral') {
      return {
        title: "Le Déchiffreur",
        description: "Chaque film est une énigme à résoudre. Tu décortiques les scénarios, cherches les symboles cachés, analyses les sous-textes.",
        icon: "🔍",
        tag: "CÉRÉBRAL",
        secondaryTrait: dominantQualityKey === 'scenario' ? "Obsédé par l'écriture" : undefined
      };
    }
    if (dominantVibeKey === 'fun') {
      return {
        title: "Le Hédoniste",
        description: "Le cinéma c'est du plaisir, point. Pas besoin de se prendre la tête, tu veux rire, vibrer, passer un bon moment.",
        icon: "🍿",
        tag: "PLAISIR BRUT",
        secondaryTrait: isDistrait ? "Multi-écrans assumé" : undefined
      };
    }
    if (dominantVibeKey === 'visuel') {
      return {
        title: "L'Œil Absolu",
        description: "La beauté visuelle te transcende. Un plan parfait vaut mille dialogues. Kubrick, Villeneuve, Wes Anderson sont ton temple.",
        icon: "👁️",
        tag: "ESTHÉTIQUE",
        secondaryTrait: dominantQualityKey === 'visual' ? "Cohérence totale vision/goût" : undefined
      };
    }
  }
  
  // 2. Profils croisés (combinaisons intéressantes)
  if (vibes.cerebral >= 7 && vibes.tension >= 7) {
    return {
      title: "Le Stratège Noir",
      description: "Tu aimes les films qui te font réfléchir ET qui te tiennent en haleine. Thrillers psychologiques, polars cérébraux — ton terrain de jeu.",
      icon: "🕵️",
      tag: "THRILLER CÉRÉBRAL",
      secondaryTrait: quality.scenario >= 7 ? "Scénario irréprochable exigé" : undefined
    };
  }
  
  if (vibes.emotion >= 7 && vibes.visuel >= 7) {
    return {
      title: "Le Romantique Visionnaire",
      description: "Tu veux que la beauté te frappe en plein cœur. Les films qui allient esthétique sublime et émotion profonde sont ta drogue.",
      icon: "🌅",
      tag: "POÉSIE VISUELLE"
    };
  }
  
  if (vibes.fun >= 7 && vibes.tension >= 6) {
    return {
      title: "Le Cascadeur",
      description: "Action, humour, adrénaline. Tu veux que chaque minute soit un spectacle. Le rythme c'est ta religion.",
      icon: "💥",
      tag: "SPECTACLE"
    };
  }
  
  if (vibes.cerebral >= 7 && vibes.emotion >= 6) {
    return {
      title: "Le Philosophe Sensible",
      description: "Tu veux comprendre ET ressentir. Les films qui provoquent autant de réflexion que d'émotion sont ceux qui te marquent à vie.",
      icon: "🎭",
      tag: "PROFONDEUR"
    };
  }
  
  // 3. Profils basés sur les quality metrics
  if (isExigeant && isImmersif) {
    return {
      title: "Le Puriste",
      description: "Standards élevés, immersion totale. Quand tu regardes un film, rien d'autre n'existe. Et il a intérêt à être à la hauteur.",
      icon: "💎",
      tag: "EXCELLENCE",
      secondaryTrait: `Expert en ${dominantQualityKey === 'scenario' ? 'écriture' : dominantQualityKey === 'acting' ? 'interprétation' : dominantQualityKey === 'visual' ? 'esthétique' : 'design sonore'}`
    };
  }
  
  if (isIndulgent && vibes.fun >= 6) {
    return {
      title: "Le Bon Vivant",
      description: "Tu trouves du bon partout. Ta bienveillance naturelle te permet de profiter de films que d'autres snobent. Le cinéma est une fête.",
      icon: "🎉",
      tag: "BIENVEILLANT"
    };
  }
  
  // 4. Profil basé sur la diversité
  if (genreCount >= 5 && movieCount >= 10) {
    return {
      title: "L'Omnivore",
      description: "Tu dévores tout. Horreur le lundi, comédie le mardi, drame le mercredi. Aucun genre ne t'échappe, c'est ta plus grande force.",
      icon: "🌍",
      tag: "ÉCLECTIQUE"
    };
  }
  
  // 5. Fallback intelligent
  const trait = dominantVibeKey === 'cerebral' ? 'cérébral' 
    : dominantVibeKey === 'emotion' ? 'émotionnel'
    : dominantVibeKey === 'fun' ? 'divertissant'
    : dominantVibeKey === 'visuel' ? 'visuel'
    : 'intense';
    
  return {
    title: "L'Analyste Équilibré",
    description: `Tes goûts sont nuancés et matures. Tu apprécies un peu de tout avec une légère tendance vers le cinéma ${trait}. Continue à noter pour affiner ton profil.`,
    icon: "🧠",
    tag: "VERSATILE"
  };
};
