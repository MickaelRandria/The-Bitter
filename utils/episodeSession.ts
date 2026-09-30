/**
 * La séance en cours : l'épisode qu'on vient de lancer depuis The Bitter.
 *
 * L'app ne voit rien de ce qui se passe dans Netflix. Elle retient seulement
 * quel épisode a été lancé et quand, pour poser la question au bon moment :
 * « Alors, cet épisode ? » au retour, une fois qu'il a pu se finir.
 *
 * Elle vit dans le navigateur et pas dans le compte : c'est un état de
 * l'appareil sur lequel on regarde, pas une donnée à synchroniser.
 */

/** Le mode épisode s'ouvre avant l'épisode, ou au retour pour demander comment c'était. */
export type CompanionPhase = 'before' | 'after';

export interface EpisodeSession {
  seriesId: string;
  season: number;
  episode: number;
  /** En minutes, quand TMDB la connaît. */
  runtime?: number;
  startedAt: number;
  /** La dernière fois que la question a été remise à plus tard. */
  promptedAt?: number;
}

const KEY = 'bitter.episodeSession';
export const EPISODE_SESSION_EVENT = 'bitter:episode-session';

const MINUTE = 60_000;
/** Durée supposée d'un épisode dont TMDB ne donne pas la durée. */
const DEFAULT_RUNTIME = 40;
/** Au-delà, l'épisode est trop loin pour qu'on en parle encore. */
const FORGET_AFTER = 36 * 60 * MINUTE;
/** « Pas encore fini » : on ne redemande pas avant ce délai. */
const SNOOZE = 15 * MINUTE;

export type SessionMoment = 'watching' | 'ask' | 'expired';

/**
 * Où en est la séance. On ne demande qu'après 60 % de l'épisode, et au moins
 * dix minutes : revenir dans l'app pour lire un message n'est pas avoir fini.
 */
export function sessionMoment(session: EpisodeSession, now: number): SessionMoment {
  const elapsed = now - session.startedAt;
  if (elapsed > FORGET_AFTER || elapsed < 0) return 'expired';
  const threshold = Math.max(10, Math.round((session.runtime ?? DEFAULT_RUNTIME) * 0.6)) * MINUTE;
  if (elapsed < threshold) return 'watching';
  if (session.promptedAt != null && now - session.promptedAt < SNOOZE) return 'watching';
  return 'ask';
}

export function readEpisodeSession(): EpisodeSession | null {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as EpisodeSession;
    return typeof value?.seriesId === 'string' && typeof value.startedAt === 'number' ? value : null;
  } catch {
    return null;
  }
}

export function writeEpisodeSession(session: EpisodeSession | null): void {
  try {
    if (session) localStorage.setItem(KEY, JSON.stringify(session));
    else localStorage.removeItem(KEY);
  } catch {
    /* Navigation privée ou stockage plein : la séance ne survivra pas, rien de plus. */
  }
  window.dispatchEvent(new Event(EPISODE_SESSION_EVENT));
}
