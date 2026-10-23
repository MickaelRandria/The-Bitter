/**
 * Dessin des stories avec photo (« La séance », « Le relevé ») sur un canvas
 * 1080 × 1920. La géométrie et les règles sont dans utils/photoStory.ts.
 *
 * La photo ne quitte jamais le téléphone : elle est décodée et dessinée ici,
 * et seule l'image finale part dans la feuille de partage du système.
 */
import {
  PhotoFraming,
  PhotoStoryLayout,
  ReleveStyle,
  SAFE_BOTTOM,
  SAFE_TOP,
  Size,
  StickerColor,
  StickerPlacement,
  STORY_H,
  STORY_W,
  coverRect,
  criteriaRowMetrics,
  veilAlpha,
  wrapLines,
} from './photoStory';

export interface PhotoStoryData {
  title: string;
  /** « DRAME · 2024 · LUCA GUADAGNINO » */
  meta: string;
  /** Note affichée, déjà formatée (« 7.0 »). */
  note: string;
  criteria: { label: string; value: number }[];
  review: string;
  /** « 13.09.26 », absent quand on ne connaît pas la date. */
  dateLabel: string | null;
  /** Le verdict en un mot (« VALIDÉ »), tiré de la note. */
  verdict: string;
}

/** Une photo prête à dessiner : déjà décodée, tournée et réduite. */
export type StoryPhoto = HTMLCanvasElement;

type RGB = [number, number, number];
export interface PosterTones {
  shadow: RGB;
  highlight: RGB;
}

const TEXT = '#FFFFFF';
const TEXT_WARM = '#F4F2EC';
const ACCENT = '#D9FF00';
const FONT = '"Inter", sans-serif';
/** Plus grand côté gardé en mémoire : assez pour zoomer, sans saturer un vieux téléphone. */
const PHOTO_MAX_SIDE = 2400;

// ── Chargement ────────────────────────────────────────────────────────────────

/** Décode la photo choisie, dans le bon sens (EXIF), réduite à une taille raisonnable. */
export async function loadPhotoFile(file: File): Promise<StoryPhoto> {
  let source: ImageBitmap | HTMLImageElement;
  let width: number;
  let height: number;
  try {
    const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
    source = bitmap;
    width = bitmap.width;
    height = bitmap.height;
  } catch {
    const url = URL.createObjectURL(file);
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error('Photo illisible'));
        image.src = url;
      });
      source = img;
      width = img.naturalWidth;
      height = img.naturalHeight;
    } finally {
      URL.revokeObjectURL(url);
    }
  }
  if (!width || !height) throw new Error('Photo illisible');
  const ratio = Math.min(1, PHOTO_MAX_SIDE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * ratio);
  canvas.height = Math.round(height * ratio);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non supporté');
  ctx.drawImage(source, 0, 0, canvas.width, canvas.height);
  if ('close' in source) source.close();
  return canvas;
}

export function loadImage(url: string, timeoutMs = 10000): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (value: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(value);
    };
    const timer = window.setTimeout(() => finish(null), timeoutMs);
    img.onload = () => finish(img.naturalWidth > 0 ? img : null);
    img.onerror = () => finish(null);
    img.src = url;
  });
}

export async function ensureStoryFonts(sample: string) {
  if (!('fonts' in document)) return;
  await Promise.all([
    document.fonts.load(`500 29px ${FONT}`, 'Film Note'),
    document.fonts.load(`600 200px ${FONT}`, '0123456789.'),
    document.fonts.load(`700 60px ${FONT}`, sample || 'THE BITTER'),
    document.fonts.load(`800 75px ${FONT}`, sample || 'THE BITTER'),
    document.fonts.load(`400 28px ${FONT}`, 'Scénario'),
  ]).catch(() => undefined);
  await document.fonts.ready;
}

// ── Étalonnage « couleurs du film » ───────────────────────────────────────────

const DEFAULT_TONES: PosterTones = { shadow: [16, 40, 36], highlight: [242, 210, 176] };

/**
 * Les deux teintes de l'affiche : la moyenne de ses tons sombres et celle de
 * ses tons clairs. Elles servent au virage des ombres et des hautes lumières.
 */
