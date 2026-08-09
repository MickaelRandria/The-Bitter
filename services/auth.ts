import { supabase } from './supabase';

/**
 * Authentification du profil perso.
 *
 * Deux portes d'entrée, aucun mot de passe :
 *
 * - lien magique par email, pour les comptes qui existent déjà. C'est le chemin
 *   que prennent les 12 comptes historiques : `signInWithOtp` réutilise le compte
 *   existant si l'email est connu, il n'en crée pas un second ;
 * - session anonyme, pour un nouveau profil. Aucun écran, aucune friction.
 *
 * L'anonyme peut être converti plus tard en compte permanent via `attachEmail`.
 * Le point capital est que `auth.uid()` NE CHANGE PAS lors de cette conversion :
 * les films déjà rattachés au compte anonyme restent donc attachés.
 */

/**
 * Forme unique plutôt qu'une union discriminée : `strict` n'étant pas activé dans
 * ce projet, TypeScript ne sait pas restreindre une union sur un booléen littéral,
 * et l'appelant se retrouverait à devoir caster pour lire `reason`.
 */
export interface AuthOutcome {
  ok: boolean;
  reason?: 'not-configured' | 'failed';
  message?: string;
}

const notConfigured: AuthOutcome = { ok: false, reason: 'not-configured' };

/**
 * Envoie un lien magique. `shouldCreateUser` est laissé à true pour qu'une adresse
 * inconnue puisse aussi créer son compte, mais un email déjà présent dans
 * auth.users est toujours reconnu comme tel : il n'y a pas de doublon possible.
 */
export const sendMagicLink = async (email: string): Promise<AuthOutcome> => {
  if (!supabase) return notConfigured;

  const { error } = await supabase.auth.signInWithOtp({
    email: email.trim().toLowerCase(),
    options: { emailRedirectTo: window.location.origin },
  });

  if (error) return { ok: false, reason: 'failed', message: error.message };
  return { ok: true };
};

/**
 * Vérifie le code à 6 chiffres reçu par email, sans passer par le lien.
 *
 * C'est la seule voie praticable depuis une app installée sur l'écran d'accueil :
 * sur iOS, un lien ouvert depuis la boîte mail part toujours dans le navigateur par
 * défaut, qui possède son propre stockage. L'utilisateur se retrouverait connecté
 * dans un contexte vide, à côté de ses films, sans aucun moyen de les rejoindre.
 * Le code, lui, ouvre la session dans le contexte où il est saisi.
 *
 * `type: 'email'` couvre le code émis par `signInWithOtp`, que l'adresse soit déjà
 * connue ou non. `magiclink` ne concerne que le jeton porté par l'URL.
 */
export const verifyEmailCode = async (email: string, code: string): Promise<AuthOutcome> => {
  if (!supabase) return notConfigured;

  const { error } = await supabase.auth.verifyOtp({
    email: email.trim().toLowerCase(),
    token: code.replace(/\s/g, ''),
    type: 'email',
  });

  if (error) return { ok: false, reason: 'failed', message: error.message };
  return { ok: true };
};

/** Crée une session anonyme, sans aucun écran intermédiaire. */
export const startAnonymousSession = async (): Promise<AuthOutcome> => {
  if (!supabase) return notConfigured;

  const { error } = await supabase.auth.signInAnonymously();
  if (error) return { ok: false, reason: 'failed', message: error.message };
  return { ok: true };
};

/**
 * Convertit un compte anonyme en compte permanent.
 *
 * `auth.uid()` est conservé, donc l'historique déjà synchronisé reste rattaché.
 * En revanche, le trigger `handle_new_user` ne se redéclenche pas (il est sur
 * INSERT dans auth.users) : c'est pourquoi on met `profiles.email` à jour nous-mêmes
 * juste après, sinon la colonne resterait NULL pour toujours.
 */
export const attachEmail = async (userId: string, email: string): Promise<AuthOutcome> => {
  if (!supabase) return notConfigured;

  const normalized = email.trim().toLowerCase();
  const { error } = await supabase.auth.updateUser({ email: normalized });
  if (error) return { ok: false, reason: 'failed', message: error.message };

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ email: normalized, updated_at: new Date().toISOString() })
    .eq('id', userId);

  if (profileError && import.meta.env.DEV) {
    console.error('[Auth] Email mis à jour côté auth mais pas dans profiles :', profileError);
  }

  return { ok: true };
};

/** Une session anonyme n'a pas d'email et porte `is_anonymous`. */
export const isAnonymousSession = (session: unknown): boolean => {
  const user = (session as { user?: { is_anonymous?: boolean; email?: string | null } } | null)
    ?.user;
  if (!user) return false;
  return user.is_anonymous === true || !user.email;
};
