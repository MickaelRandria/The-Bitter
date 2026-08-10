import React, { useEffect, useMemo, useState } from 'react';
import { Loader2, Ticket, Bookmark, Check, Users, AlertTriangle, RefreshCw } from 'lucide-react';
import { getTheatreReleases, TheatreRelease, TheatreReleases } from '../services/tmdb';
import { SharedSpace } from '../services/supabase';
import { TMDB_IMAGE_URL } from '../constants';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  /** Identifiants TMDB déjà présents dans la collection, tous statuts confondus. */
  knownTmdbIds: Set<number>;
  /** Identifiants déjà proposés dans un des espaces, pour ne pas les suggérer deux fois. */
  suggestedTmdbIds: Set<number>;
  spaces: SharedSpace[];
  onSelectMovie: (tmdbId: number) => void;
  onQuickWatchlist: (tmdbId: number) => void;
  onProposeToSpace: (tmdbId: number, space: SharedSpace) => Promise<boolean>;
}

/**
 * Sorties en salle.
 *
 * Contenu éditorial et non personnalisé : tout le monde voit la même liste, ce qui
 * est précisément ce qui permet d'en parler. Aucune table, aucune donnée
 * personnelle, aucune tâche planifiée : si l'écran ne sert pas, il se retire sans
 * laisser de trace.
 */