export function posterTones(poster: HTMLImageElement | null): PosterTones {
  if (!poster) return DEFAULT_TONES;
  try {
    const w = 48;
    const h = 72;
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return DEFAULT_TONES;
    ctx.drawImage(poster, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const pixels: { l: number; c: RGB }[] = [];
    for (let i = 0; i < data.length; i += 4) {
      const c: RGB = [data[i], data[i + 1], data[i + 2]];
      pixels.push({ l: c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722, c });
    }
    pixels.sort((a, b) => a.l - b.l);
    const quarter = Math.max(1, Math.floor(pixels.length / 4));
    const mean = (list: { c: RGB }[]): RGB => {
      const sum = list.reduce<RGB>((acc, p) => [acc[0] + p.c[0], acc[1] + p.c[1], acc[2] + p.c[2]], [0, 0, 0]);
      return [sum[0] / list.length, sum[1] / list.length, sum[2] / list.length];
    };
    // Les ombres d'une affiche sont souvent presque noires : on garde leur
    // teinte en remontant leur luminosité, sinon le virage ne se voit pas.
    const lift = (c: RGB, target: number): RGB => {
      const l = c[0] * 0.2126 + c[1] * 0.7152 + c[2] * 0.0722 || 1;
      const k = Math.max(1, target / l);
      return [Math.min(255, c[0] * k), Math.min(255, c[1] * k), Math.min(255, c[2] * k)];
    };
    return {
      shadow: lift(mean(pixels.slice(0, quarter)), 40),
      highlight: lift(mean(pixels.slice(-quarter)), 200),
    };
  } catch {
    // Affiche servie sans CORS : le canvas est « teinté » et illisible.
    return DEFAULT_TONES;
  }
}

/**
 * Étalonnage maison, calculé une fois par photo : saturation contenue, courbe
 * en S douce, ombres virées vers la teinte sombre de l'affiche et hautes
 * lumières vers sa teinte claire. Le vignettage et le grain viennent au rendu.
 */
export function gradePhoto(photo: StoryPhoto, tones: PosterTones): StoryPhoto {
  const out = document.createElement('canvas');
  out.width = photo.width;
  out.height = photo.height;
  const ctx = out.getContext('2d');
  if (!ctx) return photo;
  ctx.drawImage(photo, 0, 0);
  const image = ctx.getImageData(0, 0, out.width, out.height);
  const d = image.data;
  const [sr, sg, sb] = tones.shadow.map((v) => (v / 255) * 1.2);
  const [hr, hg, hb] = tones.highlight.map((v) => v / 255);
  const curve = (v: number) => {
    const x = Math.min(1, Math.max(0, v));
    return x + 0.288 * (x - 0.5) * (1 - Math.abs(2 * x - 1));
  };
  for (let i = 0; i < d.length; i += 4) {
    let r = d[i] / 255;
    let g = d[i + 1] / 255;
    let b = d[i + 2] / 255;
    const l0 = r * 0.2126 + g * 0.7152 + b * 0.0722;
    r = curve(l0 + (r - l0) * 0.72);
    g = curve(l0 + (g - l0) * 0.72);
    b = curve(l0 + (b - l0) * 0.72);
    const l = Math.min(1, Math.max(0, r * 0.2126 + g * 0.7152 + b * 0.0722));
    const ws = (1 - l) * (1 - l) * 0.42;
    const wh = l * l * 0.22;
    const keep = 1 - ws - wh;
    d[i] = Math.min(255, Math.max(0, (r * keep + sr * ws + hr * wh) * 255));
    d[i + 1] = Math.min(255, Math.max(0, (g * keep + sg * ws + hg * wh) * 255));
    d[i + 2] = Math.min(255, Math.max(0, (b * keep + sb * ws + hb * wh) * 255));
  }
  ctx.putImageData(image, 0, 0);
  return out;
}

// ── Texte ─────────────────────────────────────────────────────────────────────

/** Texte espacé (letter-spacing) aligné à gauche, au centre ou à droite de x. */
function trackedWidth(ctx: CanvasRenderingContext2D, text: string, tracking: number) {
  const chars = Array.from(text);
  return chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + Math.max(0, chars.length - 1) * tracking;
}

function drawTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  align: 'left' | 'center' | 'right' = 'left',
) {
  const width = trackedWidth(ctx, text, tracking);
  let cursor = align === 'left' ? x : align === 'center' ? x - width / 2 : x - width;
  const previous = ctx.textAlign;
  ctx.textAlign = 'left';
  for (const c of Array.from(text)) {
    ctx.fillText(c, cursor, y);
    cursor += ctx.measureText(c).width + tracking;
  }
  ctx.textAlign = previous;
  return width;
}

