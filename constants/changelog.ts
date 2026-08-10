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
    version: 'v0.90',
    date: '10 Août 2026',
    title: 'Espaces partagés remis en service, et le fil des proches',
    changes: [
      {
        type: 'feature',
        text: "Connexion par code à 6 chiffres. Le lien reçu par mail ouvrait toujours le navigateur par défaut, jamais l'app installée sur l'écran d'accueil : chacun se connectait à côté de ses films sans pouvoir les rejoindre. Le code, lui, ouvre la session là où tu le saisis.",
      },
      {
        type: 'fix',
        text: "Les espaces partagés étaient devenus invisibles. Leur unique bouton d'accès était masqué tant qu'aucune session n'existait, et depuis la refonte de la connexion une session ne se crée plus toute seule. Le bouton reste désormais visible et explique ce qui manque.",
      },
      {
        type: 'fix',
        text: "Quitter un espace n'était plus réversible. Le code d'invitation répondait « tu es déjà membre » à celui qui était parti, pendant que l'app continuait de tout lui cacher. Deux espaces étaient morts ainsi. Un ancien membre est maintenant réactivé quand il ressaisit le code.",
      },
      {
        type: 'feature',
        text: "Outils du propriétaire : renommer l'espace, renouveler le code d'invitation, exclure un membre, transmettre la propriété, supprimer l'espace. Aucune de ces actions n'existait. Un fondateur ne peut plus non plus quitter un espace peuplé sans le transmettre.",
      },
      {
        type: 'feature',
        text: "Temps réel. Les votes, les ajouts et les verdicts des autres membres arrivent maintenant tout seuls, sans quitter l'espace ni relancer l'app.",
      },
      {
        type: 'fix',
        text: "Toutes les pannes étaient muettes. Un refus du serveur ressemblait trait pour trait à un espace vide, et une action refusée s'affichait comme réussie avant de disparaître au rechargement. Chaque échec porte désormais son motif, avec un bouton pour réessayer.",
      },
      {
        type: 'feature',
        text: "Une seule façon de noter, partout. Un film ajouté à un espace se notait sur quatre curseurs bruts, ailleurs que ta grille habituelle : deux échelles pour un même film. C'est maintenant le même formulaire qu'en solo, imposé en Bitter+ pour que les verdicts du groupe soient comparables. Et le film entre aussi dans ta collection.",
      },
      {
        type: 'feature',
        text: "Sur une suggestion, tu peux dire « partant » ou « pas envie ». Il n'existait qu'un seul bouton : le désintérêt se confondait avec l'absence de réponse.",
      },
      {
        type: 'feature',
        text: "Fiche membre repensée. Films vus par vous deux, écart moyen, qui note plus haut, où vos regards divergent critère par critère, le film sur lequel vous vous séparez le plus, et ses mieux notés que tu n'as pas vus. Le tout copiable en une phrase pour en discuter.",
      },
      {
        type: 'feature',
        text: "Ce que dit le groupe : films jugés à plusieurs, moyenne collective, le film qui met tout le monde d'accord, le plus clivant, le plus dur et le plus généreux, et le membre dont les verdicts collent le plus aux tiens.",
      },
      {
        type: 'feature',
        text: "Au cinéma. Les films à l'affiche et les sorties à venir, avec leur vraie date française, dans Découvrir. Chacun s'ajoute à tes envies ou se propose directement à un espace, où les membres voteront.",
      },
      {
        type: 'feature',
        text: "Mes proches. Ce que les membres de tes espaces ont vu et noté, par date, avec ta note à côté de la leur. Touche une note pour voir la grille complète, critère par critère. Une case à cocher permet de garder un film hors du fil au moment de le noter.",
      },
      {
        type: 'fix',
        text: "Confidentialité. N'importe quel compte connecté pouvait lire le profil de tous les autres, abonnement cinéma et prix compris. La lecture est désormais limitée à toi et aux membres de tes espaces.",
      },
      {
        type: 'fix',
        text: "Chargements bloqués. Une requête gelée n'échoue jamais, elle attend : l'écran restait figé et relancer l'app était la seule issue. Toutes les lectures ont maintenant une limite de temps, un message et un bouton pour réessayer.",
      },
      {
        type: 'style',
        text: "En-tête d'espace allégé : actualiser et quitter rejoignent la feuille d'options, qui s'ouvre pour tous les membres. Les onglets récupèrent la largeur.",
      },
    ],
  },
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
        text: 'Profil rangé. Toutes les options sont regroupées sous un bouton Paramètres repliable, et le bouton pour nous envoyer un retour y a été déplacé pour dégager de la place dans le header.',
      },
      {
        type: 'feature',
        text: 'Écran de lancement. Installée sur ton écran d’accueil, l’app s’ouvre désormais sur son propre visuel le temps que tout soit prêt. Rien ne change dans un onglet de navigateur.',
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
  }
];
