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