/** Réduit la taille jusqu'à ce que le texte tienne, puis coupe avec « … ». */
function fitTracked(
  ctx: CanvasRenderingContext2D,
  text: string,
  weight: number,
  size: number,
  minSize: number,
  trackingEm: number,
  maxWidth: number,
) {
  let s = size;
  ctx.font = `${weight} ${s}px ${FONT}`;
  while (trackedWidth(ctx, text, s * trackingEm) > maxWidth && s > minSize) {
    s -= 2;
    ctx.font = `${weight} ${s}px ${FONT}`;
  }
  let t = text;
  while (trackedWidth(ctx, t, s * trackingEm) > maxWidth && t.length > 1) {
    t = `${t.slice(0, -2).trimEnd()}…`;
  }
  return { text: t, size: s, tracking: s * trackingEm };
}

// ── Les deux blocs, dessinés autour de (0, 0) = coin haut gauche ─────────────

interface Block {
  size: Size;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/** Style, couleur et verdict du sticker du relevé. */
export interface StickerLook {
  style: ReleveStyle;
  color: StickerColor;
  /** Le verdict en un mot, dans une pastille au-dessus du bloc. */
  verdict: boolean;
}

export const DEFAULT_LOOK: StickerLook = { style: 'ligne', color: 'blanc', verdict: true };

interface Palette {
  fg: string;
  soft: string;
  note: string;
  dot: string;
  /** Contour du point quand il serait trop pâle sur une photo claire. */
  ring: string | null;
  shadow: boolean;
  badgeFill: string;
  badgeEdge: string;
}

const PALETTES: Record<StickerColor, Palette> = {
  blanc: { fg: TEXT, soft: 'rgba(255,255,255,0.86)', note: TEXT, dot: ACCENT, ring: null, shadow: true, badgeFill: 'rgba(0,0,0,0.28)', badgeEdge: 'rgba(255,255,255,0.55)' },
  noir: { fg: '#0c0c0c', soft: 'rgba(12,12,12,0.72)', note: '#0c0c0c', dot: ACCENT, ring: '#0c0c0c', shadow: false, badgeFill: 'rgba(255,255,255,0.5)', badgeEdge: 'rgba(12,12,12,0.6)' },
  accent: { fg: TEXT, soft: 'rgba(255,255,255,0.86)', note: ACCENT, dot: TEXT, ring: null, shadow: true, badgeFill: 'rgba(0,0,0,0.32)', badgeEdge: 'rgba(255,255,255,0.5)' },
};

function dot(c: CanvasRenderingContext2D, x: number, y: number, r: number, pal: Palette) {
  c.fillStyle = pal.dot;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
  if (pal.ring) {
    c.strokeStyle = pal.ring;
    c.lineWidth = Math.max(2, r * 0.4);
    c.stroke();
  }
}

/** La pastille du verdict : un contour, le point de la marque, le mot. */
function verdictPill(ctx: CanvasRenderingContext2D, word: string) {
  ctx.font = `900 31px ${FONT}`;
  const tw = trackedWidth(ctx, word, 5);
  const width = tw + 37 * 2 + 16 + 14;
  const height = 64;
  return {
    width,
    height,
    draw: (c: CanvasRenderingContext2D, cx: number, top: number, pal: Palette) => {
      const x = cx - width / 2;
      c.save();
      c.shadowColor = 'transparent';
      c.beginPath();
      roundRectPath(c, x, top, width, height, height / 2);
      c.strokeStyle = pal.fg;
      c.lineWidth = 4;
      c.stroke();
      c.restore();
      dot(c, x + 37 + 8, top + height / 2, 8, pal);
      c.fillStyle = pal.fg;
      c.font = `900 31px ${FONT}`;
      drawTracked(c, word, x + 37 + 16 + 14, top + height / 2 + 11, 5, 'left');
    },
  };
}

/** Le relevé, style Ligne : Film, Note, puis toutes les notes sur une ligne. */
function releveLigne(ctx: CanvasRenderingContext2D, data: PhotoStoryData, look: StickerLook): Block {
  const pal = PALETTES[look.color];
  const row = criteriaRowMetrics(data.criteria.length);
  const rowWidth = data.criteria.length * row.itemWidth + Math.max(0, data.criteria.length - 1) * row.gap;
  const pill = look.verdict ? verdictPill(ctx, data.verdict) : null;
  const title = fitTracked(ctx, data.title.toUpperCase() || 'SANS TITRE', 800, 75, 40, 0.04, 920);
  const width = Math.max(rowWidth, trackedWidth(ctx, title.text, title.tracking), pill?.width ?? 0, 560);

  ctx.font = `500 25px ${FONT}`;
  const labels = data.criteria.map((c) => wrapLines(c.label, row.itemWidth - 6, 2, (s) => ctx.measureText(s).width));

  const shift = pill ? pill.height + 53 : 0;
  const bFilm = shift + 26;
  const bTitle = bFilm + 14 + title.size * 0.73;
  const bNote = bTitle + 58 + 26;
  const bScore = bNote + 14 + 117 * 0.73;
  const bLabels = bScore + 72 + 56;
  const bValues = bLabels + 12 + row.valueSize * 0.73;
  const bBrand = bValues + 72 + 27;
  const height = bBrand + 8;
  const cx = width / 2;

  return {
    size: { width, height },
    draw: (c) => {
      c.textAlign = 'center';
      c.textBaseline = 'alphabetic';
      pill?.draw(c, cx, 0, pal);
      c.textAlign = 'center';
      c.fillStyle = pal.soft;
      c.font = `500 29px ${FONT}`;
      c.fillText('Film', cx, bFilm);
      c.fillStyle = pal.fg;
      c.font = `800 ${title.size}px ${FONT}`;
      drawTracked(c, title.text, cx, bTitle, title.tracking, 'center');

      c.fillStyle = pal.soft;
      c.font = `500 29px ${FONT}`;
      c.fillText('Note', cx, bNote);
      c.fillStyle = pal.note;
      c.font = `700 117px ${FONT}`;
      const scoreW = c.measureText(data.note).width;
      const dotR = 9.5;
      const scoreX = cx - (8 + dotR * 2) / 2;
      c.fillText(data.note, scoreX, bScore);
      dot(c, scoreX + scoreW / 2 + 8 + dotR, bScore - dotR, dotR, pal);

      const startX = cx - rowWidth / 2;
      data.criteria.forEach((criterion, i) => {
        const x = startX + i * (row.itemWidth + row.gap) + row.itemWidth / 2;
        c.textAlign = 'center';
        c.fillStyle = pal.soft;
        c.font = `500 25px ${FONT}`;
        const lines = labels[i];
        lines.forEach((line, k) => c.fillText(line, x, bLabels - (lines.length - 1 - k) * 30));
        c.fillStyle = pal.fg;
        c.font = `700 ${row.valueSize}px ${FONT}`;
        c.fillText(criterion.value.toFixed(1), x, bValues);
      });

      c.font = `800 37px ${FONT}`;
      const brandW = trackedWidth(c, 'THE BITTER', 5.2);
      const brandX = cx - (brandW + 16) / 2;
      c.fillStyle = pal.fg;
      drawTracked(c, 'THE BITTER', brandX, bBrand, 5.2, 'left');
      dot(c, brandX + brandW + 10, bBrand - 5.5, 5.5, pal);
    },
  };
}

/** Style Compact : le titre et une grosse note, rien d'autre. */
function releveCompact(ctx: CanvasRenderingContext2D, data: PhotoStoryData, look: StickerLook): Block {
  const pal = PALETTES[look.color];
  const pill = look.verdict ? verdictPill(ctx, data.verdict) : null;
  const title = fitTracked(ctx, data.title.toUpperCase() || 'SANS TITRE', 800, 53, 32, 0.06, 920);
  ctx.font = `700 224px ${FONT}`;
  const scoreW = ctx.measureText(data.note).width;
  const width = Math.max(trackedWidth(ctx, title.text, title.tracking), scoreW + 11 + 30, pill?.width ?? 0, 420);
  const shift = pill ? pill.height + 40 : 0;
  const bTitle = shift + title.size * 0.73;
  const bScore = bTitle + 44 + 224 * 0.73;
  const bBrand = bScore + 56 + 20;
  const height = bBrand + 8;
  const cx = width / 2;
  return {
    size: { width, height },
    draw: (c) => {
      c.textBaseline = 'alphabetic';
      pill?.draw(c, cx, 0, pal);
      c.fillStyle = pal.fg;
      c.font = `800 ${title.size}px ${FONT}`;
      drawTracked(c, title.text, cx, bTitle, title.tracking, 'center');
      c.textAlign = 'left';
      c.fillStyle = pal.note;
      c.font = `700 224px ${FONT}`;
      const x = cx - (scoreW + 11 + 30) / 2;
      c.fillText(data.note, x, bScore);
      dot(c, x + scoreW + 11 + 15, bScore - 15, 15, pal);
      c.fillStyle = pal.soft;
      c.font = `800 27px ${FONT}`;
      drawTracked(c, 'THE BITTER', cx, bBrand, 5.4, 'center');
    },
  };
}

/** Style Badge : un carré flouté à coller dans un coin. */
const BADGE = 363;
function releveBadge(ctx: CanvasRenderingContext2D, data: PhotoStoryData, look: StickerLook): Block {
  const pal = PALETTES[look.color];
  const title = fitTracked(ctx, data.title.toUpperCase() || 'SANS TITRE', 800, 24, 24, 0.12, BADGE - 74);
  return {
    size: { width: BADGE, height: BADGE },
    draw: (c) => {
      c.textBaseline = 'alphabetic';
      c.save();
      c.shadowColor = 'rgba(0,0,0,0.22)';
      c.shadowBlur = 30;
      c.shadowOffsetY = 8;
      c.beginPath();
      roundRectPath(c, 0, 0, BADGE, BADGE, 69);
      c.fillStyle = pal.badgeFill;
      c.fill();
      c.restore();
      c.save();
      c.shadowColor = 'transparent';
      c.beginPath();
      roundRectPath(c, 2, 2, BADGE - 4, BADGE - 4, 67);
      c.strokeStyle = pal.badgeEdge;
      c.lineWidth = 4;
      c.stroke();
      c.restore();
      c.textAlign = 'left';
      c.fillStyle = pal.fg;
      c.font = `800 45px ${FONT}`;
      const bW = c.measureText('B').width;
      c.fillText('B', 37, 37 + 33);
      dot(c, 37 + bW + 7, 37 + 28, 5.5, pal);
      c.fillStyle = pal.note;
      c.font = `700 133px ${FONT}`;
      c.fillText(data.note, 34, BADGE - 37 - 24 - 30);
      c.fillStyle = pal.fg;
      c.font = `800 ${title.size}px ${FONT}`;
      drawTracked(c, title.text, 37, BADGE - 37, title.tracking);
    },
  };
}

function releveBlock(ctx: CanvasRenderingContext2D, data: PhotoStoryData, look: StickerLook): Block {
  if (look.style === 'compact') return releveCompact(ctx, data, look);
  if (look.style === 'badge') return releveBadge(ctx, data, look);
  return releveLigne(ctx, data, look);
}

/** La séance : titre, infos, avis, note géante et critères sur deux colonnes. */
function seanceBlock(ctx: CanvasRenderingContext2D, data: PhotoStoryData): Block {
  const width = 898;
  const title = fitTracked(ctx, data.title.toUpperCase() || 'SANS TITRE', 700, 59, 36, 0.08, width);
  const meta = fitTracked(ctx, data.meta, 500, 23, 16, 0.16, width - 40);
  ctx.font = `500 31px ${FONT}`;
  const review = data.review.trim()
    ? wrapLines(`« ${data.review.trim()} »`, 800, 3, (s) => ctx.measureText(s).width)
    : [];

  const rows = Math.ceil(data.criteria.length / 2);
  const bTitle = title.size * 0.73;
  const bMeta = bTitle + 20 + 17;
  const bReviewFirst = bMeta + 32 + 23;
  const bReviewLast = bReviewFirst + Math.max(0, review.length - 1) * 43;
  const bScore = (review.length ? bReviewLast : bMeta) + 32 + 203 * 0.73;
  const bFirstRow = bScore + 43 + 21;
  const height = bFirstRow + (rows - 1) * 41 + 10;

  return {
    size: { width, height },
    draw: (c) => {
      c.textAlign = 'left';
      c.textBaseline = 'alphabetic';
      c.fillStyle = TEXT_WARM;
      c.font = `700 ${title.size}px ${FONT}`;
      drawTracked(c, title.text, 0, bTitle, title.tracking);
      c.fillStyle = 'rgba(244,242,236,0.68)';
      c.font = `500 ${meta.size}px ${FONT}`;
      drawTracked(c, meta.text, 0, bMeta, meta.tracking);
      c.fillStyle = 'rgba(244,242,236,0.92)';
      c.font = `500 31px ${FONT}`;
      review.forEach((line, i) => c.fillText(line, 0, bReviewFirst + i * 43));

      c.fillStyle = TEXT_WARM;
      c.font = `600 203px ${FONT}`;
      const scoreW = c.measureText(data.note).width;
      c.fillText(data.note, 0, bScore);
      c.fillStyle = ACCENT;
      c.beginPath();
      c.arc(scoreW + 11 + 12, bScore - 12, 12, 0, Math.PI * 2);
      c.fill();

      data.criteria.forEach((criterion, i) => {
        const col = i % 2;
        const x = col * (400 + 53);
        const y = bFirstRow + Math.floor(i / 2) * 41;
        c.textAlign = 'left';
        c.fillStyle = TEXT_WARM;
        c.font = `400 28px ${FONT}`;
        let label = criterion.label;
        while (c.measureText(label).width > 320 && label.length > 2) label = `${label.slice(0, -2)}…`;
        c.fillText(label, x, y);
        c.textAlign = 'right';
        c.fillStyle = ACCENT;
        c.font = `800 28px ${FONT}`;
        c.fillText(criterion.value.toFixed(1), x + 400, y);
      });
      c.textAlign = 'left';
    },
  };
}

function blockFor(ctx: CanvasRenderingContext2D, layout: PhotoStoryLayout, data: PhotoStoryData, look: StickerLook) {
  return layout === 'releve' ? releveBlock(ctx, data, look) : seanceBlock(ctx, data);
}

/** Taille du bloc à l'échelle 1, pour placer et borner le sticker. */
export function measureBlock(layout: PhotoStoryLayout, data: PhotoStoryData, look: StickerLook = DEFAULT_LOOK): Size {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: 900, height: 640 };
  return blockFor(ctx, layout, data, look).size;
}

