import { useEffect, useRef, useState } from 'react';
import {
  EPISODE_SESSION_EVENT,
  EpisodeSession,
  readEpisodeSession,
  sessionMoment,
  writeEpisodeSession,
} from './episodeSession';

/** La séance en cours, relue à chaque changement, y compris depuis un autre onglet. */
export function useEpisodeSession(): EpisodeSession | null {
  const [session, setSession] = useState<EpisodeSession | null>(readEpisodeSession);
  useEffect(() => {
    const refresh = () => setSession(readEpisodeSession());
    window.addEventListener(EPISODE_SESSION_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(EPISODE_SESSION_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, []);
  return session;
}

/**
 * Au retour dans l'app, propose de cocher l'épisode lancé.
 *
 * La vérification a lieu à l'ouverture, car iOS ferme volontiers une PWA
 * pendant un épisode, puis chaque fois que l'app repasse au premier plan.
 * `ready` attend que les œuvres du profil soient chargées.
 */
export function useEpisodeReturn(onAsk: (session: EpisodeSession) => void, ready: boolean) {
  const onAskRef = useRef(onAsk);
  onAskRef.current = onAsk;

  useEffect(() => {
    if (!ready) return;
    const check = () => {
      if (document.visibilityState !== 'visible') return;
      const session = readEpisodeSession();
      if (!session) return;
      const moment = sessionMoment(session, Date.now());
      if (moment === 'expired') writeEpisodeSession(null);
      else if (moment === 'ask') onAskRef.current(session);
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => document.removeEventListener('visibilitychange', check);
  }, [ready]);
}
