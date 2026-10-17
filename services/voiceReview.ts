import { supabase } from './supabase';

/**
 * Dictée d'un avis : on enregistre ici, on transcrit dans `review-voice`.
 *
 * Pourquoi pas la reconnaissance vocale du navigateur, gratuite et instantanée ?
 * Parce qu'elle n'existe pas partout (Firefox, PWA iPhone selon les versions),
 * qu'elle se coupe au premier silence sur Android et qu'elle ne ponctue presque
 * rien en français. Voxtral, lui, reçoit le titre et les noms du film, et un
 * avis de trente secondes coûte un dixième de centime.
 */

/** Au-delà, ce n'est plus un avis, c'est une critique : on s'arrête de soi-même. */
export const MAX_DICTATION_MS = 120_000;
/** En deçà, c'est un appui involontaire : rien n'est envoyé. */
export const MIN_DICTATION_MS = 800;

/** Dans l'ordre de préférence : Opus est trois fois plus léger que l'AAC d'iOS. */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/ogg;codecs=opus',
  'audio/mp4',
  'audio/webm',
];

export const canDictate = (): boolean =>
  typeof window !== 'undefined' &&
  !!navigator.mediaDevices?.getUserMedia &&
  typeof window.MediaRecorder !== 'undefined' &&
  !!supabase;

const pickMime = (): string | undefined =>
  MIME_CANDIDATES.find((type) => {
    try {
      return MediaRecorder.isTypeSupported(type);
    } catch {
      return false;
    }
  });

export type DictationErrorCode = 'denied' | 'no_mic' | 'empty' | 'failed';

export class DictationError extends Error {
  code: DictationErrorCode;

  constructor(code: DictationErrorCode, message?: string) {
    super(message ?? code);
    this.code = code;
  }
}

export interface Recording {
  /** Termine et rend l'audio ; `null` si l'enregistrement était trop court. */
  stop: () => Promise<Blob | null>;
  /** Abandonne sans rien rendre. */
  cancel: () => void;
  /** Niveau sonore instantané, entre 0 et 1, pour l'indicateur. */
  level: () => number;
}

/**
 * Ouvre le micro et commence à enregistrer.
 *
 * Le traitement du navigateur (annulation d'écho, réduction de bruit, gain
 * automatique) est demandé explicitement : en sortie de salle ou dans la rue,
 * c'est lui qui fait la différence avant même la transcription.
 */
export async function startRecording(onAutoStop?: () => void): Promise<Recording> {
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
      },
    });
  } catch (error: any) {
    const name = error?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') throw new DictationError('denied');
    if (name === 'NotFoundError' || name === 'OverconstrainedError')
      throw new DictationError('no_mic');
    throw new DictationError('failed', String(error));
  }

  const mimeType = pickMime();
  const recorder = new MediaRecorder(stream, {
    ...(mimeType ? { mimeType } : {}),
    audioBitsPerSecond: 32_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  // L'indicateur de niveau : sans lui, on ne sait pas si le micro entend.
  let audioContext: AudioContext | null = null;
  let analyser: AnalyserNode | null = null;
  try {
    const Context = window.AudioContext || (window as any).webkitAudioContext;
    audioContext = new Context();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 512;
    audioContext.createMediaStreamSource(stream).connect(analyser);
  } catch {
    analyser = null;
  }
  const samples = analyser ? new Uint8Array(analyser.fftSize) : null;

  const startedAt = Date.now();
  const release = () => {
    clearTimeout(autoStop);
    stream.getTracks().forEach((track) => track.stop());
    audioContext?.close().catch(() => undefined);
  };
  const autoStop = setTimeout(() => onAutoStop?.(), MAX_DICTATION_MS);

  // Un morceau par seconde : un enregistreur interrompu (appel entrant, écran
  // verrouillé) a au moins livré ce qu'il avait déjà.
  recorder.start(1000);

  return {
    stop: () =>
      new Promise<Blob | null>((resolve) => {
        const finish = () => {
          release();
          if (Date.now() - startedAt < MIN_DICTATION_MS || chunks.length === 0)
            return resolve(null);
          resolve(
            new Blob(chunks, {
              type: (recorder.mimeType || mimeType || 'audio/webm').split(';')[0],
            })
          );
        };
        if (recorder.state === 'inactive') return finish();
        recorder.onstop = finish;
        recorder.stop();
      }),
    cancel: () => {
      recorder.onstop = null;
      if (recorder.state !== 'inactive') recorder.stop();
      release();
    },
    level: () => {
      if (!analyser || !samples) return 0;
      analyser.getByteTimeDomainData(samples);
      let peak = 0;
      for (const sample of samples) peak = Math.max(peak, Math.abs(sample - 128));
      return Math.min(1, peak / 64);
    },
  };
}

export interface Transcript {
  /** Le texte mis au propre, ou la dictée époussetée si la mise au propre a échoué. */
  text: string;
  /** Ce que Voxtral a entendu, mot pour mot. */
  raw: string;
  polished: boolean;
}

/**
 * Envoie l'audio à la fonction de dictée.
 *
 * `names` : titre, réalisateur, acteurs. Ils servent de vocabulaire imposé à la
 * transcription, et c'est le plus gros gain de qualité de toute la chaîne.
 */
export async function transcribeReview(
  audio: Blob,
  names: string[],
  lang: 'fr' | 'en'
): Promise<Transcript> {
  if (!supabase) throw new DictationError('failed');

  const extension = audio.type.includes('mp4')
    ? 'm4a'
    : audio.type.includes('ogg')
      ? 'ogg'
      : 'webm';
  const form = new FormData();
  form.append('audio', audio, `avis.${extension}`);
  form.append('lang', lang);
  form.append('terms', JSON.stringify(names.filter(Boolean)));

  const { data, error } = await supabase.functions.invoke('review-voice', { body: form });
  if (error) {
    // Même lecture que `callAI` : `invoke` ne remonte que le statut.
    const response = (error as { context?: Response }).context;
    if (response && typeof response.json === 'function') {
      const detail = await response.json().catch(() => null);
      if (detail?.message) throw new DictationError('failed', detail.message);
    }
    throw new DictationError('failed');
  }

  const text = String(data?.text ?? '').trim();
  if (!text) throw new DictationError('empty');
  return { text, raw: String(data?.raw ?? text).trim(), polished: !!data?.polished };
}