function shadowFor(c: CanvasRenderingContext2D, transparent: boolean, look?: StickerLook) {
  if (look && !PALETTES[look.color].shadow) {
    // Texte noir sur photo claire : une ombre le salirait.
    c.shadowColor = 'transparent';
    return;
  }
  // Le halo est léger : c'est l'ombre des lettres qui tient la lisibilité.
  c.shadowColor = transparent ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.55)';
  c.shadowBlur = transparent ? 8 : 26;
  c.shadowOffsetY = 3;
}

// ── Rendu complet ─────────────────────────────────────────────────────────────

export interface RenderOptions {
  layout: PhotoStoryLayout;
  data: PhotoStoryData;
  photo: StoryPhoto | null;
  framing: PhotoFraming;
  placement: StickerPlacement;
  poster: HTMLImageElement | null;
  /** Vignettage et grain, avec la photo déjà étalonnée. */
  filmLook: boolean;
  /** Séance allégée : le bloc seul, sans logo, affiche ni signature. */
  light?: boolean;
  /** Style, couleur et verdict du relevé. */
  look?: StickerLook;
}

let grainTile: HTMLCanvasElement | null = null;
function grain(): HTMLCanvasElement {
  if (grainTile) return grainTile;
  const tile = document.createElement('canvas');
  tile.width = 128;
  tile.height = 128;
  const t = tile.getContext('2d');
  if (t) {
    const img = t.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) {
      const n = Math.random() * 255;
      img.data[i] = n;
      img.data[i + 1] = n;
      img.data[i + 2] = n;
      img.data[i + 3] = 22;
    }
    t.putImageData(img, 0, 0);
  }
  grainTile = tile;
  return tile;
}

