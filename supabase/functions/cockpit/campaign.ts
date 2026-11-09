/** Les trois formats d'e-mail et le brouillon demandé à l'IA. Module pur, testé. */

export const MAX_SUBJECT = 120;
export const MAX_BODY = 400;

export type Format = 'wall' | 'notes' | 'news';
export const isFormat = (value: unknown): value is Format => value === 'wall' || value === 'notes' || value === 'news';

export interface Film {
  title: string;
  poster: string | null;
}
export interface NoteRow extends Film {
  who: string;
  note: number;
}
export interface NewsItem {
  title: string;
  text: string;
}
export interface EmailContent {
  /** Films de sa liste, sinon vide : le mur prend alors les films populaires. */
  wall: Film[];
  best: (Film & { note: number }) | null;
  spaceNotes: NoteRow[];
  popular: Film[];
  news: NewsItem[];
  backdrop: string | null;
}
export interface EmailInput {
  format: Format;
  firstName: string;
  subject: string;
  line: string;
  appUrl: string;
  unsubscribeUrl: string;
  content: EmailContent;
}

const escapeHtml = (value: string) =>
  value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');

/** Seules les images TMDB entrent dans un e-mail, à la taille utile. */
export const tmdbImage = (url: string | null, size: string): string | null =>
  url && /^https:\/\/image\.tmdb\.org\/t\/p\/[a-z0-9]+\/[A-Za-z0-9_.-]+$/.test(url)
    ? url.replace(/\/t\/p\/[a-z0-9]+\//, `/t/p/${size}/`)
    : null;

/** La note affichée par l'app : la grille adaptative, sinon la moyenne des quatre critères. */
export function scoreOf(row: {
  adaptive_rating?: unknown;
  story?: unknown;
  visuals?: unknown;
  acting?: unknown;
  sound?: unknown;
}): number | null {
  const weighted = Number((row.adaptive_rating as { weightedRating?: unknown } | null)?.weightedRating);
  if (Number.isFinite(weighted) && row.adaptive_rating) return weighted;
  const values = [row.story, row.visuals, row.acting, row.sound].map(Number);
  if (values.some((value) => !Number.isFinite(value))) return null;
  return Math.round((values.reduce((sum, value) => sum + value, 0) / 4) * 10) / 10;
}

export const frenchNote = (note: number) => note.toFixed(1).replace('.', ',');

/** Un changelog raconte trop : l'e-mail garde sa première phrase. */
export function shortNews(text: string, max = 90): string {
  const first = text.trim().split(/(?<=[.!?…])\s/)[0] ?? '';
  return first.length <= max ? first : `${first.slice(0, max - 1).trimEnd()}…`;
}

const FONT = "Inter,-apple-system,'Segoe UI',Arial,sans-serif";

const posterCell = (film: Film, width: number, radius: number, size: string) => {
  const src = tmdbImage(film.poster, size);
  return src
    ? `<img src="${escapeHtml(src)}" width="${width}" alt="${escapeHtml(film.title)}" style="display:block;width:100%;max-width:${width}px;height:auto;border-radius:${radius}px">`
    : '';
};

const posterGrid = (films: Film[], columns: number, gap: number, caption: boolean, muted: string) => {
  const cells = films
    .slice(0, columns)
    .map(
      (film, index) => `<td width="${Math.floor(100 / columns)}%" valign="top" style="padding:0 ${index < columns - 1 ? gap : 0}px 0 0">
        ${posterCell(film, Math.floor(480 / columns), columns > 3 ? 9 : 12, 'w342')}
        ${caption ? `<div style="font-size:12px;line-height:1.2;font-weight:800;margin-top:7px;color:${muted}">${escapeHtml(film.title)}</div>` : ''}
      </td>`
    )
    .join('');
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="table-layout:fixed"><tr>${cells}</tr></table>`;
};

const button = (label: string, url: string) =>
  `<a href="${escapeHtml(url)}" style="display:block;text-align:center;background:#D9FF00;color:#111111;text-decoration:none;font-weight:900;font-size:12px;letter-spacing:.12em;text-transform:uppercase;padding:18px;border-radius:999px">${escapeHtml(label)}</a>`;

const footer = (url: string, color: string) =>
  `<p style="font-size:12px;line-height:1.45;color:${color};margin:18px 0 0;text-align:center">Tu as accepté les nouvelles de The Bitter.<br><a href="${escapeHtml(url)}" style="color:${color}">Ne plus recevoir ces e-mails</a></p>`;

const label = (text: string, color: string) =>
  `<div style="font-size:11px;font-weight:900;letter-spacing:.2em;text-transform:uppercase;color:${color}">${escapeHtml(text)}</div>`;

const heading = (text: string) =>
  `<h1 style="margin:16px 0 18px;font-size:38px;line-height:1.02;font-weight:900;letter-spacing:-.04em">${escapeHtml(text)}</h1>`;

const shell = (subject: string, dark: boolean, top: string, inner: string) => {
  const bg = dark ? '#0C0C0C' : '#FDFCF8';
  const color = dark ? '#FFFFFF' : '#1A1A1A';
  return `<!doctype html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="${dark ? 'dark' : 'light'}"><title>${escapeHtml(subject)}</title></head>
<body style="margin:0;padding:0;background:${bg};font-family:${FONT};color:${color}">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${bg}" style="background:${bg}"><tr><td align="center">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;color:${color}">${top}<tr><td style="padding:26px 20px">${inner}</td></tr></table>
  </td></tr></table>
</body></html>`;
};

const paragraph = (text: string, color: string) =>
  text ? `<p style="margin:18px 0 0;font-size:16px;line-height:1.35;font-weight:700;color:${color}">${escapeHtml(text)}</p>` : '';

/** Rend null quand ce format n'a rien à montrer à cette personne. */
export function buildEmail(input: EmailInput): { subject: string; html: string; text: string } | null {
  const { format, firstName, subject, line, appUrl, unsubscribeUrl, content } = input;
  const named = (text: string, end: string) => (firstName ? `${text}, ${firstName}${end}` : `${text}${end}`);
  const plain = (title: string, lines: string[], cta: string) => ({
    subject,
    text: `${title}\n\n${lines.filter(Boolean).join('\n')}\n\n${cta} : ${appUrl}\n\nTu as accepté les nouvelles de The Bitter.\nNe plus recevoir ces e-mails : ${unsubscribeUrl}`,
  });

  if (format === 'wall') {
    const own = content.wall.filter((film) => tmdbImage(film.poster, 'w342')).slice(0, 3);
    const films = own.length ? own : content.popular.filter((film) => tmdbImage(film.poster, 'w342')).slice(0, 3);
    if (!films.length) return null;
    const title = own.length
      ? named(`${own.length} film${own.length > 1 ? 's attendent' : ' attend'} ta note`, '.')
      : named('Par quoi tu commences', ' ?');
    const inner = `${label('The Bitter', '#6B6B64')}${heading(title)}${posterGrid(films, 3, 8, true, '#1A1A1A')}${paragraph(line, '#4A4A46')}<div style="margin-top:20px">${button('Noter mes films', appUrl)}</div>${footer(unsubscribeUrl, '#6B6B64')}`;
    return { ...plain(title, [...films.map((film) => `- ${film.title}`), line], 'Noter mes films'), html: shell(subject, false, '', inner) };
  }

  if (format === 'notes') {
    const best = content.best;
    if (!best || !tmdbImage(best.poster, 'w342')) return null;
    const rows = content.spaceNotes
      .slice(0, 3)
      .map(
        (row) => `<tr><td width="52" style="padding:9px 12px 9px 0;border-top:1px solid #2A2A28">${posterCell(row, 40, 7, 'w154')}</td>
        <td style="padding:9px 0;border-top:1px solid #2A2A28"><div style="font-size:14px;font-weight:900">${escapeHtml(row.title)}</div><div style="font-size:12px;font-weight:700;color:#D6D3D1">${escapeHtml(row.who)}</div></td>
        <td align="right" style="padding:9px 0;border-top:1px solid #2A2A28;font-size:24px;font-weight:900">${frenchNote(row.note)}</td></tr>`
      )
      .join('');
    const spaces = rows
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="#1A1A19" style="background:#1A1A19;border-radius:22px;margin-top:18px"><tr><td style="padding:14px 16px 6px">
          <div style="font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#A8A29E;padding-bottom:9px">Dans tes espaces</div>
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="color:#FFFFFF">${rows}</table>
        </td></tr></table>`
      : '';
    const hero = `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:18px"><tr>
      <td width="150" valign="bottom">${posterCell(best, 150, 16, 'w342')}</td>
      <td valign="bottom" style="padding-left:16px">
        <div style="font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#A8A29E">Ta meilleure note</div>
        <div style="font-size:76px;line-height:.95;font-weight:900;letter-spacing:-.06em;margin:6px 0">${frenchNote(best.note)}</div>
        <div style="font-size:18px;line-height:1.15;font-weight:900">${escapeHtml(best.title)}</div>
      </td></tr></table>`;
    const inner = `${label('The Bitter · ton mois', '#A8A29E')}${hero}${paragraph(line, '#D6D3D1')}${spaces}<div style="margin-top:18px">${button('Voir et donner ma note', appUrl)}</div>${footer(unsubscribeUrl, '#A8A29E')}`;
    const title = `Ta meilleure note : ${best.title}, ${frenchNote(best.note)}`;
    return {
      ...plain(title, [line, ...content.spaceNotes.slice(0, 3).map((row) => `${row.title} : ${frenchNote(row.note)} (${row.who})`)], 'Voir et donner ma note'),
      html: shell(subject, true, '', inner),
    };
  }

  const news = content.news.slice(0, 3);
  const films = content.popular.filter((film) => tmdbImage(film.poster, 'w342')).slice(0, 4);
  if (!news.length) return null;
  const styles = [
    ['#3E5238', '#FFFFFF'],
    ['#1A1A1A', '#FFFFFF'],
    ['#F2EFE9', '#1A1A1A'],
  ];
  const cards = news
    .map(
      (item, index) => `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" bgcolor="${styles[index][0]}" style="background:${styles[index][0]};border-radius:18px;margin-bottom:8px"><tr><td style="padding:14px 16px;color:${styles[index][1]}">
        <div style="font-size:16px;line-height:1.2;font-weight:900">${escapeHtml(item.title)}</div>
        <div style="font-size:13px;line-height:1.3;font-weight:600;margin-top:3px">${escapeHtml(item.text)}</div>
      </td></tr></table>`
    )
    .join('');
  const backdrop = tmdbImage(content.backdrop, 'w780');
  const top = backdrop ? `<tr><td><img src="${escapeHtml(backdrop)}" width="520" alt="" style="display:block;width:100%;height:auto"></td></tr>` : '';
  const title = named('Quoi de neuf', ' ?');
  const posters = films.length
    ? `<div style="font-size:10px;font-weight:900;letter-spacing:.16em;text-transform:uppercase;color:#6B6B64;margin:18px 0 10px">À ne pas rater</div>${posterGrid(films, 4, 7, false, '#1A1A1A')}`
    : '';
  const inner = `${label('The Bitter', '#6B6B64')}${heading(title)}${cards}${paragraph(line, '#4A4A46')}${posters}<div style="margin-top:20px">${button('Ouvrir The Bitter', appUrl)}</div>${footer(unsubscribeUrl, '#6B6B64')}`;
  return { ...plain(title, [...news.map((item) => `${item.title} : ${item.text}`), line], 'Ouvrir The Bitter'), html: shell(subject, false, top, inner) };
}

