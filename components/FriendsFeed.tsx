import React, { useEffect, useMemo, useState } from 'react';
import {
  Loader2,
  Star,
  Film,
  AlertTriangle,
  RefreshCw,
  Users,
  Bookmark,
  TrendingUp,
  TrendingDown,
} from 'lucide-react';
import { FriendActivity, getFriendsActivity } from '../services/supabase';
import { TMDB_IMAGE_URL } from '../constants';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  /** Mes films vus, pour situer mon verdict à côté du sien. */
  myRatingByTmdb: Map<number, number>;
  /** Ce que j'ai déjà, vu ou en envie : le raccourci n'a pas à le reproposer. */
  knownTmdbIds: Set<number>;
  onSelectMovie: (tmdbId: number) => void;
  onQuickWatchlist: (tmdbId: number) => void;
}

/**
 * La couleur du badge porte le verdict avant même sa lecture.
 *
 * Un badge de teinte unique oblige à lire le chiffre pour savoir si le film a plu.
 * Trois paliers suffisent à trancher d'un coup d'œil, et le rouge sombre du bas de
 * l'échelle dit la sévérité sans crier.
 */
const scoreTone = (score: number) => {
  if (score >= 8) return 'bg-lime-400 text-charcoal';
  if (score >= 5) return 'bg-bitter-lime text-charcoal';
  return 'bg-[#7f1d1d] text-white';
};

/**
 * Ce que les membres de tes espaces ont vu, du plus récent au plus ancien.
 *
 * Aucune table dédiée : la source est `user_movies`, filtrée par une fonction
 * serveur sur les seules personnes avec qui l'on partage un espace. Un film dont
 * le partage a été décoché n'y figure pas.
 */
