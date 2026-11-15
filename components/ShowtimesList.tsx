import React, { useEffect, useMemo, useRef, useState } from 'react';
import { rememberBookingTrip } from '../services/bookingReturn';
import { ArrowUpRight, Loader2, RotateCw, X } from 'lucide-react';
import { CinemaScreening, CinemaShowtime } from '../types';
import { fetchMovieShowtimes } from '../services/cinemaDirectory';
import { createScreening, listScreeningsForMovie } from '../services/screenings';
import { ShowtimeSource, SourcedShowtime, groupShowtimesByDay, shortCinemaName } from '../utils/favoriteCinemas';
import { isSameScreening } from '../utils/myPlace';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { usePosterColors } from '../utils/posterTint';
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

/** Les moments de la journée, pour ranger le programme comme une affiche de cinéma. */
const PARTS = [
  { key: 'morning', until: 12 },
  { key: 'afternoon', until: 18 },
  { key: 'evening', until: 29 },
] as const;

/**
 * Les séances d'un film dans plusieurs salles, en programme : une bande de
 * jours à grands chiffres, puis les horaires du jour choisi, rangés en matin,
 * après-midi et soirée. Le fond prend la couleur de l'affiche.
 *
 * Chaque salle est interrogée à part et s'affiche dès qu'elle répond : une salle
 * lente ou en panne ne bloque jamais les autres.
 *
 * Hors espace, toucher un horaire ouvre d'abord la réservation UGC (avant tout
 * `await`, sinon le navigateur bloque l'onglet), puis enregistre la séance « en
 * attente » dans le calendrier. Ma séance déjà prévue est marquée « Ta place ».
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
  const { t } = useLanguage();
  const locale = t('place.locale');
  const weekday = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'short' }), [locale]);
  const longDay = useMemo(() => new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }), [locale]);
  const dateFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { day: 'numeric', month: 'long' }), [locale]);
  const timeFormatter = useMemo(() => new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }), [locale]);
  const time = (ts: number) => timeFormatter.format(new Date(ts));

  const [states, setStates] = useState<Record<string, SourceState>>({});
  const [existing, setExisting] = useState<CinemaScreening[]>([]);
  const [selectedDay, setSelectedDay] = useState<number | null>(null);
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
          [cinemaId]: result.error ? { status: 'error', message: result.error } : { status: 'ready', showtimes: result.data },
        }));
      })
      .catch(() => setStates((current) => ({ ...current, [cinemaId]: { status: 'error', message: '' } })));
  };

  // D'autres titres : tout est à redemander.
  useEffect(() => {
    requested.current = new Set();
    setStates({});
    setSelectedDay(null);
  }, [titleKey]);

  useEffect(() => {
    if (!wantedTitles.length) return;
    sources.forEach((source) => {
      if (!requested.current.has(source.cinema.id)) load(source.cinema.id);
    });
    // sourceKey / titleKey plutôt que les tableaux : leur référence change à chaque rendu.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sourceKey, titleKey]);

  // Mes séances de ce film : « Ta place » sur l'horaire, et pas de doublon au toucher.
  useEffect(() => {
    if (!profileId) return;
    let alive = true;
    void listScreeningsForMovie(profileId, tmdbId).then((list) => {
      if (!alive) return;
      submitted.current = new Set(list.map((s) => String(s.startsAt)));
      setExisting(list);
    });
    return () => {
      alive = false;
    };
  }, [profileId, tmdbId]);

  const sourceOf = (id: string) => sources.find((s) => s.cinema.id === id);
  const order = sources.map((s) => s.cinema.id);

  const entries = useMemo<SourcedShowtime[]>(
    () =>
      sources.flatMap((source) => {
        const state = states[source.cinema.id];
        return state?.status === 'ready' ? state.showtimes.map((showtime) => ({ showtime, cinemaId: source.cinema.id })) : [];
      }),
    [states, sourceKey] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const days = useMemo(() => groupShowtimesByDay(entries, order, Date.now(), DAYS_AHEAD), [entries]); // eslint-disable-line react-hooks/exhaustive-deps
  const stillLoading = sources.some((s) => !states[s.cinema.id] || states[s.cinema.id].status === 'loading');
  const failed = sources.filter((s) => states[s.cinema.id]?.status === 'error');

  // Le premier jour qui a des séances, dès qu'il est connu ; ou le jour de ma place.
  useEffect(() => {
    if (selectedDay !== null) return;
    const mine = days.find((day) => day.groups.some((g) => g.showtimes.some((s) => placeFor(s, g.cinemaId))));
    const first = mine ?? days.find((day) => day.count > 0);
    if (first) setSelectedDay(first.day);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days, existing]);

  const placeFor = (showtime: CinemaShowtime, cinemaId: string) => {
    const source = sourceOf(cinemaId);
    return existing.find((s) => isSameScreening(s, { startsAt: showtime.startsAt, cinemaName: source?.cinema.name }));
  };

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
    const already = placeFor(showtime, source.cinema.id);
    // Déjà notée et toujours à confirmer : au retour, la même question se pose.
    if (already?.status === 'pending') rememberBookingTrip(already.id);
    if (already || submitted.current.has(key)) return;

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
        bookingUrl: showtime.bookingUrl,
        status: 'pending',
      });
      setPendingId('');
      if (!result.ok) {
        submitted.current.delete(key);
        onToast?.('error' in result ? result.error : t('showtimes.addFailed'));
        return;
      }
      setExisting((current) => [...current, result.screening]);
      // Au retour dans l'app : « Alors, tu as tes places ? »
      rememberBookingTrip(result.screening.id);
    })();
  };

  const whoLabel = (source: ShowtimeSource) =>
    source.mine
      ? source.followers.length
        ? t('showtimes.also', { names: source.followers.join(', ') })
        : ''
      : t('showtimes.favoriteOf', { names: source.followers.join(', ') });

  // ── Aucune salle ────────────────────────────────────────────────────────
  if (!sources.length) {
    return (
      <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
        <p className="text-lg font-black tracking-tight">{t('showtimes.empty.title')}</p>
        <p className="mt-1.5 text-[13px] font-medium leading-relaxed text-white/70">{t('showtimes.empty.body')}</p>
        {onManageCinemas && (
          <button
            onClick={onManageCinemas}
            className="mt-4 h-12 w-full rounded-full bg-bitter-lime text-[13px] font-black text-charcoal transition active:scale-[0.98]"
          >
            {t('showtimes.empty.cta')}
          </button>
        )}
      </div>
    );
  }

  const nowhere = !stillLoading && entries.length === 0;
  const release = releaseDate ? new Date(`${releaseDate}T12:00:00`) : null;
  const upcomingRelease = release && release.getTime() > Date.now() ? release : null;
  const day = days.find((d) => d.day === selectedDay) ?? null;

  // Le jour choisi, à plat puis rangé par moment de la journée.
  const rows = (day?.groups ?? [])
    .flatMap((group) => group.showtimes.map((showtime) => ({ showtime, source: sourceOf(group.cinemaId)! })))
    .sort((a, b) => a.showtime.startsAt - b.showtime.startsAt);
  const sections = PARTS.map((part, index) => ({
    key: part.key,
    rows: rows.filter(({ showtime }) => {
      const hour = new Date(showtime.startsAt).getHours() || 24;
      const from = index === 0 ? 0 : PARTS[index - 1].until;
      return hour >= from && hour < part.until;
    }),
  })).filter((section) => section.rows.length);

  return (
    <div className="space-y-4">
      {/* La semaine, en grands chiffres */}
      <div className="-mx-2 flex gap-1 overflow-x-auto px-2 [scrollbar-width:none]" role="tablist" aria-label={t('showtimes.kicker')}>
        {days.map((d) => {
          const on = d.day === selectedDay;
          const empty = d.count === 0;
          return (
            <button
              key={d.day}
              role="tab"
              aria-selected={on}
              aria-label={`${longDay.format(new Date(d.day))} · ${empty ? t('showtimes.none') : t(d.count > 1 ? 'showtimes.count.many' : 'showtimes.count.one', { n: String(d.count) })}`}
              disabled={empty}
              onClick={() => {
                haptics.soft();
                setSelectedDay(d.day);
              }}
              className={`flex h-[72px] w-[52px] shrink-0 flex-col items-center justify-center gap-0.5 rounded-[18px] transition active:scale-95 ${
                on ? 'bg-cream text-charcoal' : empty ? 'text-white/25' : 'text-white hover:bg-white/[0.06]'
              }`}
            >
              <span className="text-[10px] font-extrabold uppercase tracking-[0.12em] opacity-70">
                {d.offset === 0 ? t('showtimes.todayShort') : weekday.format(new Date(d.day)).replace('.', '')}
              </span>
              <span className="text-[26px] font-black leading-none tracking-[-0.05em]">{new Date(d.day).getDate()}</span>
              <span className="mt-0.5 flex h-1 gap-[3px]" aria-hidden="true">
                {stillLoading && empty ? (
                  <span className="h-1 w-1 animate-pulse rounded-full bg-white/30" />
                ) : (
                  d.groups.map((g) => (
                    <span key={g.cinemaId} className="h-1 w-1 rounded-full" style={{ background: sourceOf(g.cinemaId)?.color }} />
                  ))
                )}
              </span>
            </button>
          );
        })}
      </div>

      <div className="h-px bg-white/[0.12]" />

      {/* Salles qui n'ont pas répondu */}
      {failed.map((source) => (
        <div key={source.cinema.id} className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.05] px-3.5 py-2">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: source.color }} />
          <span className="min-w-0 flex-1 truncate text-[13px] font-bold">{shortCinemaName(source.cinema.name)}</span>
          <button
            onClick={() => load(source.cinema.id)}
            className="flex h-9 shrink-0 items-center gap-1.5 rounded-xl border border-white/15 px-3 text-[11px] font-black text-amber-300"
          >
            <RotateCw size={12} /> {t('showtimes.failed')}
          </button>
        </div>
      ))}

      {nowhere ? (
        failed.length < sources.length && (
          <div className="rounded-3xl border border-white/10 bg-white/[0.06] p-5">
            <p className="text-lg font-black leading-tight tracking-tight">
              {space ? t('showtimes.nowhereSpace') : t('showtimes.nowhere', { n: String(sources.length) })}
            </p>
            {upcomingRelease && (
              <p className="mt-1.5 text-[13px] font-medium text-white/70">
                {t('showtimes.release', { date: dateFormatter.format(upcomingRelease) })}
              </p>
            )}
            {onManageCinemas && (
              <button
                onClick={onManageCinemas}
                className="mt-3 h-11 rounded-full border border-white/20 px-4 text-xs font-extrabold"
              >
                {t('showtimes.manage')}
              </button>
            )}
          </div>
        )
      ) : !day ? (
        <p className="flex items-center gap-2 py-6 text-xs font-bold text-white/60">
          <Loader2 size={14} className="animate-spin" /> {t('showtimes.searching')}
        </p>
      ) : (
        <div>
          {sections.map((section) => (
            <div key={section.key}>
              <p className="mb-0.5 mt-3 text-[10px] font-black uppercase tracking-[0.2em] text-white/50 first:mt-0">
                {t(`showtimes.part.${section.key}`)}
              </p>
              {section.rows.map(({ showtime, source }) => {
                const mine = placeFor(showtime, source.cinema.id);
                const saving = pendingId === showtime.id;
                const who = whoLabel(source);
                return (
                  <button
                    key={`${source.cinema.id}-${showtime.id}`}
                    onClick={() => choose(showtime, source)}
                    aria-label={
                      space
                        ? t('showtimes.pickAria', { time: time(showtime.startsAt), cinema: source.cinema.name })
                        : t('showtimes.bookAria', { time: time(showtime.startsAt), cinema: source.cinema.name })
                    }
                    className="flex min-h-[64px] w-full items-center gap-3.5 border-b border-white/[0.08] py-2.5 text-left transition active:bg-white/[0.04]"
                  >
                    <span
                      className="w-[76px] shrink-0 text-[26px] font-black tabular-nums tracking-[-0.05em]"
                      style={{ color: mine ? '#D9FF00' : undefined }}
                    >
                      {time(showtime.startsAt)}
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                      <span className="flex items-center gap-2 text-[13px] font-bold">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: source.color }} />
                        <span className="truncate">{source.cinema.name}</span>
                      </span>
                      <span className="truncate text-[11px] font-semibold text-white/55">
                        {[showtime.version, who, mine ? t('showtimes.inCalendar') : ''].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {saving ? (
                      <Loader2 size={16} className="shrink-0 animate-spin text-white/50" />
                    ) : mine ? (
                      <span className="flex h-7 shrink-0 items-center rounded-full bg-bitter-lime px-3 text-[11px] font-black text-charcoal">
                        {t('place.yours')}
                      </span>
                    ) : space ? (
                      <span className="shrink-0 text-[11px] font-black text-white/60">{t('showtimes.choose')}</span>
                    ) : (
                      <ArrowUpRight size={16} strokeWidth={2.2} className="shrink-0 text-white/45" />
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      )}

      <p className="pb-1 text-[11px] font-semibold leading-relaxed text-white/50">
        {space ? t('showtimes.footerSpace') : t('showtimes.footer')}
      </p>
    </div>
  );
};

export interface ShowtimesSheetProps extends ShowtimesListProps {
  title: string;
  onClose: () => void;
}

/**
 * La feuille des séances, aux couleurs de l'affiche : l'affiche en haut, qui se
 * fond dans sa propre teinte, puis le programme.
 */
export const ShowtimesSheet: React.FC<ShowtimesSheetProps> = ({ title, onClose, ...list }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('showtimes.sheetLabel', { title }));
  const colors = usePosterColors(list.posterUrl);
  const ground = colors?.deep ?? '#17152C';
  const cinemaCount = list.sources.length;

  return (
    <div {...dialog.props} className="fixed inset-0 z-[110] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} aria-label={t('showtimes.close')} tabIndex={-1} />
      <section
        className="relative z-10 flex h-[94vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] text-white sm:h-[min(880px,92vh)] sm:rounded-[2rem]"
        style={{ background: ground }}
      >
        <div className="overflow-y-auto overscroll-contain">
          <div className="relative h-[300px] shrink-0">
            {list.posterUrl && (
              <img src={list.posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 30%' }} />
            )}
            <div
              className="absolute inset-0"
              style={{ background: `linear-gradient(180deg, rgba(0,0,0,0.45) 0%, transparent 28%, transparent 45%, ${ground} 100%)` }}
            />
            <button
              onClick={onClose}
              aria-label={t('showtimes.close')}
              className="absolute right-4 top-4 grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/30 backdrop-blur-md"
            >
              <X size={18} strokeWidth={2.2} />
            </button>
            <div className="absolute inset-x-5 bottom-1">
              <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: colors?.accent ?? '#F4C7A8' }}>
                {list.space
                  ? t('showtimes.inSpace')
                  : cinemaCount === 1
                    ? list.sources[0].cinema.name
                    : t('showtimes.inMine', { n: String(cinemaCount) })}
              </p>
              <h2 className="mt-2 line-clamp-2 text-[32px] font-black leading-[0.95] tracking-[-0.06em]">{title}</h2>
            </div>
          </div>
          <div className="px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-5">
            <ShowtimesList {...list} />
          </div>
        </div>
      </section>
    </div>
  );
};

export default ShowtimesSheet;
