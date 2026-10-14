import { useEffect, useMemo, useState } from 'react';
import type { CinemaScreening, Movie } from '../types';
import { cancelPastScreening, listRecentScreenings } from './screenings';
import { screeningRatingDue } from '../utils/screeningFollowup';
import { getNotificationPrefs } from '../utils/notifications';

export function useScreeningFollowup(profileId: string | undefined, movies: Movie[]) {
  const [screenings, setScreenings] = useState<CinemaScreening[]>([]);
  const [now, setNow] = useState(Date.now());
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(false);
  const key = `bitter_screening_followup_${profileId ?? 'local'}`;
  useEffect(() => {
    let alive = true;
    setScreenings([]);
    try { const raw = JSON.parse(localStorage.getItem(key) || '{}'); setSnoozed(raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {}); } catch { setSnoozed({}); }
    const refresh = async () => {
      if (!profileId) return;
      const rows = await listRecentScreenings(profileId);
      if (alive) { setScreenings(rows); setNow(Date.now()); }
    };
    void refresh();
    const visible = () => { if (document.visibilityState === 'visible') void refresh(); };
    const interval = window.setInterval(() => void refresh(), 5 * 60_000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', visible);
    return () => { alive = false; clearInterval(interval); window.removeEventListener('focus', refresh); document.removeEventListener('visibilitychange', visible); };
  }, [profileId, key]);
  const due = useMemo(() => getNotificationPrefs().unrated ? screeningRatingDue(screenings, movies, now) : [], [screenings, movies, now]);
  const snooze = (id: string) => {
    const next = { ...snoozed, [id]: Date.now() + 24 * 60 * 60_000 };
    setSnoozed(next);
    try { localStorage.setItem(key, JSON.stringify(next)); } catch { /* Un refus de stockage n'empêche pas le report courant. */ }
  };
  const cancel = async (id: string) => {
    if (!profileId || cancelling) return;
    setCancelling(true); setCancelError(false);
    const ok = await cancelPastScreening(profileId, id);
    if (ok) setScreenings(rows => rows.filter(row => row.id !== id));
    else setCancelError(true);
    setCancelling(false);
  };
  return { due, prompt: due.find(row => (snoozed[row.id] || 0) <= now), snooze, cancel, cancelling, cancelError };
}