const FriendsFeed: React.FC<Props> = ({
  myRatingByTmdb,
  knownTmdbIds,
  onSelectMovie,
  onQuickWatchlist,
}) => {
  const { t, language } = useLanguage();
  const [items, setItems] = useState<FriendActivity[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** Note dépliée : on montre comment elle a été obtenue, pas seulement son résultat. */
  const [openDetail, setOpenDetail] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    const result = await getFriendsActivity(50);
    if (result.error) setError(result.error);
    setItems(result.data);
    setLoading(false);
  };

  useEffect(() => {
    load();
  }, []);

  /**
   * Regroupé par jour. Une liste plate de cinquante lignes ne se lit pas : les
   * repères de temps sont ce qui transforme un journal en récit.
   */
  const byDay = useMemo(() => {
    const groups = new Map<string, FriendActivity[]>();
    for (const item of items) {
      const day = (item.watchedAt || '').slice(0, 10);
      const list = groups.get(day) ?? [];
      list.push(item);
      groups.set(day, list);
    }
    return [...groups.entries()].sort((a, b) => b[0].localeCompare(a[0]));
  }, [items]);

  const formatDay = (iso: string) => {
    const date = new Date(iso);
    if (Number.isNaN(date.getTime())) return iso;

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();

    if (same(date, today)) return t('feed.today');
    if (same(date, yesterday)) return t('feed.yesterday');

    return date.toLocaleDateString(language === 'fr' ? 'fr-FR' : 'en-GB', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
    });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3">
        <Loader2 size={28} className="animate-spin text-stone-300 dark:text-stone-700" />
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-700">
          {t('feed.loading')}
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
          onClick={load}
          className="px-5 py-2.5 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all flex items-center gap-2"
        >
          <RefreshCw size={13} />
          {t('shared.retry')}
        </button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="text-center py-16 space-y-3">
        <div className="w-14 h-14 rounded-full bg-stone-50 dark:bg-[#161616] flex items-center justify-center mx-auto text-stone-300 dark:text-stone-700">
          <Users size={22} />
        </div>
        <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 max-w-[260px] mx-auto leading-relaxed">
          {t('feed.empty')}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-[fadeIn_0.3s_ease-out]">
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">
          {t('feed.title')}
        </h3>
        <button
          onClick={load}
          aria-label={t('shared.retry')}
          className="text-stone-300 dark:text-stone-700 hover:text-charcoal dark:hover:text-white transition-colors"
        >
          <RefreshCw size={13} />
        </button>
      </div>

      {byDay.map(([day, entries]) => (
        <section key={day} className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-stone-300 dark:text-stone-700 ml-1">
            {formatDay(day)}
          </p>

          <div className="space-y-2">
            {entries.map((item) => {
              const mine = item.tmdbId != null ? myRatingByTmdb.get(item.tmdbId) : undefined;
              const gap = mine != null ? item.rating - mine : null;

              return (
                <div
                  key={item.movieId}
                  className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-[1.5rem] overflow-hidden"
                >
                <div className="flex items-start gap-3 p-3">
                <button
                  onClick={() => {
                    if (item.tmdbId == null) return;
                    haptics.soft();
                    onSelectMovie(item.tmdbId);
                  }}
                  className="flex-1 flex items-start gap-3 text-left active:scale-[0.99] transition-transform min-w-0"
                >
                  {item.posterUrl ? (
                    <img
                      src={resizeTmdbImage(item.posterUrl, 'w154')}
                      alt=""
                      className="w-12 rounded-lg object-cover aspect-[2/3] shrink-0"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-12 aspect-[2/3] bg-stone-100 dark:bg-[#252525] rounded-lg shrink-0 flex items-center justify-center">
                      <Film size={14} className="text-stone-400" />
                    </div>
                  )}

                  <div className="flex-1 min-w-0">
                    <p className="text-[10px] font-black uppercase tracking-widest text-forest dark:text-lime-400">
                      {item.firstName}
                    </p>
                    <p className="text-sm font-black text-charcoal dark:text-white leading-tight mt-0.5">
                      {item.title}
                    </p>
                    <p className="text-[10px] font-medium text-stone-400 dark:text-stone-600 truncate">
                      {item.director}
                      {item.year ? ` · ${item.year}` : ''}
                    </p>

                    {/* Uniquement un avis écrit. Le synopsis, identique pour tout le
                        monde, n'apprenait rien et allongeait chaque carte pour rien. */}
                    {item.review && (
                      <p className="text-[11px] font-medium text-charcoal dark:text-stone-300 leading-snug mt-1.5 line-clamp-2">
                        « {item.review} »
                      </p>
                    )}

                    {/* Ta note à côté de la sienne : c'est ce rapprochement qui rend
                        le fil intéressant, et non la simple annonce d'un visionnage.
                        En encart teinté plutôt qu'en ligne grise, parce que c'est la
                        seule information de la carte qui parle de toi. */}
                    {gap != null && (
                      <span
                        className={`inline-flex items-center gap-1.5 mt-2 px-2 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${
                          Math.abs(gap) < 0.5
                            ? 'bg-stone-100 dark:bg-white/5 text-stone-400 dark:text-stone-500'
                            : gap < 0
                              ? 'bg-lime-400/20 text-forest dark:text-lime-400'
                              : 'bg-[#7f1d1d]/10 text-[#7f1d1d] dark:text-red-400'
                        }`}
                      >
                        {Math.abs(gap) < 0.5 ? (
                          t('feed.sameAsYou')
                        ) : (
                          <>
                            {gap < 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                            {t('feed.versusYou', { mine: (mine as number).toFixed(1) })}
                          </>
                        )}
                      </span>
                    )}
                  </div>

                </button>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    {/* La note est un bouton : un chiffre seul ne dit pas comment il
                        a été obtenu, et c'est justement ce qui distingue Bitter+ d'une
                        étoile posée à la va-vite. Sa couleur, elle, livre le verdict
                        avant même qu'on lise le chiffre. */}
                    <button
                      onClick={() => {
                        haptics.soft();
                        setOpenDetail(openDetail === item.movieId ? null : item.movieId);
                      }}
                      disabled={!item.adaptiveRating?.criteria?.length}
                      aria-expanded={openDetail === item.movieId}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-lg active:scale-90 transition-transform disabled:active:scale-100 ${scoreTone(item.rating)}`}
                    >
                      <Star size={10} fill="currentColor" />
                      <span className="text-[10px] font-black tabular-nums">
                        {item.rating.toFixed(1)}
                      </span>
                    </button>

                    {/* Ancré sous la note : un film aperçu dans le fil se met de côté
                        d'un geste, sans ouvrir sa fiche ni perdre sa lecture. */}
                    {item.tmdbId != null && !knownTmdbIds.has(item.tmdbId) && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          haptics.medium();
                          onQuickWatchlist(item.tmdbId as number);
                        }}
                        aria-label={t('feed.addToWatchlist')}
                        className="w-7 h-7 rounded-lg bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-stone-400 dark:text-stone-500 active:scale-90 transition-transform hover:text-charcoal dark:hover:text-white"
                      >
                        <Bookmark size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {openDetail === item.movieId && item.adaptiveRating?.criteria?.length && (
                  <div className="px-3 pb-3 space-y-2 animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-stone-50 dark:bg-[#161616] rounded-xl p-3 border border-stone-100 dark:border-white/5 space-y-2">
                      <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                        {t('feed.gridOf', {
                          name: item.firstName,
                          profile: item.adaptiveRating.profile?.label ?? '',
                        })}
                      </p>
                      {item.adaptiveRating.criteria.map((c) => (
                        <div key={c.key} className="flex items-center gap-2">
                          <span className="text-[10px] font-bold text-stone-500 dark:text-stone-400 w-24 shrink-0 truncate">
                            {c.label}
                          </span>
                          <div className="flex-1 h-1.5 bg-stone-200 dark:bg-white/5 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-forest dark:bg-lime-500"
                              style={{ width: `${Math.max(0, Math.min(100, c.value * 10))}%` }}
                            />
                          </div>
                          <span className="text-[10px] font-black text-charcoal dark:text-white tabular-nums w-7 text-right">
                            {c.value.toFixed(1)}
                          </span>
                          {/* Le poids explique pourquoi la moyenne brute et la note
                              affichée diffèrent : sans lui le détail semblerait faux. */}
                          <span className="text-[9px] font-bold text-stone-300 dark:text-stone-700 w-8 text-right shrink-0">
                            ×{c.weight}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                </div>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
};

export default FriendsFeed;
