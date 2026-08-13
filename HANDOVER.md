# Passation — The Bitter

État au 13 août 2026, version **v0.91**. Ce document couvre les derniers chantiers
et surtout les pièges déjà payés : ils ne se devinent pas en lisant le code.

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

Vérifié sur le bundle de production : la clé TMDB de secours de `constants.ts:36`
s'y trouve en clair.

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

| Sujet | État |
|---|---|
| `App.tsx:868` — `SIGNED_OUT` met `activeProfileId` à `null` sans rouvrir l'écran d'accueil → **écran vide** | connu, non corrigé, ~30 min |
| Déclenchement automatique des amorces sur les films déjà notés | jamais confirmé ; un bouton de repli « Propose-moi une amorce » existe |
| Nouveau flux « Je l'ai vu, je note » | livré, **non recetté** |
| Portrait et argumentaire | livrés, recette partielle |
| Licences des styles DiceBear (CC0 contre CC BY 4.0) | **non vérifiées** |
| `De la Comédie-Française` a `date_watched` nul | antérieur au correctif ; les prochains sont datés |
| Chat dans les espaces | reporté par le propriétaire ; le socle temps réel est prêt |

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
