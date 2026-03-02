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
    version: 'v0.79',
    date: 'Aujourd\'hui',
    title: 'Focus Réalisateurs',
    changes: [
      { type: 'feature', text: 'Navigation Réalisateur : Cliquez sur le nom d\'un réalisateur pour explorer ses 10 meilleurs films (triés par note et popularité).' },
      { type: 'feature', text: 'Modal Brutaliste : Une nouvelle interface sombre et typographique pour découvrir la filmographie des créateurs.' },
      { type: 'style', text: 'Exploration Fluide : Accès direct aux films du réalisateur depuis les cartes, les détails ou les statistiques favorites.' }
    ]
  },
  {
    version: 'v0.78',
    date: 'Aujourd\'hui',
    title: 'Visualisation & ADN',
    changes: [
      { type: 'feature', text: 'Distribution des Notes : Nouvel histogramme de tes moyennes globales par film, coloré par sévérité (orange ≤ 3 · gris 4-7 · vert ≥ 8).' },
      { type: 'feature', text: 'Radar Chart ADN : Tes vibes (Cérébral, Tension, Fun, Visuel, Émotion) sont désormais visualisées via un graphique en toile d\'araignée (pentagone) pour un profil psychologique immédiat.' },
      { type: 'style', text: 'Résumé de Sévérité : Comptage rapide Sévère / Moyen / Généreux ajouté en pied de bloc Distribution.' }
    ]
  },
  {
    version: 'v0.77',
    date: 'Aujourd\'hui',
    title: 'Fluidité & Sécurité',
    changes: [
      { type: 'feature', text: 'Suppression Annulable : Une erreur de manipulation ? Vous avez maintenant 4 secondes pour annuler la suppression d\'un film via le toast.' },
      { type: 'feature', text: 'Flux Watchlist : Passez un film de "À voir" à "Vu" en un clic via le bouton Play sur la carte ou l\'action rapide "J\'ai vu ça".' },
      { type: 'style', text: 'Déconnexion Immersive : Adieu l\'alerte système native, place à une bottom sheet élégante pour confirmer la sortie.' }
    ]
  },
  {
    version: 'v0.76.5',
    date: '15 Février 2026',
    title: 'Ton Profil, Enfin',
    changes: [
      { type: 'feature', text: 'Page Profil : Accède à ton identité complète depuis l\'avatar en haut à droite — archétype, stats clés, genres favoris et indices de calibration.' },
      { type: 'feature', text: 'Archétype Contextuel : Le profil affiche si ton archétype est encore Provisoire (< 10 films) ou Confirmé, avec l\'icône et la description associées.' },
      { type: 'feature', text: 'Stats Synthétiques : Films vus, heures de cinéma, note moyenne personnelle et genre dominant regroupés en un coup d\'œil.' },
      { type: 'style', text: 'Header Épuré : Le header passe à 3 actions — Thème, Espaces, Profil. Les options secondaires (tutoriel, déconnexion) vivent désormais dans la page Profil.' },
      { type: 'style', text: 'Avatar Initiales : Le bouton profil affiche maintenant ta première initiale pour un repère visuel immédiat.' }
    ]
  },
  {
    version: 'v0.76.2',
    date: '14 Février 2026',
    title: 'Obscurité & Identité',
    changes: [
      { type: 'style', text: 'Mode Sombre : Activez le thème sombre directement depuis le header pour vos séances nocturnes.' },
      { type: 'feature', text: 'Archétypes Dynamiques : Le système a été retravaillé pour accorder à chacun son profil précisément en fonction des notes et ressentis.' }
    ]
  },
  {
    version: 'v0.76',
    date: '14 Février 2026',
    title: 'Améliorations & Expérience',
    changes: [
      { type: 'feature', text: 'Watchlist Améliorée : Filtre par genre et bouton "Ce soir ?" pour choisir un film au hasard dans ta liste.' },
      { type: 'feature', text: 'Swipe Actions : Glisse vers la gauche pour supprimer, vers la droite pour éditer une carte film.' },
      { type: 'feature', text: 'Archétypes V3 : 13 profils cinéphiles enrichis basés sur tes vibes, tes notes et tes habitudes.' },
      { type: 'feature', text: 'Édition Rapide : Modifie un film sans repasser par la recherche TMDB.' },
      { type: 'style', text: 'Cache Discover : Les résultats sont mémorisés 5 minutes pour une navigation instantanée.' },
      { type: 'style', text: 'Toast de Confirmation : Un message visuel apparaît après chaque ajout ou modification.' },
      { type: 'style', text: 'Seuil Analytics : Un minimum de 5 films est requis pour afficher les statistiques détaillées.' },
      { type: 'fix', text: 'Sécurisation API : Les clés sensibles ne sont plus exposées côté navigateur.' },
      { type: 'fix', text: 'Bouton + : Respecte maintenant l\'onglet actif (Vu ou À voir) pour le statut par défaut.' }
    ]
  },
  {
    version: 'v0.75.5',
    date: '12 Février 2026',
    title: 'Restructuration Analytics',
    changes: [
      { type: 'style', text: '📑 Navigation Repensée : "Mon Profil" (ex-Overview), "Mes Goûts" (ex-Notes) et "Mon ADN" (ex-Psycho).' },
      { type: 'feature', text: '👤 Profil Enrichi : L\'Archétype (6 nouveaux profils) devient la carte Hero. Ajout du compteur d\'heures visionnées (uniquement films).' },
      { type: 'style', text: '⚖️ Jauge de Sévérité : Le comparatif TMDB est simplifié en un curseur "Sévère ↔ Généreux".' },
      { type: 'feature', text: '🧬 ADN Contextuel : Phrases descriptives pour chaque jauge et encart "Concentration" dédié pour le Smartphone Factor.' },
      { type: 'fix', text: '🧹 Nettoyage : Suppression des statistiques complexes (Corrélations, Écart-type) pour plus de lisibilité.' }
    ]
  },
  {
    version: 'v0.75',
    date: '10 Février 2026',
    title: 'DataViz & Chronologie',
    changes: [
      { type: 'feature', text: '📊 Analytics Étendues : Nouvel onglet "Mes Notes" incluant l\'analyse des corrélations (ex: Scénario vs Jeu) et vos genres les mieux notés.' },
      { type: 'fix', text: '📅 Maître du Temps : Le sélecteur de date est de retour ! Vous pouvez à nouveau spécifier le jour exact du visionnage lors de l\'ajout ou de l\'édition.' },
      { type: 'feature', text: '🏆 Comparatif Mondial : Comparez votre sévérité par rapport à la moyenne globale TMDB. Êtes-vous plus généreux que le reste du monde ?' },
      { type: 'style', text: '📉 Films Polarisants : Mise en lumière des œuvres qui divisent vos propres critères (ex: Visuel 10/10 mais Scénario 4/10).' }
    ]
  },
  {
    version: 'v0.74.5',
    date: '09 Février 2026',
    title: 'Espaces : Consolidation',
    changes: [
      { type: 'feature', text: '👤 Fiches Profils : Cliquez sur un membre pour consulter sa carte d\'identité (Rôle, Bio, Statut) sans quitter l\'espace.' },
      { type: 'fix', text: '🛡️ Départ Sécurisé : Quitter un espace est désormais une action non-destructive (Soft Delete), préservant l\'intégrité de la base de données.' },
      { type: 'fix', text: '👻 Filtrage Actif : Les membres ayant quitté un espace n\'apparaissent plus, ni dans la liste des participants, ni dans le calcul des votes.' },
      { type: 'style', text: '⚡ Flux Instantané : L\'interface se met à jour immédiatement lors du départ d\'un groupe, sans latence ni rechargement.' }
    ]
  },
  {
    version: 'v0.74',
    date: '08 Février 2026',
    title: 'Consensus & Collectif',
    changes: [
      { type: 'feature', text: '🍿 Watchlist Collective : Un nouvel onglet "À voir" dans vos espaces pour centraliser les suggestions du groupe.' },
      { type: 'feature', text: '🔥 Système d\'intérêt : Votez "Je veux voir" sur les suggestions. Les films les plus plébiscités remontent automatiquement en haut de liste.' },
      { type: 'feature', text: '✅ Cycle de Visionnage : Bouton "Marquer comme vu" pour basculer instantanément un film de la Watchlist vers l\'Historique commun.' },
      { type: 'feature', text: '🚪 Liberté de mouvement : Ajout de la fonctionnalité "Quitter l\'espace" pour gérer plus finement vos cercles de partage.' },
      { type: 'style', text: '📊 Jauge d\'adhésion : Visualisez en un coup d\'œil le pourcentage de membres intéressés par une œuvre.' },
      { type: 'fix', text: '🧹 Nettoyage simplifié : Possibilité de supprimer les suggestions ou les erreurs directement depuis l\'espace partagé.' }
    ]
  },
  {
    version: 'v0.73',
    date: '07 Février 2026',
    title: 'Séries & Stories',
    changes: [
      { type: 'feature', text: '🔍 Découverte Avancée : Filtres par période (Mois, Année, Tout) pour explorer le catalogue avec précision.' },
      { type: 'feature', text: '📺 Séries TV : Support complet (Recherche, Saisons & Détails) dans l\'Explorateur et la Collection.' },
      { type: 'feature', text: '📸 Partage Story (Beta) : Générez une carte de verdict esthétique pour Instagram directement depuis vos films vus.' },
      { type: 'fix', text: '🧠 Persistance de Session : L\'application se souvient de votre dernier profil actif (Invité ou Mail) au démarrage.' },
      { type: 'style', text: '🚀 Performance : Optimisation massive de la fluidité des listes et du moteur de rendu.' }
    ]
  },
  {
    version: 'v0.72',
    date: '06 Février 2026',
    title: 'Symbiose Sociale',
    changes: [
      { type: 'feature', text: 'Espaces Partagés : Créez des cercles privés (Ciné-club, Famille...), invitez vos amis via un code unique.' },
      { type: 'fix', text: 'Authentification Blindée : Nouveau flux de vérification d\'email clair et synchronisation automatique du profil.' },
      { type: 'style', text: 'Stabilité Visuelle : Éradication des écrans blancs lors du chargement des espaces.' },
      { type: 'feature', text: 'Onboarding Connecté : Votre identité est désormais préservée et synchronisée.' }
    ]
  },
  {
    version: 'v0.71',
    date: '05 Février 2026',
    title: 'Deep Discovery',
    changes: [
      { type: 'feature', text: 'Fiches Films Immersives : Cliquez sur une affiche pour accéder au casting, synopsis et plateformes.' },
      { type: 'style', text: 'Badges Contextuels : Repérez instantanément les films "Au Cinéma" ou sur vos plateformes.' },
      { type: 'fix', text: 'Protocole Watchlist : Correction critique du bug empêchant l\'ajout dans la liste "À Voir".' }
    ]
  }
];