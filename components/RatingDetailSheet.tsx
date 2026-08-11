import React, { useMemo } from 'react';
import { X, Star, Bookmark } from 'lucide-react';
import { FriendActivity } from '../services/supabase';
import { Movie } from '../types';
import { TMDB_IMAGE_URL } from '../constants';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { avatarSrc } from '../utils/avatar';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface Props {
  item: FriendActivity;
  /** Mon propre film, s'il est dans ma collection. */
  mine?: Movie;
  onClose: () => void;
  onQuickWatchlist?: (tmdbId: number) => void;
}

/** Une valeur par critère, quelle que soit la façon dont la note a été posée. */
const criteriaOf = (
  adaptive: { criteria?: { key: string; label: string; value: number; weight: number }[] } | null,
  fallback?: { story: number; visuals: number; acting: number; sound: number }
) => {
  if (adaptive?.criteria?.length) {
    return adaptive.criteria.map((c) => ({ key: c.key, label: c.label, value: c.value, weight: c.weight }));
  }
  if (!fallback) return [];
  return [
    { key: 'scenario', label: 'Scénario', value: Number(fallback.story), weight: 1 },
    { key: 'image', label: 'Image', value: Number(fallback.visuals), weight: 1 },
    { key: 'interpretation', label: 'Jeu', value: Number(fallback.acting), weight: 1 },
    { key: 'sound', label: 'Son', value: Number(fallback.sound), weight: 1 },
  ];
};

/**
 * Le verdict d'un film, en grand.
 *
 * La carte du fil est en format fixe : agrandir le détail à l'intérieur déformerait
 * la rangée, et un retournement aurait offert un dos exactement aussi étroit que la
 * face. Une feuille libère la place, et permet surtout de montrer ce qui compte
 * vraiment : non pas comment il a noté, mais comment vous avez noté ce film tous
 * les deux. La comparaison par critère, fade sur une moyenne générale, devient
 * parlante sur un seul titre.
 */
