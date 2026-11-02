/**
 * Dessin de l'image « Partager mon mois » sur un canvas 1080 × 1920 (format
 * story). Deux images : le calendrier (la grille du mois, une affiche par jour
 * de séance) et le programme (une ligne par séance). Les données viennent de
 * utils/monthShare.ts ; les affiches sont chargées avec CORS, comme la story
 * photo, pour que le canvas reste exportable.
 */
import type { CinemaScreening } from '../types';
import { formatTime, localDay, monthGrid, type MonthShareOptions } from './monthShare';

const W = 1080;
const H = 1920;
const FONT = '"Inter", sans-serif';
const INK = '#1A1A1A';
const CREAM = '#FDFCF8';
const LIME = '#D9FF00';
const MUTE = '#8A8A8A';
const LINE = '#E9E4DA';

export interface MonthShareData {
  month: string;
  monthLabel: string;
  firstName: string;
  screenings: CinemaScreening[];
  posters: Map<string, HTMLImageElement | null>;
  language: string;
  now: number;
  labels: {
    kicker: string;
    count: string;
    next: string;
    weekdays: string[];
    weekdayOf: (ts: number) => string;
    pending: string;
    more: (n: number) => string;
    programmeKicker: string;
    programmeSub: string;
    invite: string;
  };
}

const path = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
};

/** L'image recadrée pour couvrir la zone, comme `object-fit: cover`. */
const cover = (ctx: CanvasRenderingContext2D, img: HTMLImageElement, x: number, y: number, w: number, h: number, focusY = 0.3) => {
  const scale = Math.max(w / img.naturalWidth, h / img.naturalHeight);
  const sw = w / scale;
  const sh = h / scale;
  const sx = (img.naturalWidth - sw) / 2;
  const sy = (img.naturalHeight - sh) * focusY;
  ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
};

const font = (ctx: CanvasRenderingContext2D, weight: number, size: number, spacing = 0) => {
  ctx.font = `${weight} ${size}px ${FONT}`;
  // Pas partout : sans `letterSpacing`, le titre est juste un peu plus large.
  if ('letterSpacing' in ctx) (ctx as CanvasRenderingContext2D & { letterSpacing: string }).letterSpacing = `${spacing}px`;
};

/** Le texte coupé avec « … » pour tenir dans la largeur. */
const fit = (ctx: CanvasRenderingContext2D, text: string, max: number) => {
  if (ctx.measureText(text).width <= max) return text;
  let cut = text;
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > max) cut = cut.slice(0, -1);
  return `${cut.trimEnd()}…`;
};

const where = (s: CinemaScreening, options: MonthShareOptions, language: string) =>
  [formatTime(s.startsAt, language), options.showCinema ? s.cinemaName : ''].filter(Boolean).join(' · ');