/** Luminosité moyenne (0-1) d'une zone du canvas, échantillonnée en grille. */
function sampleLuminance(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
  const sx = Math.max(0, Math.floor(x));
  const sy = Math.max(0, Math.floor(y));
  const sw = Math.max(1, Math.min(STORY_W - sx, Math.floor(w)));
  const sh = Math.max(1, Math.min(STORY_H - sy, Math.floor(h)));
  try {
    const data = ctx.getImageData(sx, sy, sw, sh).data;
    let sum = 0;
    let n = 0;
    for (let i = 0; i < data.length; i += 4 * 37) {
      sum += data[i] * 0.2126 + data[i + 1] * 0.7152 + data[i + 2] * 0.0722;
      n += 1;
    }
    return n ? sum / n / 255 : 0.3;
  } catch {
    return 0.3;
  }
}

/** Dessine la story complète dans un canvas 1080 × 1920. Rend la boîte du bloc. */
export function renderPhotoStory(canvas: HTMLCanvasElement, o: RenderOptions) {
  canvas.width = STORY_W;
  canvas.height = STORY_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non supporté');
  ctx.save();
  ctx.fillStyle = '#111111';
  ctx.fillRect(0, 0, STORY_W, STORY_H);

  if (o.photo) {
    const r = coverRect({ width: o.photo.width, height: o.photo.height }, o.framing);
    ctx.drawImage(o.photo, r.x, r.y, r.width, r.height);
  }

  if (o.filmLook) {
    const pattern = ctx.createPattern(grain(), 'repeat');
    if (pattern) {
      ctx.save();
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = pattern;
      ctx.fillRect(0, 0, STORY_W, STORY_H);
      ctx.restore();
    }
    const v = ctx.createRadialGradient(STORY_W / 2, STORY_H / 2, STORY_H * 0.3, STORY_W / 2, STORY_H / 2, STORY_H * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.38)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
  }

  const look = o.look ?? DEFAULT_LOOK;
  const block = blockFor(ctx, o.layout, o.data, look);
  const s = o.placement.scale;
  const w = block.size.width * s;
  const h = block.size.height * s;
  const left = o.placement.cx - w / 2;
  const top = o.placement.cy - h / 2;
  const luminance = sampleLuminance(ctx, left, top, w, h);
  const a = veilAlpha(o.layout, luminance);

  if (o.layout === 'releve' && look.style === 'badge') {
    // Le badge floute la photo derrière lui (là où le navigateur sait flouter un canvas).
    if (o.photo && 'filter' in ctx) {
      const r = coverRect({ width: o.photo.width, height: o.photo.height }, o.framing);
      ctx.save();
      ctx.beginPath();
      roundRectPath(ctx, left, top, w, h, 69 * s);
      ctx.clip();
      ctx.filter = 'blur(24px)';
      ctx.drawImage(o.photo, r.x, r.y, r.width, r.height);
      ctx.restore();
    }
  } else if (o.layout === 'releve' && look.color === 'noir') {
    // Texte noir : la photo est claire, on la laisse telle quelle.
  } else if (o.layout === 'releve') {
    // Un halo sombre suit le bloc, où qu'on le pose.
    ctx.save();
    ctx.translate(o.placement.cx, o.placement.cy);
    ctx.scale(1, h / w);
    // Large et très progressif : il assombrit sans dessiner de forme.
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 1.15);
    g.addColorStop(0, `rgba(0,0,0,${a.toFixed(3)})`);
    g.addColorStop(0.35, `rgba(0,0,0,${(a * 0.8).toFixed(3)})`);
    g.addColorStop(0.65, `rgba(0,0,0,${(a * 0.35).toFixed(3)})`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(-STORY_W * 2, -STORY_H * 2, STORY_W * 4, STORY_H * 4);
    ctx.restore();
  } else {
    // Bandeau vert sapin derrière le bloc ; posé en bas, il descend jusqu'au bord.
    const t = (x: number) => `rgba(0,14,11,${Math.min(1, x).toFixed(3)})`;
    const lowHalf = o.placement.cy > STORY_H / 2;
    const g = ctx.createLinearGradient(0, top - h * 0.7, 0, lowHalf ? STORY_H : top + h * 1.6);
    g.addColorStop(0, t(0));
    g.addColorStop(0.32, t(a * 0.9));
    g.addColorStop(lowHalf ? 0.7 : 0.6, t(a));
    g.addColorStop(1, lowHalf ? t(a + 0.06) : t(0));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, STORY_W, STORY_H);
    if (!o.light) {
      const top0 = ctx.createLinearGradient(0, 0, 0, 560);
      top0.addColorStop(0, 'rgba(0,0,0,0.38)');
      top0.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = top0;
      ctx.fillRect(0, 0, STORY_W, 560);
      drawSeanceFrame(ctx, o);
    }
  }

  ctx.save();
  ctx.translate(left, top);
  ctx.scale(s, s);
  shadowFor(ctx, false, o.layout === 'releve' ? look : undefined);
  block.draw(ctx);
  ctx.restore();
  ctx.restore();
  return { left, top, width: w, height: h, size: block.size, luminance };
}