const RatingDetailSheet: React.FC<Props> = ({ item, mine, onClose, onQuickWatchlist }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, item.title);

  const theirs = useMemo(() => criteriaOf(item.adaptiveRating ?? null), [item]);

  const ours = useMemo(() => {
    if (!mine) return [];
    return criteriaOf(mine.adaptiveRating ?? null, mine.ratings);
  }, [mine]);

  /**
   * Axes communs uniquement. Deux profils de notation différents n'ont pas les mêmes
   * critères, et superposer des formes qui ne mesurent pas la même chose produirait
   * un dessin faux mais convaincant, ce qui est pire qu'aucun dessin.
   */
  const axes = useMemo(() => {
    if (theirs.length === 0) return [];
    if (ours.length === 0) return theirs.map((c) => ({ label: c.label, a: c.value, b: null as number | null }));

    const byKey = new Map(ours.map((c) => [c.key, c.value]));
    return theirs
      .filter((c) => byKey.has(c.key))
      .map((c) => ({ label: c.label, a: c.value, b: byKey.get(c.key) as number }));
  }, [theirs, ours]);

  const myRating = mine
    ? (mine.adaptiveRating?.weightedRating ??
      (mine.ratings.story + mine.ratings.visuals + mine.ratings.acting + mine.ratings.sound) / 4)
    : null;

  /** Coordonnées d'un point sur l'axe `i`, pour une valeur de 0 à 10. */
  const point = (i: number, value: number, radius = 40) => {
    const angle = (-90 + (360 / axes.length) * i) * (Math.PI / 180);
    const r = (Math.max(0, Math.min(10, value)) / 10) * radius;
    return `${50 + r * Math.cos(angle)},${50 + r * Math.sin(angle)}`;
  };

  const shape = (pick: (axis: { a: number; b: number | null }) => number | null) =>
    axes
      .map((axis, i) => {
        const v = pick(axis);
        return v == null ? null : point(i, v);
      })
      .filter(Boolean)
      .join(' ');

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[280] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        {/* Bandeau : l'affiche situe immédiatement de quel film on parle, sans
            obliger à lire un titre au milieu de chiffres. */}
        <div className="relative h-32 shrink-0 bg-stone-200 dark:bg-[#161616] overflow-hidden">
          {item.posterUrl && (
            <img
              src={resizeTmdbImage(item.posterUrl, 'w500')}
              alt=""
              className="w-full h-full object-cover opacity-60"
            />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-cream dark:from-[#0c0c0c] to-transparent" />

          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="absolute top-3 right-3 w-8 h-8 rounded-full bg-black/40 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
          >
            <X size={16} strokeWidth={2.5} />
          </button>

          <div className="absolute inset-x-0 bottom-0 px-6 pb-3">
            <p className="text-lg font-black text-charcoal dark:text-white leading-tight line-clamp-2">
              {item.title}
            </p>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar px-6 py-5 space-y-6">
          <div className="flex items-center justify-center gap-6">
            <div className="flex items-center gap-2">
              <span className="w-8 h-8 rounded-full overflow-hidden bg-stone-100 dark:bg-[#252525] flex items-center justify-center shrink-0">
                {avatarSrc(item.avatarUrl) ? (
                  <img src={avatarSrc(item.avatarUrl) as string} alt="" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-[11px] font-black text-stone-400">
                    {item.firstName[0]?.toUpperCase()}
                  </span>
                )}
              </span>
              <div className="text-left">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                  {item.firstName}
                </p>
                <p className="text-xl font-black text-charcoal dark:text-white tabular-nums leading-none">
                  {item.rating.toFixed(1)}
                </p>
              </div>
            </div>

            {myRating != null && (
              <div className="text-left">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                  {t('member.you')}
                </p>
                <p className="text-xl font-black text-charcoal dark:text-white tabular-nums leading-none">
                  {myRating.toFixed(1)}
                </p>
              </div>
            )}
          </div>

          {axes.length >= 3 && (
            <div className="space-y-3">
              {/* Un radar plutôt que des barres : sur un même film, ce qui intéresse
                  n'est pas le niveau de chaque critère mais la FORME du jugement, et
                  deux formes superposées se comparent d'un seul regard. */}
              <svg viewBox="0 0 100 100" className="w-full max-w-[240px] mx-auto" role="img">
                {[0.25, 0.5, 0.75, 1].map((ratio) => (
                  <polygon
                    key={ratio}
                    points={axes.map((_, i) => point(i, 10 * ratio)).join(' ')}
                    className="fill-none stroke-stone-200 dark:stroke-white/10"
                    strokeWidth="0.4"
                  />
                ))}

                {myRating != null && (
                  <polygon
                    points={shape((a) => a.b)}
                    className="fill-stone-400/20 stroke-stone-400 dark:stroke-stone-500"
                    strokeWidth="1"
                    vectorEffect="non-scaling-stroke"
                  />
                )}

                <polygon
                  points={shape((a) => a.a)}
                  className="fill-forest/20 dark:fill-lime-400/20 stroke-forest dark:stroke-lime-400"
                  strokeWidth="1.4"
                  vectorEffect="non-scaling-stroke"
                />
              </svg>

              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
                {axes.map((axis) => (
                  <span
                    key={axis.label}
                    className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600"
                  >
                    {axis.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {theirs.map((c) => (
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
                {/* Le poids explique pourquoi la moyenne brute et la note affichée
                    diffèrent : sans lui, le détail paraît se contredire. */}
                <span className="text-[9px] font-bold text-stone-300 dark:text-stone-700 w-8 text-right shrink-0">
                  ×{c.weight}
                </span>
              </div>
            ))}
          </div>

          {item.review && (
            <p className="text-[13px] font-medium text-charcoal dark:text-stone-300 leading-relaxed">
              « {item.review} »
            </p>
          )}

          {/* Ne pas avoir vu le film est le moment le plus naturel pour le mettre
              de côté : on vient justement de lire pourquoi il a plu. */}
          {myRating == null && item.tmdbId != null && onQuickWatchlist && (
            <button
              onClick={() => {
                haptics.medium();
                onQuickWatchlist(item.tmdbId as number);
                onClose();
              }}
              className="w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <Bookmark size={13} />
              {t('feed.addToWatchlist')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default RatingDetailSheet;
