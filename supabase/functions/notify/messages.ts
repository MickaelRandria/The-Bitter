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
  | 'link_joined'
  | 'plan_proposed'
  | 'plan_agreed'
  | 'plan_cancelled'
  | 'plan_rate'
  | 'common_wish'
  | 'release_today'
  | 'now_streaming';

/** Un créneau tel que le serveur le range dans `notifications.payload`. */
export interface PlanSlot {
  id?: string;
  starts_at: string;
  cinema_name?: string | null;
  version?: string | null;
  booking_url?: string | null;
}

export interface PlanPayload {
  slots?: PlanSlot[];
  chosen_slot_id?: string | null;
  status?: string;
  /** Film de la liste personnelle (envie commune, sortie, streaming). */
  tmdb_id?: number;
  media_type?: 'movie' | 'tv';
  /** Nouvelles plateformes d'abonnement, pour `now_streaming`. */
  providers?: string[];
  /** Prénoms des proches qui attendent aussi le film. */
  also?: string[];
}

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
  /** Séance proposée ou calée. */
  payload?: PlanPayload | null;
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

/**
 * « samedi 27 septembre, 20 h 30 », toujours à l'heure de Paris : le push part
 * d'un serveur réglé sur UTC, et les salles sont en France.
 */
export const formatWhen = (iso: string, now = new Date()): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const tz = 'Europe/Paris';
  const day = (d: Date) => new Intl.DateTimeFormat('fr-FR', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
  const hm = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: '2-digit', minute: '2-digit' })
    .format(date)
    .replace(':', ' h ');
  const tomorrow = new Date(now.getTime() + 86_400_000);
  if (day(date) === day(now)) {
    // `format` rend « 20 h » en français : seule la partie `hour` se lit comme un nombre.
    const hour = Number(
      new Intl.DateTimeFormat('fr-FR', { timeZone: tz, hour: 'numeric', hour12: false })
        .formatToParts(date)
        .find((part) => part.type === 'hour')?.value
    );
    return `${hour >= 18 ? 'ce soir' : 'aujourd’hui'}, ${hm}`;
  }
  if (day(date) === day(tomorrow)) return `demain, ${hm}`;
  const label = new Intl.DateTimeFormat('fr-FR', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long' }).format(date);
  return `${label}, ${hm}`;
};

/** « samedi 27 septembre, 20 h 30 · UGC Talence » */
export const formatSlot = (slot: PlanSlot | null | undefined, now = new Date()): string => {
  if (!slot) return '';
  return [formatWhen(slot.starts_at, now), slot.cinema_name].filter(Boolean).join(' · ');
};

const chosenSlot = (payload?: PlanPayload | null): PlanSlot | null => {
  const slots = payload?.slots ?? [];
  return slots.find((s) => s.id && s.id === payload?.chosen_slot_id) ?? (slots.length === 1 ? slots[0] : null);
};

/** « Léa », « Léa et Tom », « Léa, Tom et Sam ». */
export const listNames = (names: string[]): string => {
  const clean = names.map((n) => n.trim()).filter(Boolean);
  if (clean.length <= 1) return clean[0] ?? '';
  return `${clean.slice(0, -1).join(', ')} et ${clean[clean.length - 1]}`;
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
  const slots = input.payload?.slots ?? [];
  const firstSlot = formatSlot(slots[0]);
  const chosen = formatSlot(chosenSlot(input.payload));

  switch (input.kind) {
    case 'watch_invite':
      if (slots.length === 1) return { title: `${actor} veut voir ${title} avec toi`, body: `${firstSlot}. Ça te dit ?` };
      if (slots.length > 1) {
        return { title: `${actor} veut voir ${title} avec toi`, body: `${slots.length} créneaux au choix. Ça te dit ?` };
      }
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
        // Sans note : tu n'as pas encore noté, elle reste cachée jusque-là.
        body: !rating ? 'Note-le pour découvrir sa note.' : own ? `Toi : ${own}. Vous en parlez ?` : 'Va voir son verdict.',
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
      if (slots.length === 1) return { title: `${guest} dit oui pour ${title}`, body: `${firstSlot} : c’est calé.` };
      return { title: `${guest} dit oui pour ${title}`, body: 'Réponse reçue par ton lien.' };
    case 'link_joined':
      // « a rejoint The Bitter » serait faux pour qui avait déjà un compte : le
      // serveur ne distingue pas les deux, la phrase doit rester vraie dans les deux cas.
      return { title: `${actor} a suivi ton lien`, body: `${title} vous attend dans votre espace commun.` };
    case 'plan_proposed':
      return {
        title: `${actor} propose une séance pour ${title}`,
        body: slots.length > 1 ? `${slots.length} créneaux au choix.` : `${firstSlot}. Ça te va ?`,
      };
    case 'plan_agreed':
      return {
        title: `C’est calé : ${title}`,
        body: `${chosen || 'Séance choisie'} avec ${actor}. Pense à réserver ta place.`,
      };
    case 'plan_cancelled':
      return { title: `Séance annulée : ${title}`, body: chosen ? `${actor} a annulé ${chosen}.` : `${actor} a annulé la séance.` };
    case 'plan_rate':
      return { title: `Vous avez vu ${title} ?`, body: `Note-le pour découvrir la note de ${actor}.` };
    case 'common_wish':
      return { title: `${actor} veut aussi voir ${title}`, body: 'Vous l’avez tous les deux dans votre liste. On y va ensemble ?' };
    case 'release_today': {
      const also = input.payload?.also ?? [];
      return {
        title: `${title} sort aujourd’hui en salle`,
        body: also.length
          ? `${listNames(also)} ${also.length > 1 ? 'veulent' : 'veut'} aussi le voir. On y va ensemble ?`
          : 'Il était dans ta liste. C’est le moment.',
      };
    }
    case 'now_streaming': {
      const also = input.payload?.also ?? [];
      const providers = listNames(input.payload?.providers ?? []);
      return {
        title: providers ? `${title} est maintenant sur ${providers}` : `${title} est maintenant en streaming`,
        body: also.length
          ? `${listNames(also)} ${also.length > 1 ? 'veulent' : 'veut'} aussi le voir. Soirée ciné à la maison ?`
          : 'Il était dans ta liste.',
      };
    }
    default:
      return { title: 'The Bitter', body: title };
  }
};
