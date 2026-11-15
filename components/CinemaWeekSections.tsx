import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bookmark, Check, Loader2, MapPin, RefreshCw, Ticket, Users } from 'lucide-react';
import type { CinemaScreening, FavoriteCinema } from '../types';
import { getCinemaWeek, TheatreRelease } from '../services/tmdb';
import { fetchPlayingInCinemas } from '../services/cinemaDirectory';
import type { CinemaWeek, WeekFilm } from '../utils/cinemaWeek';
import { TMDB_IMAGE_URL } from '../constants';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import MyPlacePill from './MyPlacePill';

type Film = WeekFilm<TheatreRelease>;
type ShowtimesTarget = { tmdbId: number; title: string; posterUrl?: string; releaseDate?: string };

interface Props {
  /** Mes cinémas : ils disent ce qui passe « chez toi ». */
  favoriteCinemas?: FavoriteCinema[];
  /** Déjà dans la collection, tous statuts confondus. */
  knownTmdbIds: Set<number>;
  /** Mes places déjà au calendrier, par film. */
  places?: Map<number, CinemaScreening>;
  onSelectMovie: (tmdbId: number) => void;
  onQuickWatchlist: (tmdbId: number) => void;
  onWatchWith?: (tmdbId: number) => void;
  onShowtimes?: (film: ShowtimesTarget) => void;
  onManageCinemas?: () => void;
}

const poster = (film: TheatreRelease, size: 'w342' | 'w500' | 'w780' = 'w342') =>
  film.posterPath ? resizeTmdbImage(`${TMDB_IMAGE_URL}${film.posterPath}`, size) : undefined;

const pill =
  'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[9.5px] font-black uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60';

/**
 * « Sortis mercredi » puis « Toujours à l'affiche ».
 *
 * La semaine suit le calendrier des salles (mercredi → mardi) : seules les
 * sorties nationales de la semaine sont présentées en grand. Ce qui sort depuis
 * plus longtemps tient dans une rangée d'affiches, chacune avec son ancienneté.
 * Les sorties limitées viennent en dernier, et une pastille dit si elles passent
 * dans mes cinémas.
 */
