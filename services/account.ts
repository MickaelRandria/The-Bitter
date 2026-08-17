import { supabase } from './supabase';

/**
 * Forme unique plutôt qu'union discriminée : `strictNullChecks` est désactivé
 * dans ce projet, et le narrowing par `if (!result.ok)` n'y fonctionne pas.
 */
export interface DeleteAccountResult {
  ok: boolean;
  /** Renseigné uniquement en cas d'échec. */
  message?: string;
  spacesTransferred?: number;
  spacesRemoved?: number;
}

/** Mot que l'utilisateur saisit pour confirmer. Doit rester aligné sur l'Edge Function. */
export const DELETE_CONFIRMATION = 'SUPPRIMER';

interface DeleteAccountResponse {
  ok?: boolean;
  spacesTransferred?: number;
  spacesRemoved?: number;
}

/**
 * Supprime définitivement le compte connecté et toutes ses données serveur.
 *
 * Le serveur transmet d'abord les espaces partagés dont l'utilisateur est le
 * créateur, pour ne pas emporter les données des autres membres. Voir
 * `supabase/functions/delete-account`.
 */
export const deleteAccount = async (): Promise<DeleteAccountResult> => {
  if (!supabase) return { ok: false, message: 'Le compte en ligne n’est pas configuré.' };

  const { data, error } = await supabase.functions.invoke('delete-account', {
    body: { confirm: DELETE_CONFIRMATION },
  });

  if (error) {
    // `functions.invoke` garde parfois la réponse JSON côté transport. On reste
    // volontairement générique : aucun message serveur n'est affiché tel quel.
    return { ok: false, message: 'La suppression n’a pas pu aboutir. Réessaie dans un instant.' };
  }

  const payload = (data || {}) as DeleteAccountResponse;
  if (!payload.ok) {
    return { ok: false, message: 'La suppression n’a pas pu aboutir. Réessaie dans un instant.' };
  }

  return {
    ok: true,
    spacesTransferred: payload.spacesTransferred ?? 0,
    spacesRemoved: payload.spacesRemoved ?? 0,
  };
};
