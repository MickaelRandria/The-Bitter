import React, { useEffect, useMemo, useState } from 'react';
import { Check, LayoutDashboard, Pencil, Rows2, X } from 'lucide-react';
import type { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { fmt1 } from '../utils/verdict';
import {
  MAIN_CHOICES,
  PIN_NOTE_MAX,
  type PinMode,
  type WallFilter,
  type WallPin,
  activePin,
  choicesOf,
  heroMonth,
  heroOf,
  monthKey,
  noteOf,
  sectionsOf,
  statsOf,
  watchedAt,
} from '../utils/filmWall';

interface Props {
  /** Les films vus, déjà passés par la recherche et les filtres de la collection. */
  movies: Movie[];
  profileId: string;
  onOpen: (movie: Movie) => void;
}

const FILTERS: WallFilter[] = ['recent', 'top', 'genre', 'year'];
const FILTER_KEYS: Record<WallFilter, string> = {
  recent: 'wall.filterRecent',
  top: 'wall.filterTop',
  genre: 'wall.filterGenre',
  year: 'wall.filterYear',
};
/** Hauteurs des affiches de la mosaïque, en alternance d'une colonne à l'autre. */
const HEIGHTS = [230, 180, 200, 250, 190, 210];
/** Affiches montrées avant « Voir plus ». */
const PAGE = 40;

const FILTER_KEY = 'bitter_wall_filter';
const pinKey = (profileId: string) => `bitter_wall_pin_${profileId}`;

const readPin = (profileId: string): WallPin | null => {
  try {
    const raw = localStorage.getItem(pinKey(profileId));
    return raw ? (JSON.parse(raw) as WallPin) : null;
  } catch {
    return null;
  }
};

const noteTone = (note: number) =>
  note >= 8 ? 'bg-bitter-lime text-charcoal' : note >= 6 ? 'bg-white text-charcoal' : 'bg-[#F08A24] text-charcoal';

const Tile: React.FC<{ movie: Movie; height: number; onOpen: (movie: Movie) => void }> = ({ movie, height, onOpen }) => {
  const note = noteOf(movie);
  return (
    <button
      type="button"
      onClick={() => {
        haptics.soft();
        onOpen(movie);
      }}
      aria-label={`${movie.title}, ${fmt1(note)}`}
      className="relative mb-2.5 block w-full overflow-hidden rounded-[22px] bg-stone-200 shadow-[0_10px_22px_rgba(26,26,26,0.16)] transition-transform active:scale-[0.98] dark:bg-[#1a1a1a] dark:shadow-none"
      style={{ height }}
    >
      {movie.posterUrl && (
        <img src={resizeTmdbImage(movie.posterUrl, 'w342')} alt="" loading="lazy" className="h-full w-full object-cover" />
      )}
      <span aria-hidden="true" className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-black/80 to-transparent" />
      <span className="absolute inset-x-3 bottom-2.5 flex items-end justify-between gap-2 text-left text-white">
        <span className="line-clamp-2 text-[12px] font-black leading-[1.1] tracking-[-0.02em]">{movie.title}</span>
        <span className={`flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full text-[12px] font-black ${noteTone(note)}`}>
          {fmt1(note)}
        </span>
      </span>
    </button>
  );
};

/**
 * Les films vus en mur : un film en grand, puis la mosaïque en sections (voir
 * utils/filmWall). En « Récents », le film en grand se choisit (« Changer ») ;
 * le choix vaut jusqu'à la fin du mois et reste sur ce téléphone.
 */
const FilmWall: React.FC<Props> = ({ movies, profileId, onOpen }) => {
  const { t, language } = useLanguage();
  const [filter, setFilter] = useState<WallFilter>(() => {
    try {
      const saved = localStorage.getItem(FILTER_KEY) as WallFilter | null;
      return saved && FILTERS.includes(saved) ? saved : 'recent';
    } catch {
      return 'recent';
    }
  });
  const [choice, setChoice] = useState<string | null>(null);
  const [showAllChoices, setShowAllChoices] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [pin, setPin] = useState<WallPin | null>(() => readPin(profileId));
  const [picking, setPicking] = useState(false);

  useEffect(() => setPin(readPin(profileId)), [profileId]);
  useEffect(() => setLimit(PAGE), [filter, choice, movies]);

  const current = activePin(pin, Date.now());
  const choices = useMemo(
    () => (filter === 'genre' || filter === 'year' ? choicesOf(movies, filter) : []),
    [movies, filter]
  );
  const chosen = choices.some((c) => c.value === choice) ? choice : (choices[0]?.value ?? null);
  const hero = heroOf(movies, filter, filter === 'recent' ? current : null, chosen);
  const sections = sectionsOf(movies, filter, chosen, hero?.film.id);

  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const monthName = (key: string, withYear = false) => {
    const [y, m] = key.split('-').map(Number);
    const name = new Intl.DateTimeFormat(locale, { month: 'long', ...(withYear ? { year: 'numeric' } : null) }).format(
      new Date(y, m - 1, 1)
    );
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const thisYear = String(new Date().getFullYear());
  const sectionTitle = (key: string) =>
    filter === 'recent' ? monthName(key, !key.startsWith(thisYear)) : filter === 'top' ? t(`wall.band${key}`) : key;

  const pickFilter = (next: WallFilter) => {
    haptics.soft();
    setFilter(next);
    setShowAllChoices(false);
    try {
      localStorage.setItem(FILTER_KEY, next);
    } catch {
      // Sans stockage, le filtre vaut pour cette visite.
    }
  };

  const savePin = (next: WallPin | null) => {
    setPin(next);
    try {
      if (next) localStorage.setItem(pinKey(profileId), JSON.stringify(next));
      else localStorage.removeItem(pinKey(profileId));
    } catch {
      // Sans stockage, le choix vaut pour cette visite.
    }
  };

  const heroKicker = () => {
    if (!hero) return '';
    if (filter === 'top') return t('wall.heroEver');
    if (filter === 'genre') return t('wall.heroGenre', { value: chosen ?? '' });
    if (filter === 'year') return t('wall.heroYear', { value: chosen ?? '' });
    const month = monthName(monthKey(Date.now())).toLowerCase();
    if (hero.mode === 'pick') return t('wall.heroPick', { month });
    if (hero.mode === 'last') return t('wall.heroLast');
    if (hero.mode === 'ever') return t('wall.heroEver');
    return t('wall.heroMonth', { month: monthName(heroMonth(movies) ?? monthKey(Date.now())).toLowerCase() });
  };

  let shown = 0;
  const visibleChoices = showAllChoices ? choices : choices.slice(0, MAIN_CHOICES);

  return (
    <div className="space-y-4">
      <div className="-mx-6 flex gap-1.5 overflow-x-auto px-6 no-scrollbar">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => pickFilter(f)}
            aria-pressed={filter === f}
            className={`h-[30px] shrink-0 rounded-full px-3 text-[11px] font-extrabold transition-colors ${
              filter === f
                ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal'
                : 'border border-stone-200 bg-white text-stone-500 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-stone-400'
            }`}
          >
            {t(FILTER_KEYS[f])}
          </button>
        ))}
      </div>

      {choices.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {visibleChoices.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                haptics.soft();
                setChoice(c.value);
              }}
              aria-pressed={chosen === c.value}
              className={`h-7 rounded-full px-2.5 text-[11px] font-extrabold ${
                chosen === c.value
                  ? 'bg-bitter-lime text-charcoal'
                  : 'bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-stone-400'
              }`}
            >
              {c.value} <span className="opacity-60">{c.count}</span>
            </button>
          ))}
          {choices.length > MAIN_CHOICES && (
            <button
              type="button"
              onClick={() => setShowAllChoices((v) => !v)}
              aria-expanded={showAllChoices}
              className="h-7 rounded-full border border-dashed border-stone-300 px-2.5 text-[11px] font-extrabold text-stone-500 dark:border-white/15 dark:text-stone-400"
            >
              {showAllChoices ? t('wall.less') : t('wall.more', { count: String(choices.length - MAIN_CHOICES) })}
            </button>
          )}
        </div>
      )}

      {hero && (
        <section aria-label={heroKicker()} className="relative h-[230px] overflow-hidden rounded-[30px] bg-[#111] text-white">
          {hero.film.posterUrl && (
            <>
              <img
                src={resizeTmdbImage(hero.film.posterUrl, 'w154')}
                alt=""
                aria-hidden="true"
                className="pointer-events-none absolute -inset-[30px] h-[calc(100%+60px)] w-[calc(100%+60px)] max-w-none object-cover opacity-60 blur-[24px]"
              />
              <span aria-hidden="true" className="absolute inset-0 bg-black/35" />
              <button
                type="button"
                onClick={() => onOpen(hero.film)}
                aria-label={hero.film.title}
                className="absolute right-[22px] top-[22px] h-[186px] w-[124px] rotate-[5deg] overflow-hidden rounded-2xl shadow-[0_18px_36px_rgba(0,0,0,0.5)]"
              >
                <img src={resizeTmdbImage(hero.film.posterUrl, 'w342')} alt="" className="h-full w-full object-cover" />
              </button>
            </>
          )}
          <div className="pointer-events-none absolute bottom-[22px] left-[22px] top-[22px] flex w-[170px] flex-col">
            <p className="text-[10px] font-black uppercase tracking-[0.18em] text-bitter-lime">{heroKicker()}</p>
            <p className="mt-2 line-clamp-3 text-[28px] font-black leading-[0.95] tracking-[-0.055em]">{hero.film.title}</p>
            <p className="mt-1.5 line-clamp-2 text-[11px] font-bold text-white/70">
              {filter === 'recent' && current?.note
                ? `« ${current.note} »`
                : [hero.film.year, hero.film.director].filter(Boolean).join(' · ')}
            </p>
            <p className="mt-auto text-[52px] font-black leading-[0.85] tracking-[-0.07em] text-bitter-lime">{fmt1(noteOf(hero.film))}</p>
          </div>
          {filter === 'recent' && (
            <button
              type="button"
              onClick={() => {
                haptics.soft();
                setPicking(true);
              }}
              aria-label={t('wall.changeLabel')}
              className="absolute bottom-3.5 right-3.5 z-10 flex h-8 items-center gap-1.5 rounded-full border border-white/25 bg-black/60 pl-2.5 pr-3 text-[11px] font-black backdrop-blur-md active:scale-95"
            >
              <Pencil size={13} strokeWidth={2.6} />
              {t('wall.change')}
            </button>
          )}
        </section>
      )}

      {sections.map((section) => {
        if (shown >= limit) return null;
        const films = section.films.slice(0, limit - shown);
        shown += films.length;
        const stats = statsOf(movies, filter, section.key);
        return (
          <div key={section.key} className="space-y-3">
            <div className="flex items-baseline justify-between px-0.5">
              <h3 className="text-[17px] font-black tracking-[-0.04em] text-charcoal dark:text-white">{sectionTitle(section.key)}</h3>
              <p className="text-[11px] font-extrabold text-stone-400">
                {t(stats.count > 1 ? 'wall.statsMany' : 'wall.statsOne', { count: String(stats.count), avg: fmt1(stats.avg) })}
              </p>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {[0, 1].map((col) => (
                <div key={col}>
                  {films
                    .filter((_, i) => i % 2 === col)
                    .map((m, i) => (
                      <Tile key={m.id} movie={m} height={HEIGHTS[(i * 2 + col) % HEIGHTS.length]} onOpen={onOpen} />
                    ))}
                </div>
              ))}
            </div>
          </div>
        );
      })}

      {sections.reduce((sum, s) => sum + s.films.length, 0) > limit && (
        <button
          type="button"
          onClick={() => setLimit((n) => n + PAGE)}
          className="w-full rounded-2xl border border-stone-200 py-3 text-xs font-black uppercase tracking-widest text-stone-400 transition-all active:scale-95 dark:border-white/5 dark:text-stone-600"
        >
          {t('wall.loadMore')}
        </button>
      )}

      {picking && (
        <PinSheet
          movies={movies}
          pin={current}
          onClose={() => setPicking(false)}
          onSave={(next) => {
            savePin(next);
            setPicking(false);
          }}
        />
      )}
    </div>
  );
};