const SEGMENTS: Record<string, string> = {
  active: 'des personnes qui ont noté au moins un film ces 30 derniers jours',
  never: 'des personnes qui ont créé un compte mais n’ont encore noté aucun film',
  asleep: 'des personnes qui ont noté au moins 5 films mais plus rien depuis 30 jours',
  trial: 'des personnes qui ont essayé (moins de 5 notes) puis arrêté depuis 30 jours',
};
export const isSegment = (value: unknown): value is 'active' | 'never' | 'asleep' | 'trial' =>
  typeof value === 'string' && value in SEGMENTS;

const REQUESTS: Record<string, string> = {
  write: 'Propose un objet et une phrase d’accroche.',
  shorter: 'Raccourcis cette phrase sans perdre son idée.',
  warmer: 'Rends cette phrase plus chaleureuse, sans en faire trop.',
};

/** Aucune donnée personnelle ici : l'IA ne reçoit que la description du groupe. */
export function draftMessages(segment: string, mode: string, subject: string, body: string) {
  const system = `Tu écris pour The Bitter, une app française où l'on note les films qu'on voit, critère par critère. L'e-mail s'adresse à ${SEGMENTS[segment] ?? SEGMENTS.never}. Les affiches et les notes sont déjà dans l'e-mail : tu n'écris que l'objet et une phrase d'accroche.

RÈGLES :
- En français, en tutoyant, ton simple et direct. Une seule phrase de 20 mots maximum.
- N'invente aucune fonctionnalité, aucun chiffre, aucun titre de film, aucune promotion.
- Pas d'émoji, pas de salutation, pas de signature.
- Objet de 60 caractères maximum, sans point d'exclamation.

Réponds UNIQUEMENT par un objet JSON de la forme {"subject":"...","body":"..."}.`;
  const current = subject || body ? `\n\nActuel :\nObjet : ${subject}\nPhrase : ${body}` : '';
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
