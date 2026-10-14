import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { tmdbImage } from '../utils/tmdbImage';
import { DAILY_FILMS } from '../config/dailyFilms';
import { parisDay, planFor } from '../utils/dailyFil';
import { onCinemaFilChange, readFilLocal } from '../services/cinemaFil';

/** L'accès reste dans le header ; sa pastille signale un Fil pas encore ouvert aujourd'hui. */
const DailyFilButton: React.FC<{ onOpen: () => void; profileId?: string }> = ({ onOpen, profileId = 'local' }) => {
  const { t } = useLanguage();
  const day = parisDay(Date.now());
  const poster = useMemo(() => tmdbImage(planFor(DAILY_FILMS, day).mystery.film.p, 'w185'), [day]);
  const [openedAt, setOpenedAt] = useState(() => readFilLocal(profileId).openedAt);
  useEffect(() => {
    const refresh = () => setOpenedAt(readFilLocal(profileId).openedAt);
    refresh(); return onCinemaFilChange(refresh);
  }, [profileId]);
  const opened = openedAt && parisDay(openedAt) === day;
  return <button type="button" onClick={() => { haptics.medium(); onOpen(); }} aria-label={t('cineFil.headerLabel')} className="relative shrink-0 active:scale-90 transition-transform">
    <span className={`relative isolate block h-11 w-8 overflow-hidden rounded-lg bg-[#0b0b0b] ${opened ? 'shadow-sm' : 'fil-glow'}`}>
      <img src={poster} alt="" className="absolute -inset-1.5 -z-20 h-[calc(100%+12px)] w-[calc(100%+12px)] max-w-none object-cover blur-[3px] saturate-150" />
      <span className="absolute inset-0 -z-10 bg-gradient-to-b from-black/5 to-black/65" />
      <i className="absolute inset-x-0 top-[3px] text-center text-[6px] font-black not-italic tracking-[.12em] text-bitter-lime">FIL</i>
      <b className="absolute inset-x-0 bottom-[3px] text-center text-[10px] font-black tabular-nums text-white">{Number(day.slice(-2))}</b>
    </span>
    <span className={`absolute -right-1 -top-1 flex h-3.5 w-3.5 items-center justify-center rounded-full border-2 border-cream dark:border-[#0c0c0c] ${opened ? 'bg-bitter-lime text-charcoal' : 'bg-[#F08A24]'}`}>{opened && <Check size={8} strokeWidth={4} />}</span>
  </button>;
};
export default DailyFilButton;