/** roundRect manque aux Safari d'avant la 16 : on trace le chemin à la main. */
function roundRectPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Logo, affiche en vignette avec la date, et signature : fixes sur la séance. */
function drawSeanceFrame(ctx: CanvasRenderingContext2D, o: RenderOptions) {
  const y = SAFE_TOP + 27;
  ctx.save();
  ctx.textBaseline = 'alphabetic';
  ctx.shadowColor = 'rgba(0,0,0,0.42)';
  ctx.shadowBlur = 6;
  ctx.fillStyle = TEXT_WARM;
  ctx.font = `700 85px ${FONT}`;
  const bW = ctx.measureText('B').width;
  ctx.fillText('B', 91, y + 66);
  ctx.fillStyle = ACCENT;
  ctx.beginPath();
  ctx.arc(91 + bW + 11, y + 58, 8, 0, Math.PI * 2);
  ctx.fill();

  if (o.poster) {
    const pw = 139;
    const ph = 208;
    const px = STORY_W - 80 - pw;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 40;
    ctx.shadowOffsetY = 18;
    ctx.beginPath();
    roundRectPath(ctx, px, y, pw, ph, 11);
    ctx.fillStyle = '#000';
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    roundRectPath(ctx, px, y, pw, ph, 11);
    ctx.clip();
    const sc = Math.max(pw / o.poster.naturalWidth, ph / o.poster.naturalHeight);
    const dw = o.poster.naturalWidth * sc;
    const dh = o.poster.naturalHeight * sc;
    ctx.drawImage(o.poster, px + (pw - dw) / 2, y + (ph - dh) / 2, dw, dh);
    ctx.restore();
    ctx.strokeStyle = 'rgba(244,242,236,0.35)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    roundRectPath(ctx, px, y, pw, ph, 11);
    ctx.stroke();
    if (o.data.dateLabel) {
      ctx.fillStyle = 'rgba(244,242,236,0.82)';
      ctx.font = `600 20px ${FONT}`;
      drawTracked(ctx, `VU LE ${o.data.dateLabel}`, px + pw, y + ph + 40, 3.6, 'right');
    }
  }

  const baseline = STORY_H - SAFE_BOTTOM - 36;
  ctx.font = `700 27px ${FONT}`;
  ctx.fillStyle = TEXT_WARM;
  const brandW = drawTracked(ctx, 'THE BITTER', STORY_W - 91, baseline, 3.8, 'right');
  ctx.fillStyle = ACCENT;
  ctx.shadowBlur = 0;
  ctx.fillRect(STORY_W - 91 - brandW - 21 - 32, baseline - 12, 32, 4);
  ctx.restore();
}

/**
 * Le sticker seul, sur fond transparent, recadré au plus près : à coller sur
 * une vidéo dans Instagram.
 */
export function renderStickerOnly(
  layout: PhotoStoryLayout,
  data: PhotoStoryData,
  look: StickerLook = DEFAULT_LOOK,
): HTMLCanvasElement {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('Canvas non supporté');
  const block = blockFor(probe, layout, data, look);
  const pad = 48;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(block.size.width + pad * 2);
  canvas.height = Math.ceil(block.size.height + pad * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non supporté');
  ctx.translate(pad, pad);
  shadowFor(ctx, true, layout === 'releve' ? look : undefined);
  block.draw(ctx);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image non générée'))), type, quality),
  );
}

