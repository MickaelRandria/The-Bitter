import React, { useState } from 'react';
import { Info, Minus, Plus, X } from 'lucide-react';
import { AdaptiveRatingCriterion } from '../types';
import {
  CUSTOM_WEIGHT_LEVELS,
  PROFILE_OPTIONS,
  RatingProfileId,
  getRatingProfile,
} from '../config/ratingProfiles';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * La grille de notation Bitter et Bitter+, telle qu'elle existe sur les films.
 *
 * POURQUOI CE FICHIER
 * Ces composants vivaient au bas de `AddMovieModal`. Ils y sont restés tant
 * qu'un seul écran notait. Les épisodes notent désormais aussi, et sur la même
 * échelle : en recopier une variante aurait garanti la dérive — un pas de
 * curseur différent d'un côté, une explication périmée de l'autre, et la même
 * note ne voulant plus dire la même chose selon l'écran par lequel on est passé.
 *
 * Le code est déplacé tel quel, sans retouche : l'écran d'ajout d'un film rend
 * exactement ce qu'il rendait.
 */

// Mapping weight → pips: Essentiel ●●●, Important ●●○, Standard ●○○, Secondaire ○○○
const weightToPipCount = (weight: number): number =>
  weight >= 1.7 ? 3 : weight >= 1.3 ? 2 : weight >= 0.9 ? 1 : 0;

const PIP_A11Y_LABEL: Record<AdaptiveRatingCriterion['weightLabel'], string> = {
  Essentiel: 'Influence forte dans la note finale',
  Important: 'Influence moyenne dans la note finale',
  Standard: 'Influence normale dans la note finale',
  Secondaire: 'Influence légère dans la note finale',
};

export const WeightPips: React.FC<{
  weight: number;
  weightLabel?: AdaptiveRatingCriterion['weightLabel'];
  variant?: 'lime' | 'mono';
  size?: 'sm' | 'md';
}> = ({ weight, weightLabel, variant = 'lime', size = 'md' }) => {
  const filled = weightToPipCount(weight);
  const filledClass =
    variant === 'mono' ? 'bg-charcoal dark:bg-white' : 'bg-bitter-lime dark:bg-bitter-lime';
  const emptyClass =
    variant === 'mono'
      ? 'bg-stone-300 dark:bg-stone-700'
      : 'bg-stone-200 dark:bg-white/15';
  const dot = size === 'sm' ? 'w-1.5 h-1.5' : 'w-2 h-2';
  return (
    <span
      className="inline-flex items-center gap-1 shrink-0"
      role="img"
      aria-label={weightLabel ? PIP_A11Y_LABEL[weightLabel] : undefined}
    >
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className={`${dot} rounded-full ${i < filled ? filledClass : emptyClass}`}
        />
      ))}
    </span>
  );
};

