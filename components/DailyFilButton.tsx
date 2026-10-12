import React, { useEffect, useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { tmdbImage } from '../utils/tmdbImage';
import { DAILY_FILMS } from '../config/dailyFilms';
import { filNumber, parisDay, planFor, streakOf } from '../utils/dailyFil';
import { doneDays, isDoneLocally, onFilChange } from '../services/dailyFil';

/**
 * L'entrée du Fil du jour, dans l'en-tête de l'accueil : une mini-affiche, celle
 * du film mystère du jour floutée, avec le numéro du Fil. Tant qu'il n'est pas
 * fait, elle brille (liseré qui respire, reflet, pastille). Une fois fait, elle
 * s'éteint et montre la série de jours.
 */
const DailyFilButton: React.FC<{ onOpen: () => void }> = ({ onOpen }) => {
  const { t } = useLanguage();
  const day = parisDay(Date.now());
  const { number, poster } = useMemo(() => {
    const plan = planFor(DAILY_FILMS, day);
    return { number: filNumber(day), poster: tmdbImage(plan.mystery.film.p, 'w185') };
  }, [day]);
  const [done, setDone] = useState(() => isDoneLocally(day));
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    let alive = true;
    const refresh = async () => {
      const days = await doneDays();
      if (!alive) return;
      setDone(days.has(day));
      setStreak(streakOf(days, day));
    };
    void refresh();
    const off = onFilChange(() => void refresh());
    return () => {
      alive = false;
      off();
    };
  }, [day]);

  return (
    <button
      type="button"
      onClick={() => {
        haptics.medium();
        onOpen();
      }}
      aria-label={done ? t('fil.buttonDone', { n: String(streak) }) : t('fil.buttonTodo', { n: String(number) })}
      className="relative shrink-0 active:scale-90 transition-transform"
    >
      <span
        className={`relative isolate block w-8 h-11 rounded-lg overflow-hidden bg-[#0b0b0b] ${
          done ? 'shadow-[0_6px_14px_-6px_rgba(0,0,0,0.55)]' : 'fil-glow'
        }`}
      >
        <img
          src={poster}
          alt=""
          className={`absolute -inset-1.5 -z-20 w-[calc(100%+12px)] h-[calc(100%+12px)] max-w-none object-cover blur-[3px] ${done ? 'grayscale-[0.6] brightness-75' : 'saturate-150'}`}
        />
        <span className="absolute inset-0 -z-10 bg-gradient-to-b from-black/5 to-black/65" />
        {!done && <span className="fil-sheen absolute -inset-[40%]" aria-hidden="true" />}
        <i className="absolute top-[3px] inset-x-0 text-center not-italic text-[6px] font-black tracking-[0.12em] text-bitter-lime">FIL</i>
        <b className={`absolute bottom-[3px] inset-x-0 text-center text-[10px] font-black tracking-[-0.03em] tabular-nums ${done ? 'text-bitter-lime' : 'text-white'}`}>
          {done ? `${streak} j` : number}
        </b>
      </span>
      {done ? (
        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-bitter-lime border-2 border-cream dark:border-[#0c0c0c] flex items-center justify-center text-charcoal">
          <Check size={8} strokeWidth={4} />
        </span>
      ) : (
        <span className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-[#F08A24] border-2 border-cream dark:border-[#0c0c0c]" />
      )}
    </button>
  );
};

export default DailyFilButton;
