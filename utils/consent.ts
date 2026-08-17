/**
 * Choix de l'utilisateur sur les traceurs d'audience.
 *
 * Le RGPD demande un consentement libre, éclairé et révocable : refuser doit être
 * aussi simple qu'accepter, et le choix doit tenir dans le temps sans être
 * redemandé à chaque ouverture. Trois états, et non deux : tant que rien n'est
 * enregistré, la bannière s'affiche et rien n'est chargé.
 */

export type ConsentChoice = 'granted' | 'denied';

const STORAGE_KEY = 'the-bitter:analytics-consent';

/** Le choix déjà exprimé, ou `null` si la question n'a pas encore été posée. */
export const readConsent = (): ConsentChoice | null => {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === 'granted' || stored === 'denied' ? stored : null;
  } catch {
    // Navigation privée ou stockage refusé : on repose la question, sans jamais
    // supposer un accord.
    return null;
  }
};

export const saveConsent = (choice: ConsentChoice): void => {
  try {
    localStorage.setItem(STORAGE_KEY, choice);
  } catch {
    // Le refus reste effectif pour la session en cours même s'il n'est pas écrit.
  }
};

/** Repose la question au prochain rendu. Utilisé par « revenir sur mon choix ». */
export const clearConsent = (): void => {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Sans stockage, il n'y a rien à effacer.
  }
};