/** « Ton film à l'affiche » : l'automatique, ou un film choisi, et un mot. */
const PinSheet: React.FC<{
  movies: Movie[];
  pin: WallPin | null;
  onClose: () => void;
  onSave: (pin: WallPin | null) => void;
}> = ({ movies, pin, onClose, onSave }) => {
  const { t } = useLanguage();
  const [mode, setMode] = useState<PinMode>(pin?.mode ?? 'month');
  const [movieId, setMovieId] = useState<string | undefined>(pin?.movieId);
  const [note, setNote] = useState(pin?.note ?? '');

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const month = heroMonth(movies);
  // Les films du mois d'abord (les mieux notés en tête), puis les autres séances.
  const candidates = useMemo(() => {
    const ofMonth = movies.filter((m) => monthKey(watchedAt(m)) === month).sort((a, b) => noteOf(b) - noteOf(a));
    const others = movies
      .filter((m) => monthKey(watchedAt(m)) !== month)
      .sort((a, b) => watchedAt(b) - watchedAt(a))
      .slice(0, 30);
    return [...ofMonth, ...others];
  }, [movies, month]);
  const auto = (m: PinMode) => heroOf(movies, 'recent', { mode: m, month: monthKey(Date.now()) }, null)?.film;

  const options: { mode: PinMode; label: string; film?: Movie }[] = [
    { mode: 'month', label: t('wall.pickMonth'), film: auto('month') },
    { mode: 'last', label: t('wall.pickLast'), film: auto('last') },
    { mode: 'ever', label: t('wall.pickEver'), film: auto('ever') },
    { mode: 'pick', label: t('wall.pickChosen'), film: movies.find((m) => m.id === movieId) },
  ];

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center">
      <button type="button" aria-label={t('wall.pickClose')} onClick={onClose} className="absolute inset-0 bg-black/55" />
      <section
        role="dialog"
        aria-modal="true"
        aria-label={t('wall.pickTitle')}
        className="relative flex max-h-[90dvh] w-full max-w-md flex-col gap-3.5 overflow-y-auto rounded-t-[32px] bg-cream px-5 pb-[calc(env(safe-area-inset-bottom)+24px)] pt-3 text-charcoal shadow-[0_-20px_40px_rgba(0,0,0,0.25)] dark:bg-[#121212] dark:text-white"
      >
        <span aria-hidden="true" className="mx-auto h-[5px] w-10 rounded-full bg-stone-300 dark:bg-white/15" />
        <div className="flex items-start justify-between">
          <h2 className="text-[24px] font-black tracking-[-0.05em]">{t('wall.pickTitle')}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('wall.pickClose')}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-stone-100 dark:bg-white/10"
          >
            <X size={16} />
          </button>
        </div>

        <div role="radiogroup" aria-label={t('wall.pickTitle')} className="flex flex-col gap-1.5">
          {options.map((option) => {
            const on = mode === option.mode;
            return (
              <button
                key={option.mode}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => {
                  haptics.soft();
                  setMode(option.mode);
                  if (option.mode === 'pick' && !movieId) setMovieId(candidates[0]?.id);
                }}
                className={`flex w-full items-center gap-3 rounded-[18px] px-3.5 py-3 text-left ${
                  on ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal' : 'bg-stone-100 dark:bg-white/5'
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-[18px] w-[18px] shrink-0 rounded-full ${on ? 'border-[5px] border-bitter-lime' : 'border-2 border-stone-300 dark:border-white/20'}`}
                />
                <span className="flex min-w-0 flex-col gap-0.5">
                  <span className="text-[13px] font-black tracking-[-0.02em]">{option.label}</span>
                  {option.film && (
                    <span className={`truncate text-[11px] font-semibold ${on ? 'opacity-70' : 'text-stone-500 dark:text-stone-400'}`}>
                      {option.mode === 'pick'
                        ? t('wall.pickChosenSub', { title: option.film.title })
                        : t('wall.pickAuto', { title: option.film.title, note: fmt1(noteOf(option.film)) })}
                    </span>
                  )}
                </span>
              </button>
            );
          })}
        </div>

        {mode === 'pick' && (
          <div role="radiogroup" aria-label={t('wall.pickChosen')} className="-mx-5 flex gap-2.5 overflow-x-auto px-5 pb-0.5 pt-1 no-scrollbar">
            {candidates.map((m) => {
              const on = m.id === movieId;
              const n = noteOf(m);
              return (
                <button
                  key={m.id}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  aria-label={m.title}
                  onClick={() => {
                    haptics.soft();
                    setMovieId(m.id);
                  }}
                  className="flex w-[76px] shrink-0 flex-col gap-1 text-left"
                >
                  <span
                    className={`relative block h-[114px] w-[76px] overflow-hidden rounded-[14px] bg-stone-200 dark:bg-white/10 ${
                      on ? 'outline outline-[3px] outline-offset-2 outline-bitter-lime' : 'opacity-80'
                    }`}
                  >
                    {m.posterUrl && (
                      <img src={resizeTmdbImage(m.posterUrl, 'w154')} alt="" loading="lazy" className="h-full w-full object-cover" />
                    )}
                    <span className={`absolute bottom-1 left-1 rounded-full px-1.5 py-0.5 text-[10px] font-black ${noteTone(n)}`}>{fmt1(n)}</span>
                    {on && (
                      <span className="absolute right-1 top-1 flex h-[22px] w-[22px] items-center justify-center rounded-full bg-bitter-lime text-charcoal">
                        <Check size={12} strokeWidth={3.4} />
                      </span>
                    )}
                  </span>
                  <span className="truncate text-[10px] font-extrabold">{m.title}</span>
                </button>
              );
            })}
          </div>
        )}

        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-black">
            {t('wall.pickNote')} <span className="font-bold text-stone-400">{t('wall.optional')}</span>
          </span>
          <input
            type="text"
            value={note}
            maxLength={PIN_NOTE_MAX}
            onChange={(event) => setNote(event.target.value)}
            placeholder={t('wall.pickNotePlaceholder')}
            className="h-[46px] rounded-2xl border border-stone-200 bg-white px-3.5 text-[13px] font-semibold outline-none focus:border-charcoal dark:border-white/10 dark:bg-[#1a1a1a] dark:focus:border-white/40"
          />
        </label>

        <button
          type="button"
          onClick={() => {
            haptics.medium();
            const trimmed = note.trim();
            onSave(
              mode === 'month' && !trimmed
                ? null
                : { mode, movieId: mode === 'pick' ? movieId : undefined, note: trimmed || undefined, month: monthKey(Date.now()) }
            );
          }}
          className="h-[54px] rounded-full bg-bitter-lime text-[15px] font-black text-charcoal active:scale-[0.98]"
        >
          {t('wall.pickSave')}
        </button>
      </section>
    </div>
  );
};

