import { useEffect, useRef } from 'react';

/**
 * Verrou de défilement de la page, partagé par toutes les modales.
 *
 * Sans lui, la page continue de défiler derrière la modale : on perd sa place,
 * et sur mobile le geste destiné au contenu de la modale emporte l'arrière-plan.
 * Un compteur gère les modales empilées — la première pose le verrou, la
 * dernière le retire.
 *
 * `position: fixed` plutôt qu'un simple `overflow: hidden` : iOS ignore le second
 * sur le body. La position de lecture est mémorisée puis rendue à la fermeture,
 * sinon fermer une modale renverrait en haut de la collection.
 */
let lockCount = 0;
let savedScrollY = 0;

const lockScroll = () => {
  if (lockCount++ > 0) return;
  savedScrollY = window.scrollY;
  const { style } = document.body;
  style.position = 'fixed';
  style.top = `-${savedScrollY}px`;
  style.left = '0';
  style.right = '0';
  style.width = '100%';
  style.overflowY = 'scroll';
};

const unlockScroll = () => {
  if (--lockCount > 0) return;
  lockCount = 0;
  const { style } = document.body;
  style.position = '';
  style.top = '';
  style.left = '';
  style.right = '';
  style.width = '';
  style.overflowY = '';
  window.scrollTo(0, savedScrollY);
};

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * Accessibilité des modales : rôle dialog, fermeture au clavier (Échap),
 * focus piégé à l'intérieur et rendu à l'élément d'origine à la fermeture.
 *
 * Usage :
 *   const dialog = useDialog(onClose, t('addMovie.title'));
 *   return <div {...dialog.props}>…</div>
 */
export function useDialog(onClose?: () => void, label?: string) {
  const ref = useRef<HTMLDivElement>(null);
  // onClose est souvent une lambda recréée à chaque rendu du parent : on la lit via
  // une ref pour que l'effet ne se relance pas (sinon le focus repart au début).
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    lockScroll();
    return unlockScroll;
  }, []);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const node = ref.current;

    // Focus initial dans la modale, sinon le clavier reste derrière
    const first = node?.querySelector<HTMLElement>(FOCUSABLE);
    (first ?? node)?.focus({ preventScroll: true });

    const onKeyDown = (e: KeyboardEvent) => {
      // Rien de rendu (modale fermée qui renvoie null) : on ne capte rien
      if (!ref.current) return;

      if (e.key === 'Escape' && onCloseRef.current) {
        e.stopPropagation();
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab' || !node) return;

      const focusables = [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
        (el) => el.offsetParent !== null || el === document.activeElement
      );
      if (focusables.length === 0) return;

      const firstEl = focusables[0];
      const lastEl = focusables[focusables.length - 1];
      if (e.shiftKey && document.activeElement === firstEl) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && document.activeElement === lastEl) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener('keydown', onKeyDown, true);
    return () => {
      document.removeEventListener('keydown', onKeyDown, true);
      previouslyFocused?.focus?.({ preventScroll: true });
    };
    // Volontairement au montage uniquement : une modale = un cycle d'ouverture
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    ref,
    props: {
      ref,
      role: 'dialog' as const,
      'aria-modal': true,
      'aria-label': label,
      tabIndex: -1,
    },
  };
}
