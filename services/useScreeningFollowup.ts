import { useEffect, useMemo, useRef, useState } from 'react';
import type { CinemaScreening, Movie } from '../types';
import { cancelPastScreening, confirmScreeningRating, listRecentScreenings } from './screenings';
import { screeningRatingDue } from '../utils/screeningFollowup';
import { getNotificationPrefs } from '../utils/notifications';

export function useScreeningFollowup(profileId: string | undefined, movies: Movie[]) {
  const [screenings, setScreenings] = useState<CinemaScreening[]>([]);
  const [now, setNow] = useState(Date.now());
  const [snoozed, setSnoozed] = useState<Record<string, number>>({});
  const [cancelling, setCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(false);
  const [linking, setLinking] = useState(false);
  const [linkError, setLinkError] = useState(false);
  const owner = useRef(profileId);
  owner.current = profileId;
  const key = `bitter_screening_followup_${profileId ?? 'local'}`;
  useEffect(() => {
    let alive = true;
    setScreenings([]);
    setLinkError(false); setLinking(false);
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
  const confirm = async (id: string) => {
    if (!profileId || linking) return false;
    setLinking(true); setLinkError(false);
    const ok = await confirmScreeningRating(profileId, id);
    if (owner.current !== profileId) return false;
    if (ok) setScreenings(rows => rows.map(row => row.id === id ? { ...row, ratingConfirmedAt: Date.now() } : row));
    else setLinkError(true);
    setLinking(false);
    return ok;
  };
  return { due, screenings, prompt: due.find(row => (snoozed[row.id] || 0) <= now), snooze, cancel, cancelling, cancelError, confirm, linking, linkError };
}
