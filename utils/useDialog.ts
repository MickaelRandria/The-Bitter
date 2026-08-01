import { useEffect, useRef } from 'react';

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
