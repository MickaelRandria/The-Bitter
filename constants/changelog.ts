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
    version: 'v0.89',
    date: '4 Août 2026',
    title: 'Visite guidée & Profil rangé',
    changes: [
      {
        type: 'feature',
        text: "Visite guidée à la création du profil. 17 étapes qui éclairent les vrais boutons de l'app, page par page, sans fausses données de démonstration. À chaque geste utile, c'est toi qui cliques et le tuto avance tout seul.",
      },
      {
        type: 'feature',
        text: "Parcours notation au premier ajout. 8 étapes consacrées aux critères et au mode Bitter+ : profil détecté d'après le genre, poids de chaque critère, critère spécifique au genre et note pondérée.",
      },
      {
        type: 'feature',
        text: 'Le tuto est proposé, jamais imposé. Une question avant de commencer, avec le nombre d’étapes et la durée annoncés. Relançable à tout moment depuis Profil puis Paramètres.',
      },
      {
        type: 'feature',
        text: 'Profil rangé. Toutes les options sont regroupées sous un bouton Paramètres repliable, et le retour au feed y a été déplacé pour dégager de la place dans le header.',
      },
      {
        type: 'style',
        text: '« Comment ça marche » devient « Les bonnes pratiques » et remonte au-dessus de l’import de données.',
      },
      {
        type: 'style',
        text: 'Textes resserrés dans toute l’application : phrases plus courtes, listes à puces plutôt que des pavés, et plus aucun tiret cadratin.',
      },
    ],
  },
  {
    version: 'v0.88',
    date: '3 Août 2026',
    title: 'Stories sur mesure & Analytics',
    changes: [
      {
        type: 'feature',
        text: "Weekly Recap personnalisable : choisis la semaine à raconter, puis sélectionne précisément le film à afficher dans chacun des trois cadres. Les emplacements secondaires peuvent aussi accueillir une statistique.",
      },
      {
        type: 'feature',
        text: "Tendance des notes enrichie : ouvre la tuile Analytics en grand et analyse la semaine passée, les 4 dernières semaines, tout l'historique ou une plage personnalisée. Les mois, trimestres et semestres les plus actifs sont classés selon le nombre de films notés.",
      },
      {
        type: 'style',
        text: "Weekly Story retravaillée : logo ajouté, titres en Inter Light et hiérarchie typographique renforcée entre le film principal, le deuxième et le troisième. Les notes restent l'élément le plus visible.",
      },
      {
        type: 'style',
        text: "Story Variante affinée : titre, logo, métadonnées, note principale, sous-notes et point vert sont mieux alignés. Le genre rejoint l'année et le réalisateur, tandis que le footer gagne en respiration.",
      },
      {
        type: 'fix',
        text: "Exports plus propres : suppression des séparateurs entre les sous-notes et du doublon de marque sur le film principal de la Weekly.",
      },
    ],
  },
  {
    version: 'v0.87',
    date: '2 Août 2026',
    title: 'Weekly Recap & Story Éditoriale',
    changes: [
      {
        type: 'feature',
        text: "Le Weekly Recap. Fais le bilan de ta semaine ciné ! Une toute nouvelle story générée sur mesure avec tes statistiques et les films que tu as vus (tu peux même choisir les stats à afficher en touchant l'écran). Disponible depuis l'onglet Calendrier.",
      },
      {
        type: 'feature',
        text: "Story Éditoriale (Bêta). Une nouvelle direction artistique plus sombre, plus immersive et digne d'une vraie affiche de cinéma pour partager tes notes. Au moment de partager, choisis entre le visuel Classique et la Variante.",
      },
      {
        type: 'fix',
        text: "Améliorations de l'interface. Correction de bugs gênants lors de la navigation (notamment la fermeture inattendue des menus) pour rendre l'expérience plus fluide.",
      },
    ],
  },
  {
    version: 'v0.86',
    date: '1 Août 2026',
    title: '100% Local & Nouvel Onboarding',
    changes: [
      {
        type: 'feature',
        text: "Plus de compte. En attendant que la synchronisation soit au point, The Bitter fonctionne entièrement sans compte : ta collection reste sur ton appareil, sans serveur ni inscription.",
      },
      {
        type: 'feature',
        text: "« Comment ça marche ». Un nouveau guide en 3 écrans t'explique où vivent tes données, pourquoi éviter la navigation privée, et comment installer l'app sur ton écran d'accueil (iPhone et Android). Accessible dès l'accueil et depuis ton profil.",
      },
      {
        type: 'fix',
        text: "Profil local. L'écran de connexion a été retiré du parcours. Le profil affiche désormais « Profil local » à la place du statut de compte invité.",
      },
    ],
  },
  {
    version: 'v0.85',
    date: '1 Août 2026',
    title: 'Performance, Cohérence & Accessibilité',
    changes: [
      {
        type: 'fix',
        text: 'Chargement allégé. Tailwind est désormais compilé au build au lieu d\'être chargé depuis un CDN, et les outils de mesure d\'audience ne sont téléchargés qu\'après ton consentement. Environ 180 Ko de moins au premier chargement, et les affiches sont demandées à la taille réellement affichée.',
      },
      {
        type: 'fix',
        text: 'Des chiffres qui concordent. Le nombre d\'heures visionnées et le genre favori étaient calculés différemment selon l\'écran. Feed, statistiques et profil affichent maintenant la même valeur.',
      },
      {
        type: 'fix',
        text: 'Pluriels et signes. Correction d\'un bug d\'affichage qui laissait apparaître « {s} » dans les textes, du signe manquant sur ta déception vs TMDB, et des mois « juin » et « juillet » devenus indistinguables sur les graphiques.',
      },
      {
        type: 'feature',
        text: 'Ambiances fiables. Le 5ᵉ axe « Visuel » est enfin saisissable au moment de noter. Le radar ADN et les moods restent verrouillés tant que trop peu de films ont une ambiance renseignée, au lieu d\'afficher un profil neutre inventé. Sélectionner un mood filtre désormais réellement ta file d\'attente.',
      },
      {
        type: 'feature',
        text: 'File d\'attente plus lisible, « Ce soir ? » remonte en haut de l\'onglet À voir, et les statistiques affichées concernent la file (films, durée totale, temps d\'attente) plutôt que les films déjà vus.',
      },
      {
        type: 'feature',
        text: 'Accessibilité. Libellés sur toute la navigation, fermeture au clavier et focus correctement piégé dans les fenêtres, vignettes Discover atteignables au clavier. Le classement des genres tient compte du nombre de films vus.',
      },
      {
        type: 'style',
        text: 'Nouveautés en un écran. La présentation des nouveautés ne fait plus défiler cinq étapes : tout est listé d\'un coup, avec une croix dès l\'ouverture et un « ne plus afficher » qui tient vraiment.',
      },
      {
        type: 'style',
        text: 'Cohérence éditoriale. L\'application te tutoie partout. Le calendrier et l\'écran de connexion sont enfin traduits en anglais, et le sélecteur de langue est accessible dès le premier écran.',
      },
    ],
  },
  {
    version: 'v0.84',
    date: '28 Mars 2026',
    title: 'Feedback, Recos & Optimisations',
    changes: [
      {
        type: 'feature',
        text: 'Feedback intégré. Un bouton 💬 dans la navbar te permet de signaler un bug, proposer une amélioration ou envoyer un message directement à l\'équipe. Tes retours nous sont précieux pour faire évoluer l\'app.',
      },
      {
        type: 'feature',
        text: 'Recos Perso. Un widget intelligent analyse tes 10 films les mieux notés pour te suggérer des œuvres qui correspondent vraiment à tes goûts. Mode "Par film" disponible aussi.',
      },
      {
        type: 'feature',
        text: 'Version anglaise. L\'application est désormais disponible en anglais. Bascule entre FR et EN depuis le header.',
      },
      {
        type: 'fix',
        text: 'Optimisation du code. Pagination du feed (20 films par page), debounce sur les filtres Discover, recalcul automatique de l\'archétype à chaque ajout de film (≥ 10 vus), et sécurisation des clés API.',
      },
      {
        type: 'fix',
        text: 'Dark mode complet. Les écrans de connexion, d\'inscription et de création de profil sont maintenant entièrement compatibles dark mode.',
      },
    ],
  },
  {
    version: 'v0.82',
    date: '23 Mars 2026',
    title: 'Notifications & Reminders',
    changes: [
      {
        type: 'feature',
        text: '🔔 Centre de notifications. Cloche dans le header avec badge non-lu : streak, récap hebdo, rappel watchlist, stats mensuelles.',
      },
      {
        type: 'feature',
        text: 'Préférences granulaires. Active ou désactive chaque type de notif individuellement depuis ton profil.',
      },
      {
        type: 'feature',
        text: 'Notif test. Envoie immédiatement une notification navigateur (films vus cette semaine) depuis le profil.',
      },
      {
        type: 'feature',
        text: 'Recherche globale étendue. Titre, réalisateur, acteurs et genre avec raccourci ⌘K.',
      },
      {
        type: 'feature',
        text: 'Filtres avancés. Slider note minimum et plage d\'années dans le feed.',
      },
      {
        type: 'fix',
        text: 'Qualité code : types stricts, cache TMDB 5 min, guards DEV pour les logs.',
      },
    ],
  },
  {
    version: 'v0.81',
    date: '15 Mars 2026',
    title: 'Calendrier, Analytics & Feed',
    changes: [
      {
        type: 'feature',
        text: 'Calendrier : Streak hebdomadaire. un compteur de semaines consécutives avec au moins 1 film vu, et ton record personnel.',
      },
      {
        type: 'feature',
        text: 'Calendrier : Vue annuelle (heatmap). bascule entre la grille mensuelle et une vue 12 mois colorée par intensité (clic sur un mois pour y revenir).',
      },
      {
        type: 'feature',
        text: "Calendrier : Filtre par genre. chips scrollables pour n'afficher que les jours d'un genre précis dans le mois courant.",
      },
      {
        type: 'feature',
        text: 'Analytics : Partage de ton archétype. bouton "Partager" dans l\'onglet Profil pour générer une carte image (PNG) à envoyer sur Instagram ou à télécharger.',
      },
      {
        type: 'feature',
        text: "Analytics : Tendance des notes semaine par semaine. courbe SVG sur 26 semaines glissantes dans l'onglet Goûts, avec indicateur de progression (hausse / baisse).",
      },
      {
        type: 'feature',
        text: 'Feed : Bandeau "Ta collection". films vus, note moyenne et heures totales en un coup d\'œil au-dessus des onglets.',
      },
      {
        type: 'feature',
        text: "Feed : Compteurs dans les onglets. le nombre de films s'affiche directement dans Vu (n) et À voir (n).",
      },
      {
        type: 'feature',
        text: "Feed : Filtre par genre sur l'onglet Vu. chips scrollables identiques à celles de la watchlist.",
      },
      {
        type: 'feature',
        text: 'Feed : Bouton "Surprise ?" sur l\'onglet Vu. tire un film au hasard dans ta collection pour une séance de redécouverte.',
      },
    ],
  },
  {
    version: 'v0.80',
    date: '14 Mars 2026',
    title: 'Parcours Client',
    changes: [
      {
        type: 'fix',
        text: "Sécurité : Les réponses de l'IA sont désormais sanitisées avant affichage (protection XSS via DOMPurify).",
      },
      {
        type: 'fix',
        text: "Erreurs visibles : TMDB indisponible, ajout collab échoué ou Discover vide. l'app t'informe maintenant via un toast au lieu de rester silencieuse.",
      },
      {
        type: 'feature',
        text: 'Empty states : Watchlist vide et feed filtré à 0 résultat affichent désormais un message clair avec un bouton pour effacer les filtres.',
      },
      {
        type: 'fix',
        text: 'Onboarding : Bouton "Retour" ajouté entre chaque étape du calibrage. plus de blocage si tu veux corriger une réponse.',
      },
      {
        type: 'style',
        text: "Mode Collab : Les confirmations (quitter un espace, supprimer un film, marquer comme vu) utilisent désormais des modales cohérentes avec le design de l'app.",
      },
      {
        type: 'feature',
        text: "Connexion : Le champ mot de passe dispose maintenant d'un bouton pour afficher / masquer la saisie.",
      },
      {
        type: 'feature',
        text: 'Profil : Le widget de complétion détaille exactement les champs manquants (ex : "Manque : Genres · Archétype").',
      },
      {
        type: 'fix',
        text: "Thème : L'app détecte automatiquement la préférence dark/light de ton système au premier lancement.",
      },
      {
        type: 'feature',
        text: "Analytics : Nouveau graphique d'activité sur les 12 derniers mois dans l'onglet Profil.",
      },
      {
        type: 'feature',
        text: 'Export : Bouton "Exporter mes données" dans ton profil pour sauvegarder ta collection en JSON.',
      },
    ],
  },
  {
    version: 'v0.79',
    date: "Aujourd'hui",
    title: 'Focus Réalisateurs',
    changes: [
      {
        type: 'feature',
        text: "Navigation Réalisateur : Cliquez sur le nom d'un réalisateur pour explorer ses 10 meilleurs films (triés par note et popularité).",
      },
      {
        type: 'feature',
        text: 'Modal Brutaliste : Une nouvelle interface sombre et typographique pour découvrir la filmographie des créateurs.',
      },
      {
        type: 'style',
        text: 'Exploration Fluide : Accès direct aux films du réalisateur depuis les cartes, les détails ou les statistiques favorites.',
      },
    ],
  },
  {
    version: 'v0.78',
    date: "Aujourd'hui",
    title: 'Visualisation & ADN',
    changes: [
      {
        type: 'feature',
        text: 'Distribution des Notes : Nouvel histogramme de tes moyennes globales par film, coloré par sévérité (orange ≤ 3 · gris 4-7 · vert ≥ 8).',
      },
      {
        type: 'feature',
        text: "Radar Chart ADN : Tes vibes (Cérébral, Tension, Fun, Visuel, Émotion) sont désormais visualisées via un graphique en toile d'araignée (pentagone) pour un profil psychologique immédiat.",
      },
      {
        type: 'style',
        text: 'Résumé de Sévérité : Comptage rapide Sévère / Moyen / Généreux ajouté en pied de bloc Distribution.',
      },
    ],
  },
  {
    version: 'v0.77',
    date: "Aujourd'hui",
    title: 'Fluidité & Sécurité',
    changes: [
      {
        type: 'feature',
        text: "Suppression Annulable : Une erreur de manipulation ? Vous avez maintenant 4 secondes pour annuler la suppression d'un film via le toast.",
      },
      {
        type: 'feature',
        text: 'Flux Watchlist : Passez un film de "À voir" à "Vu" en un clic via le bouton Play sur la carte ou l\'action rapide "J\'ai vu ça".',
      },
      {
        type: 'style',
        text: "Déconnexion Immersive : Adieu l'alerte système native, place à une bottom sheet élégante pour confirmer la sortie.",
      },
    ],
  },
  {
    version: 'v0.76.5',
    date: '15 Février 2026',
    title: 'Ton Profil, Enfin',
    changes: [
      {
        type: 'feature',
        text: "Page Profil : Accède à ton identité complète depuis l'avatar en haut à droite. archétype, stats clés, genres favoris et indices de calibration.",
      },
      {
        type: 'feature',
        text: "Archétype Contextuel : Le profil affiche si ton archétype est encore Provisoire (< 10 films) ou Confirmé, avec l'icône et la description associées.",
      },
      {
        type: 'feature',
        text: "Stats Synthétiques : Films vus, heures de cinéma, note moyenne personnelle et genre dominant regroupés en un coup d'œil.",
      },
      {
        type: 'style',
        text: 'Header Épuré : Le header passe à 3 actions. Thème, Espaces, Profil. Les options secondaires (tutoriel, déconnexion) vivent désormais dans la page Profil.',
      },
      {
        type: 'style',
        text: 'Avatar Initiales : Le bouton profil affiche maintenant ta première initiale pour un repère visuel immédiat.',
      },
    ],
  },
  {
    version: 'v0.76.2',
    date: '14 Février 2026',
    title: 'Obscurité & Identité',
    changes: [
      {
        type: 'style',
        text: 'Mode Sombre : Activez le thème sombre directement depuis le header pour vos séances nocturnes.',
      },
      {
        type: 'feature',
        text: 'Archétypes Dynamiques : Le système a été retravaillé pour accorder à chacun son profil précisément en fonction des notes et ressentis.',
      },
    ],
  },
  {
    version: 'v0.76',
    date: '14 Février 2026',
    title: 'Améliorations & Expérience',
    changes: [
      {
        type: 'feature',
        text: 'Watchlist Améliorée : Filtre par genre et bouton "Ce soir ?" pour choisir un film au hasard dans ta liste.',
      },
      {
        type: 'feature',
        text: 'Swipe Actions : Glisse vers la gauche pour supprimer, vers la droite pour éditer une carte film.',
      },
      {
        type: 'feature',
        text: 'Archétypes V3 : 13 profils cinéphiles enrichis basés sur tes vibes, tes notes et tes habitudes.',
      },
      {
        type: 'feature',
        text: 'Édition Rapide : Modifie un film sans repasser par la recherche TMDB.',
      },
      {
        type: 'style',
        text: 'Cache Discover : Les résultats sont mémorisés 5 minutes pour une navigation instantanée.',
      },
      {
        type: 'style',
        text: 'Toast de Confirmation : Un message visuel apparaît après chaque ajout ou modification.',
      },
      {
        type: 'style',
        text: 'Seuil Analytics : Un minimum de 5 films est requis pour afficher les statistiques détaillées.',
      },
      {
        type: 'fix',
        text: 'Sécurisation API : Les clés sensibles ne sont plus exposées côté navigateur.',
      },
      {
        type: 'fix',
        text: "Bouton + : Respecte maintenant l'onglet actif (Vu ou À voir) pour le statut par défaut.",
      },
    ],
  },
  {
    version: 'v0.75.5',
    date: '12 Février 2026',
    title: 'Restructuration Analytics',
    changes: [
      {
        type: 'style',
        text: '📑 Navigation Repensée : "Mon Profil" (ex-Overview), "Mes Goûts" (ex-Notes) et "Mon ADN" (ex-Psycho).',
      },
      {
        type: 'feature',
        text: "👤 Profil Enrichi : L'Archétype (6 nouveaux profils) devient la carte Hero. Ajout du compteur d'heures visionnées (uniquement films).",
      },
      {
        type: 'style',
        text: '⚖️ Jauge de Sévérité : Le comparatif TMDB est simplifié en un curseur "Sévère ↔ Généreux".',
      },
      {
        type: 'feature',
        text: '🧬 ADN Contextuel : Phrases descriptives pour chaque jauge et encart "Concentration" dédié pour le Smartphone Factor.',
      },
      {
        type: 'fix',
        text: '🧹 Nettoyage : Suppression des statistiques complexes (Corrélations, Écart-type) pour plus de lisibilité.',
      },
    ],
  },
  {
    version: 'v0.75',
    date: '10 Février 2026',
    title: 'DataViz & Chronologie',
    changes: [
      {
        type: 'feature',
        text: '📊 Analytics Étendues : Nouvel onglet "Mes Notes" incluant l\'analyse des corrélations (ex: Scénario vs Jeu) et vos genres les mieux notés.',
      },
      {
        type: 'fix',
        text: "📅 Maître du Temps : Le sélecteur de date est de retour ! Vous pouvez à nouveau spécifier le jour exact du visionnage lors de l'ajout ou de l'édition.",
      },
      {
        type: 'feature',
        text: '🏆 Comparatif Mondial : Comparez votre sévérité par rapport à la moyenne globale TMDB. Êtes-vous plus généreux que le reste du monde ?',
      },
      {
        type: 'style',
        text: '📉 Films Polarisants : Mise en lumière des œuvres qui divisent vos propres critères (ex: Visuel 10/10 mais Scénario 4/10).',
      },
    ],
  },
  {
    version: 'v0.74.5',
    date: '09 Février 2026',
    title: 'Espaces : Consolidation',
    changes: [
      {
        type: 'feature',
        text: "👤 Fiches Profils : Cliquez sur un membre pour consulter sa carte d'identité (Rôle, Bio, Statut) sans quitter l'espace.",
      },
      {
        type: 'fix',
        text: "🛡️ Départ Sécurisé : Quitter un espace est désormais une action non-destructive (Soft Delete), préservant l'intégrité de la base de données.",
      },
      {
        type: 'fix',
        text: "👻 Filtrage Actif : Les membres ayant quitté un espace n'apparaissent plus, ni dans la liste des participants, ni dans le calcul des votes.",
      },
      {
        type: 'style',
        text: "⚡ Flux Instantané : L'interface se met à jour immédiatement lors du départ d'un groupe, sans latence ni rechargement.",
      },
    ],
  },
  {
    version: 'v0.74',
    date: '08 Février 2026',
    title: 'Consensus & Collectif',
    changes: [
      {
        type: 'feature',
        text: '🍿 Watchlist Collective : Un nouvel onglet "À voir" dans vos espaces pour centraliser les suggestions du groupe.',
      },
      {
        type: 'feature',
        text: '🔥 Système d\'intérêt : Votez "Je veux voir" sur les suggestions. Les films les plus plébiscités remontent automatiquement en haut de liste.',
      },
      {
        type: 'feature',
        text: '✅ Cycle de Visionnage : Bouton "Marquer comme vu" pour basculer instantanément un film de la Watchlist vers l\'Historique commun.',
      },
      {
        type: 'feature',
        text: '🚪 Liberté de mouvement : Ajout de la fonctionnalité "Quitter l\'espace" pour gérer plus finement vos cercles de partage.',
      },
      {
        type: 'style',
        text: "📊 Jauge d'adhésion : Visualisez en un coup d'œil le pourcentage de membres intéressés par une œuvre.",
      },
      {
        type: 'fix',
        text: "🧹 Nettoyage simplifié : Possibilité de supprimer les suggestions ou les erreurs directement depuis l'espace partagé.",
      },
    ],
  },
  {
    version: 'v0.73',
    date: '07 Février 2026',
    title: 'Séries & Stories',
    changes: [
      {
        type: 'feature',
        text: '🔍 Découverte Avancée : Filtres par période (Mois, Année, Tout) pour explorer le catalogue avec précision.',
      },
      {
        type: 'feature',
        text: "📺 Séries TV : Support complet (Recherche, Saisons & Détails) dans l'Explorateur et la Collection.",
      },
      {
        type: 'feature',
        text: '📸 Partage Story (Beta) : Générez une carte de verdict esthétique pour Instagram directement depuis vos films vus.',
      },
      {
        type: 'fix',
        text: "🧠 Persistance de Session : L'application se souvient de votre dernier profil actif (Invité ou Mail) au démarrage.",
      },
      {
        type: 'style',
        text: '🚀 Performance : Optimisation massive de la fluidité des listes et du moteur de rendu.',
      },
    ],
  },
  {
    version: 'v0.72',
    date: '06 Février 2026',
    title: 'Symbiose Sociale',
    changes: [
      {
        type: 'feature',
        text: 'Espaces Partagés : Créez des cercles privés (Ciné-club, Famille...), invitez vos amis via un code unique.',
      },
      {
        type: 'fix',
        text: "Authentification Blindée : Nouveau flux de vérification d'email clair et synchronisation automatique du profil.",
      },
      {
        type: 'style',
        text: 'Stabilité Visuelle : Éradication des écrans blancs lors du chargement des espaces.',
      },
      {
        type: 'feature',
        text: 'Onboarding Connecté : Votre identité est désormais préservée et synchronisée.',
      },
    ],
  },
  {
    version: 'v0.71',
    date: '05 Février 2026',
    title: 'Deep Discovery',
    changes: [
      {
        type: 'feature',
        text: 'Fiches Films Immersives : Cliquez sur une affiche pour accéder au casting, synopsis et plateformes.',
      },
      {
        type: 'style',
        text: 'Badges Contextuels : Repérez instantanément les films "Au Cinéma" ou sur vos plateformes.',
      },
      {
        type: 'fix',
        text: 'Protocole Watchlist : Correction critique du bug empêchant l\'ajout dans la liste "À Voir".',
      },
    ],
  },
];