export default FilmWall;

/** Cartes ou mur, à côté des onglets « Vu / À voir ». */
export const FilmViewSwitch: React.FC<{ view: 'cards' | 'wall'; onChange: (view: 'cards' | 'wall') => void }> = ({ view, onChange }) => {
  const { t } = useLanguage();
  return (
    <div
      role="radiogroup"
      aria-label={t('feed.viewLabel')}
      className="flex shrink-0 rounded-full border border-stone-200/50 bg-stone-100 p-1 shadow-inner dark:border-white/5 dark:bg-[#161616]"
    >
      {(['cards', 'wall'] as const).map((v) => (
        <button
          key={v}
          type="button"
          role="radio"
          aria-checked={view === v}
          aria-label={t(v === 'cards' ? 'feed.viewCards' : 'feed.viewWall')}
          onClick={() => {
            haptics.soft();
            onChange(v);
          }}
          className={`flex h-10 w-10 items-center justify-center rounded-full transition-colors ${
            view === v ? 'bg-charcoal text-bitter-lime dark:bg-white dark:text-charcoal' : 'text-stone-400'
          }`}
        >
          {v === 'cards' ? <Rows2 size={16} strokeWidth={2.2} /> : <LayoutDashboard size={16} strokeWidth={2.2} />}
        </button>
      ))}
    </div>
  );
};
