import React from 'react';
import { Sparkles, Plus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

interface AIUnlockWidgetProps {
  watchedCount: number;
  onAddMovie: () => void;
}

const MIN_MOVIES_FOR_AI = 10;

export const AIUnlockWidget: React.FC<AIUnlockWidgetProps> = ({ watchedCount, onAddMovie }) => {
  const { t } = useLanguage();
  if (watchedCount >= MIN_MOVIES_FOR_AI) return null;

  const remaining = MIN_MOVIES_FOR_AI - watchedCount;
  const progress = (watchedCount / MIN_MOVIES_FOR_AI) * 100;

  return (
    <div className="bg-gradient-to-br from-forest/10 to-lime-400/10 dark:from-forest/20 dark:to-lime-400/20 border border-forest/20 dark:border-forest/30 p-6 rounded-[2rem] shadow-sm dark:shadow-black/20">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-forest/10 dark:bg-forest/20 rounded-xl">
          <Sparkles size={18} className="text-forest dark:text-lime-400" />
        </div>
        <h3 className="text-sm font-black uppercase tracking-widest text-charcoal dark:text-white">
          {t('aiUnlock.title')}
        </h3>
      </div>

      <div className="mb-3">
        <div className="flex items-center justify-between text-xs font-bold text-stone-400 dark:text-stone-500 mb-2">
          <span>{t('aiUnlock.progress')}</span>
          <span>
            {watchedCount}/{MIN_MOVIES_FOR_AI}
          </span>
        </div>
        <div className="h-2 bg-white dark:bg-[#161616] rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-forest to-lime-400 transition-all duration-700"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <p className="text-xs font-bold text-stone-600 dark:text-stone-400 mb-4">
        {t('aiUnlock.remaining', { count: String(remaining), s: remaining > 1 ? 's' : '' })}
      </p>

      <button
        onClick={onAddMovie}
        className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-2xl text-xs font-black text-charcoal dark:text-white hover:border-forest dark:hover:border-forest/50 transition-all"
      >
        <Plus size={16} />
        {t('aiUnlock.addMovie')}
      </button>
    </div>
  );
};

export default AIUnlockWidget;
