import React from 'react';
import { Minus, Plus } from 'lucide-react';
import { AdaptiveRatingCriterion, WeightLabel } from '../types';
import { PROFILE_OPTIONS, RatingProfileId } from '../config/ratingProfiles';

/**
 * La grille de notation, isolée de tout écran.
 *
 * POURQUOI CE COMPOSANT EXISTE
 * La même grille est demandée à trois endroits : ajouter un film, revoir un
 * film, et maintenant noter un épisode. Les deux premiers la portaient chacun
 * dans son fichier, à quelques pixels près. En écrire une troisième copie
 * aurait garanti qu'elles divergent — un curseur au demi-point ici, au dixième
 * là, et la même note n'aurait plus voulu dire la même chose selon l'écran par
 * lequel on est passé.
 *
 * Les deux écrans existants ne sont volontairement **pas** réécrits pour
 * l'utiliser : ils marchent, ils sont notés par de vraies personnes, et les
 * refondre n'était pas la tâche. Ce composant est le point de départ commun de
 * ce qui vient ensuite.
 */

/** Essentiel ●●●, Important ●●○, Standard ●○○, Secondaire ○○○. */
const weightToPipCount = (weight: number): number =>
  weight >= 1.7 ? 3 : weight >= 1.3 ? 2 : weight >= 0.9 ? 1 : 0;

const PIP_A11Y_LABEL: Record<WeightLabel, string> = {
  Essentiel: 'Influence forte dans la note finale',
  Important: 'Influence moyenne dans la note finale',
  Standard: 'Influence normale dans la note finale',
  Secondaire: 'Influence légère dans la note finale',
};

const WeightPips: React.FC<{ weight: number; weightLabel?: WeightLabel }> = ({ weight, weightLabel }) => (
  <span
    className="inline-flex items-center gap-1 shrink-0"
    role="img"
    aria-label={weightLabel ? PIP_A11Y_LABEL[weightLabel] : undefined}
  >
    {[0, 1, 2].map((i) => (
      <span
        key={i}
        className={`w-1.5 h-1.5 rounded-full ${
          i < weightToPipCount(weight) ? 'bg-forest dark:bg-bitter-lime' : 'bg-stone-200 dark:bg-white/15'
        }`}
      />
    ))}
  </span>
);

export const CriterionRow: React.FC<{
  criterion: AdaptiveRatingCriterion;
  onChange: (key: string, value: number) => void;
  /** Les pastilles de poids n'ont de sens qu'en Bitter+, où les poids diffèrent. */
  showWeight?: boolean;
  showDescription?: boolean;
}> = ({ criterion, onChange, showWeight, showDescription }) => {
  const { key, label, value, weight, weightLabel, description } = criterion;
  return (
    <div>
      <div className="flex justify-between items-start mb-1.5 gap-2">
        <div className="flex flex-col gap-1 min-w-0 flex-1">
          <span className="text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white leading-tight break-words">
            {label}
          </span>
          {showWeight && <WeightPips weight={weight} weightLabel={weightLabel} />}
          {showDescription && description && (
            <p className="text-[11px] leading-snug text-stone-500 dark:text-stone-400 mt-0.5">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            aria-label={`Baisser ${label}`}
            onClick={() => onChange(key, Math.max(0, value - 0.5))}
            className="w-8 h-8 rounded-lg bg-stone-100 dark:bg-[#202020] flex items-center justify-center active:scale-90 transition-all"
          >
            <Minus size={11} strokeWidth={3} className="text-charcoal dark:text-white" />
          </button>
          <span className="text-[11px] font-black text-charcoal dark:text-white w-7 text-center tabular-nums">
            {value.toFixed(1)}
          </span>
          <button
            type="button"
            aria-label={`Monter ${label}`}
            onClick={() => onChange(key, Math.min(10, value + 0.5))}
            className="w-8 h-8 rounded-lg bg-bitter-lime flex items-center justify-center active:scale-90 transition-all"
          >
            <Plus size={11} strokeWidth={3} className="text-charcoal" />
          </button>
        </div>
      </div>
      <input
        type="range"
        min="0"
        max="10"
        step="0.5"
        value={value}
        aria-label={label}
        onChange={(e) => onChange(key, parseFloat(e.target.value))}
        className="w-full accent-forest dark:accent-bitter-lime"
      />
    </div>
  );
};

/** Le sélecteur Bitter / Bitter+, dans la forme qu'il a déjà ailleurs. */
export const RatingModeSwitch: React.FC<{
  useBitterPlus: boolean;
  onChange: (useBitterPlus: boolean) => void;
  bitterLabel: string;
  bitterPlusLabel: string;
  hint: string;
}> = ({ useBitterPlus, onChange, bitterLabel, bitterPlusLabel, hint }) => (
  <div>
    <div role="tablist" className="flex bg-stone-100 dark:bg-[#161616] p-1 rounded-2xl border border-stone-200/50 dark:border-white/5">
      {[false, true].map((plus) => (
        <button
          key={String(plus)}
          type="button"
          role="tab"
          aria-selected={useBitterPlus === plus}
          onClick={() => onChange(plus)}
          className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
            useBitterPlus === plus
              ? 'bg-charcoal dark:bg-[#202020] text-white shadow-md'
              : 'text-stone-400 dark:text-stone-600'
          }`}
        >
          {plus ? bitterPlusLabel : bitterLabel}
        </button>
      ))}
    </div>
    <p className="mt-2 text-[11px] leading-snug text-stone-500 dark:text-stone-400">{hint}</p>
  </div>
);

/** Le choix du profil Bitter+, réduit à une ligne de puces. */
export const ProfilePicker: React.FC<{
  profileId: RatingProfileId;
  onChange: (id: RatingProfileId) => void;
  label: string;
}> = ({ profileId, onChange, label }) => (
  <div>
    <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-2">{label}</p>
    <div className="flex flex-wrap gap-1.5">
      {PROFILE_OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          aria-pressed={profileId === option.id}
          onClick={() => onChange(option.id)}
          className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 ${
            profileId === option.id
              ? 'bg-forest text-white'
              : 'bg-stone-100 dark:bg-[#202020] text-stone-500 dark:text-stone-400'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  </div>
);

/** La note qui se met à jour pendant qu'on bouge les curseurs. */
export const LiveRating: React.FC<{ rating: number; label: string }> = ({ rating, label }) => (
  <div className="flex items-baseline justify-between rounded-2xl bg-charcoal dark:bg-[#1a1a1a] px-4 py-3">
    <span className="text-[10px] font-black uppercase tracking-[0.18em] text-white/60">{label}</span>
    <span className="text-2xl font-black text-white tabular-nums">
      {rating.toFixed(1)}
      <span className="text-sm text-white/40">/10</span>
    </span>
  </div>
);