const TheatreReleasesSection: React.FC<Props> = ({
  knownTmdbIds,
  suggestedTmdbIds,
  spaces,
  onSelectMovie,
  onQuickWatchlist,
  onProposeToSpace,
}) => {
  const { t, language } = useLanguage();
  const [data, setData] = useState<TheatreReleases | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [pickerFor, setPickerFor] = useState<number | null>(null);
  const [proposing, setProposing] = useState<number | null>(null);

  /**
   * Sans région, la liste ne veut rien dire : les dates de sortie diffèrent d'un
   * pays à l'autre. Faute de réglage de pays dans l'app, on la déduit de la langue.
   * Approximation assumée, un francophone hors de France verra les dates françaises.
   */
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

  /** Les sorties à venir se lisent par semaine : une liste à plat de deux mois est illisible. */
  const upcomingByWeek = useMemo(() => {
    if (!data) return [];
    const groups = new Map<string, TheatreRelease[]>();
    for (const film of data.upcoming) {
      if (!film.releaseDate) continue;
      const list = groups.get(film.releaseDate) ?? [];
      list.push(film);
      groups.set(film.releaseDate, list);
    }
    return [...groups.entries()].sort((a, b) => a[0].localeCompare(b[0])).slice(0, 8);
  }, [data]);

  const formatDay = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;
    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  const handlePropose = async (tmdbId: number, space: SharedSpace) => {
    setProposing(tmdbId);
    const ok = await onProposeToSpace(tmdbId, space);
    setProposing(null);
    setPickerFor(null);
    if (ok) {
      haptics.success();
      setAdded((prev) => new Set(prev).add(tmdbId));
    } else {
      haptics.error();
    }
  };

  const renderCard = (film: TheatreRelease) => {
    const inCollection = knownTmdbIds.has(film.id);
    const alreadySuggested = suggestedTmdbIds.has(film.id) || added.has(film.id);

    return (
      <div
        key={film.id}
        className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-[1.5rem] overflow-hidden"
      >
        <button
          onClick={() => {
            haptics.soft();
            onSelectMovie(film.id);
          }}
          className="w-full flex items-start gap-3 p-3 text-left active:scale-[0.99] transition-transform"
        >
          {film.posterPath ? (
            <img
              src={resizeTmdbImage(`${TMDB_IMAGE_URL}${film.posterPath}`, 'w154')}
              alt=""
              className="w-14 rounded-lg object-cover aspect-[2/3] shrink-0"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <div className="w-14 aspect-[2/3] bg-stone-100 dark:bg-[#252525] rounded-lg shrink-0 flex items-center justify-center">
              <Ticket size={16} className="text-stone-400" />
            </div>
          )}

          <div className="flex-1 min-w-0">
            <p className="text-sm font-black text-charcoal dark:text-white leading-tight">
              {film.title}
            </p>
            {film.overview && (
              <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-snug mt-1 line-clamp-2">
                {film.overview}
              </p>
            )}
            {film.releaseDate && (
              <p className="text-[10px] font-black uppercase tracking-widest text-forest dark:text-lime-400 mt-1.5">
                {formatDay(film.releaseDate)}
              </p>
            )}
            <div className="flex flex-wrap items-center gap-1.5 mt-2">
              {inCollection && (
                <span className="text-[9px] font-black uppercase tracking-widest bg-stone-100 dark:bg-[#252525] text-stone-500 dark:text-stone-400 px-2 py-0.5 rounded">
                  {t('releases.inCollection')}
                </span>
              )}
              {alreadySuggested && (
                <span className="text-[9px] font-black uppercase tracking-widest bg-forest/10 dark:bg-lime-400/10 text-forest dark:text-lime-400 px-2 py-0.5 rounded">
                  {t('releases.alreadySuggested')}
                </span>
              )}
            </div>
          </div>
        </button>

        <div className="flex items-stretch border-t border-sand dark:border-white/5">
          <button
            onClick={() => {
              haptics.medium();
              onQuickWatchlist(film.id);
            }}
            disabled={inCollection}
            className="flex-1 py-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white active:scale-95 transition-transform disabled:opacity-30"
          >
            <Bookmark size={13} />
            {t('releases.addToWatchlist')}
          </button>

          {spaces.length > 0 && (
            <button
              onClick={() => {
                haptics.soft();
                setPickerFor(pickerFor === film.id ? null : film.id);
              }}
              disabled={proposing === film.id}
              className="flex-1 py-3 flex items-center justify-center gap-2 text-[10px] font-black uppercase tracking-widest text-forest dark:text-lime-400 border-l border-sand dark:border-white/5 active:scale-95 transition-transform disabled:opacity-40"
            >
              {proposing === film.id ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Users size={13} />
              )}
              {t('releases.proposeToSpace')}
            </button>
          )}
        </div>

        {/* Sélecteur d'espace en accordéon plutôt qu'en modale : proposer un film
            doit rester un geste court, et la liste tient en trois lignes. */}
        {pickerFor === film.id && (
          <div className="px-3 pb-3 space-y-1.5 animate-[fadeIn_0.2s_ease-out]">
            {spaces.map((space) => (
              <button
                key={space.id}
                onClick={() => handlePropose(film.id, space)}
                className="w-full text-left px-3 py-2.5 rounded-xl bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 text-xs font-bold text-charcoal dark:text-white active:scale-95 transition-transform"
              >
                {space.name}
              </button>
            ))}
          </div>
        )}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
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
        <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 max-w-[240px] leading-relaxed">
          {error}
        </p>
        <button
          onClick={() => load(true)}
          className="px-5 py-2.5 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all flex items-center gap-2"
        >
          <RefreshCw size={13} />
          {t('shared.retry')}
        </button>
      </div>
    );
  }

  const nothing = !data || (data.thisWeek.length === 0 && data.upcoming.length === 0);

  if (nothing) {
    return (
      <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 text-center py-16 leading-relaxed">
        {t('releases.empty')}
      </p>
    );
  }

  return (
    <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
      {data.thisWeek.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 flex items-center gap-2">
              <Ticket size={12} />
              {t('releases.thisWeek')}
            </h3>
            <button
              onClick={() => load(true)}
              aria-label={t('shared.retry')}
              className="text-stone-300 dark:text-stone-700 hover:text-charcoal dark:hover:text-white transition-colors"
            >
              <RefreshCw size={13} />
            </button>
          </div>
          <div className="space-y-3">{data.thisWeek.map(renderCard)}</div>
        </section>
      )}

      {upcomingByWeek.length > 0 && (
        <section className="space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 flex items-center gap-2">
            <Check size={12} />
            {t('releases.upcoming')}
          </h3>
          {upcomingByWeek.map(([day, films]) => (
            <div key={day} className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-widest text-stone-300 dark:text-stone-700 ml-1">
                {formatDay(day)}
              </p>
              <div className="space-y-3">{films.map(renderCard)}</div>
            </div>
          ))}
        </section>
      )}
    </div>
  );
};

export default TheatreReleasesSection;