function drawCalendar(ctx: CanvasRenderingContext2D, data: MonthShareData, options: MonthShareOptions) {
  const { labels } = data;
  ctx.fillStyle = CREAM;
  ctx.fillRect(0, 0, W, H);
  const X = 66;
  const inner = W - X * 2;

  // En-tête : l'initiale, « Mes séances ciné · Micka », le mois en grand.
  ctx.fillStyle = LIME;
  ctx.beginPath();
  ctx.arc(X + 45, 147, 45, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = INK;
  font(ctx, 900, 36);
  ctx.textAlign = 'center';
  ctx.fillText((data.firstName || 'B')[0].toUpperCase(), X + 45, 160);
  ctx.textAlign = 'left';
  font(ctx, 800, 33);
  ctx.fillStyle = MUTE;
  ctx.fillText(fit(ctx, labels.kicker, inner - 120), X + 114, 159);
  font(ctx, 900, 150, -9);
  ctx.fillStyle = INK;
  ctx.fillText(data.monthLabel, X - 4, 352);
  font(ctx, 800, 39);
  const count = labels.count;
  const countW = ctx.measureText(count).width;
  ctx.fillStyle = LIME;
  path(ctx, X - 6, 386, countW + 30, 60, 16);
  ctx.fill();
  ctx.fillStyle = INK;
  ctx.fillText(count, X + 9, 430);

  // La grille : lundi en tête, une affiche sur chaque jour de séance.
  const cells = monthGrid(data.month, data.screenings, data.now);
  const rows = Math.ceil(cells.length / 7);
  const gap = 15;
  const cellW = (inner - gap * 6) / 7;
  const gridTop = 530;
  const gridBottom = data.screenings.length ? 1330 : 1700;
  const cellH = Math.min(cellW * 1.5, (gridBottom - gridTop - gap * (rows - 1)) / rows);
  font(ctx, 900, 27);
  ctx.fillStyle = MUTE;
  ctx.textAlign = 'center';
  labels.weekdays.forEach((d, i) => ctx.fillText(d, X + i * (cellW + gap) + cellW / 2, gridTop - 22));
  ctx.textAlign = 'left';
  cells.forEach((cell, i) => {
    if (!cell.day) return;
    const x = X + (i % 7) * (cellW + gap);
    const y = gridTop + Math.floor(i / 7) * (cellH + gap);
    const img = cell.screening?.posterUrl ? data.posters.get(cell.screening.posterUrl) : null;
    if (cell.screening) {
      ctx.save();
      ctx.globalAlpha = cell.past ? 0.5 : 1;
      path(ctx, x, y, cellW, cellH, 24);
      ctx.fillStyle = INK;
      ctx.fill();
      if (img) {
        ctx.clip();
        cover(ctx, img, x, y, cellW, cellH);
      }
      ctx.restore();
      // Le numéro du jour en pastille.
      font(ctx, 900, 27);
      const label = String(cell.day);
      const lw = Math.max(45, ctx.measureText(label).width + 20);
      ctx.fillStyle = cell.past ? '#FFFFFF' : LIME;
      path(ctx, x + 9, y + 9, lw, 45, 22.5);
      ctx.fill();
      ctx.fillStyle = INK;
      ctx.textAlign = 'center';
      ctx.fillText(label, x + 9 + lw / 2, y + 41);
      ctx.textAlign = 'left';
    } else {
      path(ctx, x, y, cellW, cellH, 24);
      ctx.fillStyle = cell.today ? '#FFFFFF' : 'rgba(26,26,26,0.04)';
      ctx.fill();
      if (cell.today) {
        ctx.lineWidth = 4.5;
        ctx.strokeStyle = INK;
        ctx.stroke();
      }
      font(ctx, 800, 27);
      ctx.fillStyle = cell.today ? INK : '#B5B0A6';
      ctx.fillText(String(cell.day), x + 15, y + 39);
    }
  });

  // Les prochaines séances : trois au plus.
  const next = data.screenings.filter((s) => s.startsAt >= data.now - 3 * 3_600_000).slice(0, 3);
  if (next.length) {
    let y = 1400;
    font(ctx, 900, 27, 4);
    ctx.fillStyle = MUTE;
    ctx.fillText(labels.next.toUpperCase(), X, y);
    y += 24;
    for (const s of next) {
      path(ctx, X, y, inner, 102, 40);
      ctx.fillStyle = '#FFFFFF';
      ctx.fill();
      ctx.lineWidth = 3;
      ctx.strokeStyle = LINE;
      ctx.stroke();
      const d = new Date(s.startsAt);
      ctx.textAlign = 'center';
      font(ctx, 900, 51, -2);
      ctx.fillStyle = INK;
      ctx.fillText(String(d.getDate()), X + 75, y + 60);
      font(ctx, 800, 24, 1);
      ctx.fillStyle = MUTE;
      ctx.fillText(labels.weekdayOf(s.startsAt).toUpperCase(), X + 75, y + 90);
      ctx.textAlign = 'left';
      font(ctx, 900, 36);
      ctx.fillStyle = INK;
      ctx.fillText(fit(ctx, s.title, inner - 190), X + 150, y + 50);
      font(ctx, 700, 30);
      ctx.fillStyle = MUTE;
      const sub = [where(s, options, data.language), s.status === 'pending' ? labels.pending : ''].filter(Boolean).join(' · ');
      ctx.fillText(fit(ctx, sub, inner - 190), X + 150, y + 88);
      y += 116;
    }
  }

  font(ctx, 900, 30);
  ctx.fillStyle = INK;
  ctx.fillText('The Bitter', X, 1860);
  ctx.textAlign = 'right';
  ctx.fillStyle = MUTE;
  ctx.fillText('thebitter.watch', W - X, 1860);
  ctx.textAlign = 'left';
}

function drawProgramme(ctx: CanvasRenderingContext2D, data: MonthShareData, options: MonthShareOptions) {
  const { labels } = data;
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, W, H);
  // Le fond : la première affiche, floutée.
  const lead = data.screenings.find((s) => s.posterUrl && data.posters.get(s.posterUrl));
  const leadImg = lead?.posterUrl ? data.posters.get(lead.posterUrl) : null;
  if (leadImg) {
    ctx.save();
    ctx.filter = 'blur(60px) saturate(1.2)';
    ctx.globalAlpha = 0.5;
    cover(ctx, leadImg, -120, -120, W + 240, H + 240, 0.2);
    ctx.restore();
  }
  const veil = ctx.createLinearGradient(0, 0, 0, H);
  veil.addColorStop(0, 'rgba(12,12,12,0.55)');
  veil.addColorStop(0.45, 'rgba(12,12,12,0.92)');
  veil.addColorStop(1, 'rgba(12,12,12,0.96)');
  ctx.fillStyle = veil;
  ctx.fillRect(0, 0, W, H);

  const X = 66;
  const inner = W - X * 2;
  font(ctx, 900, 30, 6);
  ctx.fillStyle = LIME;
  ctx.fillText(labels.programmeKicker.toUpperCase(), X, 132);
  font(ctx, 900, 156, -10);
  ctx.fillStyle = '#FFFFFF';
  ctx.fillText(data.monthLabel, X - 6, 290);
  font(ctx, 700, 36);
  ctx.fillStyle = 'rgba(255,255,255,0.65)';
  ctx.fillText(labels.programmeSub, X, 350);

  const MAX = 8;
  const shown = data.screenings.length > MAX ? data.screenings.slice(0, MAX - 1) : data.screenings;
  const rest = data.screenings.length - shown.length;
  const top = 420;
  const bottom = 1730 - (rest ? 70 : 0);
  const rowH = Math.min(200, (bottom - top) / Math.max(1, shown.length));
  const posterH = rowH - 24;
  const posterW = posterH / 1.5;
  shown.forEach((s, i) => {
    const y = top + i * rowH;
    if (i) {
      ctx.fillStyle = 'rgba(255,255,255,0.12)';
      ctx.fillRect(X, y, inner, 3);
    }
    const mid = y + rowH / 2;
    const d = new Date(s.startsAt);
    const past = localDay(s.startsAt) < localDay(data.now);
    ctx.globalAlpha = past ? 0.5 : 1;
    font(ctx, 900, Math.min(78, rowH * 0.45), -4);
    ctx.fillStyle = i === 0 && !past ? LIME : '#FFFFFF';
    ctx.fillText(String(d.getDate()), X, mid + 10);
    font(ctx, 900, 25, 3);
    ctx.fillStyle = 'rgba(255,255,255,0.5)';
    ctx.fillText(labels.weekdayOf(s.startsAt).toUpperCase(), X, mid + 44);
    const px = X + 130;
    const img = s.posterUrl ? data.posters.get(s.posterUrl) : null;
    ctx.save();
    path(ctx, px, mid - posterH / 2, posterW, posterH, 21);
    ctx.fillStyle = '#222';
    ctx.fill();
    if (img) {
      ctx.clip();
      cover(ctx, img, px, mid - posterH / 2, posterW, posterH);
    }
    ctx.restore();
    const tx = px + posterW + 36;
    const tw = W - X - tx;
    font(ctx, 900, 39, -1);
    ctx.fillStyle = '#FFFFFF';
    ctx.fillText(fit(ctx, s.title, tw), tx, mid - 6);
    font(ctx, 700, 30);
    ctx.fillStyle = 'rgba(255,255,255,0.6)';
    ctx.fillText(fit(ctx, where(s, options, data.language), tw), tx, mid + 36);
    if (s.status === 'pending') {
      font(ctx, 900, 22, 2);
      const tag = labels.pending.toUpperCase();
      const tagW = ctx.measureText(tag).width + 28;
      ctx.fillStyle = 'rgba(255,255,255,0.14)';
      path(ctx, tx, mid + 52, tagW, 40, 20);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.fillText(tag, tx + 14, mid + 80);
    }
    ctx.globalAlpha = 1;
  });
  if (rest) {
    font(ctx, 800, 33);
    ctx.fillStyle = 'rgba(255,255,255,0.65)';
    ctx.fillText(labels.more(rest), X, top + shown.length * rowH + 50);
  }

  font(ctx, 700, 33);
  ctx.fillStyle = 'rgba(255,255,255,0.75)';
  ctx.fillText(labels.invite, X, 1850);
  font(ctx, 900, 33);
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'right';
  ctx.fillText('The Bitter', W - X, 1850);
  ctx.textAlign = 'left';
}

export function drawMonthShare(data: MonthShareData, options: MonthShareOptions): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponible');
  ctx.textBaseline = 'alphabetic';
  if (options.variant === 'calendar') drawCalendar(ctx, data, options);
  else drawProgramme(ctx, data, options);
  return canvas;
}
