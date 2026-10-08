import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Bookmark, Check, Loader2, RefreshCw, Ticket, Users } from 'lucide-react';
import { getTheatreReleases, TheatreRelease, TheatreReleases } from '../services/tmdb';
import { TMDB_IMAGE_URL } from '../constants';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  /** Identifiants TMDB déjà présents dans la collection, tous statuts confondus. */
  knownTmdbIds: Set<number>;
  onSelectMovie: (tmdbId: number) => void;
  onQuickWatchlist: (tmdbId: number) => void;
  /** « Voir avec… » : absent sans compte. */
  onWatchWith?: (tmdbId: number) => void;
}

/**
 * « Bientôt en salle », dans l'onglet À venir du calendrier.
 *
 * Une frise : un groupe par jour de sortie, du plus proche au plus lointain, la
 * date en grand à gauche. Toutes les affiches ont la même taille : c'est l'image
 * qui fait envie, pas un classement de popularité.
 */
const UpcomingReleasesFrise: React.FC<Props> = ({ knownTmdbIds, onSelectMovie, onQuickWatchlist, onWatchWith }) => {
  const { t, language } = useLanguage();
  const [data, setData] = useState<TheatreReleases | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Ajoutés à « À voir » ici : le bouton bascule sans attendre la collection. */
  const [wished, setWished] = useState<Set<number>>(new Set());

  /** Les dates de sortie diffèrent d'un pays à l'autre ; faute de réglage, la langue tranche. */
  const region = language === 'fr' ? 'FR' : 'US';

  const load = async (force = false) => {
    setLoading(true);
    setError(null);
    try {
      setData(await getTheatreReleases(region, { force }));
    } catch (e) {
      console.warn('[Sorties] Lecture impossible :', e);
      setError(t('releases.failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [region]);

  const days = useMemo(() => {
    if (!data) return [] as [string, TheatreRelease[]][];
    const seen = new Set<number>();
    const films = data.upcoming
      .filter((film) => film.releaseDate && !seen.has(film.id) && seen.add(film.id))
      .sort((a, b) => a.releaseDate.localeCompare(b.releaseDate) || (b.popularity ?? 0) - (a.popularity ?? 0));
    const byDay = new Map<string, TheatreRelease[]>();
    for (const film of films) byDay.set(film.releaseDate, [...(byDay.get(film.releaseDate) ?? []), film]);
    return [...byDay.entries()];
  }, [data]);

  /** « dans 6 j », « demain » : la distance compte plus que la date. */
  const untilLabel = (iso: string) => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
    const n = Math.round((Date.parse(`${iso}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
    if (n <= 0) return t('releases.today');
    if (n === 1) return t('releases.tomorrow');
    return t('releases.inDays', { days: String(n) });
  };

  const dateParts = (iso: string) => {
    const date = new Date(`${iso}T12:00:00Z`);
    const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
    const part = (o: Intl.DateTimeFormatOptions) => date.toLocaleDateString(locale, { ...o, timeZone: 'Europe/Paris' });
    return { day: part({ day: 'numeric' }), month: part({ month: 'short' }).replace('.', ''), weekday: part({ weekday: 'short' }) };
  };

  const pill =
    'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[9.5px] font-black uppercase tracking-widest active:scale-95 transition-transform disabled:opacity-60';

  const renderFilm = (film: TheatreRelease) => {
    const inCollection = knownTmdbIds.has(film.id) || wished.has(film.id);
    return (
      <div key={film.id}>
        <button
          onClick={() => {
            haptics.soft();
            onSelectMovie(film.id);
          }}
          aria-label={film.title}
          className="relative block aspect-[2/3] w-full overflow-hidden rounded-2xl bg-stone-200 shadow-[0_14px_30px_-18px_rgba(0,0,0,0.6)] transition-transform active:scale-[0.98] dark:bg-[#1A1A19]"
        >
          {film.posterPath ? (
            <img
              src={resizeTmdbImage(`${TMDB_IMAGE_URL}${film.posterPath}`, 'w500')}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <Ticket size={28} className="absolute inset-0 m-auto text-stone-400" />
          )}
        </button>
        <p className="mt-2.5 text-[17px] font-black leading-tight tracking-tight text-charcoal dark:text-white">{film.title}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            onClick={() => {
              haptics.medium();
              setWished((prev) => new Set(prev).add(film.id));
              onQuickWatchlist(film.id);
            }}
            disabled={inCollection}
            className={`${pill} ${
              inCollection
                ? 'bg-[#D9FF00]/20 text-forest dark:text-[#D9FF00]'
                : 'bg-charcoal text-white dark:bg-white dark:text-[#111]'
            }`}
          >
            {inCollection ? <Check size={12} strokeWidth={3} /> : <Bookmark size={12} />}
            {t(inCollection ? 'releases.inYourList' : 'releases.wantToSee')}
          </button>
          {onWatchWith && (
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
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16">
        <Loader2 size={28} className="animate-spin text-stone-300 dark:text-stone-700" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-700">
          {t('releases.loading')}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle size={20} className="text-orange-400" />
        <p className="max-w-[240px] text-[11px] font-medium leading-relaxed text-stone-400 dark:text-stone-500">{error}</p>
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

  if (!days.length) {
    return (
      <p className="py-16 text-center text-[11px] font-medium leading-relaxed text-stone-400 dark:text-stone-500">
        {t('releases.empty')}
      </p>
    );
  }

  return (
    <div className="animate-[fadeIn_0.3s_ease-out]">
      {days.map(([day, films]) => {
        const parts = dateParts(day);
        return (
          <div key={day} className="grid grid-cols-[52px_minmax(0,1fr)] gap-3">
            <div className="self-start pt-1 text-center">
              <p className="text-[38px] font-black leading-[0.9] tracking-tighter text-charcoal dark:text-white">{parts.day}</p>
              <p className="text-[10px] font-black uppercase tracking-[0.16em] text-charcoal dark:text-white">{parts.month}</p>
              <p className="mt-0.5 text-[9.5px] font-extrabold text-stone-400">{parts.weekday}</p>
              <span className="mt-2 inline-block rounded-full bg-[#D9FF00] px-1.5 py-0.5 text-[9px] font-black text-[#111]">
                {untilLabel(day)}
              </span>
            </div>
            <div className="min-w-0 space-y-6 border-l-2 border-stone-200 pb-8 pl-3 dark:border-white/10">
              {films.map(renderFilm)}
            </div>
          </div>
        );
      })}
    </div>
  );
};

export default UpcomingReleasesFrise;
