# Publier sur Google Play (TWA)

## 0. Générer le paquet Android

Les valeurs à donner sont dans `android/twa-manifest.json`. Depuis le dossier
`android/` :

```
npm i -g @bubblewrap/cli
bubblewrap init --manifest https://thebitter.watch/manifest.webmanifest
bubblewrap build
```

Au premier lancement, Bubblewrap propose de télécharger lui-même le JDK et le SDK
Android : accepter. `init` pose ensuite ses questions ; répondre avec les valeurs
de `twa-manifest.json` — surtout **Application ID `watch.thebitter.app`**, qui ne
pourra plus jamais changer. Il crée enfin la **clé de signature**
(`android.keystore`, alias `thebitter`) et demande deux mots de passe.

> **La clé et ses mots de passe se sauvegardent hors de l'ordinateur** (gestionnaire
> de mots de passe + une copie du fichier). Perdue, plus aucune mise à jour n'est
> possible sans passer par le support Google ; divulguée, n'importe qui peut signer
> une fausse version. Elle est exclue de git par `.gitignore`.

Le build produit `app-release-bundle.aab` : c'est ce fichier qu'on envoie dans la
console Play. Pour chaque nouvelle version, augmenter `appVersionCode` (entier,
+1) et `appVersionName` dans `twa-manifest.json`, puis `bubblewrap update` et
`bubblewrap build`. Le contenu de l'app, lui, se met à jour sans republier : c'est
le site qui s'affiche.

Accepter **la signature d'application par Google Play** à l'envoi du premier
`.aab` : Google conserve la clé de publication, la vôtre ne sert plus qu'à envoyer.

# Association du domaine pour le TWA Android

`assetlinks.json` est ce qui permet à l'application Android (Trusted Web Activity)
de s'ouvrir en plein écran. Sans lui, Chrome affiche sa barre d'adresse au-dessus
de l'application : elle ressemble alors à un site web dans un cadre, et Google
Play le voit aussi.

Deux valeurs doivent être renseignées, et elles n'existent qu'une fois le paquet
Android créé.

## 1. `package_name`

L'identifiant choisi au moment de générer le TWA, par exemple avec Bubblewrap :

```
npx @bubblewrap/cli init --manifest https://thebitter.watch/manifest.webmanifest
```

La valeur actuellement inscrite, `watch.thebitter.app`, est une proposition. Elle
doit correspondre **exactement** à celle du paquet publié — un identifiant Android
ne peut plus être changé après la première publication sur Play.

## 2. `sha256_cert_fingerprints`

L'empreinte de la clé qui signe l'application. Deux cas, et c'est la source
d'erreur la plus fréquente :

- **Signature gérée par Google Play** (le défaut) — l'empreinte à utiliser est
  celle affichée dans la console Play, sous *Configuration → Intégrité de
  l'application → Certificat de la clé de signature d'application*. Ce n'est pas
  celle de votre keystore local.
- **Signature locale** — obtenue par :
  ```
  keytool -list -v -keystore <votre.keystore> -alias <alias>
  ```

Les deux peuvent être listées ensemble : le tableau accepte plusieurs empreintes,
ce qui est utile pendant les tests.

## Vérifier

Une fois le fichier en ligne et l'application publiée :

```
https://developers.google.com/digital-asset-links/tools/generator
```

Le fichier doit être servi à `https://thebitter.watch/.well-known/assetlinks.json`
en `application/json` — l'en-tête est déjà posé dans `vercel.json`.
