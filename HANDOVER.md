# Passation — The Bitter

État au **28 août 2026**. Ce document couvre les derniers chantiers et surtout les
pièges déjà payés : ils ne se devinent pas en lisant le code.

Les sections 1 à 10 décrivent l'état au 13 août (v0.91) et restent valables, aux deux
corrections signalées près (§3.1 et §6.9). Le **§11 rattrape les onze livraisons du 17
au 25 août**, absentes de tout le reste du document. Le **§12** explique comment
remonter un poste de travail à partir du dépôt seul.

Deux avertissements avant de lire :

- Le changelog utilisateur (`constants/changelog.ts`) est resté à **v0.91 du 12 août**.
  Aucune des onze livraisons du §11 n'y est annoncée.
- **Aucun des chantiers ouverts du §8 n'a été refermé** entre le 15 et le 28 août.
  Tout ce qui a été livré depuis est nouveau. Vérifié dans le code, pas supposé.

---

## 1. Le projet en dix lignes

Application mobile-first de suivi et de notation de films, en français.
PWA React + TypeScript + Vite + Tailwind, données sur Supabase.

| | |
|---|---|
| Production | https://thebitter.watch |
| Dépôt | `github.com/MickaelRandria/The-Bitter` |
| Hébergement | Vercel, projet `the-bitter-r1ta` |
| Supabase | projet `tnvnmsevddvcklkitnpa` (région eu-west-1) |
| Propriétaire | MickaelRandria |

Les données locales (localStorage) restent la source de vérité pour un profil non
connecté ; Supabase sert de sauvegarde en ligne et porte tout le social.

---

## 2. Contraintes posées par le propriétaire — à respecter sans discussion

- **12 comptes réels existent dans `auth.users`.** Ce sont de vraies personnes avec
  de vrais e-mails. Ne jamais les traiter comme des données de test à supprimer.
- **Le projet Supabase est déjà configuré.** Ne pas en créer un autre.
- **Les colonnes `story`, `visuals`, `acting`, `sound` de `user_movies` et
  `movie_ratings` ont été migrées de `integer` vers `numeric(3,1)`.** C'est fait,
  ne pas y retoucher. (Voir §6, cette migration a des conséquences.)
- **Ne supprimer aucune fonctionnalité existante.** Ne pas refactoriser des parties
  sans rapport avec la tâche en cours.

---

## 3. L'architecture IA — le chantier principal

### 3.1 Pourquoi un relais

Toute clé placée dans une application web finit **en clair** dans le fichier
JavaScript téléchargé par le navigateur : Vite la remplace par sa valeur au moment
du build. Pour une clé facturée à l'usage, cela revient à publier un moyen de
paiement.

Vérifié sur le bundle de production : la clé TMDB de secours qui figurait alors dans
`constants.ts` s'y trouvait en clair.

