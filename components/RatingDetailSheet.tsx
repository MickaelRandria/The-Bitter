import React, { useMemo } from 'react';
import { X, Bookmark } from 'lucide-react';
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
   * Mes notes, indexées par critère. Seuls les critères que nous avons tous les deux
   * peuvent être comparés : deux profils de notation différents ne mesurent pas les
   * mêmes choses, et rapprocher deux valeurs qui ne parlent pas du même sujet
   * donnerait un écart faux mais crédible, ce qui est pire que pas d'écart du tout.
   */
  const ourByKey = useMemo(() => new Map(ours.map((c) => [c.key, c.value])), [ours]);

  const myRating = mine
    ? (mine.adaptiveRating?.weightedRating ??
      (mine.ratings.story + mine.ratings.visuals + mine.ratings.acting + mine.ratings.sound) / 4)
    : null;

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

          {item.synopsis && (
            <p className="text-[12px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
              {item.synopsis}
            </p>
          )}

          {/* Une ligne par critère plutôt qu'une rangée serrée : le libellé au-dessus
              de sa barre laisse à celle-ci toute la largeur, et le regard descend au
              lieu de faire des allers-retours. */}
          <div className="space-y-4">
            {theirs.map((c) => {
              const ourValue = ourByKey.get(c.key);
              return (
                <div key={c.key} className="space-y-1.5">
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-[11px] font-black uppercase tracking-widest text-charcoal dark:text-white truncate">
                      {c.label}
                    </span>
                    <div className="flex items-baseline gap-2 shrink-0">
                      {/* Le poids explique pourquoi la moyenne brute et la note
                          affichée diffèrent : sans lui, le détail paraît se contredire. */}
                      {c.weight !== 1 && (
                        <span className="text-[9px] font-black text-stone-300 dark:text-stone-700 tabular-nums">
                          ×{c.weight}
                        </span>
                      )}
                      <span className="text-sm font-black text-charcoal dark:text-white tabular-nums">
                        {c.value.toFixed(1)}
                        <span className="text-[10px] text-stone-300 dark:text-stone-700">/10</span>
                      </span>
                    </div>
                  </div>

                  <div className="relative h-2.5 bg-stone-200/70 dark:bg-white/5 rounded-full overflow-hidden">
                    <div
                      className="absolute inset-y-0 left-0 bg-gradient-to-r from-forest to-forest/80 dark:from-lime-500 dark:to-lime-400 rounded-full transition-[width] duration-500"
                      style={{ width: `${Math.max(0, Math.min(100, c.value * 10))}%` }}
                    />

                    {/* Ta note posée sur la même piste, en repère vertical : deux
                        barres l'une sous l'autre obligeraient à comparer deux
                        longueurs séparées, alors qu'un trait se lit d'un coup. */}
                    {ourValue != null && (
                      <span
                        className="absolute inset-y-0 w-0.5 bg-charcoal dark:bg-white rounded-full"
                        style={{ left: `${Math.max(0, Math.min(99, ourValue * 10))}%` }}
                        title={`${t('member.you')} ${ourValue.toFixed(1)}`}
                      />
                    )}
                  </div>
                </div>
              );
            })}

            {ourByKey.size > 0 && (
              <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                <span className="w-0.5 h-3 bg-charcoal dark:bg-white rounded-full" />
                {t('member.yourMark')}
              </p>
            )}
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
