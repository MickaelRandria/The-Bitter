/** L'e-mail d'une campagne et le brouillon demandé à l'IA. Module pur, testé. */

export const MAX_SUBJECT = 120;
export const MAX_BODY = 2_000;

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

export interface CampaignEmailInput {
  firstName: string;
  subject: string;
  body: string;
  appUrl: string;
  unsubscribeUrl: string;
}

export function buildCampaignEmail({ firstName, subject, body, appUrl, unsubscribeUrl }: CampaignEmailInput) {
  const hello = firstName ? `Salut ${firstName},` : 'Salut,';
  const paragraphs = body.trim().split(/\n\s*\n/).map((part) => part.trim()).filter(Boolean);
  const footer = 'Tu reçois cet e-mail parce que tu as accepté les nouvelles de The Bitter.';
  const html = `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:#FDFCF8;font-family:Inter,-apple-system,'Segoe UI',Arial,sans-serif;color:#1A1A1A">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#FDFCF8"><tr><td align="center" style="padding:24px 16px">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#FFFFFF;border:1px solid #E7E4DC;border-radius:20px"><tr><td style="padding:24px">
      <div style="font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:#6B6B64">The Bitter</div>
      <p style="font-size:16px;line-height:1.5;margin:16px 0 8px">${escapeHtml(hello)}</p>
      ${paragraphs.map((part) => `<p style="font-size:15px;line-height:1.5;margin:0 0 12px;color:#4A4A46">${escapeHtml(part).replace(/\n/g, '<br>')}</p>`).join('\n      ')}
      <a href="${escapeHtml(appUrl)}" style="display:block;margin-top:16px;text-align:center;background:#3E5238;color:#FFFFFF;text-decoration:none;font-weight:900;font-size:15px;padding:14px 18px;border-radius:999px">Ouvrir The Bitter</a>
      <p style="font-size:12px;line-height:1.5;color:#6B6B64;margin:16px 0 0;text-align:center">${footer}<br><a href="${escapeHtml(unsubscribeUrl)}" style="color:#6B6B64">Ne plus recevoir ces e-mails</a></p>
    </td></tr></table>
  </td></tr></table>
</body></html>`;
  const text = `${hello}\n\n${paragraphs.join('\n\n')}\n\nOuvrir The Bitter : ${appUrl}\n\n${footer}\nNe plus recevoir ces e-mails : ${unsubscribeUrl}`;
  return { subject, html, text };
}

const SEGMENTS: Record<string, string> = {
  never: 'des personnes qui ont créé un compte mais n’ont encore noté aucun film',
  asleep: 'des personnes qui ont noté au moins 5 films mais plus rien depuis 30 jours',
  trial: 'des personnes qui ont essayé (moins de 5 notes) puis arrêté depuis 30 jours',
};
export const isSegment = (value: unknown): value is 'never' | 'asleep' | 'trial' =>
  typeof value === 'string' && value in SEGMENTS;

const REQUESTS: Record<string, string> = {
  write: 'Rédige un nouveau message.',
  shorter: 'Raccourcis ce message sans perdre son idée.',
  warmer: 'Rends ce message plus chaleureux, sans en faire trop.',
};

/** Aucune donnée personnelle ici : l'IA ne reçoit que la description du groupe. */
export function draftMessages(segment: string, mode: string, subject: string, body: string) {
  const system = `Tu écris un e-mail court pour The Bitter, une app française où l'on note les films qu'on voit, critère par critère. Il s'adresse à ${SEGMENTS[segment] ?? SEGMENTS.never}.

RÈGLES :
- En français, en tutoyant, ton simple et direct. 60 mots maximum, deux paragraphes au plus.
- Une seule idée et une seule action : revenir noter un film.
- N'invente aucune fonctionnalité, aucun chiffre, aucune promotion.
- Pas d'émoji, pas de formule de salutation ni de signature : elles sont ajoutées automatiquement.
- Objet de 60 caractères maximum, sans point d'exclamation.

Réponds UNIQUEMENT par un objet JSON de la forme {"subject":"...","body":"..."}.`;
  const current = subject || body ? `\n\nMessage actuel :\nObjet : ${subject}\n${body}` : '';
  return [
    { role: 'system', content: system },
    { role: 'user', content: `${REQUESTS[mode] ?? REQUESTS.write}${current}` },
  ];
}

export function parseDraft(raw: string): { subject: string; body: string } | null {
  try {
    const parsed = JSON.parse(raw);
    const subject = typeof parsed?.subject === 'string' ? parsed.subject.trim().slice(0, MAX_SUBJECT) : '';
    const body = typeof parsed?.body === 'string' ? parsed.body.trim().slice(0, MAX_BODY) : '';
    return subject && body ? { subject, body } : null;
  } catch {
    return null;
  }
}