**Ce repli a été supprimé le 18 août** (§11, PR #79) : `VITE_TMDB_API_KEY` est
désormais l'unique source. La démonstration ci-dessus n'a pas été appliquée à temps,
et elle a fini par coûter une panne de production — voir §6.11.

La clé Mistral vit donc dans les secrets d'une Edge Function, et l'application
appelle cette fonction plutôt que Mistral.

### 3.2 L'Edge Function `ai`

`supabase/functions/ai/index.ts` — versionnée dans le dépôt, déployée sur Supabase.

**Secrets à poser dans le tableau de bord Supabase → Edge Functions → Secrets :**

| Nom | Défaut | Rôle |
|---|---|---|
| `MISTRAL_API_KEY` | — | obligatoire |
| `AI_DAILY_LIMIT` | `40` | appels par personne et par jour |
| `MISTRAL_MODEL` | `mistral-small-latest` | modèle utilisé |

Poser un secret redéploie la fonction (le numéro de version s'incrémente).

**Trois gardes, dans cet ordre exact :**

1. **Authentification.** `verify_jwt: true` ne suffit pas : la clé anonyme du projet
   *est elle-même un JWT valide*, et elle est publique. La fonction résout donc la
   session avec `auth.getUser()` pour savoir si l'appelant est *quelqu'un* et non
   seulement *quelque chose*. Vérifié : un appel muni de la seule clé anonyme reçoit
   `401`.
2. **Configuration.** Le test de présence de la clé vient **après** l'authentification,
   pour qu'un inconnu n'apprenne rien de l'état du serveur.
3. **Quota.** `consume_ai_quota(p_user, p_limit)` incrémente et vérifie dans **une
   seule instruction SQL** (`insert … on conflict do update … returning`), donc une
   rafale d'appels simultanés ne peut pas se glisser entre la lecture et l'écriture.
   La fonction n'est exécutable que par `service_role`. **Fermé par défaut** :
   compteur en panne ou réponse vide → refus.

**Les huit actions :**

| Action | Ce qu'elle rend | Mode JSON |
|---|---|---|
| `assistant` | Ciné-Assistant conversationnel | non |
| `search` | Recherche approfondie sur un titre | non |
| `review-starters` | 3 amorces de phrase | oui |
| `review-continue` | **une** phrase de prolongement | non |
| `discover-query` | filtres TMDB à partir d'une envie | oui |
| `recommend` | 5 films + justification | oui |
| `portrait` | 3 observations + le chiffre de chacune | oui |
| `space-pitch` | un argument par membre | oui |

Chaque action a sa `persona` (consigne système) et son entrée dans `TUNING`
(température, `max_tokens`, mode JSON). **Toute sortie JSON est validée et bornée
côté serveur** avant d'être rendue : liste blanche pour les genres, bornes pour les
nombres, tri et plateforme vérifiés. Ces valeurs finissent dans des URL — les
accepter brutes reviendrait à laisser un texte généré composer les requêtes.

### 3.3 Côté client

`services/ai.ts` — tous les appels passent par `supabase.functions.invoke('ai')`.

`callAI<T>()` lit le corps des réponses d'erreur (que `invoke` ne remonte pas) pour
distinguer « connecte-toi » de « quota atteint » de « le service est tombé ».

### 3.4 Coût

Tarif `mistral-small-latest` : 0,15 $/M jetons en entrée, 0,60 $/M en sortie.

| Fonction | Coût | Fréquence |
|---|---|---|
| Amorces + continuer | ~0,02 ¢ | 2 appels par film noté |
| Recherche d'envie | ~0,01 ¢ | par recherche validée |
| Recommandations | ~0,03 ¢ | par ouverture |
| Portrait | ~0,04 ¢ | tous les 10 films, en cache |
| Argumentaire | ~0,02 ¢ | par film proposé |

À 100 utilisateurs actifs : **environ 0,70 € par mois**. La consommation n'est pas
un sujet ; le **rythme** en est un — aucune fonction ne doit se déclencher à la frappe.

---

## 4. Les fonctions IA livrées

### Avis co-écrit — `components/ReviewComposer.tsx`

**Le problème mesuré :** sur 90 films notés, **un seul** portait un avis écrit. Le
champ n'était ni caché ni compliqué — il était vide, et arrivait après le travail
de la notation.

**Deux règles gouvernent ce que le modèle a le droit de produire :**

1. *Une amorce porte l'ÉLAN que la note a déjà posé, jamais la RAISON.*
   La note contient déjà un verdict, et il est de l'auteur : un 9 en image dit qu'il
   a été bluffé. Le lui rappeler ne lui met rien dans la bouche. « J'ai décroché au
   moment où » est permis ; « j'ai décroché à cause du rythme » ne l'est pas.
   *Historique : une première version interdisait tout jugement. Le modèle a obéi en
   rendant des cases grammaticales vides (« L'histoire m'a… ») — neutres et
   parfaitement inertes.*
2. *L'IA ne peut rien écrire à partir de rien.* Le bouton « continuer » n'existe pas
   tant que le champ est vide, il ajoute **une** phrase, et jamais une conclusion.
   Le serveur tronque à la première ponctuation forte.

Une amorce finit sur un mot qui réclame une suite (« quand », « au moment où »,
« sauf ») : un mot suspendu tire plus fort qu'un verbe suspendu.

**Porte d'entrée sur les films déjà notés :** `MovieCard` affiche « Tu as noté, mais
tu n'as pas dit pourquoi » là où l'avis manque.

### Recherche par envie — `components/MoodSearch.tsx`

« un truc pas trop long, pas prise de tête, à regarder à deux » → filtres TMDB.

**Le modèle ne choisit aucun film** : il produit des critères, TMDB répond. Rien ne
peut être inventé. Un bandeau affiche ce qui a été compris, avec une croix pour
revenir en arrière — sans lui, l'écran changerait de contenu sans qu'on sache
pourquoi et un contresens passerait inaperçu.

*Règle du silence :* un champ que la phrase ne demande pas reste vide. Un filtre
ajouté d'initiative écarte des films pour une raison que personne n'a donnée, et
**l'absence ne se voit pas**.

### Recommandations — `components/RecommendationsModal.tsx`

L'écran s'annonçait « IA » et interrogeait les recommandations TMDB — du « ceux qui
ont aimé X ont aimé Y », aveugle au *pourquoi*.

Le modèle propose 5 titres avec une justification tirée des notes. Chaque titre est
**cherché dans TMDB avant affichage** : un film inventé ne trouve pas de fiche et
disparaît tout seul. **Repli sur TMDB** si pas de session, quota atteint ou réseau
coupé.

### Portrait de goût — `components/TastePortrait.tsx` + `utils/tasteStats.ts`

Statistiques → Profil.

**Le danger porte un nom : l'horoscope.** Une phrase inventée sur quelqu'un se lit
exactement comme une phrase vraie. D'où le partage des rôles : **l'application
calcule, le modèle rédige**, et le chiffre reste affiché à côté de la phrase.

`tasteStats.ts` calcule moyennes par critère, écart avec TMDB, moyennes par genre,
films longs contre courts, distraction téléphone — et surtout la **corrélation de
Pearson** entre chaque critère et la note finale : elle révèle le critère qui décide
vraiment de la note, qui n'est presque jamais celui qu'on note le plus haut.
Cas dégénéré traité : une série constante rend `0`, pas `NaN`.

Rien en dessous de 10 films. Recalcul seulement après 5 films de plus.

### Argumentaire d'espace — `components/SpacePitchPanel.tsx`

Espace → À voir → déplier un film → « Pour qui est ce film ? ».

Un film posé sans un mot ne déclenche rien : dans le doute, chacun passe. Le modèle
a **explicitement le droit de dire non** — un argumentaire qui ne sait pas
décourager ne veut plus rien dire quand il encourage.

### Comment un goût est décrit — `describeLovedFilms()` dans `services/ai.ts`

Partagé entre les recommandations et l'argumentaire. **C'est le point le plus récent
et le plus important à comprendre.**

Une moyenne ne décrit personne : qui met 9 à l'image des films qu'il adore et 3 à
celle des films qu'il déteste ressort à 6, comme qui s'en moque. Mesuré : Nakib se
résumait à « scénario 8.4, image 8.4, jeu 8.4, son 8.4 » — quatre fois le même
chiffre.

On envoie donc **les films bien notés un par un, avec leurs critères**, plus les
moyennes en fin de bloc comme **échelle de lecture** (un 8 est un exploit chez qui
plafonne à 6). Le seuil du « bien noté » suit la personne au lieu d'être constant.

`getMemberFilms` rend désormais `allCriteria`, la grille complète : c'est
« Humour 10 » ou « Facteur peur 8 » qui distingue un goût, pas un quatrième chiffre
sur les mêmes axes que tout le monde.

---

## 5. Espaces partagés — modèle de fonctionnement

- `shared_spaces` · `space_members` · `shared_movies` · `movie_ratings` ·
  `space_movie_votes`
- Un film proposé a `status = 'watchlist'`, un film vu `status = 'watched'`.
- **Nouveau flux (PR #68) :** depuis « À voir », « Je l'ai vu, je note » ouvre
  directement la notation, et le film bascule **quand le verdict est enregistré**.
  La bascule suit la note au lieu de la précéder — avant, le groupe attendait qu'une
  personne pense à basculer le film pour que les autres puissent s'exprimer.
- La bascule n'est tentée que si le film est encore en attente. Si elle échoue, le
  verdict est quand même enregistré.
- Le bouton « Juste marquer comme vu » reste, en second, pour un film vu ensemble et
  noté plus tard.
- Temps réel : un seul canal `space-${spaceId}` avec trois écouteurs.

**Conséquence à connaître :** un film noté par une personne quitte « À voir » pour
tout le monde. Les autres le notent depuis l'onglet des verdicts. Le propriétaire
en est informé et l'a accepté ; c'est réversible si l'usage montre que ça gêne.

---

## 6. Les pièges déjà payés — à lire avant de toucher au code

### 6.1 Postgres rend les `numeric` en **texte**

Les colonnes `numeric` arrivent en `"6.1"` et non `6.1`, alors que les types
TypeScript annoncent des nombres. Le compilateur ne voit rien.

```js
movie.tmdb_rating.toFixed(1)                        // TypeError → écran noir
(story + visuals + acting + sound) / 4              // "6.16.16.16.1" / 4 → NaN
ratings.reduce((a, r) => a + r.story, 0) / n        // juste PAR ACCIDENT
```

Le troisième cas est le plus vicieux : faux, et pourtant bon résultat, parce que la
division finale reconvertit la chaîne. Introuvable à la relecture.

**Règle : toute valeur venue de la base passe par `Number()` avant le moindre
calcul.** Les `.toFixed` sur `vote_average` sont sans risque — ça vient de l'API
TMDB en vrai nombre JSON.

### 6.2 Zone morte temporelle dans un composant

Le corps d'un `useMemo` **s'exécute à l'endroit où on l'écrit**, pas plus tard. Une
fonction `const` déclarée plus bas est encore dans sa zone morte.

Safari dit « Cannot access uninitialized variable », Chrome « Cannot access 'X'
before initialization ».

Ce défaut a dormi des mois : `groupStats` n'atteignait l'appel qu'en parcourant les
notes du groupe, et `movie_ratings` était vide. **La toute première note posée dans
l'espace l'a réveillé.**

Un balayage est disponible dans l'historique de la PR #70 ; il n'a rien trouvé
d'autre sur `App`, `AnalyticsView`, `DiscoverView`, `AddMovieModal`, `FriendsFeed`,
`MemberProfileModal`.

### 6.3 `Number(null)` vaut `0`, et `Number.isFinite(0)` vaut `true`

Une validation écrite ainsi transforme tout champ vide en borne basse :

```js
const n = Number(value);
return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;   // FAUX
```

Conséquence vécue : chaque recherche par envie partait avec
`with_runtime.gte=40` **et** `lte=40` — les films de quarante minutes pile. Aucune
requête ne rendait jamais rien.

**Traiter l'absence avant la conversion.**

### 6.4 `@types/react` n'est pas installé

`React.Component` arrive sans typage : `props`, `state` et `setState` sont invisibles
pour TypeScript. `components/ErrorBoundary.tsx` redéclare ce contrat localement.
**Ne pas ajouter la dépendance de types** sans mesurer : elle ferait remonter des
centaines d'erreurs dans tout le reste du code.

### 6.5 Noms de colonnes à ne pas confondre

| Table | Colonne | Contenu |
|---|---|---|
| `user_movies` | `review` | **le synopsis TMDB** |
| `user_movies` | `comment` | **l'avis personnel** |
| `shared_movies` | `synopsis` | le synopsis (il n'y a **pas** de `review`) |
| `user_movies` | ~~`quality_metrics`~~ | **n'existe pas** — n'existe qu'en local |

Une seule colonne inconnue fait rejeter toute la requête PostgREST.

### 6.6 `buildCriteriaForProfile` rend toujours tous les critères

Y compris ceux qu'on n'a pas touchés, à **5/10** par défaut. Vérifier que l'ensemble
a bien été réglé avant de bâtir quoi que ce soit dessus, sinon on commente un film à
la place de son spectateur.

### 6.7 Déploiement — ne jamais se fier au statut GitHub

**Vercel n'a pas déclenché le déploiement de production sur la fusion de la PR #64**
— il n'a construit que l'aperçu de la branche. Aucun statut n'a été publié, et le
site a servi l'ancienne version pendant une heure.

**Toujours vérifier le fichier réellement servi :**

```bash
curl -s https://thebitter.watch/index.html | grep -o 'assets/index-[A-Za-z0-9_-]*\.js'
```

puis chercher dedans une chaîne propre au changement. Si le déploiement ne part pas,
un commit vide sur `main` relance le webhook.

### 6.8 Le cache de la PWA

Une PWA sert obstinément la version qu'elle a enregistrée. Un correctif déployé peut
rester invisible plusieurs heures. Le bouton « Recharger la dernière version » de
`ErrorBoundary` désinstalle les services workers et vide les caches — c'est le seul
geste accessible depuis un téléphone.

### 6.9 Reprise après veille — `utils/useResumeRefresh.ts`

iOS gèle l'app en arrière-plan ; le verrou de renouvellement du jeton Supabase reste
pris et **toute requête suivante attend derrière lui**. D'où des écrans qui tournent
dans le vide que seul un redémarrage débloquait. `stopAutoRefresh` avant la veille,
`startAutoRefresh` + `realtime.connect()` au réveil.

**Corrigé à la racine le 24 août (PR #84).** La parade existait mais n'était montée que
sur `FriendsFeed` et `SharedSpaceView` ; partout ailleurs — dont la fiche film — le
client restait verrouillé. `SupabaseClient._getAccessToken()` appelle `auth.getSession()`,
qui prend le verrou : c'est le chemin de **toutes** les requêtes, PostgREST comme
`functions.invoke`. `useSupabaseWake` se pose donc **une seule fois, à la racine**, dans
`App.tsx`. Ne pas la remonter dans un composant : c'est un état global, pas un état de vue.

Les séances UGC ont rendu le cas quotidien : toucher un horaire ouvre la billetterie
dans un autre onglet, donc met la PWA en arrière-plan à chaque réservation.

### 6.10 Déployer en ligne de commande depuis un dossier non versionné efface le travail

**Deux jours de travail ont été perdus ainsi, les 13-15 août** (restaurés par la PR #75).

La production était déployée par `vercel --prod` depuis le dossier de travail, qui
n'était pas un dépôt git. Tant que personne ne fusionnait rien, l'illusion tenait : le
site servait bien ce qui venait d'être déployé. **La fusion des PR #73 et #74 le 15 août
a rebâti la production depuis GitHub**, effaçant tout ce qui n'avait jamais été commité —
refonte de l'accueil, section ADN et son radar, calendrier, chaîne de notifications push.

Le back-end n'avait pas régressé : migrations appliquées, fonctions actives. **Seul le
front-end a disparu**, ce qui rend le diagnostic trompeur — la base répond, donc on
cherche ailleurs.

**Règle : la production se reconstruit depuis `main`.** Un déploiement CLI est au mieux
temporaire, au pire un travail condamné à la prochaine fusion. Committer d'abord.
`.vercel` a rejoint `.gitignore` à cette occasion.

### 6.11 Une clé en dur survit à sa propre révocation

`constants.ts` portait une valeur de repli pour la clé TMDB. Elle a été régénérée côté
TMDB — et **le bundle déployé a continué de présenter l'ancienne** : la production a
répondu `401` sur chaque appel TMDB, donc plus de recherche, plus de fiches, plus de
planification. Le repli, censé protéger d'une variable manquante, a masqué la panne
qu'il aurait fallu voir.

Plus de repli : `VITE_TMDB_API_KEY` est la seule source. **Une variable absente se voit
au build, pas six mois plus tard.**

### 6.12 La CSP ne s'applique qu'en production — et un `fetch()` sur `data:` en dépend

Le partage de story renvoyait « Impossible de générer la story : Load failed ». L'image
était pourtant dessinée : `toDataURL()` réussissait, c'est la ligne suivante qui tombait.

```js
const response = await fetch(imageDataUrl);   // data:image/png;base64,...
```

**Un `fetch()` vers une URL `data:` reste une requête**, donc soumis à `connect-src`. La
CSP de `vercel.json` énumère Supabase, TMDB, PostHog, Formspree, Google — sans `data:`.
Safari remontait le refus en `TypeError « Load failed »`, affiché tel quel à l'utilisateur.

**Ce défaut est invisible en développement** : `vite.config.ts` sert une CSP permissive
(`default-src *`). Le seul environnement où la vraie politique s'applique est celui où
personne ne teste avant de déployer. Le partage d'images était cassé depuis le
déploiement des en-têtes de sécurité, le 17 août — trois fonctionnalités d'un coup, la
même construction étant recopiée à trois endroits.

Même famille, même jour : PostHog charge son enregistreur depuis des sous-domaines
variables et crée des workers en `blob:`. Restreint au seul `eu.i.posthog.com`, **la
mesure d'audience se serait tue en silence** après acceptation du consentement, sans
qu'aucune fonctionnalité visible ne le signale (PR #77).

**Avant de déployer un changement d'en-têtes : lister ce qui sort du navigateur.**

---

## 7. Frontière d'erreur

`components/ErrorBoundary.tsx`, posée dans `App.tsx` **autour du contenu et non à la
racine** : l'en-tête et la navigation restent debout, donc on peut toujours quitter
l'écran fautif. Une clé sur `viewMode` la remet à zéro à chaque changement de vue.

Elle affiche **le texte brut de l'erreur**. Ce n'est pas élégant, et c'est ce qui a
permis de résoudre en cinq minutes un écran noir cherché pendant deux heures : six
mots rapportés par l'utilisateur ont suffi.

**Avant elle, l'application n'en avait aucune** — n'importe quelle erreur de rendu
effaçait tout, sans message ni issue.

---

## 8. Chantiers ouverts

Relevé le **28 août 2026**. Rien n'a été refermé depuis le 13 août : les onze livraisons
du §11 sont toutes des nouveautés. Les lignes marquées *(vérifié le 28/08)* ont été
recontrôlées dans le code à cette date ; les autres sont reconduites telles quelles.

| Sujet | État |
|---|---|
| `App.tsx:1057` — `SIGNED_OUT` met `activeProfileId` à `null` sans rouvrir l'écran d'accueil → **écran vide** | **toujours présent** *(vérifié le 28/08)*, ~30 min. La référence `App.tsx:868` du 13 août a dérivé : le fichier a grossi de 190 lignes |
| `public/.well-known/assetlinks.json` contient encore `REMPLACER_PAR_L_EMPREINTE_SHA256_DE_LA_CLE_DE_SIGNATURE` | **bloque la sortie Android** *(vérifié le 28/08)*. Sans lui, Chrome garde sa barre d'adresse au-dessus du TWA et Play le voit. Procédure dans `TWA-ANDROID.md` |
| Licences des styles DiceBear (CC0 contre CC BY 4.0) | **toujours non vérifiées** *(vérifié le 28/08 : aucune mention de licence ni d'attribution DiceBear dans le code, les traductions ou le HTML)*. L'attribution TMDB a été faite le 18 août ; celle-ci relève de la même exigence des stores |
| `constants/changelog.ts` arrêté à v0.91 (12 août) | *(vérifié le 28/08)* onze livraisons sont en production sans être annoncées à qui que ce soit |
| Déclenchement automatique des amorces sur les films déjà notés | jamais confirmé ; un bouton de repli « Propose-moi une amorce » existe |
| Nouveau flux « Je l'ai vu, je note » | livré, **non recetté** |
| Portrait et argumentaire | livrés, recette partielle |
| Séances UGC, programme, thème sombre, tablette, mode démo (§11) | livrés et déployés, **recette réelle non faite** |
| `De la Comédie-Française` a `date_watched` nul | antérieur au correctif ; les prochains sont datés |
| Chat dans les espaces | reporté par le propriétaire ; le socle temps réel est prêt |

### Branches non fusionnées — état au 28 août

| Branche | État |
|---|---|
| `mode-demo` | **PR #86 ouverte** depuis le 25 août. C'est le travail en cours |
| `responsive-tablette` | poussée, non fusionnée, **aucune PR ouverte** |
| `agent/data-backup-import` | 1er août — **160 commits de retard** sur `main` |
| `agent/pwa-onboarding-icons` | 1er août — **159 commits de retard** |
| `agent/stories-analytics-v088` | 3 août — **166 commits de retard** |

Les trois branches `agent/*` sont antérieures à toute la refonte d'août, y compris à la
restauration du §6.10. **Les rebaser coûterait plus cher que de refaire le travail** à
partir du code actuel. Décider de leur sort — reprendre l'idée, ou supprimer la branche —
plutôt que de les laisser donner l'illusion d'un travail disponible.

---

## 9. Manière de travailler attendue

- **Toujours `git status --short` avant de committer.** Un `git add -A` sur un dépôt
  mal synchronisé a déjà supprimé 68 fichiers en une PR (revert `9805b49`).
- Une branche, une PR, un sujet. Message de commit qui explique **pourquoi**, pas
  seulement quoi.
- `npx tsc --noEmit` puis `npm run build` avant toute PR.
- **Vérifier en production après déploiement** (§6.7), pas seulement le statut CI.
- Mesurer avant d'affirmer : les diagnostics de ce document viennent tous de
  requêtes SQL ou d'appels d'API réels, pas de lecture de code.

---

## 10. Chiffres utiles

Relevés en base le 12 août 2026 — ils expliquent la plupart des choix ci-dessus.

| | |
|---|---|
| Comptes | 12, dont **3 réellement actifs** (Mickael 62 films, Nakib 10, Mirana 5) |
| Films vus | 90 |
| Avis écrits | **1 avant les amorces**, 2 après |
| Tags posés | **0** — la fonction est morte, rien ne les consomme |
| Espaces | 1 (« Ciné pote »), 3 membres actifs, 5 films, 1 vu |
| Notes dans les espaces | 1 |

---

## 11. Livré du 17 au 25 août — ce que les §1 à 10 ne couvrent pas

Onze PR fusionnées dans `main`, 23 commits, aucune annoncée au changelog. Les corps de
commit sont détaillés et font foi : `git log --merges bb685de..main`.

### 11.1 Conformité stores et vie privée — PR #76, #78, #80

Trois obligations manquaient pour soumettre l'application.

**Suppression de compte** (App Store 5.1.1(v) et droit à l'effacement). Une Edge Function
efface l'identité Auth et toutes les données serveur. Le point délicat n'était pas la
suppression mais **sa cascade** : `shared_spaces.created_by` est en `CASCADE`, donc
effacer le profil du créateur d'un espace aurait emporté les films et les votes de tous
les autres membres. L'espace est désormais **transmis à son plus ancien membre encore
actif**, et n'est détruit que si son créateur en était le dernier. `profiles` n'ayant
aucune clé étrangère vers `auth.users`, les deux suppressions sont explicites,
**l'identité en dernier** pour qu'un échec laisse un compte encore capable de relancer
l'opération. `ai_usage` ne porte pas de clé étrangère : purgé à part.

**Politique de confidentialité** servie à `/confidentialite` : données collectées, bases
légales, sous-traitants réels, durées, droits et recours. L'éditeur et l'adresse de
contact ont été renseignés le 18 août (PR #78).

**Attribution TMDB.** Leurs conditions imposent le logo et la mention « ce produit
utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB » dès lors qu'on affiche
leurs fiches, affiches ou castings. L'application en affichait partout, **avec zéro
attribution**. Apple (règle 5.2) et Google exigent le respect des conditions des tiers :
la clé d'API exposée ne bloque rien, l'attribution manquante si. Le logo est l'asset
officiel, pas une reproduction ; il apparaît dans le profil sous « Sources ».

*Reste ouvert dans la même famille : les licences DiceBear (§8).*

### 11.2 Séances UGC et planification depuis le vrai programme — PR #82, #85

Découvrir un film et le réserver étaient deux parcours séparés.

`cinema-directory` gagne une action **`showtimes`** : UGC décrit chaque séance en
attributs `data-*` sur son bouton de réservation — **la partie la plus stable de la
page, on ne lit qu'elle**. Le rapprochement est une **égalité stricte après
normalisation**, sur UN titre demandé dans la grille d'un cinéma : pas de réconciliation
massive entre catalogues, donc pas de faux appariement à grande échelle. Un faux positif
ouvrirait le mauvais lien de réservation.

**Le fuseau n'est pas cosmétique** : UGC affiche « 21:00 » heure de Paris, l'Edge
Function tourne en UTC. Le décalage réel du jour concerné est calculé, avec une seconde
passe pour les nuits de changement d'heure. Cache de 3 h par couple (cinéma, jour), sur
la forme déjà analysée ; les séances passées sont filtrées à la lecture.

Une action **`programme`** rend ensuite la grille entière groupée par film — la fonction
la lisait déjà et jetait les trente autres films. Trois choix sur quatre sont souvent
déjà faits : cinéma favori pré-rempli, jour par défaut = **le premier qui a encore des
séances à vendre**, et beaucoup de films n'ont qu'un horaire.

Ce dernier point n'est pas cosmétique non plus : **à 22 h, « aujourd'hui » n'a plus une
seule séance** et ouvrir sur le jour courant montrerait un écran vide. Les sept jours
sont décrits, **les vides grisés plutôt que cachés** : UGC ne publie la semaine suivante
qu'au basculement du mercredi, et un jour sans séance doit se lire « rien de prévu », pas
« c'est cassé ».

### 11.3 Thème sombre de la fiche film — PR #83

`MovieDetailModal` était **le seul écran à ne pas porter `dark:bg-[#0c0c0c]`** à côté de
son `bg-cream`. Le panneau restait crème pendant que ses enfants basculaient en texte
clair : gris pâle sur crème, illisible. Passe complète, 30 éléments, en suivant les
conventions déjà en place (`dark:bg-[#161616]` pour une carte, `dark:border-white/10`,
`dark:bg-bitter-lime dark:text-charcoal` pour un bouton primaire). Deux cas qui ne se
voient qu'à l'écran : le dégradé de l'affiche finissait en `to-cream` en dur, et la barre
d'actions du bas était crème sur crème.

### 11.4 Tablette portrait — branche `responsive-tablette`, non fusionnée

L'application était conçue pour un seul appareil : **185 préfixes `sm:`, trois `md:`, un
`lg:`**. Sur un iPad de 820 px, le Feed restait bridé à 448 px pendant qu'Analytics
s'étalait sur 772 px, avec des carrés `aspect-square` de 480 px de côté pour une icône de
40 px et deux mots.

**Le principe : on n'élargit pas les tuiles, on en met plus par rangée.** C'est ce qui
protège les images — élargir une carte du Feed flouterait son affiche (le fond est un
`w780`, une carte de plus de ~440 px le dépasse sur écran Retina).

Le palier s'appelle **`tab` et vaut 720 px, pas le `md` par défaut** : l'iPad mini en
portrait fait 744 px et serait resté au rendu téléphone avec `md` (768 px) ; 720 passe
au-dessus de la plus large fenêtre Split View, qui doit elle rester en rendu téléphone.
Il est déclaré en **redéfinissant `theme.screens` en entier, pas via `extend`** :
Tailwind range les écrans étendus à la fin de la liste, un `tab:` ajouté ainsi serait
sorti après `xl:` et aurait gagné la cascade sur les grands écrans.

### 11.5 Mode démo — branche `mode-demo`, PR #86 ouverte

Un profil vide ne démontre rien : l'ADN, le fil d'amis et la rentabilité de l'abonnement
ont besoin de dizaines de films pour dire quelque chose. `?demo=true` (ou `?guest=true`,
ou le bouton discret de l'accueil) ouvre le profil d'Alex : 31 films sur dix mois, 6 en
attente, un abonnement UGC rentabilisé, trois amis qui postent.

**Rien n'est écrit.** Le mode démo n'ouvre aucune session, donc toutes les
synchronisations — déjà gardées par `session?.user?.id` — sont mortes d'elles-mêmes. Les
trois effets qui persistent les profils sont neutralisés : ce qu'on note pendant une
démonstration vit en mémoire et disparaît au rechargement. Une seule clé est posée,
`the_bitter_demo_mode`, et elle ne contient qu'un drapeau.

Le drapeau est **calculé au chargement du module et non dans un effet** : les services
le lisent avant le premier rendu.

### 11.6 Corrections d'infrastructure

| PR | Sujet | Où c'est expliqué |
|---|---|---|
| #75 | Restauration du travail des 13-15 août | §6.10 — le piège le plus cher du mois |
| #77 | CSP PostHog et workers `blob:` | §6.12 |
| #79 | Clé TMDB sortie du code | §6.11 |
| #81 | Partage de story cassé par la CSP | §6.12 |
| #84 | Réveil Supabase à la racine | §6.9 |

---

## 12. Remonter un poste de travail

Le dépôt contient **tout le code** : branches, historique, migrations, Edge Functions,
documentation. Il ne contient volontairement **ni les secrets, ni le lien Vercel, ni les
dépendances**.

```bash
git clone https://github.com/MickaelRandria/The-Bitter.git
cd The-Bitter
npm install
vercel link            # projet the-bitter-r1ta
vercel env pull .env   # les 6 variables VITE_* — modèle dans .env.example
npm run lint           # tsc --noEmit
npm run dev
```

**Sans `.env`, l'application démarre mais tout le code Supabase disparaît du build** :
plus d'authentification, plus d'espaces, plus d'IA — et aucun message pour le dire. Un
écran qui « marche » sans `.env` ne prouve rien du tout. C'est le premier piège d'un
poste neuf.

Le reste tient en quatre points :

- **Choisir un chemin sans espace ni parenthèse** (`C:\dev\the-bitter`). Un chemin du
  type `Downloads\The-Bitter-main (8)` doit être échappé par chaque outil qui le
  manipule et rend toute configuration illisible.
- **Vérifier `git config user.name`** : des commits ont été signés du nom de la machine
  (`DESKTOP-XXXX\utilisateur`) au lieu de celui de l'auteur.
- **Ne pas recopier `node_modules`** d'une machine à l'autre : binaires natifs. `npm
  install` — Node 22.x, la même majeure, pour que `package-lock.json` résolve à
  l'identique.
- **Recette sur téléphone** : une adresse IP en clair n'est pas un contexte sécurisé, donc
  pas de service worker ni de PWA, et le pare-feu Windows bloque le port de Vite par
  défaut. Deux faux bugs classiques qui font perdre une soirée.

Enfin, le §9 s'applique dès le premier commit : `git status --short` avant de committer,
`npx tsc --noEmit` puis `npm run build` avant toute PR, et **vérification en production
après déploiement** (§6.7), pas seulement le statut CI.
