import { UserProfile } from '../types';

export const BACKUP_SCHEMA = 'the-bitter-backup';

/**
 * Version 2 : les séries y sont représentées par une ligne-série et ses
 * saisons, avec progression. Les sauvegardes de version 1 restent importables —
 * elles ne contiennent que des films et des séries sans saison, ce que le
 * modèle actuel sait toujours lire. Refuser une ancienne sauvegarde reviendrait
 * à perdre l'historique de quelqu'un pour une raison de forme.
 */
export const BACKUP_VERSION = 2;
const SUPPORTED_VERSIONS = [1, 2];

/** Préférences locales qui influencent directement l'expérience sans contenir de session ni de secret. */
const PREFERENCE_KEYS = [
  'the-bitter-theme',
  'the_bitter_language',
  'bitter_notification_prefs',
  'bitter_notifications_read',
  'the_bitter_last_seen_version',
  'the_bitter_hide_new_features',
  'the_bitter_seen_tooltips',
  'the_bitter_guide_seen',
  'bitter-recent-searches',
  // La partie (Films ou Séries) où l'on se trouvait : une préférence d'usage,
  // au même titre que le thème ou la langue.
  'bitter_media_mode',
] as const;

type PreferenceKey = (typeof PREFERENCE_KEYS)[number];
type BackupPreferences = Record<PreferenceKey, string | null>;

export interface TheBitterBackup {
  schema: typeof BACKUP_SCHEMA;
  /** Celle du fichier lu, pas forcément la version courante. */
  version: number;
  exportedAt: string;
  profile: UserProfile;
  preferences: BackupPreferences;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isRating = (value: unknown): boolean =>
  isRecord(value) &&
  ['story', 'visuals', 'acting', 'sound'].every(
    (key) => typeof value[key] === 'number' && Number.isFinite(value[key])
  );

const isOptionalNumber = (value: unknown): boolean =>
  value === undefined || (typeof value === 'number' && Number.isFinite(value));

/**
 * Progression d'une série. Facultative : un film n'en a pas, et une série
 * importée d'une sauvegarde version 1 non plus.
 */
const isTvProgress = (value: unknown): boolean => {
  if (value === undefined) return true;
  if (!isRecord(value)) return false;
  const states = ['planned', 'watching', 'paused', 'dropped', 'completed'];
  return (
    typeof value.state === 'string' &&
    states.includes(value.state) &&
    isOptionalNumber(value.lastSeason) &&
    isOptionalNumber(value.lastEpisode) &&
    (value.seasonsWatched === undefined ||
      (Array.isArray(value.seasonsWatched) &&
        value.seasonsWatched.every((n) => typeof n === 'number'))) &&
    typeof value.updatedAt === 'number'
  );
};

/**
 * Une œuvre : film, série ou saison.
 *
 * Les champs TV sont tous facultatifs — c'est ce qui laisse passer les
 * sauvegardes antérieures aux séries sans traitement particulier. Le validateur
 * ne cherche pas à vérifier la cohérence entre `seasonNumber` et
 * `seriesTmdbId` : une sauvegarde n'est pas l'endroit où arbitrer cela, et
 * rejeter tout un fichier pour une incohérence de ce genre coûterait plus cher
 * que de l'importer tel quel.
 */
const isMovie = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  typeof value.director === 'string' &&
  typeof value.year === 'number' &&
  typeof value.genre === 'string' &&
  (value.status === 'watched' || value.status === 'watchlist') &&
  typeof value.dateAdded === 'number' &&
  isRating(value.ratings) &&
  (value.mediaType === undefined || value.mediaType === 'movie' || value.mediaType === 'tv') &&
  isOptionalNumber(value.seasonNumber) &&
  isOptionalNumber(value.seriesTmdbId) &&
  isOptionalNumber(value.numberOfSeasons) &&
  (value.seriesTitle === undefined || typeof value.seriesTitle === 'string') &&
  isTvProgress(value.tvProgress);

/**
 * Crée une sauvegarde portable et complète du profil actif. Les identifiants de
 * session, tokens et données Supabase ne sont volontairement jamais exportés.
 */
export const createBackup = (profile: UserProfile): TheBitterBackup => {
  const preferences = PREFERENCE_KEYS.reduce((result, key) => {
    result[key] = localStorage.getItem(key);
    return result;
  }, {} as BackupPreferences);

  return {
    schema: BACKUP_SCHEMA,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    // JSON garantit une copie indépendante et ne retire aucune donnée sérialisable du profil.
    profile: JSON.parse(JSON.stringify(profile)) as UserProfile,
    preferences,
  };
};

export const parseBackup = (value: unknown): TheBitterBackup | null => {
  if (
    !isRecord(value) ||
    value.schema !== BACKUP_SCHEMA ||
    typeof value.version !== 'number' ||
    !SUPPORTED_VERSIONS.includes(value.version)
  ) {
    return null;
  }

  const { profile, preferences, exportedAt } = value;
  if (
    !isRecord(profile) ||
    typeof profile.id !== 'string' ||
    typeof profile.firstName !== 'string' ||
    typeof profile.lastName !== 'string' ||
    typeof profile.createdAt !== 'number' ||
    !Array.isArray(profile.movies) ||
    !profile.movies.every(isMovie) ||
    !isRecord(preferences) ||
    typeof exportedAt !== 'string'
  ) {
    return null;
  }

  const completePreferences = PREFERENCE_KEYS.reduce((result, key) => {
    const preference = preferences[key];
    result[key] = typeof preference === 'string' ? preference : null;
    return result;
  }, {} as BackupPreferences);

  return {
    schema: BACKUP_SCHEMA,
    // La version lue est conservée : l'appelant sait ainsi qu'il a affaire à
    // une sauvegarde antérieure aux séries, plutôt que de la croire à jour.
    version: value.version,
    exportedAt,
    profile: profile as unknown as UserProfile,
    preferences: completePreferences,
  };
};

export const restoreBackupPreferences = (preferences: BackupPreferences): void => {
  PREFERENCE_KEYS.forEach((key) => {
    const value = preferences[key];
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  });
};
