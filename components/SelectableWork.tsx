import React from 'react';
import { Check } from 'lucide-react';
import type { SelectedWork } from '../utils/navActions';
import { LongPressHandlers, longPressStyle, useSelectableWork } from '../utils/useLongPress';

export interface SelectableState {
  selected: boolean;
  /** Une sélection est en cours : un appui court coche au lieu d'ouvrir. */
  selecting: boolean;
  /** À étaler sur l'élément touchable (racine de la carte ou bouton plein cadre). */
  handlers: LongPressHandlers;
  /** Empêche le menu d'image iOS et la sélection de texte pendant l'appui. */
  style: React.CSSProperties;
}

/**
 * Rend une affiche sélectionnable par appui long sans écrire de hook dans une
 * boucle : les listes (`items.map`) et les fonctions de rendu (`renderWatchItem`)
 * enveloppent chaque affiche dans ce composant.
 *
 * `work` à null : l'affiche ne peut pas être sélectionnée et garde son
 * comportement habituel.
 */
export const Selectable: React.FC<{
  work: SelectedWork | null;
  children: (state: SelectableState) => React.ReactNode;
}> = ({ work, children }) => {
  const { selected, selecting, handlers } = useSelectableWork(work);
  return <>{children({ selected, selecting, handlers, style: work ? longPressStyle : {} })}</>;
};

/** Contour d'une affiche cochée, commun à tous les écrans. */
export const SELECTED_RING =
  'ring-4 ring-bitter-lime ring-offset-2 ring-offset-cream dark:ring-offset-[#0c0c0c] scale-[0.96]';

/** Pastille cochée, à poser en `absolute` dans le coin d'une affiche. */
export const SelectionCheck: React.FC<{ selected: boolean; className?: string }> = ({
  selected,
  className = 'top-2 right-2',
}) => (
  <span
    aria-hidden="true"
    className={`pointer-events-none absolute z-30 flex h-6 w-6 items-center justify-center rounded-full bg-bitter-lime text-charcoal shadow-md transition-all duration-200 motion-reduce:transition-none ${className} ${
      selected ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
    }`}
  >
    <Check size={14} strokeWidth={3.5} />
  </span>
);
