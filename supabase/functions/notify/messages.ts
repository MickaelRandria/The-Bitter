/**
 * Texte des notifications sociales.
 *
 * Module pur, sans import : la fonction Edge `notify` s'en sert pour le push, et
 * l'app pour la cloche. Une seule rédaction, pour que le téléphone verrouillé et
 * la boîte de l'app disent la même chose.
 *
 * Tournures sans accord de genre (« dit oui », pas « est partant·e ») : l'app ne
 * connaît pas le genre de ses membres et n'a pas à le deviner.
 */

export type SocialKind =
  | 'watch_invite'
  | 'watch_accepted'
  | 'verdict_request'
  | 'verdict_given'
  | 'link_answered'
  | 'link_joined';

export interface SocialMessageInput {
  kind: SocialKind;
  /** Prénom de la personne à l'origine de la notification, s'il y en a une. */
  actor?: string | null;
  /** Prénom saisi sur la page d'un lien, sans compte. */
  guestName?: string | null;
  title: string;
  /** Note de l'autre personne. */
  rating?: number | string | null;
  /** Note de la personne qui reçoit la notification, pour l'écart. */
  ownRating?: number | string | null;
  /** Sorte du lien, pour `link_answered`. */
  linkKind?: 'watch' | 'verdict' | null;
}

export interface SocialMessage {
  title: string;
  body: string;
}

/** « 6.5 » → « 6,5 » ; « 7.0 » → « 7 ». Les numeric arrivent en texte depuis Postgres. */
export const formatRating = (value: number | string | null | undefined): string | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 10) / 10;
  return (Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)).replace('.', ',');
};

const name = (value: string | null | undefined, fallback: string) => {
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
};

export const socialMessage = (input: SocialMessageInput): SocialMessage => {
  const actor = name(input.actor, 'Quelqu’un');
  const guest = name(input.guestName, 'Quelqu’un');
  const title = input.title;
  const rating = formatRating(input.rating);
  const own = formatRating(input.ownRating);

  switch (input.kind) {
    case 'watch_invite':
      return { title: `${actor} veut voir ${title} avec toi`, body: 'Ça te dit ? Réponds en un geste.' };
    case 'watch_accepted':
      return { title: `${actor} dit oui pour ${title}`, body: 'Vous êtes deux à vouloir le voir.' };
    case 'verdict_request':
      return {
        title: `${actor} veut ton avis sur ${title}`,
        body: 'Tu l’as vu ? Donne ta note pour découvrir la sienne.',
      };
    case 'verdict_given':
      return {
        title: rating ? `${actor} a mis ${rating} à ${title}` : `${actor} a noté ${title}`,
        body: own ? `Toi : ${own}. Vous en parlez ?` : 'Va voir son verdict.',
      };
    case 'link_answered':
      if (input.linkKind === 'verdict' && rating) {
        return {
          title: `${guest} a mis ${rating} à ${title}`,
          body: own ? `Toi : ${own}. Réponse reçue par ton lien.` : 'Réponse reçue par ton lien.',
        };
      }
      if (input.linkKind === 'verdict') {
        return { title: `${guest} n’a pas encore vu ${title}`, body: 'Mais ça lui dit bien.' };
      }
      return { title: `${guest} dit oui pour ${title}`, body: 'Réponse reçue par ton lien.' };
    case 'link_joined':
      // « a rejoint The Bitter » serait faux pour qui avait déjà un compte : le
      // serveur ne distingue pas les deux, la phrase doit rester vraie dans les deux cas.
      return { title: `${actor} a suivi ton lien`, body: `${title} vous attend dans votre espace commun.` };
    default:
      return { title: 'The Bitter', body: title };
  }
};
