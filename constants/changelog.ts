
export type ChangeType = 'feature' | 'fix' | 'style';

export interface ChangeEntry {
  type: ChangeType;
  text: string;
}

export interface Release {
  version: string;
  date: string;
  title: string;
  changes: ChangeEntry[];
}

export const RELEASE_HISTORY: Release[] = [
  {
    version: 'v0.70',
    date: '04 Février 2026',
    title: 'Intelligence Épurée',
    changes: [
      { type: 'feature', text: 'Ciné-Assistant IA : Votre expert personnel pour savoir quoi regarder ou répondre à toutes vos questions ciné, s\'appuyant sur votre profil d\'analyste unique.' },
      { type: 'feature', text: 'Flux Direct-to-Collection : Redirection automatique vers le Movie Deck après calibration pour une prise en main immédiate.' },
      { type: 'style', text: 'AI Design System : Adoption d\'un rendu HTML épuré (balises b) supprimant les scories visuelles du Markdown (**).' },
      { type: 'style', text: 'Nettoyage IA : Implémentation d\'un filtre de sécurité post-traitement garantissant l\'absence d\'astérisques dans toute l\'interface.' }
    ]
  },
  {
    version: 'v0.69',
    date: '04 Février 2026',
    title: 'Vitesse Lumière',
    changes: [
      { type: 'style', text: 'Optimisation Critique : Fluidité augmentée (60 FPS) via GPU acceleration et suppression des transitions CSS globales (transition-all).' },
      { type: 'fix', text: 'Stabilité : Correction définitive du bug de suppression des comptes/carnets de bord.' },
      { type: 'feature', text: 'Smart Loading : Implémentation du Lazy Loading pour les modules lourds et du debouncing pour une recherche instantanée sans ralentissement.' },
      { type: 'style', text: 'Navigation : Modernisation des durées d\'animation (300ms) pour une interface plus réactive.' }
    ]
  },
  {
    version: 'v0.68',
    date: '04 Février 2026',
    title: 'Focus & Clarté',
    changes: [
      { type: 'style', text: 'Refonte UI & UX : Nouveau système de notation multi-critères avec réglage par paliers (Steppers) pour plus de précision.' },
      { type: 'feature', text: 'Onboarding optimisé : Choix du mode de visionnage (Cinéma, Streaming ou les deux) et sélection des plateformes favorites dès l\'inscription.' },
      { type: 'fix', text: 'Simplification : Suppression de la question "Film de chevet" au profit de données de visionnage plus utiles.' },
      { type: 'fix', text: 'Focus Qualité : Retrait temporaire du partage Instagram Stories, le rendu visuel actuel ne répondant pas à nos standards d\'exigence.' }
    ]
  }
];
