import { useEffect, useRef } from 'react';
import { supabase } from '../services/supabase';

/**
 * Remet le client Supabase en marche après une mise en veille.
 *
 * Recharger les données ne suffit pas, et c'est ce qui manquait : quand iOS gèle
 * l'app, le renouvellement automatique du jeton reste armé mais ne peut plus
 * s'exécuter. Au réveil, le client se croit en train de rafraîchir, garde son
 * verrou interne, et TOUTE requête suivante attend derrière lui sans jamais partir.
 * D'où un écran qui tourne dans le vide que seul un redémarrage débloquait.
 *
 * `stopAutoRefresh` avant la veille et `startAutoRefresh` au réveil est la parade
 * recommandée pour les applications mobiles. On rouvre aussi la connexion temps
 * réel, qu'une suspension laisse fermée sans le signaler.
 */
const wakeSupabase = (active: boolean) => {
  if (!supabase) return;
  try {
    if (active) {
      supabase.auth.startAutoRefresh();
      supabase.realtime.connect();
    } else {
      supabase.auth.stopAutoRefresh();
    }
  } catch (e) {
    console.warn('[Reprise] Réveil du client Supabase :', e);
  }
};

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
        wakeSupabase(false);
        return;
      }

      // Avant tout rechargement : une requête lancée sur un client encore verrouillé
      // ne partirait pas, et l'écran retomberait dans l'attente sans fin.
      wakeSupabase(true);

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
