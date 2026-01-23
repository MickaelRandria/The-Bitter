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

/**
 * Zone de brouillon pour les futurs changements non encore publiés
 */
export const PENDING_CHANGES: ChangeEntry[] = [];

/**
 * Historique des versions publiées
 */
export const RELEASE_HISTORY: Release[] = [
  {
    version: 'v0.4',
    date: '23 Janvier 2026',
    title: "L'Ère Native (PWA)",
    changes: [
      { type: 'feature', text: 'Transformation officielle en Progressive Web App (PWA). The Bitter s\'installe désormais sur votre écran d\'accueil sans passer par les stores.' },
      { type: 'style', text: 'Expérience "Standalone" : suppression de la barre d\'URL du navigateur et gestion immersive de la barre d\'état.' },
      { type: 'fix', text: 'Optimisation du Manifest : icônes adaptatives et définition de la couleur de thème "Cream" pour l\'intégration OS.' }
    ]
  },
  {
    version: 'v0.3',
    date: '23 Janvier 2026',
    title: "L'Expérience Visuelle",
    changes: [
      { type: 'feature', text: 'Nouvelle vue Calendrier immersive avec affichage en mosaïque dynamique.' },
      { type: 'feature', text: 'Gestion intelligente des "Piles" de films pour les visionnages multiples sur une même date.' },
      { type: 'feature', text: 'Logique temporelle avancée : distinction automatique et visuelle entre films "Vus" et séances "Prévues".' },
      { type: 'feature', text: 'Recherche intelligente par "Humeur" (Mood Picker) directement sur la page d\'accueil.' },
      { type: 'feature', text: 'Édito IA : Résumé analytique textuel généré mensuellement dans votre tableau de bord.' },
      { type: 'feature', text: 'Nouveaux graphiques de données : Standards de sévérité et analyse de Chronologie préférée.' },
      { type: 'style', text: 'Navigation "Floating Dock" : Menu flottant en bas d\'écran pour une ergonomie mobile optimisée.' },
      { type: 'style', text: 'En-têtes "Capsules" pour le calendrier et la gestion des onglets.' },
      { type: 'style', text: 'Harmonisation globale de l\'interface : nouveaux arrondis 4XL, ombres portées douces et blanc pur.' },
      { type: 'fix', text: 'Verrouillage de sécurité : impossibilité de saisir une date de visionnage antérieure à la sortie officielle d\'un film.' },
      { type: 'fix', text: 'Centralisation du bouton "Nouveau Film" au cœur du dock principal.' }
    ]
  },
  {
    version: 'v0.2',
    date: '22 Janvier 2026',
    title: 'Suivi & Précision',
    changes: [
      { type: 'feature', text: 'Déploiement du système de "Notes de Mise à Jour" pour la transparence utilisateur.' },
      { type: 'fix', text: 'Correction majeure du calendrier : les séances prévues s\'affichent désormais à la date programmée.' },
      { type: 'feature', text: 'Planification avancée : possibilité de définir une date précise pour les films en file d\'attente.' }
    ]
  },
  {
    version: 'v0.1',
    date: '20 Janvier 2026',
    title: 'Lancement Héritage',
    changes: [
      { type: 'feature', text: 'Création du noyau de l\'application The Bitter et du système d\'analyse Bento.' },
      { type: 'style', text: 'Identité visuelle basée sur la typographie Inter et des palettes organiques.' }
    ]
  }
];
