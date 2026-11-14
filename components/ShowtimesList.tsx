import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, ExternalLink, Loader2, MapPin, RotateCw, Ticket, X } from 'lucide-react';
import { CinemaScreening, CinemaShowtime } from '../types';
import { fetchMovieShowtimes } from '../services/cinemaDirectory';
import { createScreening, listScreeningsForMovie } from '../services/screenings';
import {
  ShowtimeSource,
  SourcedShowtime,
  groupShowtimesByDay,
  nextShowtime,
  shortCinemaName,
} from '../utils/favoriteCinemas';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';

const DAYS_AHEAD = 7;

type SourceState =
  | { status: 'loading' }
  | { status: 'ready'; showtimes: CinemaShowtime[] }
  | { status: 'error'; message: string };

export interface ShowtimesListProps {
  tmdbId: number;
  /** Titre français puis titre original : UGC affiche parfois l'un, parfois l'autre. */
  titles: string[];
  posterUrl?: string;
  profileId?: string;
  sources: ShowtimeSource[];
  /** Dans un espace : les salles des autres membres sont mêlées aux miennes. */
  space?: boolean;
  /** Date de sortie TMDB (aaaa-mm-jj), dite quand le film ne passe nulle part. */
  releaseDate?: string;
  /**
   * Un horaire choisi. Absent : il ouvre la réservation UGC et s'ajoute au
   * calendrier « à confirmer ». Présent (espace) : il prépare « On y va ».
   */
  onPick?: (showtime: CinemaShowtime, source: ShowtimeSource) => void;
  onManageCinemas?: () => void;
  onToast?: (message: string) => void;
}

const pastille = (color: string, size = 8) => (
  <span
    aria-hidden="true"
    className="inline-block shrink-0 rounded-full ring-1 ring-black/5 dark:ring-white/25"
    style={{ width: size, height: size, background: color }}
  />
);

/**
 * Les séances d'un film dans plusieurs salles, repliées jour par jour.
 *
 * Chaque salle est interrogée à part et s'affiche dès qu'elle répond : une salle
 * lente ou en panne ne bloque jamais les autres, et se relance seule.
 *
 * Hors espace, toucher un horaire fait deux choses, dans cet ordre : l'onglet de
 * réservation UGC s'ouvre **avant** toute écriture (un `window.open` lancé après
 * un `await` n'est plus rattaché au geste et se fait bloquer), puis la séance
 * s'enregistre « en attente » — The Bitter ne sait pas si la réservation a
 * abouti, et ne programme aucun rappel avant qu'elle soit confirmée.
 */
