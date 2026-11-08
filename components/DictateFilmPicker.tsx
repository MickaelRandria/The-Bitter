/**
 * « Dicter un avis » : de quel film tu parles ?
 *
 * Avant de taper : les films vus ces 7 derniers jours (collection et séances
 * passées du calendrier), puis ceux notés sans avis. En tapant : la collection
 * d'abord (titre, faute de frappe, réalisateur, acteur, « dune 2 »), puis TMDB,
 * et la filmographie d'un réalisateur ou d'un acteur reconnu. Le micro de la
 * barre dicte le titre (reconnaissance vocale du navigateur, sans quota).
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronRight, Loader2, Mic, Search, X } from 'lucide-react';
import type { CinemaScreening, Movie } from '../types';
import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { resizeTmdbImage, tmdbImage } from '../utils/tmdbImage';
import { getMovieDisplayRating } from '../utils/movieDisplay';
import { formatScore } from '../utils/guidedReview';
import {
  hotPicks,
  personMatches,
  rankRemote,
  searchCollection,
  splitSequel,
  unreviewed,
  type HotPick,
  type RemoteFilm,
} from '../utils/filmPicker';

export type FilmPick =
  | { kind: 'movie'; movie: Movie }
  | { kind: 'screening'; screening: CinemaScreening }
  | { kind: 'tmdb'; tmdbId: number };

interface Props {
  movies: Movie[];
  dueScreenings: CinemaScreening[];
  mediaType: 'movie' | 'tv';
  onPick: (pick: FilmPick) => void;
  onClose: () => void;
}

type Person = { name: string; role: 'director' | 'actor'; films: RemoteFilm[] };

const DAY = 86_400_000;

// ── Reconnaissance vocale du navigateur (Chrome, Safari) ─────────────────────
type Recognition = {
  lang: string;
  interimResults: boolean;
  maxAlternatives: number;
  onresult: ((e: any) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
  start: () => void;
  stop: () => void;
};
const recognitionCtor = (): (new () => Recognition) | null => {
  if (typeof window === 'undefined') return null;
  const w = window as any;
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
};

const toRemote = (r: any): RemoteFilm => ({
  id: r.id,
  title: r.title || r.name || '',
  originalTitle: r.original_title || r.original_name || undefined,
  year: (r.release_date || r.first_air_date || '').slice(0, 4) || undefined,
  posterPath: r.poster_path,
  popularity: r.popularity,
});

const DictateFilmPicker: React.FC<Props> = ({ movies, dueScreenings, mediaType, onPick, onClose }) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('picker.title'));
  const [query, setQuery] = useState('');
  const [remote, setRemote] = useState<RemoteFilm[]>([]);
  const [person, setPerson] = useState<Person | null>(null);
  const [loading, setLoading] = useState(false);
  const [listening, setListening] = useState(false);
  const recognition = useRef<Recognition | null>(null);
  const canListen = useMemo(() => recognitionCtor() != null, []);

  const now = Date.now();
  const hot = useMemo(() => hotPicks(movies, dueScreenings, mediaType, now), [movies, dueScreenings, mediaType]); // eslint-disable-line react-hooks/exhaustive-deps
  const rest = useMemo(
    () => unreviewed(movies, mediaType, new Set(hot.flatMap((p) => (p.kind === 'movie' ? [p.movie.id] : [])))),
    [movies, mediaType, hot]
  );
  const typed = query.trim().length >= 2;
  const local = useMemo(() => (typed ? searchCollection(movies, query, mediaType) : []), [movies, query, mediaType, typed]);
  const owned = useMemo(
    () => new Set(movies.filter((m) => (m.mediaType ?? 'movie') === mediaType && m.tmdbId != null).map((m) => m.tmdbId as number)),
    [movies, mediaType]
  );

  // TMDB : titres, et la personne quand son nom répond bien.
  useEffect(() => {
    if (!typed) {
      setRemote([]);
      setPerson(null);
      setLoading(false);
      return;
    }
    const q = query.trim();
    let active = true;
    setLoading(true);
    const timer = window.setTimeout(async () => {
      const lang = language === 'en' ? 'en-US' : 'fr-FR';
      const kind = mediaType === 'tv' ? 'tv' : 'movie';
      const get = (path: string) =>
        fetch(`${TMDB_BASE_URL}/${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_API_KEY}&language=${lang}`)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null);
      // « dune 2 » : TMDB connaît « Dune : Deuxième partie » sous « dune ».
      const { base, sequel } = splitSequel(q);
      const [titles, people, baseTitles] = await Promise.all([
        get(`search/${kind}?query=${encodeURIComponent(q)}&page=1`),
        kind === 'movie' ? get(`search/person?query=${encodeURIComponent(q)}&page=1`) : Promise.resolve(null),
        sequel != null ? get(`search/${kind}?query=${encodeURIComponent(base)}&page=1`) : Promise.resolve(null),
      ]);
      if (!active) return;
      setRemote([...(titles?.results ?? []), ...(baseTitles?.results ?? [])].map(toRemote));
      const top = (people?.results ?? [])[0];
      const role = top?.known_for_department === 'Directing' ? 'director' : top?.known_for_department === 'Acting' ? 'actor' : null;
      if (top && role && personMatches(top.name, q)) {
        const credits = await get(`person/${top.id}/movie_credits`);
        if (!active) return;
        const list = role === 'director'
          ? (credits?.crew ?? []).filter((c: any) => c.job === 'Director')
          : (credits?.cast ?? []).filter((c: any) => (c.order ?? 99) < 8);
        const films = (list as any[])
          .filter((c) => c.release_date)
          .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0))
          .map(toRemote);
        setPerson(films.length ? { name: top.name, role, films } : null);
      } else {
        setPerson(null);
      }
      setLoading(false);
    }, 300);
    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [query, typed, mediaType, language]);

  useEffect(() => () => recognition.current?.stop(), []);

  const listen = () => {
    const Ctor = recognitionCtor();
    if (!Ctor) return;
    if (listening) {
      recognition.current?.stop();
      return;
    }
    haptics.soft();
    const rec = new Ctor();
    rec.lang = language === 'en' ? 'en-US' : 'fr-FR';
    rec.interimResults = true;
    rec.maxAlternatives = 1;
    rec.onresult = (e: any) => {
      const text = Array.from(e.results as ArrayLike<any>).map((r: any) => r[0]?.transcript ?? '').join(' ');
      setQuery(text.replace(/[.?!]+$/, '').trim());
    };
    rec.onend = () => setListening(false);
    rec.onerror = () => setListening(false);
    recognition.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setListening(false);
    }
  };

  const pick = (p: FilmPick) => {
    haptics.medium();
    recognition.current?.stop();
    onPick(p);
  };

  const localIds = new Set(local.map((m) => m.movie.tmdbId).filter(Boolean) as number[]);
  const ownedOrShown = new Set([...owned, ...localIds]);
  const personFilms = person ? rankRemote(person.films, '', ownedOrShown, 6) : [];
  const remoteRanked = rankRemote(remote, query, new Set([...ownedOrShown, ...personFilms.map((r) => r.id)]), person ? 3 : 8);
  const personOwned = person
    ? person.films.filter((f) => owned.has(f.id) && !localIds.has(f.id)).map((f) => movies.find((m) => m.tmdbId === f.id)).filter(Boolean) as Movie[]
    : [];
  const collection = [...local.map((m) => m.movie), ...personOwned].slice(0, 6);

  const when = (at: number) => {
    const days = Math.floor((new Date(now).setHours(0, 0, 0, 0) - new Date(at).setHours(0, 0, 0, 0)) / DAY);
    if (days <= 0) return t('picker.today');
    if (days === 1) return t('picker.yesterday');
    return new Date(at).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', { weekday: 'long' });
  };
  const score = (m: Movie) => formatScore(getMovieDisplayRating(m), language);
  const isRated = (m: Movie) => m.status === 'watched' && getMovieDisplayRating(m) > 0;

  const Poster = ({ url, className }: { url?: string | null; className: string }) => (
    <span className={`block shrink-0 overflow-hidden bg-stone-200 dark:bg-[#202020] ${className}`}>
      {url && <img src={url} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />}
    </span>
  );

  const hotRow = (p: HotPick, first: boolean) => {
    const movie = p.kind === 'movie' ? p.movie : null;
    const title = movie ? movie.title : p.kind === 'screening' ? p.screening.title : '';
    const poster = movie ? resizeTmdbImage(movie.posterUrl, 'w154') : p.kind === 'screening' ? resizeTmdbImage(p.screening.posterUrl, 'w154') : undefined;
    const where = p.kind === 'screening' ? p.screening.cinemaName : undefined;
    const key = movie ? movie.id : p.kind === 'screening' ? p.screening.id : '';
    const highlight = first && p.kind === 'movie' && !p.reviewed;
    return (
      <button
        key={key}
        type="button"
        onClick={() => pick(movie ? { kind: 'movie', movie } : { kind: 'screening', screening: (p as any).screening })}
        className={`w-full flex items-center gap-3.5 p-3 rounded-3xl bg-white dark:bg-[#1a1a1a] text-left active:scale-[0.99] transition-transform ${highlight ? 'border-2 border-bitter-lime shadow-lg shadow-forest/10' : 'border border-stone-100 dark:border-white/10'}`}
      >
        <Poster url={poster} className="w-[52px] h-[76px] rounded-2xl" />
        <span className="flex-1 min-w-0 flex flex-col gap-1">
          <span className="text-[15px] font-black tracking-tight leading-tight text-charcoal dark:text-white line-clamp-2">{title}</span>
          <span className="text-[12px] font-semibold text-stone-500 dark:text-stone-400 truncate first-letter:uppercase">
            {when(p.at)}
            {where ? ` · ${where}` : p.kind === 'screening' ? ` · ${t('picker.fromCalendar')}` : ''}
          </span>
          <span className="flex gap-1.5">
            {movie && isRated(movie) && (
              <span className="px-2 py-0.5 rounded-full bg-charcoal text-white dark:bg-white dark:text-charcoal text-[11px] font-black">{score(movie)}</span>
            )}
            {movie && isRated(movie) ? (
              <span className="px-2 py-0.5 rounded-full bg-stone-100 dark:bg-white/5 text-stone-500 dark:text-stone-400 text-[11px] font-bold">
                {p.kind === 'movie' && p.reviewed ? t('picker.hasReview') : t('picker.noReview')}
              </span>
            ) : (
              <span className="px-2 py-0.5 rounded-full bg-forest/10 text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime text-[11px] font-black">
                {t('picker.toRate')}
              </span>
            )}
          </span>
        </span>
        <ChevronRight size={18} className="shrink-0 text-charcoal dark:text-white" />
      </button>
    );
  };

  const resultRow = (m: Movie) => {
    const rated = isRated(m);
    const reviewed = !!m.review?.trim();
    return (
      <button
        key={m.id}
        type="button"
        onClick={() => pick({ kind: 'movie', movie: m })}
        className={`w-full flex items-center gap-3.5 p-2.5 rounded-[1.4rem] bg-white dark:bg-[#1a1a1a] text-left active:scale-[0.99] transition-transform ${rated && !reviewed ? 'border-2 border-bitter-lime' : 'border border-stone-100 dark:border-white/10'}`}
      >
        <Poster url={resizeTmdbImage(m.posterUrl, 'w154')} className="w-[44px] h-[64px] rounded-xl" />
        <span className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-[15px] font-black tracking-tight leading-tight text-charcoal dark:text-white line-clamp-2">{m.title}</span>
          <span className="text-[11px] font-semibold text-stone-500 dark:text-stone-400 truncate">
            {[m.year, m.director, rated ? t('picker.ratedAt', { n: score(m) }) : m.status === 'watchlist' ? t('picker.inWatchlist') : null].filter(Boolean).join(' · ')}
          </span>
        </span>
        {rated && (
          <span className={`shrink-0 px-2.5 py-1.5 rounded-full text-[10px] font-black ${reviewed ? 'bg-stone-100 text-stone-500 dark:bg-white/5 dark:text-stone-400' : 'bg-bitter-lime text-charcoal uppercase tracking-wider'}`}>
            {reviewed ? t('picker.complete') : t('picker.noReview')}
          </span>
        )}
      </button>
    );
  };

  const remoteRow = (r: RemoteFilm, meta?: string) => (
    <button
      key={r.id}
      type="button"
      onClick={() => pick({ kind: 'tmdb', tmdbId: r.id })}
      className="w-full flex items-center gap-3.5 py-2 px-1 border-b border-stone-100 dark:border-white/5 last:border-0 text-left active:bg-stone-50 dark:active:bg-white/5"
    >
      <Poster url={r.posterPath ? tmdbImage(r.posterPath, 'w154') : null} className="w-[40px] h-[58px] rounded-[10px]" />
      <span className="flex-1 min-w-0 flex flex-col gap-0.5">
        <span className="text-[14px] font-extrabold text-charcoal dark:text-white truncate">{r.title}</span>
        <span className="text-[11px] font-semibold text-stone-400 dark:text-stone-500 truncate">{[r.year, meta].filter(Boolean).join(' · ')}</span>
      </span>
    </button>
  );

  const label = (text: string, tone: 'muted' | 'forest' = 'muted') => (
    <p className={`ml-1 text-[10px] font-black uppercase tracking-[0.2em] ${tone === 'forest' ? 'text-forest dark:text-bitter-lime' : 'text-stone-400 dark:text-stone-500'}`}>
      {text}
    </p>
  );

  const nothing = typed && !loading && !collection.length && !remoteRanked.length && !personFilms.length;

  return (
    <div {...dialog.props} className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-md max-h-[92vh] flex flex-col bg-cream dark:bg-[#0c0c0c] rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl border-t dark:border-white/10 picker-sheet">
        <style>{`@keyframes pickerUp { from { transform: translateY(100%); } to { transform: none; } } .picker-sheet { animation: pickerUp .42s cubic-bezier(.175,.885,.32,1.1); } @media (prefers-reduced-motion: reduce) { .picker-sheet { animation: none; } }`}</style>
        <div className="px-5 pt-3.5 pb-4 flex flex-col gap-4 shrink-0">
          <div className="flex justify-center"><span className="w-10 h-[5px] rounded-full bg-stone-200 dark:bg-white/10" /></div>
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-forest dark:text-bitter-lime">
              <span className="w-[22px] h-[22px] rounded-full bg-bitter-lime grid place-items-center text-charcoal">
                <Mic size={12} strokeWidth={2.5} />
              </span>
              {t('nav.add.dictate')}
            </p>
            <button type="button" onClick={onClose} aria-label={t('common.close')} className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#161616] grid place-items-center text-charcoal dark:text-white active:scale-90 transition-transform">
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
          {!typed && (
            <h2 className="text-[30px] font-black tracking-[-0.03em] leading-[1.05] text-charcoal dark:text-white">{t('picker.title')}</h2>
          )}
          <label className="relative block">
            <span className="sr-only">{t('picker.search')}</span>
            <input
              type="search"
              enterKeyHint="search"
              autoComplete="off"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={listening ? t('picker.listening') : t('picker.placeholder')}
              className="w-full h-[60px] rounded-[18px] border-2 border-charcoal dark:border-white/30 bg-white dark:bg-[#161616] pl-12 pr-16 text-[17px] font-extrabold text-charcoal dark:text-white placeholder:text-stone-400 dark:placeholder:text-stone-600 outline-none [&::-webkit-search-cancel-button]:hidden"
            />
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-500" aria-hidden="true">
              {loading ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} strokeWidth={2.5} />}
            </span>
            {query ? (
              <button type="button" onClick={() => setQuery('')} aria-label={t('picker.clear')} className="absolute right-2 top-2 w-11 h-11 rounded-[14px] bg-stone-100 dark:bg-white/5 grid place-items-center text-charcoal dark:text-white">
                <X size={16} strokeWidth={2.5} />
              </button>
            ) : canListen ? (
              <button
                type="button"
                onClick={listen}
                aria-label={t('picker.sayTitle')}
                aria-pressed={listening}
                className={`absolute right-2 top-2 w-11 h-11 rounded-[14px] grid place-items-center transition-colors ${listening ? 'bg-bitter-lime text-charcoal motion-safe:animate-pulse' : 'bg-stone-100 dark:bg-white/5 text-charcoal dark:text-white'}`}
              >
                <Mic size={18} strokeWidth={2.5} />
              </button>
            ) : null}
          </label>
          {typed && person && (
            <div className="flex flex-wrap gap-2">
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-charcoal text-white dark:bg-white dark:text-charcoal text-[11px] font-extrabold">
                {t(person.role === 'director' ? 'picker.byDirector' : 'picker.byActor', { name: person.name })}
              </span>
            </div>
          )}
        </div>

        <div className="overflow-y-auto no-scrollbar flex-1 px-5 pb-10 flex flex-col gap-6">
          {!typed && (
            <>
              {hot.length > 0 && (
                <section className="flex flex-col gap-3">
                  {label(t('picker.hot'))}
                  {hot.map((p, i) => hotRow(p, i === 0))}
                </section>
              )}
              {rest.items.length > 0 && (
                <section className="flex flex-col gap-3 -mr-5">
                  {label(t('picker.unreviewed', { n: rest.total }))}
                  <div className="flex gap-2.5 overflow-x-auto no-scrollbar pr-5">
                    {rest.items.map((m) => (
                      <button key={m.id} type="button" onClick={() => pick({ kind: 'movie', movie: m })} className="shrink-0 w-[82px] flex flex-col gap-1.5 text-left active:scale-95 transition-transform">
                        <span className="relative block w-[82px] h-[118px] rounded-2xl overflow-hidden bg-stone-200 dark:bg-[#202020]">
                          {m.posterUrl && <img src={resizeTmdbImage(m.posterUrl, 'w185')} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" />}
                          <span className="absolute top-1.5 right-1.5 px-1.5 py-0.5 rounded-full bg-white/90 text-charcoal text-[10px] font-black">{score(m)}</span>
                        </span>
                        <span className="text-[11px] font-extrabold leading-tight text-charcoal dark:text-white line-clamp-2">{m.title}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
              {!hot.length && !rest.items.length && (
                <p className="text-[13px] font-medium text-stone-500 dark:text-stone-400 ml-1">{t('picker.emptyHint')}</p>
              )}
              <p className="mt-auto flex items-center gap-2 text-[12px] font-semibold text-stone-500 dark:text-stone-400 ml-1">
                <span className="w-2 h-2 rounded-full bg-forest dark:bg-bitter-lime" />
                {t('picker.micAfter')}
              </p>
            </>
          )}

          {typed && (
            <>
              {collection.length > 0 && (
                <section className="flex flex-col gap-2.5">
                  {label(t('picker.inCollection'), 'forest')}
                  {collection.map(resultRow)}
                </section>
              )}
              {person && personFilms.length > 0 && (
                <section className="flex flex-col">
                  {label(t(person.role === 'director' ? 'picker.directedBy' : 'picker.withActor', { name: person.name }))}
                  <div className="mt-1.5">{personFilms.map((r) => remoteRow(r))}</div>
                </section>
              )}
              {remoteRanked.length > 0 && (
                <section className="flex flex-col">
                  {label(t(collection.length ? 'picker.otherFilms' : 'picker.films'))}
                  <div className="mt-1.5">{remoteRanked.map((r) => remoteRow(r))}</div>
                </section>
              )}
              {nothing && <p className="text-[13px] font-medium text-stone-500 dark:text-stone-400 ml-1">{t('picker.noResults')}</p>}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default DictateFilmPicker;
