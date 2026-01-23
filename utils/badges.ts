/**
 * Utilitaire pour mettre à jour le badge de notification sur l'icône de l'application
 * Compatible avec les navigateurs supportant l'API App Badging (Chrome, Edge, Safari sur iOS)
 */
export const updateAppBadge = async (count: number) => {
  if (typeof navigator !== 'undefined' && 'setAppBadge' in navigator) {
    try {
      if (count > 0) {
        // Affiche le nombre sur l'icône
        await (navigator as any).setAppBadge(count);
      } else {
        // Efface le badge si le compte est à zéro
        await (navigator as any).clearAppBadge();
      }
    } catch (error) {
      console.error('Erreur lors de la mise à jour du badge:', error);
    }
  }
};
