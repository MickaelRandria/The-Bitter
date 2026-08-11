import { useEffect, useRef } from 'react';

/**
 * Rejoue une lecture quand l'app revient au premier plan.
 *
 * iOS suspend la connexion temps réel dès que la PWA passe en arrière-plan, et ne
 * la rétablit pas au retour. L'écran continue alors d'afficher l'état qu'il avait
 * au moment de s'endormir, sans que rien ne signale qu'il est périmé : c'est ce qui
 * obligeait à relancer l'application entière pour voir la moindre nouveauté.
 *
 * Le retour de connexion réseau est traité de la même façon, pour la même raison.
 *
 * @param onResume Ce qu'il faut rejouer. Doit rester peu coûteux : il sera appelé
 *   à chaque retour, y compris plusieurs fois par minute.
 * @param minAwayMs Durée d'absence en dessous de laquelle on ne fait rien. Passer
 *   d'un onglet à l'autre une seconde ne justifie pas de tout relire.
 */
export const useResumeRefresh = (onResume: () => void, minAwayMs = 3000) => {
  const callback = useRef(onResume);
  callback.current = onResume;

  useEffect(() => {
    let hiddenAt: number | null = null;

    const onVisibility = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }

      // `hiddenAt` est nul quand l'onglet n'a jamais été masqué : l'effet vient de
      // se monter, et le chargement initial a déjà eu lieu.
      if (hiddenAt === null) return;

      const away = Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= minAwayMs) callback.current();
    };

    const onOnline = () => callback.current();

    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
    };
  }, [minAwayMs]);
};
