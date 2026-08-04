/**
 * Pont vers le splash de lancement défini dans index.html.
 *
 * Le splash vit hors de React : il doit être peint avant même que le bundle soit
 * chargé, donc c'est du HTML et du CSS inline. React n'a qu'un rôle à jouer,
 * signaler que l'amorçage est fini. Le reste (durée plancher, plafond de sécurité,
 * fondu, retrait du DOM) est géré côté page.
 *
 * Sans effet en navigateur classique : le splash y est retiré au chargement et le
 * hook global n'est jamais installé.
 */
type SplashWindow = Window & {
  __bitterSplashReady?: () => void;
  __bitterAppReady?: boolean;
};

export const notifySplashReady = () => {
  const w = window as SplashWindow;
  // Le drapeau double l'appel : si l'app était prête avant que le script du splash
  // ne soit exécuté, celui-ci le relit à l'installation. L'ordre des scripts ne
  // peut donc pas laisser le splash coincé jusqu'au plafond de sécurité.
  w.__bitterAppReady = true;
  w.__bitterSplashReady?.();
};
