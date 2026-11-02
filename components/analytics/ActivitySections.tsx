import React, { useEffect, useMemo, useState } from 'react';
import { ChevronRight, Minus, Plus } from 'lucide-react';
import type { Movie, UserProfile } from '../../types';
import CinemasSheet from './CinemasSheet';
import SeanceCatchup, { readSkipped } from './SeanceCatchup';
import { catchupCandidates } from '../../utils/seance';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { fmt1 } from '../../utils/verdict';
import { getDisplayWeightedRating } from '../../utils/rating';
import { cinemaStats, goalProgress } from '../../utils/cinemaStats';
import { listPastScreenings } from '../../services/screenings';

/**
 * Deux sections de Profil, « ton activité » : l'objectif de l'année (le même que
 * dans le calendrier) et tes salles (d'après tes séances).
 */

/** La même clé que le calendrier : un seul objectif. */
const GOAL_KEY = 'bitter_calendar_goal_v1';
const card = 'rounded-[22px] border border-sand bg-white px-4 py-4 dark:border-white/[0.08] dark:bg-[#1C1B19]';

const Head: React.FC<{ title: string; aside?: React.ReactNode }> = ({ title, aside }) => (
  <div className="flex items-baseline justify-between gap-3 px-1">
    <h3 className="text-[17px] font-black tracking-[-0.035em] text-charcoal dark:text-white">{title}</h3>
    {aside}
  </div>
);

export const YearGoalSection: React.FC<{ movies: Movie[] }> = ({ movies }) => {
  const { t } = useLanguage();
  const now = new Date();
  const year = now.getFullYear();
  const [goal, setGoal] = useState(() => {
    try {
      const saved = Number(localStorage.getItem(GOAL_KEY));
      return Number.isInteger(saved) && saved > 0 ? saved : 100;
    } catch {
      return 100;
    }
  });
  const [editing, setEditing] = useState(false);
  const count = movies.filter((m) => m.status === 'watched' && new Date(m.dateWatched || m.dateAdded).getFullYear() === year).length;
  const p = goalProgress(count, goal, now);
  const pct = Math.min(100, (count / goal) * 100);
  const change = (next: number) => {
    const value = Math.max(1, Math.min(999, next));
    haptics.soft();
    setGoal(value);
    try {
      localStorage.setItem(GOAL_KEY, String(value));
    } catch {
      // Sans stockage, l'objectif vaut pour cette visite.
    }
  };
  return (
    <section className="flex flex-col gap-[11px]">
      <Head
        title={t('activity.goal', { year: String(year) })}
        aside={
          <button type="button" onClick={() => setEditing((v) => !v)} className="text-[11px] font-black text-forest dark:text-bitter-lime">
            {editing ? t('activity.done') : t('activity.edit')}
          </button>
        }
      />
      <div className={`${card} flex items-center gap-4`}>
        <span
          className="relative flex h-[88px] w-[88px] shrink-0 items-center justify-center rounded-full [--goal-ink:#1A1A1A] [--goal-track:#F2EFE9] dark:[--goal-ink:#D9FF00] dark:[--goal-track:rgba(255,255,255,0.1)]"
          style={{ background: `conic-gradient(var(--goal-ink) 0 ${pct}%, var(--goal-track) ${pct}% 100%)` }}
          role="img"
          aria-label={t('activity.goalAria', { n: String(count), goal: String(goal) })}
        >
          <span className="flex h-[68px] w-[68px] flex-col items-center justify-center rounded-full bg-white dark:bg-[#1C1B19]">
            <b className="text-[21px] font-black leading-none tracking-[-0.05em] text-charcoal dark:text-white">{count}</b>
            <small className="mt-0.5 text-[9px] font-extrabold text-stone-400">{t('activity.outOf', { goal: String(goal) })}</small>
          </span>
        </span>
        {editing ? (
          <div className="flex flex-1 items-center justify-center gap-3">
            <button type="button" aria-label={t('activity.less')} onClick={() => change(goal - 5)} className="flex h-11 w-11 items-center justify-center rounded-full bg-sand dark:bg-white/10">
              <Minus size={18} />
            </button>
            <b className="w-14 text-center text-[26px] font-black tracking-[-0.05em] text-charcoal dark:text-white">{goal}</b>
            <button type="button" aria-label={t('activity.more')} onClick={() => change(goal + 5)} className="flex h-11 w-11 items-center justify-center rounded-full bg-sand dark:bg-white/10">
              <Plus size={18} />
            </button>
          </div>
        ) : (
          <div className="min-w-0">
            <p className="text-[15px] font-black tracking-[-0.02em] text-charcoal dark:text-white">
              {count >= goal
                ? t('activity.reached')
                : p.ahead >= 1
                  ? t('activity.ahead', { n: String(p.ahead) })
                  : p.ahead <= -1
                    ? t('activity.behind', { n: String(-p.ahead) })
                    : t('activity.onPace')}
            </p>
            <p className="mt-1 text-[12px] font-semibold leading-snug text-stone-500 dark:text-stone-400">
              {t('activity.projection', { n: String(p.projection) })}{' '}
              {count < goal && t('activity.perWeek', { n: fmt1(p.left / p.weeksLeft) })}
            </p>
          </div>
        )}
      </div>
    </section>
  );
};