export const BitterRatingSection: React.FC<{
  criteria: AdaptiveRatingCriterion[];
  finalRating: number;
  onChange: (key: string, value: number) => void;
  onSwitchToBitterPlus: () => void;
}> = ({ criteria, finalRating, onChange, onSwitchToBitterPlus }) => {
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1 mb-3">
          Critères de notation
        </p>
        <div className="space-y-3">
          {criteria.map((c) => (
            <AdaptiveCriterionStepper key={c.key} criterion={c} onChange={onChange} hideImportance />
          ))}
        </div>
      </div>

      {/* Final rating (simple average) */}
      <div className="bg-charcoal dark:bg-[#1a1a1a] text-white rounded-[2rem] p-6 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
            Note finale
          </p>
          <span className="text-5xl font-black text-bitter-lime tracking-tighter shrink-0">
            {finalRating.toFixed(1)}
          </span>
        </div>
      </div>

      {/* Discreet upgrade CTA */}
      <button
        type="button"
        onClick={onSwitchToBitterPlus}
        className="w-full bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 rounded-2xl p-4 text-left active:scale-[0.98] transition-all flex items-center justify-between gap-3 shadow-sm"
      >
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white">
            Passer en Bitter+
          </p>
          <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-1 leading-snug">
            Une grille adaptée au type d’expérience du film, avec profil et critères renforcés.
          </p>
        </div>
        <span className="shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white">
          Activer
        </span>
      </button>

      {/* Formula help */}
      <div className="bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            setShowFormulaHelp((v) => !v);
          }}
          className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-stone-100 dark:active:bg-[#1f1f1f] transition-colors"
        >
          <span className="text-[11px] font-black uppercase tracking-widest text-charcoal dark:text-white">
            Comment est calculée la note&nbsp;?
          </span>
          <span className="text-charcoal dark:text-white text-lg leading-none">
            {showFormulaHelp ? '−' : '+'}
          </span>
        </button>
        {showFormulaHelp && (
          <div className="px-4 pb-4 pt-1 text-[12px] leading-relaxed text-stone-600 dark:text-stone-400 space-y-2">
            <p>La note finale est la moyenne des 4 critères.</p>
            <p>
              Chaque critère compte autant : <span className="font-bold text-charcoal dark:text-white">Scénario</span>,{' '}
              <span className="font-bold text-charcoal dark:text-white">Image</span>,{' '}
              <span className="font-bold text-charcoal dark:text-white">Interprétation</span> et{' '}
              <span className="font-bold text-charcoal dark:text-white">Sonore</span>.
            </p>
            <p className="text-[11px] text-stone-500 dark:text-stone-500">
              Pour adapter le poids des critères au type de film, passe en Bitter+.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const CustomWeightRow: React.FC<{
  label: string;
  selectedWeight: number;
  onSelect: (weight: number) => void;
}> = ({ label, selectedWeight, onSelect }) => (
  <div className="flex items-center justify-between gap-3">
    <span className="text-[11px] font-black uppercase tracking-widest text-charcoal dark:text-white leading-tight flex-1 min-w-0 break-words">
      {label}
    </span>
    <div className="inline-flex items-center gap-1 shrink-0">
      {CUSTOM_WEIGHT_LEVELS.map((opt) => {
        const isSelected = Math.abs(selectedWeight - opt.weight) < 0.001;
        return (
          <button
            key={opt.label}
            type="button"
            aria-label={`Définir comme ${opt.label.toLowerCase()}`}
            aria-pressed={isSelected}
            onClick={() => onSelect(opt.weight)}
            className={`h-8 px-2 rounded-lg flex items-center justify-center transition-all active:scale-90 border ${
              isSelected
                ? 'bg-charcoal text-white border-charcoal dark:bg-bitter-lime/15 dark:border-bitter-lime/40'
                : 'bg-stone-50 dark:bg-[#161616] border-stone-200 dark:border-white/5'
            }`}
          >
            <WeightPips
              weight={opt.weight}
              weightLabel={opt.label}
              variant="lime"
              size="sm"
            />
          </button>
        );
      })}
    </div>
  </div>
);

export const AdaptiveRatingSection: React.FC<{
  profileId: RatingProfileId;
  profileLabel: string;
  criteria: AdaptiveRatingCriterion[];
  weightedRating: number;
  customWeights: Record<string, number>;
  quickRating: number | null;
  ratedKeys: Record<string, number>;
  isReady: boolean;
  onQuickRating: (value: number) => void;
  onChange: (key: string, value: number) => void;
  onChangeCustomWeight: (key: string, weight: number) => void;
  onOpenProfilePicker: () => void;
}> = ({
  profileId,
  profileLabel,
  criteria,
  weightedRating,
  customWeights,
  quickRating,
  ratedKeys,
  isReady,
  onQuickRating,
  onChange,
  onChangeCustomWeight,
  onOpenProfilePicker,
}) => {
  const { t } = useLanguage();
  const [showFormulaHelp, setShowFormulaHelp] = useState(false);
  const base = criteria.filter((c) => c.group === 'base');
  const specific = criteria.filter((c) => c.group === 'specific');
  const isCustom = profileId === 'custom';

  return (
    <div className="space-y-6">
      {/* Profile header */}
      <div
        data-tour="add-profile-header"
        className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 rounded-[2rem] p-5 shadow-sm"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
              Profil de notation
            </p>
            <p className="text-xl font-black text-charcoal dark:text-white tracking-tight mt-1">
              {profileLabel}
            </p>
            <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-2 leading-snug">
              {isCustom
                ? 'Choisis les critères qui comptent le plus dans ta manière de noter ce film.'
                : 'La grille s’adapte au type de film. Tu peux la changer à tout moment.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onOpenProfilePicker}
            className="shrink-0 text-[10px] font-black uppercase tracking-widest px-3 py-2 rounded-full bg-stone-100 dark:bg-[#161616] text-charcoal dark:text-white border border-stone-200 dark:border-white/5 active:scale-95 transition-all"
          >
            Changer
          </button>
        </div>

        {isCustom && (
          <div className="mt-5 pt-5 border-t border-stone-100 dark:border-white/5 space-y-3">
            {base.map((c) => (
              <CustomWeightRow
                key={c.key}
                label={c.label}
                selectedWeight={customWeights[c.key] ?? 1.0}
                onSelect={(w) => onChangeCustomWeight(c.key, w)}
              />
            ))}
          </div>
        )}
      </div>

      <div className="rounded-[2rem] border border-bitter-lime/20 bg-charcoal p-5 text-white shadow-xl dark:bg-[#1a1a1a]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">
              {t('addMovie.startingPoint')}
            </p>
            <p className="mt-1 text-[11px] font-medium leading-snug text-stone-300">
              {t('addMovie.startingPointHint')}
            </p>
          </div>
          <span className="text-3xl font-black tracking-tighter text-bitter-lime tabular-nums">
            {quickRating == null ? '—' : quickRating.toFixed(1)}
          </span>
        </div>
        <input
          type="range"
          min="0"
          max="10"
          step="0.5"
          value={quickRating ?? 5}
          onChange={(event) => onQuickRating(Number(event.target.value))}
          aria-label={t('addMovie.startingPoint')}
          className="mt-5 w-full accent-bitter-lime"
        />
        <div className="mt-1 flex justify-between text-[9px] font-bold text-stone-500"><span>0</span><span>10</span></div>
      </div>

      {/* Base criteria */}
      <div data-tour="add-criteria">
        <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1 mb-3">
          Critères de notation
        </p>
        <div className="space-y-3">
          {base.map((c) => (
            <AdaptiveCriterionStepper key={c.key} criterion={c} onChange={onChange} isSet={ratedKeys[c.key] != null} />
          ))}
        </div>
      </div>

      {/* Specific criterion */}
      {specific.length > 0 && (
        <div data-tour="add-specific">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1">
            Ce qui compte le plus ici
          </p>
          <p className="text-[11px] font-medium text-stone-500 dark:text-stone-500 mt-1 ml-1 mb-3 leading-snug">
            {specific[0].label} pèse davantage dans ta note pour ce type de film.
          </p>
          <div className="grid grid-cols-1 gap-3">
            {specific.map((c) => (
              <AdaptiveCriterionStepper key={c.key} criterion={c} onChange={onChange} showDescription isSet={ratedKeys[c.key] != null} />
            ))}
          </div>
        </div>
      )}

      {/* Final weighted rating */}
      <div
        data-tour="add-final-rating"
        className="bg-charcoal dark:bg-[#1a1a1a] text-white rounded-[2rem] p-6 shadow-xl"
      >
        <div className="flex items-center justify-between gap-3">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
            Note finale
          </p>
          <span className="text-5xl font-black text-bitter-lime tracking-tighter shrink-0">
            {isReady ? weightedRating.toFixed(1) : '—'}
          </span>
        </div>
      </div>

      {/* Formula help (collapsible) */}
      <div className="bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-2xl overflow-hidden">
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            setShowFormulaHelp((v) => !v);
          }}
          className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-stone-100 dark:active:bg-[#1f1f1f] transition-colors"
        >
          <span className="text-[11px] font-black uppercase tracking-widest text-charcoal dark:text-white">
            Comment est calculée la note&nbsp;?
          </span>
          <span className="text-charcoal dark:text-white text-lg leading-none">
            {showFormulaHelp ? '−' : '+'}
          </span>
        </button>
        {showFormulaHelp && (
          <div className="px-4 pb-4 pt-1 text-[12px] leading-relaxed text-stone-600 dark:text-stone-400 space-y-3">
            <p>
              La note finale est une moyenne pondérée. Chaque critère n’a pas toujours le même
              poids selon le profil de notation choisi.
            </p>
            <p>Les points indiquent l’influence du critère dans la note finale&nbsp;:</p>
            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <WeightPips weight={1.8} variant="mono" />
                  <span className="font-bold text-charcoal dark:text-white">Critère essentiel</span>
                </span>
                <span className="font-black text-charcoal dark:text-white tabular-nums">×1.8</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <WeightPips weight={1.4} variant="mono" />
                  <span className="font-bold text-charcoal dark:text-white">Critère important</span>
                </span>
                <span className="font-black text-charcoal dark:text-white tabular-nums">×1.4</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <WeightPips weight={1.0} variant="mono" />
                  <span className="font-bold text-charcoal dark:text-white">Critère standard</span>
                </span>
                <span className="font-black text-charcoal dark:text-white tabular-nums">×1.0</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="flex items-center gap-3">
                  <WeightPips weight={0.7} variant="mono" />
                  <span className="font-bold text-charcoal dark:text-white">Critère secondaire</span>
                </span>
                <span className="font-black text-charcoal dark:text-white tabular-nums">×0.7</span>
              </div>
            </div>
            <p className="text-[11px] text-stone-500 dark:text-stone-500">
              Les poids sont appliqués automatiquement selon le profil de notation.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};

export const AdaptiveCriterionStepper: React.FC<{
  criterion: AdaptiveRatingCriterion;
  onChange: (key: string, value: number) => void;
  showDescription?: boolean;
  hideImportance?: boolean;
  isSet?: boolean;
}> = ({ criterion, onChange, showDescription, hideImportance, isSet = true }) => {
  const { key, label, value, weight, weightLabel, description } = criterion;
  const currentValue = isSet ? value : 5;

  /**
   * L'explication à la demande.
   *
   * L'afficher en permanence sous chaque critère alourdissait un écran déjà
   * long, et celui qui a compris n'a pas besoin de la relire à chaque film.
   * L'afficher nulle part laissait deviner ce qu'on note. Un (i) règle les
   * deux : discret pour qui sait, à portée de pouce pour qui doute.
   */
  const [showHelp, setShowHelp] = useState(false);
  const helpId = `aide-${key}`;
  const helpVisible = showDescription || showHelp;

  return (
    <div className="bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] p-4 border border-stone-100 dark:border-white/10 shadow-sm">
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <span className="flex items-center gap-1.5 text-[10px] sm:text-[11px] font-black text-charcoal dark:text-white uppercase tracking-widest leading-tight">
            <span className="break-words">{label}</span>
            {description && !showDescription && (
              <button
                type="button"
                onClick={() => {
                  haptics.soft();
                  setShowHelp((v) => !v);
                }}
                aria-expanded={showHelp}
                aria-controls={helpId}
                aria-label={`Que veut dire « ${label} » ?`}
                className={`w-4 h-4 shrink-0 rounded-full flex items-center justify-center transition-colors ${
                  showHelp
                    ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal'
                    : 'bg-stone-100 dark:bg-white/10 text-stone-400 dark:text-stone-500'
                }`}
              >
                <Info size={10} strokeWidth={3} />
              </button>
            )}
          </span>
          {!hideImportance && (
            <span className="mt-2 inline-flex items-center gap-2">
              <WeightPips weight={weight} weightLabel={weightLabel} size="sm" />
              <span className="text-[9px] font-bold text-stone-400 dark:text-stone-500">{weightLabel}</span>
            </span>
          )}
        </div>
        <span className="text-2xl font-black tracking-tighter text-charcoal dark:text-white shrink-0 leading-none tabular-nums">
          {isSet ? value.toFixed(1) : '—'}
        </span>
      </div>
      {helpVisible && description && (
        <p
          id={helpId}
          className="text-[11px] leading-snug text-stone-500 dark:text-stone-400 mt-2"
        >
          {description}
        </p>
      )}
      <div className="flex items-center gap-3 mt-4 pt-3 border-t border-stone-100 dark:border-white/5">
        <button
          type="button"
          aria-label="Diminuer la note"
          onClick={() => {
            haptics.soft();
            onChange(key, Math.max(0, currentValue - 0.5));
          }}
          className="w-8 h-8 rounded-xl bg-stone-50 dark:bg-[#161616] border border-stone-200 dark:border-white/5 flex items-center justify-center active:scale-90 transition-all shadow-sm shrink-0"
        >
          <Minus size={12} strokeWidth={3} className="text-charcoal dark:text-white" />
        </button>
        <input
          type="range"
          step="0.5"
          min="0"
          max="10"
          aria-label={`Note pour ${label}`}
          value={currentValue}
          onChange={(e) => onChange(key, Number(e.target.value))}
          className="flex-1 min-w-0 accent-bitter-lime"
        />
        <button
          type="button"
          aria-label="Augmenter la note"
          onClick={() => {
            haptics.soft();
            onChange(key, Math.min(10, currentValue + 0.5));
          }}
          className="w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-all shadow-md shrink-0 bg-bitter-lime text-charcoal"
        >
          <Plus size={12} strokeWidth={3} />
        </button>
      </div>
      <div className="mt-1 flex justify-between px-11 text-[9px] font-bold text-stone-300 dark:text-stone-600"><span>0</span><span>10</span></div>
    </div>
  );
};

export const ProfilePicker: React.FC<{
  currentProfileId: RatingProfileId;
  onSelect: (id: RatingProfileId) => void;
  onClose: () => void;
}> = ({ currentProfileId, onSelect, onClose }) => (
  <div
    className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center"
    onClick={onClose}
  >
    <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm" />
    <div
      onClick={(e) => e.stopPropagation()}
      className="relative bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-sm rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl max-h-[80vh] overflow-y-auto border-t dark:border-white/10 sm:border dark:border-white/10"
    >
      <div className="p-6 border-b border-black/5 dark:border-white/10 flex items-center justify-between">
        <h3 className="font-black text-lg text-charcoal dark:text-white tracking-tight">
          Choisir un profil
        </h3>
        <button
          onClick={onClose}
          className="w-9 h-9 rounded-full bg-stone-100 dark:bg-[#161616] flex items-center justify-center active:scale-90 transition-all"
        >
          <X size={16} className="text-charcoal dark:text-white" />
        </button>
      </div>
      <div className="p-3 space-y-1">
        {PROFILE_OPTIONS.map((opt) => {
          const selected = opt.id === currentProfileId;
          const keyCriterion = getRatingProfile(opt.id).criteria.find((criterion) => criterion.group === 'specific');
          return (
            <button
              key={opt.id}
              type="button"
              onClick={() => onSelect(opt.id)}
              className={`w-full text-left px-4 py-4 rounded-2xl font-black text-sm transition-all active:scale-[0.98] ${
                selected
                  ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal'
                  : 'bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white border border-stone-100 dark:border-white/10'
              }`}
            >
              <span className="block">{opt.label}</span>
              {keyCriterion && (
                <span className={`mt-1 block text-[10px] font-bold normal-case tracking-normal ${
                  selected ? 'text-white/65 dark:text-charcoal/65' : 'text-stone-400 dark:text-stone-500'
                }`}>
                  Ce qui compte le plus : {keyCriterion.label}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  </div>
);
