import React, { useMemo, useState } from 'react';
import { Sparkles, Loader2, RefreshCw } from 'lucide-react';
import { Movie } from '../types';
import { computeTasteStats, describeStats } from '../utils/tasteStats';
import { getTastePortrait, TasteTrait } from '../services/ai';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface Props {
  movies: Movie[];
}

/** En dessous, les moyennes ne veulent rien dire et une corrélation encore moins. */
const MIN_MOVIES = 10;

const CACHE_KEY = 'bitter_taste_portrait_v1';

interface Cached {
  /** Nombre de films au moment du calcul : le portrait vieillit avec eux. */
  count: number;
  traits: TasteTrait[];
}

/**
 * Ce que la façon de noter dit de quelqu'un.
 *
 * Soixante films notés sur quatre critères contiennent un motif que personne ne
 * peut lire seul — mais le danger d'une telle fonction porte un nom :
 * l'horoscope. Une phrase inventée sur quelqu'un se lit exactement comme une
 * phrase vraie.
 *
 * D'où le partage des rôles : l'application calcule les moyennes et les
 * corrélations, le modèle se contente de les mettre en mots, et **le chiffre
 * reste affiché à côté de la phrase**. Ce n'est pas une décoration : c'est ce qui
 * rend chaque observation vérifiable par celui qu'elle décrit.
 *
 * Le portrait est mis en cache et ne se recalcule qu'après cinq films de plus :
 * un trait de caractère qui change à chaque ouverture ne serait pas un trait de
 * caractère.
 */
const TastePortrait: React.FC<Props> = ({ movies }) => {
  const { t } = useLanguage();
  const stats = useMemo(() => computeTasteStats(movies), [movies]);

  const [traits, setTraits] = useState<TasteTrait[]>(() => {
    try {
      const cached: Cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return cached?.traits ?? [];
    } catch {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cachedCount = useMemo(() => {
    try {
      const cached: Cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
      return cached?.count ?? 0;
    } catch {
      return 0;
    }
  }, [traits]);

  const stale = traits.length > 0 && stats.count - cachedCount >= 5;

  const draw = async () => {
    if (loading) return;
    haptics.medium();
    setError(null);
    setLoading(true);
    try {
      const result = await getTastePortrait(describeStats(stats));
      if (result.length === 0) {
        setError(t('portrait.failed'));
        return;
      }
      setTraits(result);
      localStorage.setItem(
        CACHE_KEY,
        JSON.stringify({ count: stats.count, traits: result } satisfies Cached)
      );
      haptics.success();
    } catch (e: any) {
      setError(e?.message || t('portrait.failed'));
    } finally {
      setLoading(false);
    }
  };

  // Rien à dire tant qu'il n'y a pas de quoi calculer : trois films ne font ni
  // une moyenne ni un motif, et un portrait bâti dessus serait une invention.
  if (stats.count < MIN_MOVIES) return null;

  return (
    <div className="bg-white dark:bg-[#161616] rounded-[2rem] p-6 border border-stone-100 dark:border-white/5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Sparkles size={13} className="text-forest dark:text-bitter-lime" />
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white">
            {t('portrait.title')}
          </h3>
        </div>

        {traits.length > 0 && (
          <button
            type="button"
            onClick={draw}
            disabled={loading}
            aria-label={t('portrait.refresh')}
            className={`w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform disabled:opacity-40 ${stale ? 'bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal' : 'bg-stone-100 dark:bg-white/5 text-stone-400'}`}
          >
            {loading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          </button>
        )}
      </div>

      {traits.length === 0 ? (
        <div className="text-center py-4">
          <p className="text-[12px] font-medium text-stone-500 dark:text-stone-400 mb-4 leading-relaxed">
            {t('portrait.pitch', { n: String(stats.count) })}
          </p>
          <button
            type="button"
            onClick={draw}
            disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-3 rounded-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal text-[10px] font-black uppercase tracking-[0.15em] active:scale-95 transition-transform disabled:opacity-50"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {loading ? t('portrait.drawing') : t('portrait.draw')}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {traits.map((trait, i) => (
            <div key={i} className="flex gap-3">
              {/* Le chiffre d'abord, la phrase ensuite : c'est lui qui autorise
                  la phrase, et le mettre en évidence rappelle que rien ici n'a
                  été deviné. */}
              <span className="shrink-0 min-w-[3.5rem] text-center px-2 py-1.5 rounded-xl bg-stone-100 dark:bg-white/5 text-[11px] font-black tabular-nums text-charcoal dark:text-white self-start">
                {trait.figure || '—'}
              </span>
              <p className="flex-1 text-[13px] font-medium text-stone-600 dark:text-stone-300 leading-snug self-center">
                {trait.text}
              </p>
            </div>
          ))}

          {stale && (
            <p className="text-[10px] font-bold uppercase tracking-widest text-stone-400 dark:text-stone-600 pt-1">
              {t('portrait.stale', { n: String(stats.count - cachedCount) })}
            </p>
          )}
        </div>
      )}

      {error && (
        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400 mt-3">{error}</p>
      )}
    </div>
  );
};

export default TastePortrait;
