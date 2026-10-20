import { createContext, useContext } from 'react';
import type { SelectedWork } from '../utils/navActions';

/**
 * Sélection d'affiches par appui long, partagée entre les écrans qui montrent des
 * œuvres (historique, Découvrir, espaces) et la barre du bas, qui devient la
 * barre d'actions tant que la sélection n'est pas vide.
 *
 * App possède l'état et fournit la valeur ; les écrans ne font que lire
 * `isSelected` et appeler `begin` / `toggle`. Hors fournisseur (tests d'écran,
 * aperçus), la sélection est désactivée et rien ne change pour l'utilisateur.
 */
export interface WorkSelection {
  /** Faux pendant une visite guidée ou sans fournisseur : l'appui long ne fait rien. */
  enabled: boolean;
  /** Vrai dès qu'une œuvre est sélectionnée : un appui court coche au lieu d'ouvrir. */
  active: boolean;
  items: SelectedWork[];
  isSelected: (key: string) => boolean;
  /** Premier appui long : démarre la sélection avec cette œuvre. */
  begin: (work: SelectedWork) => void;
  /** Ajoute ou retire une œuvre d'une sélection en cours. */
  toggle: (work: SelectedWork) => void;
  clear: () => void;
}

const noop = () => {};

export const DISABLED_SELECTION: WorkSelection = {
  enabled: false,
  active: false,
  items: [],
  isSelected: () => false,
  begin: noop,
  toggle: noop,
  clear: noop,
};

const WorkSelectionContext = createContext<WorkSelection>(DISABLED_SELECTION);

export const WorkSelectionProvider = WorkSelectionContext.Provider;

export const useWorkSelection = (): WorkSelection => useContext(WorkSelectionContext);