export const CinemasSection: React.FC<{
  movies: Movie[];
  currentUserId?: string;
  fromYear: number | null;
  userProfile?: UserProfile | null;
  onViewMovie?: (movie: Movie) => void;
}> = ({ movies, currentUserId, fromYear, userProfile = null, onViewMovie }) => {
  const { t } = useLanguage();
  /** La fenêtre de détail : ouverte sur la vue d'ensemble (`''`) ou sur un cinéma. */
  const [detail, setDetail] = useState<string | null>(null);
  const [screenings, setScreenings] = useState<Awaited<ReturnType<typeof listPastScreenings>> | null>(null);
  const [reload, setReload] = useState(0);
  const [catchupOpen, setCatchupOpen] = useState(false);
  /** Toutes tes séances, toutes périodes : pour savoir quels films en ont une. */
  const [allScreened, setAllScreened] = useState<Set<number>>(new Set());
  useEffect(() => {
    if (!currentUserId) return;
    listPastScreenings(currentUserId).then((list) => setAllScreened(new Set(list.map((s) => s.tmdbId).filter((id): id is number => id != null))));
  }, [currentUserId, reload]);
  useEffect(() => {
    if (!currentUserId) return;
    let alive = true;
    const from = fromYear ? new Date(fromYear, 0, 1).toISOString() : undefined;
    listPastScreenings(currentUserId, from).then((list) => {
      if (!alive) return;
      setScreenings(fromYear ? list.filter((s) => new Date(s.startsAt).getFullYear() === fromYear) : list);
    });
    return () => {
      alive = false;
    };
  }, [currentUserId, fromYear, reload]);

  const ratings = useMemo(() => {
    const map = new Map<number, number>();
    for (const m of movies) if (m.status === 'watched' && m.tmdbId != null) map.set(m.tmdbId, getDisplayWeightedRating(m));
    return map;
  }, [movies]);
  const report = useMemo(() => (screenings ? cinemaStats(screenings, (id) => ratings.get(id)) : null), [screenings, ratings]);
  // Les films vus au cinéma (ou pendant leur sortie) qui n'ont pas de séance.
  const missing = useMemo(
    () =>
      screenings
        ? catchupCandidates(
            movies.map((m) => ({ ...m, location: m.watches?.[0]?.viewingContext?.locationType })),
            allScreened,
            readSkipped()
          )
        : [],
    [movies, allScreened, screenings, catchupOpen]
  );
  const knownCinemas = useMemo(() => {
    const names = [userProfile?.favoriteCinema?.name, ...(report?.cinemas.map((c) => c.name) ?? [])].filter((n): n is string => !!n);
    return [...new Set(names)];
  }, [report, userProfile]);
  const catchup = currentUserId && missing.length > 0 && (
    <>
      <button
        type="button"
        onClick={() => {
          haptics.soft();
          setCatchupOpen(true);
        }}
        className="flex items-center gap-3.5 rounded-[24px] bg-bitter-lime p-4 text-left text-charcoal active:scale-[0.99]"
      >
        <span aria-hidden="true" className="relative h-[66px] w-[74px] shrink-0">
          {missing.slice(0, 3).map((m, i) =>
            m.posterUrl ? (
              <img
                key={m.id}
                src={resizeTmdbImage(m.posterUrl, 'w92')}
                alt=""
                className="absolute h-[60px] w-10 rounded-lg object-cover shadow-[0_6px_12px_rgba(0,0,0,0.25)]"
                style={{ left: i * 16, top: i === 1 ? 0 : 4, transform: `rotate(${(i - 1) * 7}deg)` }}
              />
            ) : null
          )}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-black tracking-[-0.02em]">{t(missing.length > 1 ? 'catchup.cardMany' : 'catchup.cardOne', { n: String(missing.length) })}</b>
          <small className="text-[12px] font-bold opacity-75">{t('catchup.cardSub')}</small>
        </span>
      </button>
      {catchupOpen && (
        <SeanceCatchup
          films={missing}
          cinemas={knownCinemas}
          currentUserId={currentUserId}
          onDone={() => setReload((n) => n + 1)}
          onClose={() => {
            setCatchupOpen(false);
            setReload((n) => n + 1);
          }}
        />
      )}
    </>
  );
  if (!report || report.sessions < 2) {
    return catchup ? (
      <section className="flex flex-col gap-[11px]">
        <Head title={t('activity.cinemas')} />
        {catchup}
      </section>
    ) : null;
  }
  const max = report.cinemas[0]?.count ?? 1;
  const totalFormats = report.formats.reduce((a, f) => a + f.count, 0);

  return (
    <section className="flex flex-col gap-[11px]">
      <Head
        title={t('activity.cinemas')}
        aside={
          <button type="button" onClick={() => { haptics.soft(); setDetail(''); }} className="flex items-center gap-0.5 text-[11px] font-black text-forest dark:text-bitter-lime">
            {t('salles.seeAll')} <ChevronRight size={13} />
          </button>
        }
      />
      <div
        role="button"
        tabIndex={0}
        onClick={() => { haptics.soft(); setDetail(''); }}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setDetail('');
          }
        }}
        aria-label={t('salles.open')}
        className={`${card} flex cursor-pointer flex-col gap-3 transition-transform active:scale-[0.99]`}
      >
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-2xl bg-sand p-3 dark:bg-white/[0.06]">
            <b className="block text-[22px] font-black tracking-[-0.05em] text-charcoal dark:text-white">{report.sessions}</b>
            <small className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t('activity.sessions')}</small>
          </div>
          <div className="rounded-2xl bg-sand p-3 dark:bg-white/[0.06]">
            <b className="block text-[22px] font-black tracking-[-0.05em] text-charcoal dark:text-white">{report.cinemas.length}</b>
            <small className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">{t(report.cinemas.length > 1 ? 'activity.cinemasMany' : 'activity.cinemasOne')}</small>
          </div>
        </div>
        <ul className="flex flex-col gap-2">
          {report.cinemas.slice(0, 5).map((c) => (
            <li
              key={c.name}
              onClick={(event) => {
                event.stopPropagation();
                haptics.soft();
                setDetail(c.name);
              }}
              className="grid grid-cols-[minmax(0,7rem)_1fr_2rem] items-center gap-2.5"
            >
              <span className="truncate text-[12px] font-extrabold text-charcoal dark:text-white">{c.name}</span>
              <span aria-hidden="true" className="h-2.5 overflow-hidden rounded-full bg-sand dark:bg-white/[0.08]">
                <span className="block h-full rounded-full bg-charcoal dark:bg-[#F4F1EA]" style={{ width: `${(c.count / max) * 100}%` }} />
              </span>
              <b className="text-right text-[12px] font-black tabular-nums text-charcoal dark:text-white">{c.count}</b>
            </li>
          ))}
        </ul>
        {report.formats.length > 0 && (
          <div className="flex flex-wrap gap-1.5 border-t border-sand pt-3 dark:border-white/[0.08]">
            {report.formats.map((f) => (
              <span key={f.label} className="rounded-full bg-sand px-2.5 py-1 text-[11px] font-black text-charcoal dark:bg-white/[0.08] dark:text-white">
                {f.label} <span className="text-stone-500 dark:text-stone-400">{Math.round((f.count / totalFormats) * 100)} %</span>
              </span>
            ))}
          </div>
        )}
        {report.best && report.best.average != null && (
          <p className="text-[12px] font-bold text-stone-500 dark:text-stone-400">
            {t('activity.best', { name: report.best.name, avg: fmt1(report.best.average) })}
          </p>
        )}
      </div>
      {catchup}
      {detail != null && screenings && (
        <CinemasSheet
          screenings={screenings}
          movies={movies}
          userProfile={userProfile}
          periodLabel={fromYear ? String(fromYear) : t('statsPeriod.all')}
          initialCinema={detail || null}
          onViewMovie={(movie) => {
            setDetail(null);
            onViewMovie?.(movie);
          }}
          onClose={() => setDetail(null)}
        />
      )}
    </section>
  );
};
