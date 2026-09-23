# Console Google Play : les réponses à copier-coller

Les fichiers graphiques sont dans ce dossier : `icon-512.png` (icône, 512×512) et
`feature-graphic-1024x500.png` (bannière). Il manque seulement les captures
d'écran, à faire depuis ton téléphone (voir §2).

---

## 1. Fiche principale (Croissance → Présentation sur le Store → Fiche principale)

**Nom de l'application** (30 max)

```
The Bitter
```

**Description courte** (80 max, 76 ici)

```
Note tes films et séries, découvre ton ADN cinéma, partage avec tes proches.
```

**Description complète** (4000 max)

```
The Bitter, c'est ton carnet de cinéma. Tu notes ce que tu regardes, critère par critère, et l'application apprend ce qui compte vraiment pour toi.

NOTE AUTREMENT
• Une note par critère (histoire, image, jeu, son) plutôt qu'un simple nombre d'étoiles.
• La grille Bitter+ s'adapte au film : un documentaire ne se juge pas comme un film d'action.
• Écris ton avis, ou laisse-toi aider par une amorce de phrase.
• À côté de ta note, la note IMDb du film pour situer ton verdict.

FILMS ET SÉRIES
• Suis tes séries saison par saison, et note chaque épisode.
• Un calendrier des sorties et des épisodes à venir.
• Ta liste d'envies, pour ne plus oublier ce qu'on t'a conseillé.

DÉCOUVRE TON ADN CINÉMA
• Tes statistiques : genres, réalisateurs, temps passé devant l'écran.
• Es-tu plus sévère ou plus généreux que le public ?
• Un portrait de tes goûts, et des recommandations qui partent de tes notes.
• Cherche un film en décrivant ton envie : « un truc pas trop long, à regarder à deux ».

PARTAGE AVEC TES PROCHES
• Crée un espace avec tes amis, ta famille ou ton couple.
• Proposez des films, votez, et comparez vos notes.
• Un fil pour voir ce que tes proches ont vu et ce qu'ils en ont pensé.

AU CINÉMA
• Planifie tes séances et reçois un rappel.
• Consulte le programme de ton cinéma UGC.
• Calcule la rentabilité de ton abonnement cinéma.

TES DONNÉES T'APPARTIENNENT
• Utilisable sans compte : tes films restent sur ton appareil.
• Un compte, facultatif, pour synchroniser plusieurs appareils et partager.
• Importe ton historique Letterboxd, exporte tes données quand tu veux.
• Aucune publicité, aucune donnée vendue.

Fiches et affiches fournies par TMDB. Ce produit utilise l'API TMDB mais n'est ni approuvé ni certifié par TMDB. Notes IMDb obtenues via OMDb ; The Bitter n'est pas affilié à IMDb.
```

**Catégorie** : Divertissement
**Adresse e-mail** : vrymikaf13@gmail.com
**Site web** : https://thebitter.watch

---

## 2. Captures d'écran

Au moins **2**, jusqu'à 8, au format téléphone portrait (idéalement 1080×1920).
Depuis ton téléphone, dans l'app installée, prends dans cet ordre :

1. La collection (les cartes avec les notes IMDb)
2. La notation d'un film (la grille de critères)
3. Les statistiques / ADN cinéma
4. Un espace partagé
5. Le calendrier des séances ou des séries

Évite les écrans qui montrent les noms ou avis de tes amis : ce sont leurs données.

---

## 3. Contenu de l'application (Règles → Contenu de l'application)

### Règles de confidentialité
```
https://thebitter.watch/confidentialite
```

### Accès à l'application
Choisis **« Tout ou partie des fonctionnalités sont soumises à des restrictions »**
et colle :
```
L'application s'utilise entièrement sans compte : touchez « Créer un profil », créez un profil local, puis ajoutez et notez des films.

Les fonctions sociales (espaces partagés, fil d'activité, synchronisation) nécessitent un compte. La connexion se fait par un code à 6 chiffres envoyé par e-mail, sans mot de passe : saisissez n'importe quelle adresse que vous consultez, le code arrive en moins d'une minute.

La suppression du compte se trouve dans Profil → Confidentialité → Supprimer mon compte.
```

### Annonces
**Non**, l'application ne contient pas d'annonces.

### Classification du contenu (questionnaire IARC)
- Catégorie : **Toutes les autres applications** (ni jeu, ni réseau social principal)
- Violence, sexualité, langage grossier, drogues, jeux d'argent : **Non**
- Les utilisateurs peuvent-ils interagir ou échanger du contenu ? **Oui** (avis et notes partagés avec les membres de leurs espaces)
- Partage de la position de l'utilisateur : **Non**
- Achats numériques : **Non**

### Public cible
Tranches d'âge : **16-17 ans** et **18 ans et plus**.
L'application n'est pas conçue pour attirer les enfants : **Non**.

### Sécurité des données
Questions générales :
- Collecte ou partage de données utilisateur : **Oui**
- Données chiffrées en transit : **Oui**
- Moyen de demander la suppression des données : **Oui**
- URL de suppression du compte :
  ```
  https://thebitter.watch/suppression
  ```

Données **collectées** (aucune n'est « partagée » au sens de Google : Supabase,
Mistral et Vercel sont des sous-traitants qui agissent pour ton compte) :

| Type Google | Collectée | Obligatoire ? | Finalités |
|---|---|---|---|
| Informations personnelles → **Adresse e-mail** | Oui | Facultative (seulement pour un compte) | Fonctionnalité de l'app, Gestion du compte |
| Informations personnelles → **Nom** (prénom) | Oui | Facultative | Fonctionnalité de l'app, Personnalisation |
| Informations personnelles → **ID utilisateur** | Oui | Facultative | Fonctionnalité de l'app, Gestion du compte |
| Activité dans l'app → **Interactions avec l'app** | Oui | **Facultative** (consentement) | Analyses |
| Activité dans l'app → **Autre contenu généré par l'utilisateur** (notes, avis) | Oui | Facultative | Fonctionnalité de l'app |
| Appareil ou autres ID → **ID d'appareil** (notifications) | Oui | Facultative | Fonctionnalité de l'app |

Tout le reste (position, photos, contacts, finances, santé, messages, fichiers,
historique de navigation) : **Non collecté**.

Pour chaque ligne : traitement **non éphémère**, l'utilisateur **peut choisir**
de ne pas fournir ces données (l'app marche sans compte).

### Application gouvernementale / fonctionnalités financières / santé / actualités
**Non** à tout.

---

## 4. Test fermé (obligatoire avant la production pour un compte personnel)

1. Tests → **Tests fermés** → créer un canal (ex. « Amis »).
2. Envoyer le `.aab` dans ce canal.
3. Ajouter une liste de testeurs : **au moins 12 adresses Gmail**.
4. Chaque testeur ouvre le lien d'inscription, accepte, puis **installe l'app depuis le Play Store** et la garde installée.
5. Attendre **14 jours d'affilée** avec au moins 12 testeurs inscrits.
6. Tableau de bord → **Demander l'accès à la production**. Google pose quelques
   questions sur le test : réponds honnêtement (retours reçus, corrections faites).

Message à envoyer aux testeurs :

```
Salut ! Je publie The Bitter sur le Play Store et Google me demande 12 testeurs pendant 14 jours.
1. Ouvre ce lien avec ton compte Google : <LIEN D'INSCRIPTION>
2. Clique « Devenir testeur », puis installe l'app depuis le Play Store.
3. Garde-la installée au moins deux semaines (tu peux l'utiliser comme d'habitude).
Merci 🙏
```