const CinemaWeekSections: React.FC<Props> = ({
  favoriteCinemas = [],
  knownTmdbIds,
  places,
  onSelectMovie,
  onQuickWatchlist,
  onWatchWith,
  onShowtimes,
  onManageCinemas,
}) => {
  const { t, language } = useLanguage();
  const locale = t('place.locale');
  const [data, setData] = useState<CinemaWeek<TheatreRelease> | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [wished, setWished] = useState<Set<number>>(new Set());
  const [onlyMine, setOnlyMine] = useState(false);
  /** Une semaine chargée compte vingt sorties : cinq lignes, puis le reste à la demande. */
  const [allWeek, setAllWeek] = useState(false);
  /** tmdbId → mes cinémas qui le programment ; `null` tant qu'on ne sait pas. */
  const [playing, setPlaying] = useState<Map<string, string[]> | null>(null);
  const [playingLoading, setPlayingLoading] = useState(false);

  const load = (force = false) => {
    setLoading(true);
    setError(false);
    getCinemaWeek({ force, language: language === 'fr' ? 'fr-FR' : 'en-US' })
      .then(setData)
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  };
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [language]);

  const cinemaKey = favoriteCinemas.map((c) => c.id).sort().join(',');
  useEffect(() => {
    setPlaying(null);
    if (!data || !cinemaKey) return;
    let alive = true;
    setPlayingLoading(true);
    void fetchPlayingInCinemas(
      cinemaKey.split(','),
      [...data.week, ...data.still].map((film) => ({ key: String(film.id), titles: [film.title, film.originalTitle ?? ''] }))
    )
      .then((map) => alive && setPlaying(map))
      .finally(() => alive && setPlayingLoading(false));
    return () => {
      alive = false;
    };
  }, [data, cinemaKey]);

  /** true / false quand on sait, undefined sinon. */
  const atMine = (film: Film): boolean | undefined => {
    if (!playing) return undefined;
    const list = playing.get(String(film.id));
    return list ? list.length > 0 : undefined;
  };
  const cinemaNames = useMemo(() => new Map(favoriteCinemas.map((c) => [c.id, c.name])), [favoriteCinemas]);
  const whereMine = (film: Film) => (playing?.get(String(film.id)) ?? []).map((id) => cinemaNames.get(id)).filter(Boolean) as string[];

  const fmtDay = (iso: string, options: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: 'UTC', ...options }).format(new Date(`${iso}T12:00:00Z`));

  const showtimesOf = (film: Film) =>
    onShowtimes ? () => onShowtimes({ tmdbId: film.id, title: film.title, posterUrl: poster(film, 'w500'), releaseDate: film.frDate }) : undefined;

  const actions = (film: Film, compact = false) => {
    const place = places?.get(film.id);
    if (place) return <MyPlacePill screening={place} onClick={showtimesOf(film)} className="!h-8 !px-3 !text-[11px]" />;
    const inList = knownTmdbIds.has(film.id) || wished.has(film.id);
    const open = showtimesOf(film);
    return (
      <>
        {open && atMine(film) !== false && (
          <button
            onClick={() => {
              haptics.soft();
              open();
            }}
            aria-label={t('showtimes.open', { title: film.title })}
            className={`${pill} bg-bitter-lime text-charcoal`}
          >
            <Ticket size={12} strokeWidth={2.6} />
            {t('showtimes.button')}
          </button>
        )}
        <button
          onClick={() => {
            haptics.medium();
            setWished((prev) => new Set(prev).add(film.id));
            onQuickWatchlist(film.id);
          }}
          disabled={inList}
          className={`${pill} ${inList ? 'bg-[#D9FF00]/20 text-forest dark:text-[#D9FF00]' : 'bg-charcoal text-white dark:bg-white dark:text-[#111]'}`}
        >
          {inList ? <Check size={12} strokeWidth={3} /> : <Bookmark size={12} />}
          {t(inList ? 'releases.inYourList' : 'releases.wantToSee')}
        </button>
        {!compact && onWatchWith && (
          <button
            onClick={() => {
              haptics.soft();
              onWatchWith(film.id);
            }}
            className={`${pill} bg-white text-charcoal ring-1 ring-stone-200 dark:bg-[#1C1C1B] dark:text-white dark:ring-white/10`}
          >
            <Users size={12} />
            {t('social.watchWith')}
          </button>
        )}
      </>
    );
  };

  const notMine = (film: Film) =>
    atMine(film) === false ? (
      <span className="inline-flex items-center gap-1 rounded-full bg-black/70 px-2 py-0.5 text-[9px] font-black text-white backdrop-blur-sm">
        <MapPin size={9} /> {t('week.notInYourCinemas')}
      </span>
    ) : null;

  const posterButton = (film: Film, className: string, size: 'w342' | 'w500' | 'w780', children?: React.ReactNode) => (
    <button
      onClick={() => {
        haptics.soft();
        onSelectMovie(film.id);
      }}
      aria-label={film.title}
      className={`relative block w-full overflow-hidden bg-stone-200 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.6)] transition-transform active:scale-[0.98] dark:bg-[#1A1A19] ${className}`}
    >
      {poster(film, size) ? (
        <img src={poster(film, size)} alt="" className="absolute inset-0 h-full w-full object-cover" loading="lazy" decoding="async" />
      ) : (
        <Ticket size={28} className="absolute inset-0 m-auto text-stone-400" />
      )}
      {children}
    </button>
  );

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={28} className="animate-spin text-stone-300 dark:text-stone-700" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-700">{t('releases.loading')}</p>
      </div>
    );
  }
  if (error || !data) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle size={20} className="text-orange-400" />
        <button
          onClick={() => load(true)}
          className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white px-5 py-2.5 text-[10px] font-black uppercase tracking-[0.2em] text-charcoal transition-all active:scale-95 dark:border-white/10 dark:bg-[#202020] dark:text-white"
        >
          <RefreshCw size={13} />
          {t('shared.retry')}
        </button>
      </div>
    );
  }

  const [lead, ...others] = data.week;
  const grid = others.slice(0, 2);
  const rest = others.slice(2);
  const shownRest = allWeek ? rest : rest.slice(0, 5);
  const still = onlyMine ? data.still.filter((film) => atMine(film) === true) : data.still;
  const label = 'text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400';
  const bigTitle = 'text-[30px] font-black leading-[0.95] tracking-[-0.05em] text-charcoal dark:text-white';

  return (
    <div className="animate-[fadeIn_0.3s_ease-out] space-y-10">
      {lead && (
        <section aria-label={t('week.releasedTitle', { day: fmtDay(data.weekStart, { weekday: 'long', day: 'numeric', month: 'short' }) })}>
          <p className={label}>{t('week.kicker')}</p>
          <h2 className={`mt-1.5 ${bigTitle}`}>
            {t('week.releasedOn')}
            <br />
            {fmtDay(data.weekStart, { weekday: 'long', day: 'numeric', month: 'short' })}
          </h2>
          <p className="mb-4 mt-1.5 text-[11.5px] font-bold text-stone-500">
            <b className="text-charcoal dark:text-white">{t('week.count', { n: data.week.length })}</b> ·{' '}
            {t('week.range', {
              from: fmtDay(data.weekStart, { day: 'numeric' }),
              to: fmtDay(data.weekEnd, { day: 'numeric', month: 'short' }),
            })}
          </p>

          <div className="space-y-6">
            <div>
              {posterButton(
                lead,
                'aspect-[16/11] rounded-[22px]',
                'w780',
                <>
                  <span className="absolute left-3 top-3 rounded-full bg-bitter-lime px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-charcoal">
                    {t('week.new')}
                  </span>
                  <span className="absolute bottom-3 left-3">{notMine(lead)}</span>
                </>
              )}
              <p className="mt-2.5 text-[20px] font-black leading-tight tracking-tight text-charcoal dark:text-white">{lead.title}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">{actions(lead)}</div>
            </div>

            {grid.length > 0 && (
              <div className="grid grid-cols-2 gap-x-3 gap-y-5">
                {grid.map((film) => (
                  <div key={film.id} className="min-w-0">
                    {posterButton(
                      film,
                      'aspect-[2/3] rounded-2xl',
                      'w500',
                      <>
                        <span className="absolute left-2 top-2 rounded-full bg-bitter-lime px-2 py-0.5 text-[9px] font-black uppercase tracking-[0.08em] text-charcoal">
                          {t('week.new')}
                        </span>
                        <span className="absolute bottom-2 left-2">{notMine(film)}</span>
                      </>
                    )}
                    <p className="mt-2 line-clamp-2 text-[14px] font-black leading-tight tracking-tight text-charcoal dark:text-white">{film.title}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">{actions(film, true)}</div>
                  </div>
                ))}
              </div>
            )}

            {rest.length > 0 && (
              <div>
                <p className={`${label} mb-1`}>{t('week.alsoThisWeek')}</p>
                {shownRest.map((film) => (
                  <div key={film.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-3 border-t border-stone-200 py-3 dark:border-white/10">
                    {posterButton(film, 'h-[66px] rounded-lg', 'w342')}
                    <div className="min-w-0">
                      <p className="truncate text-[13.5px] font-black tracking-tight text-charcoal dark:text-white">{film.title}</p>
                      {atMine(film) === false && <p className="text-[10.5px] font-bold text-stone-500">{t('week.notInYourCinemas')}</p>}
                      <div className="mt-1.5 flex flex-wrap gap-1.5">{actions(film, true)}</div>
                    </div>
                  </div>
                ))}
                {rest.length > shownRest.length && (
                  <button
                    onClick={() => setAllWeek(true)}
                    className="mt-1 flex h-11 w-full items-center justify-center rounded-full border border-stone-200 text-[12px] font-extrabold text-charcoal transition active:scale-[0.99] dark:border-white/15 dark:text-white"
                  >
                    {t('week.showMore', { n: rest.length - shownRest.length })}
                  </button>
                )}
              </div>
            )}
          </div>
        </section>
      )}

      {data.still.length > 0 && (
        <section aria-label={t('week.stillTitle')}>
          <p className={label}>{t('week.stillKicker')}</p>
          <h2 className={`mt-1.5 ${bigTitle}`}>{t('week.stillTitle')}</h2>
          <p className="mb-3 mt-1.5 text-[11.5px] font-bold text-stone-500">{t('week.stillSub')}</p>

          {favoriteCinemas.length > 0 ? (
            <div className="mb-3 flex gap-1.5" role="tablist">
              {[false, true].map((mine) => (
                <button
                  key={String(mine)}
                  role="tab"
                  aria-selected={onlyMine === mine}
                  onClick={() => setOnlyMine(mine)}
                  className={`inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[11px] font-extrabold transition ${
                    onlyMine === mine
                      ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal'
                      : 'border border-stone-200 text-charcoal dark:border-white/15 dark:text-white'
                  }`}
                >
                  {t(mine ? 'week.inMyCinemas' : 'week.all')}
                  {mine && playingLoading && <Loader2 size={11} className="animate-spin" />}
                </button>
              ))}
            </div>
          ) : (
            onManageCinemas && (
              <button onClick={onManageCinemas} className="mb-3 inline-flex h-8 items-center gap-1.5 rounded-full border border-stone-200 px-3 text-[11px] font-extrabold text-charcoal dark:border-white/15 dark:text-white">
                <MapPin size={12} /> {t('week.pickCinemas')}
              </button>
            )
          )}

          {still.length === 0 ? (
            <p className="py-6 text-[12px] font-semibold text-stone-500">
              {playingLoading ? t('week.readingProgrammes') : playing ? t('week.noneInMine') : t('week.programmesUnavailable')}
            </p>
          ) : (
            <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {still.map((film) => {
                const place = places?.get(film.id);
                const mine = atMine(film);
                const chip = film.rerelease
                  ? { text: t('week.rerelease'), className: 'bg-[#F08A24] text-charcoal' }
                  : film.limited
                    ? { text: t('week.limited'), className: 'bg-white/90 text-charcoal' }
                    : { text: t('week.weekOn', { n: film.weekOn }), className: 'bg-black/80 text-white' };
                return (
                  <div key={film.id} className="w-[108px] shrink-0">
                    {posterButton(
                      film,
                      'aspect-[2/3] rounded-xl',
                      'w342',
                      <>
                        {place && (
                          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded-full bg-charcoal px-1.5 py-0.5 text-[8.5px] font-black text-white">
                            <Ticket size={9} className="text-bitter-lime" /> {t('place.yours')}
                          </span>
                        )}
                        <span className={`absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[9px] font-black backdrop-blur-sm ${chip.className}`}>{chip.text}</span>
                      </>
                    )}
                    <p className="mt-1.5 line-clamp-2 text-[11px] font-extrabold leading-tight tracking-tight text-charcoal dark:text-white">{film.title}</p>
                    {mine === false && (
                      <p className="mt-0.5 flex items-center gap-0.5 text-[9.5px] font-bold text-stone-500">
                        <MapPin size={9} /> {t('week.notInYourCinemas')}
                      </p>
                    )}
                    {mine === true && film.limited && (
                      <p className="mt-0.5 truncate text-[9.5px] font-bold text-forest dark:text-lime-500">{whereMine(film)[0]}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};

export default CinemaWeekSections;
