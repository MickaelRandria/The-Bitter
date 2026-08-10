import React, { useState } from 'react';
import { X, Sparkles, SlidersHorizontal } from 'lucide-react';
import { MoodPreset, MOOD_PRESETS, VibeAxis } from '../utils/tonightPick';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface MoodPickerProps {
  selectedMood: MoodPreset;
  onSelectMood: (mood: MoodPreset) => void;
  /** Axe vibe pour le filtre de tri (optionnel, complémentaire au mood) */
  activeVibeSort: VibeAxis | null;
  onSelectVibeSort: (axis: VibeAxis | null) => void;
  /** Nombre de films matchés par le mood actif */
  matchCount?: number;
  /** Nombre de films de la watchlist dont l'ambiance a réellement été renseignée */
  vibeCount: number;
  /** Seuil à partir duquel les moods deviennent exploitables */
  minVibes: number;
}

const VIBE_AXES: { key: VibeAxis; emoji: string }[] = [
  { key: 'story', emoji: '🧠' },
  { key: 'emotion', emoji: '💧' },
  { key: 'fun', emoji: '😄' },
  { key: 'visual', emoji: '👁️' },
  { key: 'tension', emoji: '⚡' },
];

const MoodPicker: React.FC<MoodPickerProps> = ({
  selectedMood,
  onSelectMood,
  activeVibeSort,
  onSelectVibeSort,
  matchCount,
  vibeCount,
  minVibes,
}) => {
  const { t } = useLanguage();
  const [isExpanded, setIsExpanded] = useState(false);
  const isUnlocked = vibeCount >= minVibes;

  const handleMoodSelect = (moodId: MoodPreset) => {
    haptics.soft();
    if (selectedMood === moodId) {
      onSelectMood(null);
    } else {
      onSelectMood(moodId);
    }
  };

  const handleVibeSortSelect = (axis: VibeAxis) => {
    haptics.soft();
    if (activeVibeSort === axis) {
      onSelectVibeSort(null);
    } else {
      onSelectVibeSort(axis);
    }
  };

  const handleReset = () => {
    haptics.soft();
    onSelectMood(null);
    onSelectVibeSort(null);
    setIsExpanded(false);
  };

  const hasActiveFilter = selectedMood !== null || activeVibeSort !== null;

  return (
    <div className="space-y-3">
      {/* Toggle bar — le bouton « effacer » est un frère, pas un enfant :
          un <button> dans un <button> est du HTML invalide et casse le clavier */}
      <div className="relative">
      <button
        onClick={() => {
          haptics.soft();
          setIsExpanded((e) => !e);
        }}
        aria-expanded={isExpanded}
        className={`w-full flex items-center justify-between px-4 py-3 rounded-2xl border transition-all ${
          hasActiveFilter
            ? 'bg-bitter-lime/10 dark:bg-bitter-lime/5 border-bitter-lime/30 dark:border-bitter-lime/20'
            : 'bg-stone-50 dark:bg-[#161616] border-stone-100 dark:border-white/5'
        }`}
      >
        <div className="flex items-center gap-2.5">
          <Sparkles
            size={14}
            className={hasActiveFilter ? 'text-forest dark:text-bitter-lime' : 'text-stone-400'}
          />
          <span
            className={`text-[10px] font-black uppercase tracking-widest ${
              hasActiveFilter
                ? 'text-forest dark:text-bitter-lime'
                : 'text-stone-400 dark:text-stone-600'
            }`}
          >
            {hasActiveFilter
              ? `${t('feed.moodActive')}${matchCount !== undefined ? ` · ${matchCount} ${t('feed.filmsLabel')}` : ''}`
              : t('feed.whatMood')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {hasActiveFilter && <span className="w-6" aria-hidden="true" />}
          <svg
            width="10"
            height="10"
            viewBox="0 0 10 10"
            fill="none"
            className={`transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}
          >
            <path
              d="M2 3.5L5 6.5L8 3.5"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={hasActiveFilter ? 'text-forest dark:text-bitter-lime' : 'text-stone-400'}
            />
          </svg>
        </div>
      </button>
      {hasActiveFilter && (
        <button
          onClick={handleReset}
          aria-label={t('feed.clearFilter')}
          className="absolute right-9 top-1/2 -translate-y-1/2 p-1 rounded-full hover:bg-stone-200 dark:hover:bg-white/10 transition-colors"
        >
          <X size={12} strokeWidth={3} className="text-stone-400" />
        </button>
      )}
      </div>

      {/* Expanded content — démonté quand replié : sinon les boutons restent
          focusables au clavier et annoncés par les lecteurs d'écran */}
      {isExpanded && (
      <div className="animate-[fadeIn_0.25s_ease-out]">
        {!isUnlocked && (
          <div className="mb-4 px-4 py-3 rounded-2xl bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5">
            <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 leading-relaxed">
              {t('feed.moodLocked', {
                n: String(minVibes - vibeCount),
                s: minVibes - vibeCount > 1 ? 's' : '',
              })}
            </p>
          </div>
        )}

        {/* Mood presets grid */}
        <div
          className={`grid grid-cols-3 gap-2 mb-4 ${isUnlocked ? '' : 'opacity-40 pointer-events-none'}`}
        >
          {MOOD_PRESETS.map((mood) => {
            const isActive = selectedMood === mood.id;
            return (
              <button
                key={mood.id}
                disabled={!isUnlocked}
                aria-pressed={isActive}
                onClick={() => handleMoodSelect(mood.id)}
                className={`flex flex-col items-center gap-1.5 py-3.5 px-2 rounded-2xl border transition-all active:scale-95 ${
                  isActive
                    ? 'bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal border-charcoal dark:border-bitter-lime shadow-lg'
                    : 'bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white border-stone-100 dark:border-white/5 hover:border-stone-200 dark:hover:border-white/10'
                }`}
              >
                <span className="text-xl leading-none">{mood.emoji}</span>
                <span className="text-[9px] font-black uppercase tracking-widest leading-none">
                  {t(`mood.${mood.id}`)}
                </span>
              </button>
            );
          })}
        </div>

        {/* Vibe axis sort pills */}
        <div className={`space-y-2 ${isUnlocked ? '' : 'opacity-40 pointer-events-none'}`}>
          <div className="flex items-center gap-2">
            <SlidersHorizontal size={11} className="text-stone-400" />
            <span className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
              {t('feed.sortByVibe')}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar pb-1">
            {VIBE_AXES.map(({ key, emoji }) => {
              const isActive = activeVibeSort === key;
              return (
                <button
                  key={key}
                  disabled={!isUnlocked}
                  aria-pressed={isActive}
                  onClick={() => handleVibeSortSelect(key)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3.5 py-2 rounded-full text-[10px] font-black uppercase tracking-widest transition-all border ${
                    isActive
                      ? 'bg-charcoal dark:bg-forest text-white border-charcoal dark:border-forest shadow-md'
                      : 'bg-white dark:bg-[#1a1a1a] text-stone-400 dark:text-stone-600 border-stone-200 dark:border-white/5'
                  }`}
                >
                  <span className="text-xs">{emoji}</span>
                  {t(`vibe.${key}`)}
                </button>
              );
            })}
          </div>
        </div>
      </div>
      )}
    </div>
  );
};

export default MoodPicker;
