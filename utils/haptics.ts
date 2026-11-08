/**
 * Retours haptiques (vibrations).
 *
 * Android : `navigator.vibrate`, avec la durée ou le motif demandé.
 * iPhone : Safari n'a pas `navigator.vibrate`. Depuis iOS 18, basculer un
 * interrupteur natif (`<input type="checkbox" switch>`) fait vibrer le
 * téléphone : on en touche un, invisible, hors de l'arbre React. Un motif y
 * devient une suite de petits coups. Sur un iOS plus ancien, rien ne se passe.
 */

const canVibrate = (): boolean => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

const isIOS = (): boolean => {
  if (typeof navigator === 'undefined') return false;
  // Un iPad récent se présente comme un Mac : on le reconnaît à l'écran tactile.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/** Un coup de l'interrupteur natif d'iOS. */
const iosTick = () => {
  try {
    const label = document.createElement('label');
    label.ariaHidden = 'true';
    label.style.display = 'none';
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.setAttribute('switch', '');
    input.tabIndex = -1;
    label.appendChild(input);
    // Hors de #root : React ne voit pas ce clic, et il ne remonte pas plus haut.
    label.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('click', (e) => e.stopPropagation());
    document.head.appendChild(label);
    label.click();
    label.remove();
  } catch {
    // Rien à faire : la vibration est un plus.
  }
};

/** Écart entre deux coups d'un motif sur iPhone. */
const IOS_GAP_MS = 110;

const vibrate = (pattern: number | number[]) => {
  if (canVibrate()) {
    try {
      navigator.vibrate(pattern);
    } catch {
      // Souvent : pas encore de geste de l'utilisateur sur la page.
    }
    return;
  }
  if (!isIOS()) return;
  // [vibre, pause, vibre, …] : un coup par temps vibré.
  const ticks = Array.isArray(pattern) ? Math.ceil(pattern.length / 2) : 1;
  iosTick();
  for (let i = 1; i < ticks; i++) window.setTimeout(iosTick, i * IOS_GAP_MS);
};

export const haptics = {
  vibrate,

  /** Léger tick pour la navigation et les petits boutons (10ms) */
  soft: () => vibrate(10),

  /** Retour plus marqué pour les actions importantes ou ouvertures de modales (40ms) */
  medium: () => vibrate(40),

  /** Pattern de succès pour les sauvegardes et validations [50ms on, 50ms off, 50ms on] */
  success: () => vibrate([50, 50, 50]),

  /** Pattern d'erreur pour les suppressions ou alertes [50ms on, 100ms off, 50ms on, 100ms off] */
  error: () => vibrate([50, 100, 50, 100]),
};
