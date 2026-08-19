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
  X,
} from 'lucide-react';
import { FriendActivity, getFriendsActivity } from '../services/supabase';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { avatarSrc } from '../utils/avatar';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useResumeRefresh } from '../utils/useResumeRefresh';
import { Movie } from '../types';
import RatingDetailSheet from './RatingDetailSheet';

interface Props {
  /** Mes films vus, pour situer mon verdict à côté du sien. */
  myRatingByTmdb: Map<number, number>;
  /** Mes films complets, pour comparer critère par critère dans le détail. */
  myMovieByTmdb: Map<number, Movie>;
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
 * Une rangée par journée, balayée horizontalement. L'affiche occupe presque toute
 * la largeur, en 9:16 comme elle a été conçue : un recadrage en paysage ampute
 * toujours une composition verticale. Le défilement vertical reste réservé aux
 * dates, ce qui préserve la vue d'ensemble qu'un fil entièrement horizontal
 * détruirait, puisqu'il faudrait alors un geste par entrée sans jamais savoir
 * combien il en reste.
 */
const FriendsFeed: React.FC<Props> = ({
  myRatingByTmdb,
  myMovieByTmdb,
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
   * Le fil n'a pas d'abonnement temps réel : personne ne le regarde en continu.
   * Mais il doit être frais quand on le rouvre, sinon il montre l'activité d'hier
   * en la faisant passer pour celle de maintenant.
   */
  useResumeRefresh(() => load());

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
    <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
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
        <section key={day} className="space-y-3">
          <div className="flex items-baseline gap-2">
            <p className="text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white">
              {formatDay(day)}
            </p>
            <span className="text-[10px] font-black text-stone-300 dark:text-stone-700 tabular-nums">
              {entries.length}
            </span>
          </div>

          {/*
            Débordement volontaire hors des marges de la page : une affiche qui
            s'arrête net au bord donne l'impression d'une liste tronquée, alors
            qu'un aperçu de la suivante invite à balayer. Le calage par `snap`
            garantit qu'on retombe toujours sur une carte entière.
          */}
          {/* Le rail à défilement devient une grille : le `-mx-6` était calibré sur
              le padding du <main>, or Découverte est désormais une colonne centrée —
              le débordement serait allé dans la marge vide. Et sur un écran large on
              ne voyait toujours que trois cartes sur une rangée à moitié vide. */}
          <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory -mx-6 px-6 pb-1 tab:mx-0 tab:grid tab:grid-cols-3 tab:gap-4 tab:overflow-visible tab:px-0 lg:grid-cols-4">
            {entries.map((item) => {
              const mine = item.tmdbId != null ? myRatingByTmdb.get(item.tmdbId) : undefined;
              const gap = mine != null ? item.rating - mine : null;
              const detailOpen = openDetail === item.movieId;

              return (
                <article
                  key={item.movieId}
                  className="relative shrink-0 snap-start w-[78%] max-w-[300px] aspect-[9/16] rounded-[1.5rem] overflow-hidden bg-stone-100 dark:bg-[#161616] border border-sand dark:border-white/10 tab:w-full tab:shrink tab:mx-auto"
                >
                  <button
                    onClick={() => {
                      if (item.tmdbId == null) return;
                      haptics.soft();
                      onSelectMovie(item.tmdbId);
                    }}
                    className="absolute inset-0 w-full h-full"
                    aria-label={item.title}
                  >
                    {item.posterUrl ? (
                      <img
                        src={resizeTmdbImage(item.posterUrl, 'w500')}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <span className="absolute inset-0 flex items-center justify-center text-stone-300 dark:text-stone-700">
                        <Film size={28} />
                      </span>
                    )}
                  </button>

                  {/* Qui poste, en haut. Le prénom passait après le titre du film :
                      on voyait quoi avant de voir qui, l'inverse de ce qui fait vivre
                      un fil social. Le dégradé garantit la lisibilité sur une affiche
                      claire comme sur une sombre. */}
                  <div className="absolute inset-x-0 top-0 flex items-center gap-2 p-3 bg-gradient-to-b from-black/70 to-transparent pointer-events-none">
                    <span className="w-8 h-8 rounded-full overflow-hidden bg-white/20 backdrop-blur flex items-center justify-center shrink-0">
                      {avatarSrc(item.avatarUrl) ? (
                        <img
                          src={avatarSrc(item.avatarUrl) as string}
                          alt=""
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <span className="text-[11px] font-black text-white">
                          {item.firstName[0]?.toUpperCase()}
                        </span>
                      )}
                    </span>
                    <span className="text-xs font-black text-white truncate drop-shadow">
                      {item.firstName}
                    </span>
                  </div>

                  <button
                    onClick={() => {
                      haptics.soft();
                      setOpenDetail(detailOpen ? null : item.movieId);
                    }}
                    disabled={!item.adaptiveRating?.criteria?.length}
                    aria-expanded={detailOpen}
                    className={`absolute top-3 right-3 flex items-center gap-1 px-2.5 py-1 rounded-lg shadow-lg active:scale-90 transition-transform disabled:active:scale-100 ${scoreTone(item.rating)}`}
                  >
                    <Star size={10} fill="currentColor" />
                    <span className="text-[11px] font-black tabular-nums">
                      {item.rating.toFixed(1)}
                    </span>
                  </button>

                  <div className="absolute inset-x-0 bottom-0 p-3 pt-10 bg-gradient-to-t from-black/90 via-black/60 to-transparent space-y-2 pointer-events-none">
                    <div>
                      <p className="text-sm font-black text-white leading-tight line-clamp-2">
                        {item.title}
                      </p>
                      <p className="text-[10px] font-medium text-white/60 truncate">
                        {item.director}
                        {item.year ? ` · ${item.year}` : ''}
                      </p>
                    </div>

                    {item.review && (
                      <p className="text-[11px] font-medium text-white/90 leading-snug line-clamp-2">
                        « {item.review} »
                      </p>
                    )}

                    <div className="flex items-center justify-between gap-2 pointer-events-auto">
                      {gap != null ? (
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest backdrop-blur ${
                            Math.abs(gap) < 0.5
                              ? 'bg-white/15 text-white/80'
                              : gap < 0
                                ? 'bg-lime-400/25 text-lime-300'
                                : 'bg-red-500/25 text-red-300'
                          }`}
                        >
                          {Math.abs(gap) < 0.5 ? (
                            t('feed.sameAsYou')
                          ) : (
                            <>
                              {gap < 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                              {t('feed.versusYou', { mine: (mine as number).toFixed(1) })}
                            </>
                          )}
                        </span>
                      ) : (
                        <span />
                      )}

                      {item.tmdbId != null && !knownTmdbIds.has(item.tmdbId) && (
                        <button
                          onClick={() => {
                            haptics.medium();
                            onQuickWatchlist(item.tmdbId as number);
                          }}
                          aria-label={t('feed.addToWatchlist')}
                          className="w-8 h-8 rounded-lg bg-white/15 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform shrink-0"
                        >
                          <Bookmark size={14} />
                        </button>
                      )}
                    </div>
                  </div>

                </article>
              );
            })}
          </div>
        </section>
      ))}

      {/* Le détail vit dans une feuille et non dans la carte : le format fixe de la
          rangée n'offrait aucune place, et un retournement aurait donné un dos
          exactement aussi étroit que la face. */}
      {openDetail &&
        (() => {
          const item = items.find((i) => i.movieId === openDetail);
          if (!item) return null;
          return (
            <RatingDetailSheet
              item={item}
              mine={item.tmdbId != null ? myMovieByTmdb.get(item.tmdbId) : undefined}
              onClose={() => setOpenDetail(null)}
              onQuickWatchlist={onQuickWatchlist}
            />
          );
        })()}
    </div>
  );
};

export default FriendsFeed;
