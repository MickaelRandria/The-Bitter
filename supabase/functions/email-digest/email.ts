/**
 * Le récapitulatif envoyé par e-mail : sujet, HTML et texte brut.
 *
 * Module pur, testé tel quel par `tests/emailDigest.test.mjs`. Les phrases sont
 * celles des notifications (`socialMessage`) : l'e-mail dit exactement ce que la
 * cloche et le push auraient dit.
 */
import { socialMessage, listNames, SocialKind, PlanPayload } from '../notify/messages.ts';

export interface DigestItem {
  id: string;
  kind: SocialKind;
  title: string;
  poster_url: string | null;
  actor: string | null;
  guest_name: string | null;
  rating: number | string | null;
  payload: PlanPayload | null;
}

export interface DigestInput {
  firstName: string;
  items: DigestItem[];
  appUrl: string;
  unsubscribeUrl: string;
}

export interface DigestEmail {
  subject: string;
  html: string;
  text: string;
}

const escapeHtml = (value: unknown): string =>
  String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

/** Seules les affiches TMDB passent dans l'e-mail, en petite taille. */
const poster = (url: string | null) =>
  url && /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+\/[A-Za-z0-9_.-]+$/.test(url)
    ? url.replace(/\/t\/p\/[a-z0-9]+\//, '/t/p/w154/')
    : null;

const messageOf = (item: DigestItem) =>
  socialMessage({
    kind: item.kind,
    actor: item.actor,
    guestName: item.guest_name,
    title: item.title,
    rating: item.rating,
    payload: item.payload,
    linkKind: item.kind === 'link_answered' ? (item.rating != null ? 'verdict' : 'watch') : null,
  });

export const buildDigestEmail = ({ firstName, items, appUrl, unsubscribeUrl }: DigestInput): DigestEmail => {
  const messages = items.map((item) => ({ item, message: messageOf(item) }));
  const people = [...new Set(items.map((i) => i.actor || i.guest_name).filter(Boolean) as string[])];

  // Un seul message : son titre est le sujet. Plusieurs : qui attend.
  const subject =
    messages.length === 1
      ? messages[0].message.title
      : people.length
        ? `${listNames(people.slice(0, 3))} ${people.length > 1 ? 't’attendent' : 't’attend'} sur The Bitter`
        : `${messages.length} réponses t’attendent sur The Bitter`;

  const hello = firstName ? `Salut ${firstName},` : 'Salut,';
  const lead = messages.length === 1 ? 'Une réponse t’attend dans The Bitter :' : 'Des réponses t’attendent dans The Bitter :';
  const link = (id: string) => `${appUrl}/?notif=${encodeURIComponent(id)}`;

  const rows = messages
    .map(({ item, message }) => {
      const img = poster(item.poster_url);
      return `
        <tr>
          <td style="padding:12px 0;border-top:1px solid #E7E4DC;vertical-align:top;width:56px">
            ${img ? `<img src="${escapeHtml(img)}" width="48" height="72" alt="" style="display:block;border-radius:8px;object-fit:cover">` : ''}
          </td>
          <td style="padding:12px 0 12px 12px;border-top:1px solid #E7E4DC;vertical-align:top">
            <a href="${escapeHtml(link(item.id))}" style="color:#1A1A1A;text-decoration:none;font-weight:800;font-size:15px;line-height:1.35">${escapeHtml(message.title)}</a>
            <div style="color:#4A4A46;font-size:14px;line-height:1.45;margin-top:4px">${escapeHtml(message.body)}</div>
          </td>
        </tr>`;
    })
    .join('');

  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#FDFCF8;font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:#1A1A1A">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDFCF8">
    <tr><td align="center" style="padding:24px 16px">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E7E4DC;border-radius:20px">
        <tr><td style="padding:24px 24px 8px">
          <div style="font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:#8A8A82">The Bitter</div>
          <p style="font-size:16px;line-height:1.5;margin:16px 0 4px">${escapeHtml(hello)}</p>
          <p style="font-size:16px;line-height:1.5;margin:0 0 8px;color:#4A4A46">${lead}</p>
        </td></tr>
        <tr><td style="padding:0 24px">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table>
        </td></tr>
        <tr><td style="padding:16px 24px 24px">
          <a href="${escapeHtml(link(items[0]?.id ?? ''))}" style="display:block;text-align:center;background:#3E5238;color:#FFFFFF;text-decoration:none;font-weight:900;font-size:15px;padding:14px 18px;border-radius:999px">Répondre dans The Bitter</a>
          <p style="font-size:12px;line-height:1.5;color:#8A8A82;margin:16px 0 0;text-align:center">
            Tu reçois cet e-mail parce que ces réponses t’attendent depuis quelques heures.
            Active les notifications de l’app pour être prévenu plus tôt.<br>
            <a href="${escapeHtml(unsubscribeUrl)}" style="color:#8A8A82">Ne plus recevoir ces e-mails</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

  const text = [
    hello,
    '',
    lead,
    '',
    ...messages.map(({ item, message }) => `- ${message.title}\n  ${message.body}\n  ${link(item.id)}`),
    '',
    `Ne plus recevoir ces e-mails : ${unsubscribeUrl}`,
  ].join('\n');

  return { subject, html, text };
};
