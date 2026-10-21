import { useSyncExternalStore } from 'react';
import { freshPreview } from '../services/soundtrack';

/**
 * Le lecteur des extraits de bande originale, unique pour toute l'appli.
 *
 * Un seul élément audio : lancer un morceau arrête le précédent, où qu'il ait
 * été lancé (fiche, liste complète, notation). Les liens Deezer expirent vite ;
 * sur une erreur de lecture, on redemande un lien frais une fois avant de
 * renoncer.
 */

export interface PreviewState {
  trackId: number | null;
  playing: boolean;
  /** Secondes écoulées dans l'extrait. */
  position: number;
  /** Durée de l'extrait, 30 s chez Deezer. */
  length: number;
  failed: boolean;
}

const IDLE: PreviewState = { trackId: null, playing: false, position: 0, length: 30, failed: false };

let state: PreviewState = IDLE;
let audio: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

const set = (next: Partial<PreviewState>) => {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
};

function element(): HTMLAudioElement {
  if (audio) return audio;
  audio = new Audio();
  audio.preload = 'none';
  audio.addEventListener('timeupdate', () => {
    // Quatre fois par seconde suffit à une barre de progression.
    if (Math.abs(audio!.currentTime - state.position) >= 0.25) set({ position: audio!.currentTime });
  });
  audio.addEventListener('loadedmetadata', () => {
    if (Number.isFinite(audio!.duration)) set({ length: audio!.duration });
  });
  audio.addEventListener('ended', () => set({ playing: false, position: 0 }));
  audio.addEventListener('pause', () => set({ playing: false }));
  audio.addEventListener('playing', () => set({ playing: true, failed: false }));
  return audio;
}

async function start(trackId: number, url: string, retried: boolean): Promise<void> {
  const player = element();
  player.src = url;
  try {
    await player.play();
  } catch (error) {
    // Lecture refusée par le navigateur (pas de geste) : rien à réessayer.
    if ((error as DOMException)?.name === 'NotAllowedError') return set({ playing: false });
    if (retried || state.trackId !== trackId) return set({ playing: false, failed: true });
    const fresh = await freshPreview(trackId).catch(() => null);
    if (!fresh || state.trackId !== trackId) return set({ playing: false, failed: true });
    return start(trackId, fresh, true);
  }
}

/** Lance l'extrait, ou le met en pause s'il joue déjà. */
export function togglePreview(track: { id: number; preview: string | null }) {
  if (state.trackId === track.id) {
    const player = element();
    if (state.playing) player.pause();
    else void player.play().catch(() => set({ playing: false }));
    return;
  }
  set({ trackId: track.id, playing: false, position: 0, length: 30, failed: false });
  if (!track.preview) {
    void freshPreview(track.id)
      .catch(() => null)
      .then((url) => (url && state.trackId === track.id ? start(track.id, url, true) : set({ failed: true })));
    return;
  }
  void start(track.id, track.preview, false);
}

/** Arrête la lecture : à la fermeture de l'écran qui l'a lancée. */
export function stopPreview() {
  audio?.pause();
  if (audio) audio.removeAttribute('src');
  state = IDLE;
  listeners.forEach((listener) => listener());
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const usePreviewPlayer = () => useSyncExternalStore(subscribe, () => state, () => IDLE);
