/**
 * Utilitaire pour gérer les retours haptiques (vibrations)
 * Fournit une couche d'abstraction sécurisée pour navigator.vibrate
 */
export const haptics = {
  vibrate: (pattern: number | number[]) => {
    // Vérification de la compatibilité du navigateur
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try {
        navigator.vibrate(pattern);
      } catch (e) {
        // Silencieusement ignorer les erreurs (souvent liées aux permissions)
      }
    }
  },

  /** Léger tick pour la navigation et les petits boutons (10ms) */
  soft: () => haptics.vibrate(10),

  /** Retour plus marqué pour les actions importantes ou ouvertures de modales (40ms) */
  medium: () => haptics.vibrate(40),

  /** Pattern de succès pour les sauvegardes et validations [50ms on, 50ms off, 50ms on] */
  success: () => haptics.vibrate([50, 50, 50]),

  /** Pattern d'erreur pour les suppressions ou alertes [50ms on, 100ms off, 50ms on, 100ms off] */
  error: () => haptics.vibrate([50, 100, 50, 100]),
};
