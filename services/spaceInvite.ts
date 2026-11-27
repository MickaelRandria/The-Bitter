/**
 * Invitation à un espace partagé : un lien `thebitter.watch/?join=CODE`.
 *
 * Touché sur Android, il ouvre l'app installée ; ailleurs, le site. L'app
 * rejoint l'espace et l'ouvre (App.tsx, PENDING_JOIN_KEY) ; sans compte, le
 * code attend qu'il en soit créé un.
 */

/** Le vrai domaine hors du poste de dev : c'est lui qui ouvre l'app Android. */
const inviteOrigin = () => {
  const { origin, protocol, hostname } = window.location;
  return protocol === 'https:' && hostname !== 'localhost' ? origin : 'https://thebitter.watch';
};

export const spaceInviteLink = (code: string) => `${inviteOrigin()}/?join=${encodeURIComponent(code)}`;

/**
 * Envoie l'invitation par la feuille de partage du téléphone, sinon la copie.
 * Tout tient dans `text` : plusieurs messageries ignorent le champ `url` quand
 * un texte l'accompagne, et le lien disparaîtrait du message.
 */
export async function shareSpaceInvite(intro: string, code: string): Promise<'shared' | 'copied' | 'cancelled' | 'failed'> {
  const text = `${intro} ${spaceInviteLink(code)}`;
  if (typeof navigator.share === 'function') {
    try {
      await navigator.share({ text });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await navigator.clipboard.writeText(text);
    return 'copied';
  } catch {
    return 'failed';
  }
}
