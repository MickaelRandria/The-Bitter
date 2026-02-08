
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
    version: 'v0.73',
    date: 'Aujourd\'hui',
    title: 'Séries & Performance',
    changes: [
      { type: 'feature', text: '📺 Séries TV : Support complet (Recherche & Saisons)' },
      { type: 'style', text: '🚀 Performance : Optimisation de l\'affichage des cartes.' }
    ]
  },
  {
    version: 'v0.72',
    date: '06 Février 2026',
    title: 'Symbiose Sociale',
    changes: [
      { type: 'feature', text: 'Espaces Partagés : Créez des cercles privés (Ciné-club, Famille...), invitez vos amis via un code unique et construisez une cinémathèque commune. Comparez vos verdicts et visualisez votre "Match" de groupe.' },
      { type: 'fix', text: 'Authentification Blindée : Nouveau flux de vérification d\'email clair et synchronisation automatique du profil (Prénom, Calibration) entre tous vos appareils dès la connexion.' },
      { type: 'style', text: 'Stabilité Visuelle : Éradication des écrans blancs lors du chargement des espaces grâce à une gestion asynchrone optimisée.' },
      { type: 'feature', text: 'Onboarding Connecté : Votre identité est désormais préservée et synchronisée avec la base de données centrale.' }
    ]
  },
  {
    version: 'v0.71',
    date: '05 Février 2026',
    title: 'Deep Discovery',
    changes: [
      { type: 'feature', text: 'Fiches Films Immersives : Cliquez sur une affiche pour accéder au casting, synopsis et plateformes avant d\'ajouter.' },
      { type: 'style', text: 'Badges Contextuels : Repérez instantanément les films "Au Cinéma" ou sur vos plateformes dans l\'Explorateur.' },
      { type: 'fix', text: 'Protocole Watchlist : Correction critique du bug empêchant l\'ajout dans la liste "À Voir".' },
      { type: 'feature', text: 'Flux Unifié : Pré-sélection intelligente du statut (Vu/À voir) lors de la transition Découverte -> Collection.' }
    ]
  },
  {
    version: 'v0.70 test',
    date: '04 Février 2026',
    title: 'Intelligence Épurée',
    changes: [
      { type: 'feature', text: 'Ciné-Assistant IA : Votre expert personnel s\'appuyant sur gemini-3-flash-preview et Google Search pour des données temps réel.' },
      { type: 'feature', text: 'Flux Direct-to-Collection : Redirection automatique vers le Movie Deck après calibration.' },
      { type: 'style', text: 'AI Design System : Nettoyage complet des scories Markdown pour un rendu pur.' },
      { type: 'fix', text: 'Stabilité Mobile : Optimisation des appels API pour éviter les plantages sur smartphone.' }
    ]
  },
  {
    version: 'v0.69',
    date: '04 Février 2026',
    title: 'Vitesse Lumière',
    changes: [
      { type: 'style', text: 'Optimisation Critique : Fluidité augmentée (60 FPS) via GPU acceleration.' },
      { type: 'fix', text: 'Stabilité : Correction définitive du bug de suppression des comptes.' },
      { type: 'feature', text: 'Smart Loading : Implémentation du Lazy Loading pour les modules lourds.' }
    ]
  }
];
