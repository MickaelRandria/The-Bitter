import React, { useEffect, useState } from 'react';
import { Bell, Check, Loader2 } from 'lucide-react';
import { FilTitle, filWorkKey } from '../utils/cinemaFil';
import { getFilFollows, onCinemaFilChange, readFilLocal, setFilFollow } from '../services/cinemaFil';
import { useLanguage } from '../contexts/LanguageContext';

interface Props { profileId?: string; work: FilTitle; onToast?: (message: string) => void; compact?: boolean }
const FilFollowButton: React.FC<Props> = ({ profileId, work, onToast, compact }) => {
  const { t } = useLanguage();
  const [following, setFollowing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);
  const key = filWorkKey(work.mediaType, work.tmdbId);
  useEffect(() => {
    if (!profileId) return;
    const refresh = () => setFollowing(readFilLocal(profileId).follows.some(f => filWorkKey(f.mediaType, f.tmdbId) === key));
    refresh();
    let alive = true;
    setReady(false);
    void getFilFollows(profileId).then(() => { if (alive) refresh(); }).catch(() => {}).finally(() => { if (alive) setReady(true); });
    const off = onCinemaFilChange(refresh);
    return () => { alive = false; off(); };
  }, [profileId, key]);
  const toggle = async () => {
    if (!profileId || busy) return;
    setBusy(true);
    const result = await setFilFollow(profileId, work, !following);
    setBusy(false);
    if (result.error) onToast?.(t(result.error));
    else { setFollowing(result.data); onToast?.(t(result.data ? result.localOnly ? 'cineFil.followedLocalToast' : 'cineFil.followedToast' : 'cineFil.unfollowedToast')); }
  };
  if (!profileId) return null;
  return <button type="button" onClick={toggle} disabled={busy || !ready} aria-pressed={following}
    className={compact ? 'inline-flex items-center gap-1.5 text-[10px] font-bold text-white/80' : 'flex w-full items-center justify-center gap-2 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-[11px] font-black text-charcoal dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white'}>
    {busy ? <Loader2 size={14} className="animate-spin" /> : following ? <Check size={14} /> : <Bell size={14} />}
    {t(following ? 'cineFil.following' : 'cineFil.follow')}
  </button>;
};
export default FilFollowButton;
