import { UserProfile } from '../types';

export const BACKUP_SCHEMA = 'the-bitter-backup';
export const BACKUP_VERSION = 1;

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
] as const;

type PreferenceKey = (typeof PREFERENCE_KEYS)[number];
type BackupPreferences = Record<PreferenceKey, string | null>;

export interface TheBitterBackup {
  schema: typeof BACKUP_SCHEMA;
  version: typeof BACKUP_VERSION;
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

const isMovie = (value: unknown): boolean =>
  isRecord(value) &&
  typeof value.id === 'string' &&
  typeof value.title === 'string' &&
  typeof value.director === 'string' &&
  typeof value.year === 'number' &&
  typeof value.genre === 'string' &&
  (value.status === 'watched' || value.status === 'watchlist') &&
  typeof value.dateAdded === 'number' &&
  isRating(value.ratings);

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
  if (!isRecord(value) || value.schema !== BACKUP_SCHEMA || value.version !== BACKUP_VERSION) {
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
    version: BACKUP_VERSION,
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
