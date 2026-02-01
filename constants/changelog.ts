
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
    version: 'v0.67',
    date: '01 Février 2026',
    title: 'Swiss Polish',
    changes: [
      { type: 'fix', text: 'Story Generator : Correction du crash critique lié à la récupération des genres (TypeError).' },
      { type: 'style', text: 'Swiss Modern : Finalisation du template de Story (Affiche Full Bleed & Typographie Néon).' }
    ]
  },
  {
    version: 'v0.66',
    date: '30 Janvier 2026',
    title: 'Social Share',
    changes: [
      { type: 'feature', text: 'Instagram Stories : Partagez votre ADN cinéphile avec une carte générée au design Swiss Modern.' },
      { type: 'fix', text: 'Export Image : Correction du bug de génération d\'image vide sur certains appareils mobiles.' }
    ]
  },
  {
    version: 'v0.65',
    date: '29 Janvier 2026',
    title: 'Swiss Modern Update',
    changes: [
      { type: 'style', text: 'Refonte Swiss Modern : Nouvelle page d\'accueil audacieuse en grille "Bento", typographie massive et design Noir & Lime.' },
      { type: 'feature', text: 'Discovery V2 : Logos officiels des plateformes de streaming, filtrage régional strict (France) et dates de sortie précises.' },
      { type: 'feature', text: 'Movie Deck : Interface de notation rapide "Judge or Skip" pour calibrer votre profil en quelques secondes.' },
      { type: 'style', text: 'Dock Navigation : Nouvelle barre de navigation flottante et minimaliste en bas d\'écran.' }
    ]
  },
  {
    version: 'v0.6',
    date: '27 Janvier 2026',
    title: 'Privacy First',
    changes: [
      { type: 'feature', text: 'Conformité RGPD totale : Passage à une politique "Strict Opt-in". Les outils d\'analyse ne s\'activent désormais qu\'après votre consentement explicite.' },
      { type: 'style', text: 'Bannière de Cookies : Nouvelle interface discrète en bas d\'écran, respectant la charte graphique, pour gérer vos préférences de confidentialité.' },
      { type: 'fix', text: 'Stabilité : Correction des erreurs d\'initialisation des variables d\'environnement pour Google Analytics et PostHog.' }
    ]
  },
  {
    version: 'v0.5',
    date: '26 Janvier 2026',
    title: 'L\'Update "Miroir"',
    changes: [
      { type: 'feature', text: 'Calibration de l\'Analyste : Nouveau module d\'Onboarding définissant votre profil psychologique (Sévérité, Patience) et votre Archétype unique (ex: "Censeur Efficace").' },
      { type: 'feature', text: 'Vue "Miroir" : Confrontation entre votre profil déclaré et la réalité de vos notes. Analyse des indices de Crédibilité, de Déception et de Distraction.' },
      { type: 'feature', text: 'Saisie "Bitter Mode" : Refonte de la saisie avec distinction Note Technique / Expérience Ressentie. Ajout du "Smartphone Factor" et des "Symptômes Physiques".' },
      { type: 'feature', text: 'Recommandations Contextuelles : Nouveau bouton "✨" sur les cartes pour générer des suggestions ciblées via l\'IA TMDB.' },
      { type: 'style', text: 'Mobile Experience : Immersion tactile avec retours haptiques complets et Badge de notification natif pour la file d\'attente.' }
    ]
  }
];
