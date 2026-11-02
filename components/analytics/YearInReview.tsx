import React, { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, X } from 'lucide-react';
import type { Movie, UserProfile } from '../../types';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { getDisplayWeightedRating } from '../../utils/rating';
import { getPublicRating } from '../../utils/publicRating';
import { fmt1 } from '../../utils/verdict';
import { totalWatchHours } from '../../utils/movieStats';
import { cinemaArchetype } from '../../utils/cinemaPortrait';
import { calendarHistory } from '../../utils/calendarAgenda';
import { computeAffinities, type Affinity } from '../../utils/affinities';
import { periodMovies } from '../../utils/statsPeriod';
import { loadAffinityEntries } from '../../services/affinities';
import { listPastScreenings } from '../../services/screenings';

const YearStoriesSheet = lazy(() => import('../yearStories/YearStoriesSheet'));

/**
 * « Ton année en cinéma » : le bilan d'une année en stories, à faire défiler
 * d'un geste. Les chiffres de l'année, le genre, le film, la surprise, le duo
 * (d'après tes espaces) et le profil ; la dernière carte ouvre « Mon année »
 * pour partager les affiches.
 */

interface ViewerProps {
  year: number;
  movies: Movie[];
  userProfile: UserProfile | null;
  currentUserId?: string;
  onClose: () => void;
  onToast?: (message: string) => void;
}

type Slide = { id: string; tone: 'ink' | 'lime' | 'poster'; poster?: string; node: React.ReactNode };