export const ShowtimesList: React.FC<ShowtimesListProps> = ({
  tmdbId,
  titles,
  posterUrl,
  profileId,
  sources,
  space = false,
  releaseDate,
  onPick,
  onManageCinemas,
  onToast,
}) => {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const dayFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'long' }), [locale]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }), [locale]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }), [locale]);
  const time = (ts: number) => timeFormatter.format(new Date(ts));

  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [existing, setExisting] = useState<CinemaScreening[]>([]);
  const [filter, setFilter] = useState<string>('all');
  const [openDay, setOpenDay] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState('');
  /** Les créneaux déjà envoyés : une ref, deux touchers rapprochés lisent le même rendu. */
  const submitted = useRef(new Set<string>());

  const wantedTitles = useMemo(() => [...new Set(titles.filter(Boolean))], [titles]);
  const titleKey = wantedTitles.join('|');
  const sourceKey = sources.map((s) => s.cinema.id).join('|');

  /** Les salles déjà demandées pour ces titres : une salle ajoutée en route ne relance pas les autres. */
  const requested = useRef(new Set<string>());
  const load = (cinemaId: string) => {
    requested.current.add(cinemaId);
    setStates((current) => ({ ...current, [cinemaId]: { status: 'loading' } }));
    void fetchMovieShowtimes(cinemaId, wantedTitles, DAYS_AHEAD)
      .then((result) => {
        setStates((current) => ({
          ...current,
          [cinemaId]: result.error
            ? { status: 'error', message: result.error }
            : { status: 'ready', showtimes: result.data },
        }));
      })
      .catch(() => setStates((current) => ({ ...current, [cinemaId]: { status: 'error', message: '' } })));
  };

  // D'autres titres : tout est à redemander.
  useEffect(() => {
    requested.current = new Set();
    setStates({});
  }, [titleKey]);

  useEffect(() => {
    if (!wantedTitles.length) return;
    sources.forEach((source) => {
      if (!requested.current.has(source.cinema.id)) load(source.cinema.id);
    });
    // sourceKey / titleKey plutôt que les tableaux : leur référence change à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, titleKey]);

  useEffect(() => {
    if (space || !profileId) return;
    let alive = true;
    void listScreeningsForMovie(profileId, tmdbId).then((list) => {
      if (!alive) return;
      submitted.current = new Set(list.map((s) => String(s.startsAt)));
      setExisting(list);
    });
    return () => {
      alive = false;
    };
  }, [space, profileId, tmdbId]);

  // Une salle retirée du filtre entre deux ouvertures : on revient à « Tous ».
  useEffect(() => {
    if (filter !== 'all' && !sources.some((s) => s.cinema.id === filter)) setFilter('all');
  }, [filter, sourceKey]); // eslint-disable-line react-hooks/exhaustive-deps

  const sourceOf = (id: string) => sources.find((s) => s.cinema.id === id);
  const order = sources.map((s) => s.cinema.id);

  const allEntries = useMemo<SourcedShowtime[]>(
    () =>
      sources.flatMap((source) => {
        const state = states[source.cinema.id];
        return state?.status === 'ready'
          ? state.showtimes.map((showtime) => ({ showtime, cinemaId: source.cinema.id }))
          : [];
      }),
    [states, sourceKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const countOf = (id: string) => allEntries.filter((e) => e.cinemaId === id).length;
  const entries = filter === 'all' ? allEntries : allEntries.filter((e) => e.cinemaId === filter);
  const days = useMemo(() => groupShowtimesByDay(entries, order, Date.now(), DAYS_AHEAD), [entries]); // eslint-disable-line react-hooks/exhaustive-deps
  const next = nextShowtime(entries);
  const stillLoading = sources.some((s) => !states[s.cinema.id] || states[s.cinema.id].status === 'loading');
  const failed = sources.filter((s) => states[s.cinema.id]?.status === 'error');

  const screeningFor = (showtime: CinemaShowtime, source: ShowtimeSource) =>
    existing.find((s) => s.startsAt === showtime.startsAt && (s.cinemaName ?? '') === source.cinema.name);

  const choose = (showtime: CinemaShowtime, source: ShowtimeSource) => {
    haptics.soft();
    if (onPick) {
      onPick(showtime, source);
      return;
    }
    // Toujours en premier : c'est le geste de l'utilisateur qui autorise l'onglet.
    window.open(showtime.bookingUrl, '_blank', 'noopener,noreferrer');
    if (!profileId) return;
    const key = String(showtime.startsAt);
    if (screeningFor(showtime, source) || submitted.current.has(key)) return;

    submitted.current.add(key);
    setPendingId(showtime.id);
    void (async () => {
      const result = await createScreening(profileId, {
        tmdbId,
        title: wantedTitles[0] || showtime.title || '',
        posterUrl,
        startsAt: showtime.startsAt,
        cinemaName: source.cinema.name,
        cinemaAddress: source.cinema.city,
        format: showtime.version,
        status: 'pending',
      });
      setPendingId('');
      if (!result.ok) {
        submitted.current.delete(key);
        onToast?.('error' in result ? result.error : t('showtimes.addFailed'));
        return;
      }
      setExisting((current) => [...current, result.screening]);
      onToast?.(t('showtimes.added'));
    })();
  };

  const dayName = (day: { day: number; offset: number }) => {
    if (day.offset === 0) return t('showtimes.today');
    if (day.offset === 1) return t('showtimes.tomorrow');
    const name = dayFormatter.format(new Date(day.day));
    return name.charAt(0).toUpperCase() + name.slice(1);
  };
  const countLabel = (n: number) => t(n > 1 ? 'showtimes.count.many' : 'showtimes.count.one', { n: String(n) });
  const whoLabel = (source: ShowtimeSource) =>
    source.mine
      ? source.followers.length
        ? t('showtimes.also', { names: source.followers.join(', ') })
        : ''
      : t('showtimes.favoriteOf', { names: source.followers.join(', ') });

  // ── Aucune salle ────────────────────────────────────────────────────────
  if (!sources.length) {
    return (
      <div className="rounded-3xl bg-white p-5 dark:bg-white/5">
        <p className="text-lg font-black tracking-tight text-charcoal dark:text-white">{t('showtimes.empty.title')}</p>
        <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-stone-500 dark:text-stone-400">
          {t('showtimes.empty.body')}
        </p>
        {onManageCinemas && (
          <button
            onClick={onManageCinemas}
            className="mt-4 h-12 w-full rounded-full bg-charcoal text-[13px] font-black text-white transition active:scale-[0.98] dark:bg-bitter-lime dark:text-charcoal"
          >
            {t('showtimes.empty.cta')}
          </button>
        )}
      </div>
    );
  }

  const nowhere = !stillLoading && allEntries.length === 0;
  const release = releaseDate ? new Date(`${releaseDate}T12:00:00`) : null;
  const upcomingRelease = release && release.getTime() > Date.now() ? release : null;
  const mineSources = sources.filter((s) => s.mine);
  const theirSources = sources.filter((s) => !s.mine);

  const chipClass = (on: boolean) =>
    `flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3.5 text-xs font-extrabold transition active:scale-95 ${
      on
        ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal'
        : 'border border-stone-200 bg-white text-charcoal dark:border-white/10 dark:bg-white/5 dark:text-white'
    }`;
  const chip = (source: ShowtimeSource) => (
    <button
      key={source.cinema.id}
      onClick={() => {
        haptics.soft();
        setFilter(source.cinema.id);
        setOpenDay(null);
      }}
      aria-pressed={filter === source.cinema.id}
      className={chipClass(filter === source.cinema.id)}
    >
      {pastille(source.color)}
      {shortCinemaName(source.cinema.name)}
      {!source.mine && source.followers[0] && <span className="opacity-60">· {source.followers[0]}</span>}
      <span className="opacity-60">{states[source.cinema.id]?.status === 'ready' ? countOf(source.cinema.id) : '…'}</span>
    </button>
  );
  const groupLabel = (label: string) => (
    <span className="flex h-10 shrink-0 items-center pl-1 text-[10px] font-black uppercase tracking-[0.14em] text-stone-500 dark:text-stone-400">
      {label}
    </span>
  );

  return (
    <div className="space-y-3.5">
      {/* Prochaine séance */}
      {next && (() => {
        const source = sourceOf(next.cinemaId)!;
        const done = !space && screeningFor(next.showtime, source);
        const offset = groupShowtimesByDay([next], order, Date.now(), DAYS_AHEAD).find((d) => d.count) ?? {
          day: next.showtime.startsAt,
          offset: 99,
        };
        return (
          <div className="flex items-center gap-3 rounded-[22px] bg-charcoal py-3.5 pl-4 pr-3.5 text-white dark:bg-[#202020]">
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('showtimes.next')}</p>
              <p className="mt-1 text-xl font-black tracking-tight">
                {dayName(offset)} · {time(next.showtime.startsAt)}{' '}
                {next.showtime.version && (
                  <span className="text-[11px] font-extrabold tracking-wide text-stone-400">{next.showtime.version}</span>
                )}
              </p>
              <p className="mt-0.5 truncate text-xs font-semibold text-stone-300">
                {source.cinema.name}
                {!source.mine && source.followers.length ? ` · ${whoLabel(source)}` : ''}
              </p>
            </div>
            <button
              onClick={() => choose(next.showtime, source)}
              className="flex h-11 shrink-0 items-center gap-1.5 rounded-full bg-bitter-lime px-4 text-xs font-black text-charcoal transition active:scale-95"
            >
              {done ? <Check size={14} /> : null}
              {space ? t('showtimes.choose') : t('showtimes.book')}
            </button>
          </div>
        );
      })()}

      {/* Puces de filtre */}
      {sources.length > 1 && (
        <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none]">
          <button
            onClick={() => {
              haptics.soft();
              setFilter('all');
              setOpenDay(null);
            }}
            aria-pressed={filter === 'all'}
            className={chipClass(filter === 'all')}
          >
            {pastille('#D9FF00')}
            {t('showtimes.all')}
            <span className="opacity-60">{allEntries.length}</span>
          </button>
          {space && theirSources.length > 0 && groupLabel(t('showtimes.mine'))}
          {mineSources.map(chip)}
          {theirSources.length > 0 && groupLabel(t('showtimes.theirs'))}
          {theirSources.map(chip)}
        </div>
      )}

      {/* Salles qui n'ont pas répondu */}
      {failed.map((source) => (
        <div
          key={source.cinema.id}
          className="flex items-center gap-2.5 rounded-2xl border border-stone-200 bg-white px-3.5 py-2 dark:border-white/10 dark:bg-white/5"
        >
          {pastille(source.color)}
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-charcoal dark:text-white">
            {shortCinemaName(source.cinema.name)}
          </span>
          <button
            onClick={() => load(source.cinema.id)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-stone-200 px-3 text-[11px] font-black text-amber-800 dark:border-white/10 dark:text-amber-300"
          >
            <RotateCw size={12} /> {t('showtimes.failed')}
          </button>
        </div>
      ))}

      {nowhere ? (
        failed.length < sources.length && (
          <div className="rounded-3xl bg-white p-5 dark:bg-white/5">
            <p className="text-lg font-black leading-tight tracking-tight text-charcoal dark:text-white">
              {space ? t('showtimes.nowhereSpace') : t('showtimes.nowhere', { n: String(sources.length) })}
            </p>
            {upcomingRelease && (
              <p className="mt-1.5 text-[13px] font-medium text-stone-500 dark:text-stone-400">
                {t('showtimes.release', { date: dateFormatter.format(upcomingRelease) })}
              </p>
            )}
            {onManageCinemas && (
              <button
                onClick={onManageCinemas}
                className="mt-3 h-11 rounded-full border border-stone-200 bg-white px-4 text-xs font-extrabold text-charcoal dark:border-white/10 dark:bg-white/5 dark:text-white"
              >
                {t('showtimes.manage')}
              </button>
            )}
          </div>
        )
      ) : (
        <div className="space-y-2">
          {days.map((day) => {
            const empty = day.count === 0;
            const open = !empty && openDay === day.day;
            const waiting = empty && stillLoading;
            return (
              <div
                key={day.day}
                className={`overflow-hidden rounded-[20px] ${
                  open
                    ? 'border border-stone-200 bg-sand dark:border-white/10 dark:bg-white/[0.07]'
                    : empty
                      ? 'border border-dashed border-stone-200 dark:border-white/10'
                      : 'border border-stone-200 bg-white dark:border-white/10 dark:bg-white/5'
                }`}
              >
                <button
                  onClick={() => {
                    haptics.soft();
                    setOpenDay(open ? null : day.day);
                  }}
                  disabled={empty}
                  aria-expanded={empty ? undefined : open}
                  className="flex min-h-[60px] w-full items-center gap-3 px-3.5 py-2.5 text-left"
                >
                  <span className="min-w-0 flex-1">
                    <span
                      className={`block text-[15px] font-black tracking-tight ${empty ? 'text-stone-400 dark:text-stone-500' : 'text-charcoal dark:text-white'}`}
                    >
                      {dayName(day)}
                    </span>
                    <span className="mt-0.5 block text-[11px] font-semibold text-stone-500 dark:text-stone-400">
                      {dateFormatter.format(new Date(day.day))}
                    </span>
                  </span>
                  <span className="text-right">
                    <span
                      className={`block text-[13px] font-black ${empty ? 'text-stone-400 dark:text-stone-500' : 'text-charcoal dark:text-white'}`}
                    >
                      {waiting ? <Loader2 size={13} className="inline animate-spin" /> : empty ? t('showtimes.none') : countLabel(day.count)}
                    </span>
                    {!empty && (
                      <span className="mt-0.5 block text-[11px] font-bold text-stone-500 dark:text-stone-400">
                        {day.count === 1 ? time(day.first!) : `${time(day.first!)} → ${time(day.last!)}`}
                      </span>
                    )}
                  </span>
                  {!empty && filter === 'all' && sources.length > 1 && (
                    <span className="flex flex-col gap-[3px]">
                      {day.groups.map((g) => (
                        <React.Fragment key={g.cinemaId}>{pastille(sourceOf(g.cinemaId)?.color ?? '#A8A29E', 6)}</React.Fragment>
                      ))}
                    </span>
                  )}
                  <ChevronDown
                    size={16}
                    strokeWidth={2.6}
                    className={`shrink-0 transition-transform duration-200 ${open ? 'rotate-180' : ''} ${empty ? 'text-stone-200 dark:text-white/10' : 'text-charcoal dark:text-white'}`}
                  />
                </button>
                {open && (
                  <div className="space-y-3 px-3.5 pb-3.5">
                    {day.groups.map((group) => {
                      const source = sourceOf(group.cinemaId)!;
                      const who = whoLabel(source);
                      return (
                        <div key={group.cinemaId}>
                          <p className="mb-2 flex flex-wrap items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.12em] text-stone-600 dark:text-stone-300">
                            {pastille(source.color)}
                            {source.cinema.name}
                            {who && (
                              <span className="normal-case tracking-normal font-bold text-stone-500 dark:text-stone-400">
                                · {who}
                              </span>
                            )}
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {group.showtimes.map((showtime) => {
                              const done = !space && screeningFor(showtime, source);
                              const saving = pendingId === showtime.id;
                              return (
                                <button
                                  key={showtime.id}
                                  onClick={() => choose(showtime, source)}
                                  aria-label={
                                    space
                                      ? t('showtimes.pickAria', { time: time(showtime.startsAt), cinema: source.cinema.name })
                                      : t('showtimes.bookAria', { time: time(showtime.startsAt), cinema: source.cinema.name })
                                  }
                                  className={`flex h-11 items-center gap-1.5 rounded-[14px] border px-3 transition active:scale-95 ${
                                    done
                                      ? 'border-bitter-lime bg-bitter-lime/15 text-charcoal dark:text-white'
                                      : 'border-stone-200 bg-white text-charcoal hover:border-forest dark:border-white/10 dark:bg-[#1c1c1c] dark:text-white'
                                  }`}
                                >
                                  <span className="text-sm font-black">{time(showtime.startsAt)}</span>
                                  {showtime.version && (
                                    <span className="text-[9px] font-extrabold tracking-wide text-stone-500 dark:text-stone-400">
                                      {showtime.version}
                                    </span>
                                  )}
                                  {saving ? (
                                    <Loader2 size={11} className="animate-spin text-stone-400" />
                                  ) : done ? (
                                    <Check size={11} className="text-forest dark:text-bitter-lime" />
                                  ) : !space ? (
                                    <ExternalLink size={11} className="text-stone-300 dark:text-stone-500" />
                                  ) : null}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <p className="flex items-start gap-2 px-0.5 text-[11px] font-semibold leading-relaxed text-stone-500 dark:text-stone-400">
        <Ticket size={12} className="mt-0.5 shrink-0" />
        {space ? t('showtimes.footerSpace') : t('showtimes.footer')}
      </p>
      {!space && existing.some((s) => s.status === 'pending') && (
        <p className="px-0.5 text-[11px] font-bold text-forest dark:text-bitter-lime">{t('showtimes.pending')}</p>
      )}
    </div>
  );
};

export interface ShowtimesSheetProps extends ShowtimesListProps {
  title: string;
  onClose: () => void;
}

/** La même liste, en feuille du bas : ouverte depuis une liste « à voir ». */
export const ShowtimesSheet: React.FC<ShowtimesSheetProps> = ({ title, onClose, ...list }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('showtimes.sheetLabel', { title }));
  return (
    <div {...dialog.props} className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm" onClick={onClose} aria-label={t('showtimes.close')} tabIndex={-1} />
      <section className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] bg-cream dark:bg-[#111] sm:rounded-[2rem]">
        <div className="mx-auto mt-3 h-[5px] w-10 shrink-0 rounded-full bg-stone-200 dark:bg-white/15" aria-hidden="true" />
        <header className="flex shrink-0 items-center gap-3 px-4 pb-3 pt-3">
          {list.posterUrl ? (
            <img src={list.posterUrl} alt="" className="h-[68px] w-12 shrink-0 rounded-[10px] object-cover" />
          ) : (
            <span className="grid h-[68px] w-12 shrink-0 place-items-center rounded-[10px] bg-sand text-stone-400 dark:bg-white/5">
              <MapPin size={16} />
            </span>
          )}
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400">
              {t('showtimes.kicker')}
            </p>
            <h2 className="mt-1 truncate text-[22px] font-black leading-tight tracking-tight text-charcoal dark:text-white">{title}</h2>
            <p className="mt-0.5 truncate text-xs font-semibold text-stone-600 dark:text-stone-400">
              {list.space ? t('showtimes.inSpace') : t('showtimes.inMine', { n: String(list.sources.length) })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('showtimes.close')}
            className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-sand text-charcoal dark:bg-white/10 dark:text-white"
          >
            <X size={18} strokeWidth={2.4} />
          </button>
        </header>
        <div className="overflow-y-auto overscroll-contain px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <ShowtimesList {...list} />
        </div>
      </section>
    </div>
  );
};

export default ShowtimesSheet;
