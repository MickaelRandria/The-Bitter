import { createAvatar } from '@dicebear/core';
import {
  bottts,
  funEmoji,
  notionistsNeutral,
  openPeeps,
  pixelArt,
  thumbs,
} from '@dicebear/collection';

/**
 * Avatars fabriqués sur l'appareil, jamais appelés à distance.
 *
 * DiceBear expose aussi une API HTTP, plus courte à brancher puisqu'une URL se
 * range telle quelle dans `avatar_url`. Elle est écartée pour deux raisons : c'est
 * un service gratuit sans engagement, dont la panne ferait disparaître d'un coup
 * les avatars de tout le monde, et chaque affichage renseignerait un tiers sur qui
 * consulte quoi. La génération locale coûte quelques dizaines de kilo-octets et ne
 * peut pas tomber.
 */
const STYLES = {
  thumbs,
  bottts,
  'fun-emoji': funEmoji,
  'pixel-art': pixelArt,
  'open-peeps': openPeeps,
  'notionists-neutral': notionistsNeutral,
} as const;

export type AvatarStyle = keyof typeof STYLES;

export const AVATAR_STYLES = Object.keys(STYLES) as AvatarStyle[];

/** Préfixe qui distingue un avatar généré d'une vraie URL d'image. */
const PREFIX = 'dicebear:';

/**
 * Descripteur compact plutôt que l'image elle-même.
 *
 * Stocker le SVG gonflerait chaque ligne de plusieurs kilo-octets pour une pastille
 * de quarante pixels, et figerait le rendu : changer de bibliothèque un jour
 * obligerait à réécrire tous les profils. Un style et une graine suffisent à
 * reproduire exactement la même image, indéfiniment.
 */
export const buildAvatarDescriptor = (style: AvatarStyle, seed: string) =>
  `${PREFIX}${style}:${seed}`;

export const isGeneratedAvatar = (value?: string | null) =>
  typeof value === 'string' && value.startsWith(PREFIX);

/**
 * Source utilisable dans un `<img>`, quelle que soit l'origine de l'avatar.
 *
 * Rend une image de données pour un avatar généré, l'URL telle quelle pour une
 * image hébergée, et null quand il n'y a rien : à l'appelant d'afficher alors
 * l'initiale, ce qu'il fait déjà partout.
 */
export const avatarSrc = (value?: string | null): string | null => {
  if (!value) return null;
  if (!isGeneratedAvatar(value)) return value;

  const [, style, ...rest] = value.split(':');
  const seed = rest.join(':');
  const collection = STYLES[style as AvatarStyle];
  if (!collection) return null;

  try {
    // Chaque style déclare ses propres options, si bien que leur union n'est
    // assignable à aucun type commun. Le cast est ici sans danger : `seed` et
    // `radius` sont acceptés par tous, et un style inconnu a déjà été écarté.
    return createAvatar(collection as any, { seed, radius: 50 }).toDataUri();
  } catch {
    return null;
  }
};

/**
 * Graines proposées dans la grille.
 *
 * Dérivées de l'identifiant du profil pour que deux personnes n'aient pas la même
 * planche de choix, et stables d'une ouverture à l'autre : revenir sur l'écran doit
 * retrouver l'avatar qu'on hésitait à prendre, pas une grille entièrement neuve.
 */
export const avatarSeeds = (profileId: string, round = 0, count = 6) =>
  Array.from({ length: count }, (_, i) => `${profileId.slice(0, 8)}-${round}-${i}`);