function YearViewer({ year, movies, userProfile, currentUserId, onClose, onToast }: ViewerProps) {
  const { t } = useLanguage();
  const [index, setIndex] = useState(0);
  const [cinemaCount, setCinemaCount] = useState<number | null>(null);
  const [twin, setTwin] = useState<Affinity | null>(null);
  const [sharing, setSharing] = useState(false);

  const watched = useMemo(() => periodMovies(movies, year).filter((m) => m.status === 'watched'), [movies, year]);
  const score = (m: Movie) => getDisplayWeightedRating(m);
  const best = useMemo(() => [...watched].sort((a, b) => score(b) - score(a))[0], [watched]);
  const surprise = useMemo(() => {
    const rows = watched
      .map((m) => ({ m, pub: getPublicRating(m)?.value }))
      .filter((r): r is { m: Movie; pub: number } => typeof r.pub === 'number')
      .map((r) => ({ ...r, gap: score(r.m) - r.pub }))
      .sort((a, b) => b.gap - a.gap);
    return rows[0] && rows[0].gap >= 1 && rows[0].m.id !== best?.id ? rows[0] : null;
  }, [watched, best]);
  const genre = useMemo(() => {
    const map = new Map<string, { n: number; sum: number }>();
    for (const m of watched) {
      if (!m.genre) continue;
      const row = map.get(m.genre) ?? { n: 0, sum: 0 };
      row.n += 1;
      row.sum += score(m);
      map.set(m.genre, row);
    }
    const top = [...map.entries()].sort((a, b) => b[1].n - a[1].n)[0];
    return top ? { name: top[0], count: top[1].n, avg: top[1].sum / top[1].n } : null;
  }, [watched]);
  const archetype = useMemo(() => cinemaArchetype(watched, userProfile), [watched, userProfile]);
  const hours = Math.round(totalWatchHours(watched));
  const history = useMemo(() => calendarHistory(movies), [movies]);

  useEffect(() => {
    if (!currentUserId) return;
    let alive = true;
    listPastScreenings(currentUserId, new Date(year, 0, 1).toISOString()).then(
      (list) => alive && setCinemaCount(list.filter((s) => new Date(s.startsAt).getFullYear() === year).length)
    );
    loadAffinityEntries(currentUserId)
      .then(({ entries }) => alive && setTwin(computeAffinities(currentUserId, entries).friends[0] ?? null))
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [currentUserId, year]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
      if (event.key === 'ArrowRight') setIndex((i) => i + 1);
      if (event.key === 'ArrowLeft') setIndex((i) => Math.max(0, i - 1));
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const kicker = (text: string, lime = false) => (
    <p className={`text-[11px] font-black uppercase tracking-[0.18em] ${lime ? 'text-bitter-lime' : ''}`}>{text}</p>
  );
  const posters = [...watched].sort((a, b) => score(b) - score(a)).slice(0, 5);

  const slides: Slide[] = [
    {
      id: 'count',
      tone: 'ink',
      node: (
        <>
          {kicker(t('year.kicker', { year: String(year) }), true)}
          <p className="mt-6 text-[110px] font-black leading-[0.85] tracking-[-0.08em]">{watched.length}</p>
          <p className="mt-1 text-[26px] font-black tracking-[-0.04em]">{t(watched.length > 1 ? 'year.filmsMany' : 'year.filmsOne')}</p>
          <p className="mt-5 text-[16px] font-semibold leading-snug text-white/75">
            {cinemaCount ? t('year.cinemaLine', { n: String(cinemaCount) }) + ' ' : ''}
            {t('year.hoursLine', { n: String(hours) })}
          </p>
          <div className="mt-auto flex gap-2">
            {posters.map((m, i) =>
              m.posterUrl ? (
                <img key={m.id} src={resizeTmdbImage(m.posterUrl, 'w154')} alt="" className="h-[84px] w-14 rounded-lg object-cover" style={{ transform: `rotate(${(i - 2) * 4}deg)` }} />
              ) : null
            )}
          </div>
        </>
      ),
    },
    ...(genre
      ? [
          {
            id: 'genre',
            tone: 'lime' as const,
            node: (
              <>
                {kicker(t('year.genreKicker'))}
                <p className="mt-auto text-[54px] font-black leading-[0.9] tracking-[-0.065em]">{genre.name}</p>
                <p className="mt-4 text-[17px] font-bold">{t('year.genreLine', { n: String(genre.count), avg: fmt1(genre.avg) })}</p>
              </>
            ),
          },
        ]
      : []),
    ...(best
      ? [
          {
            id: 'best',
            tone: 'poster' as const,
            poster: best.posterUrl,
            node: (
              <>
                {kicker(t('year.bestKicker'), true)}
                <p className="mt-auto text-[44px] font-black leading-[0.92] tracking-[-0.06em]">{best.title}</p>
                <p className="mt-3 text-[64px] font-black leading-none tracking-[-0.07em] text-bitter-lime">{fmt1(score(best))}</p>
              </>
            ),
          },
        ]
      : []),
    ...(surprise
      ? [
          {
            id: 'surprise',
            tone: 'poster' as const,
            poster: surprise.m.posterUrl,
            node: (
              <>
                {kicker(t('year.surpriseKicker'), true)}
                <p className="mt-auto text-[42px] font-black leading-[0.92] tracking-[-0.06em]">{surprise.m.title}</p>
                <p className="mt-3 text-[16px] font-bold text-white/85">
                  {t('year.surpriseLine', { me: fmt1(score(surprise.m)), pub: fmt1(surprise.pub) })}
                </p>
              </>
            ),
          },
        ]
      : []),
    ...(twin
      ? [
          {
            id: 'duo',
            tone: 'lime' as const,
            node: (
              <>
                {kicker(t('year.duoKicker'))}
                <p className="mt-auto text-[44px] font-black leading-[0.95] tracking-[-0.06em]">{t('year.duoTitle', { name: twin.name, score: String(twin.score) })}</p>
                <p className="mt-4 text-[16px] font-bold">{t('year.duoLine', { n: String(twin.common) })}</p>
              </>
            ),
          },
        ]
      : []),
    {
      id: 'profile',
      tone: 'ink',
      node: (
        <>
          {kicker(t('year.profileKicker', { year: String(year) }), true)}
          <p className="mt-auto text-[50px] font-black leading-[0.9] tracking-[-0.065em]">{archetype.title}</p>
          <p className="mt-4 text-[15px] font-semibold leading-snug text-white/75">{archetype.description}</p>
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              haptics.medium();
              setSharing(true);
            }}
            className="mt-6 h-12 self-start rounded-full bg-white px-5 text-[14px] font-black text-charcoal active:scale-95"
          >
            {t('year.share')}
          </button>
        </>
      ),
    },
  ];
  const slide = slides[Math.min(index, slides.length - 1)];
  const next = () => {
    haptics.soft();
    if (index >= slides.length - 1) onClose();
    else setIndex(index + 1);
  };

  return createPortal(
    <div role="dialog" aria-modal="true" aria-label={t('year.title', { year: String(year) })} className="fixed inset-0 z-[120] flex items-center justify-center overflow-hidden overscroll-none bg-black [touch-action:none]">
      <div
        className={`relative flex h-full max-h-[900px] w-full max-w-[480px] flex-col overflow-hidden px-6 pb-10 pt-[calc(env(safe-area-inset-top,0px)+56px)] ${
          slide.tone === 'lime' ? 'bg-bitter-lime text-charcoal' : 'bg-charcoal text-white'
        }`}
      >
        {slide.tone === 'poster' && slide.poster && (
          <>
            <img src={resizeTmdbImage(slide.poster, 'w780')} alt="" className="absolute inset-0 h-full w-full object-cover opacity-60" />
            <span aria-hidden="true" className="absolute inset-0 bg-[linear-gradient(180deg,rgba(0,0,0,0.2),rgba(0,0,0,0.92))]" />
          </>
        )}
        <div className="absolute inset-x-4 top-[calc(env(safe-area-inset-top,0px)+14px)] z-10 flex gap-1" aria-hidden="true">
          {slides.map((s, i) => (
            <i key={s.id} className={`h-[3px] flex-1 rounded-full ${i <= index ? (slide.tone === 'lime' ? 'bg-charcoal' : 'bg-white') : slide.tone === 'lime' ? 'bg-charcoal/20' : 'bg-white/25'}`} />
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className={`absolute right-4 top-[calc(env(safe-area-inset-top,0px)+26px)] z-20 flex h-10 w-10 items-center justify-center rounded-full ${slide.tone === 'lime' ? 'bg-charcoal/10' : 'bg-white/15'}`}
        >
          <X size={18} />
        </button>
        {/* Toucher la moitié gauche revient en arrière, la droite avance. */}
        <button type="button" aria-label={t('year.previous')} onClick={() => setIndex((i) => Math.max(0, i - 1))} className="absolute inset-y-0 left-0 z-[5] w-1/3" />
        <button type="button" aria-label={t('year.next')} onClick={next} className="absolute inset-y-0 right-0 z-[5] w-2/3" />
        <div key={slide.id} className="relative z-10 flex flex-1 flex-col animate-[fadeIn_0.3s_ease-out] [&_button]:pointer-events-auto pointer-events-none">
          {slide.node}
        </div>
      </div>
      {sharing && (
        <Suspense fallback={null}>
          <YearStoriesSheet
            year={year}
            history={history}
            movies={movies}
            firstName={userProfile?.firstName}
            onClose={() => setSharing(false)}
            onToast={onToast}
          />
        </Suspense>
      )}
    </div>,
    document.body
  );
}

/** La bannière en tête de Profil, qui ouvre le bilan. */
export function YearInReviewBanner(props: Omit<ViewerProps, 'onClose'>) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => {
          haptics.medium();
          setOpen(true);
        }}
        className="flex w-full items-center gap-3 rounded-[22px] bg-charcoal px-4 py-3.5 text-left text-white active:scale-[0.99] dark:bg-bitter-lime dark:text-charcoal"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-bitter-lime text-[15px] font-black text-charcoal dark:bg-charcoal dark:text-bitter-lime">
          {String(props.year).slice(2)}
        </span>
        <span className="min-w-0 flex-1">
          <b className="block text-[15px] font-black tracking-[-0.02em]">{t('year.title', { year: String(props.year) })}</b>
          <small className="text-[12px] font-semibold opacity-70">{t('year.bannerSub')}</small>
        </span>
        <ChevronRight size={18} />
      </button>
      {open && <YearViewer {...props} onClose={() => setOpen(false)} />}
    </>
  );
}
