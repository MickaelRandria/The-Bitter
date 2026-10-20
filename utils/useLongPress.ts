import React, { useEffect, useMemo, useRef } from 'react';
import { haptics } from './haptics';
import { LONG_PRESS_MOVE_TOLERANCE, LONG_PRESS_MS, SelectedWork } from './navActions';
import { useWorkSelection } from '../contexts/WorkSelectionContext';

export interface LongPressHandlers {
  onPointerDown?: (e: React.PointerEvent) => void;
  onPointerMove?: (e: React.PointerEvent) => void;
  onPointerUp?: (e: React.PointerEvent) => void;
  onPointerCancel?: (e: React.PointerEvent) => void;
  onPointerLeave?: (e: React.PointerEvent) => void;
  onClickCapture?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}

/**
 * Empêche iOS d'ouvrir son menu d'image et de sélectionner le texte pendant
 * l'appui : à poser sur l'élément qui reçoit les gestionnaires.
 */
export const longPressStyle: React.CSSProperties = {
  WebkitTouchCallout: 'none',
  WebkitUserSelect: 'none',
  userSelect: 'none',
};

const NO_HANDLERS: LongPressHandlers = {};

interface LongPressOptions {
  enabled: boolean;
  onLongPress: () => void;
  /**
   * Quand il est fourni, un appui court ne fait plus son effet habituel (ouvrir,
   * déplier) : il appelle cette fonction à la place. Sert au mode sélection, où
   * toucher une affiche la coche.
   */
  interceptTap?: () => void;
  ms?: number;
}

/**
 * Appui long en pointer events, compatible avec les gestes déjà en place.
 *
 * - Le délai s'annule dès que le doigt bouge de plus de 10 px : un défilement ou
 *   un glissement de carte (`SwipeRow`, swipe des `MovieCard`) reste prioritaire.
 * - Le clic qui suit un appui long est avalé en phase de capture, avant les
 *   `onClick` des enfants : sinon la carte se déplierait ou la fiche s'ouvrirait.
 * - Le menu contextuel natif (clic droit, appui long Android) est bloqué.
 */
export function useLongPress({ enabled, onLongPress, interceptTap, ms = LONG_PRESS_MS }: LongPressOptions): LongPressHandlers {
  const timer = useRef<number | null>(null);
  const origin = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const latest = useRef({ onLongPress, interceptTap });
  latest.current = { onLongPress, interceptTap };

  useEffect(
    () => {
      const cancel = () => {
        if (timer.current != null) window.clearTimeout(timer.current);
        timer.current = null;
        origin.current = null;
      };
      return cancel;
    },
    [enabled]
  );

  return useMemo<LongPressHandlers>(() => {
    if (!enabled) return NO_HANDLERS;
    const cancel = () => {
      if (timer.current != null) {
        window.clearTimeout(timer.current);
        timer.current = null;
      }
      origin.current = null;
    };
    return {
      onPointerDown: (e) => {
        if (!e.isPrimary || e.button !== 0) return;
        fired.current = false;
        cancel();
        origin.current = { x: e.clientX, y: e.clientY };
        timer.current = window.setTimeout(() => {
          timer.current = null;
          origin.current = null;
          if (document.hidden) return;
          fired.current = true;
          haptics.medium();
          latest.current.onLongPress();
        }, ms);
      },
      onPointerMove: (e) => {
        const start = origin.current;
        if (!start || timer.current == null) return;
        if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > LONG_PRESS_MOVE_TOLERANCE) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: (e) => { if (e.pointerType === 'mouse') cancel(); },
      onClickCapture: (e) => {
        if (fired.current) {
          fired.current = false;
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        const tap = latest.current.interceptTap;
        if (tap) {
          e.preventDefault();
          e.stopPropagation();
          haptics.soft();
          tap();
        }
      },
      onContextMenu: (e) => e.preventDefault(),
    };
  }, [enabled, ms, interceptTap != null]);
}

/**
 * Ce qu'un écran pose sur une affiche pour la rendre sélectionnable.
 *
 * `work` vaut null quand l'œuvre ne peut pas être sélectionnée (pas de référence
 * TMDB et pas de fiche d'espace) : l'affiche garde alors son comportement normal.
 */
export function useSelectableWork(work: SelectedWork | null) {
  const selection = useWorkSelection();
  const selected = !!work && selection.isSelected(work.key);
  const workRef = useRef(work);
  workRef.current = work;

  const handlers = useLongPress({
    enabled: selection.enabled && !!work,
    onLongPress: () => {
      const current = workRef.current;
      if (!current) return;
      if (selection.active) selection.toggle(current);
      else selection.begin(current);
    },
    interceptTap: selection.active
      ? () => {
          const current = workRef.current;
          if (current) selection.toggle(current);
        }
      : undefined,
  });

  return { selected, selecting: selection.active, handlers };
}
