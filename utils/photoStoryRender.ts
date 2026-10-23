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
  SAFE_BOTTOM,
  SAFE_TOP,
  Size,
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

/** Le relevé : Film, Note, puis toutes les notes sur une ligne, façon Strava. */
function releveBlock(ctx: CanvasRenderingContext2D, data: PhotoStoryData): Block {
  const row = criteriaRowMetrics(data.criteria.length);
  const rowWidth = data.criteria.length * row.itemWidth + Math.max(0, data.criteria.length - 1) * row.gap;
  const title = fitTracked(ctx, data.title.toUpperCase() || 'SANS TITRE', 800, 75, 40, 0.04, 920);
  const width = Math.max(rowWidth, trackedWidth(ctx, title.text, title.tracking), 560);

  ctx.font = `500 25px ${FONT}`;
  const labels = data.criteria.map((c) => wrapLines(c.label, row.itemWidth - 6, 2, (s) => ctx.measureText(s).width));

  const bFilm = 26;
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
      c.fillStyle = 'rgba(255,255,255,0.86)';
      c.font = `500 29px ${FONT}`;
      c.fillText('Film', cx, bFilm);
      c.fillStyle = TEXT;
      c.font = `800 ${title.size}px ${FONT}`;
      drawTracked(c, title.text, cx, bTitle, title.tracking, 'center');

      c.fillStyle = 'rgba(255,255,255,0.86)';
      c.font = `500 29px ${FONT}`;
      c.fillText('Note', cx, bNote);
      c.fillStyle = TEXT;
      c.font = `700 117px ${FONT}`;
      const scoreW = c.measureText(data.note).width;
      const dotR = 9.5;
      const scoreX = cx - (8 + dotR * 2) / 2;
      c.fillText(data.note, scoreX, bScore);
      c.fillStyle = ACCENT;
      c.beginPath();
      c.arc(scoreX + scoreW / 2 + 8 + dotR, bScore - dotR, dotR, 0, Math.PI * 2);
      c.fill();

      const startX = cx - rowWidth / 2;
      data.criteria.forEach((criterion, i) => {
        const x = startX + i * (row.itemWidth + row.gap) + row.itemWidth / 2;
        c.fillStyle = 'rgba(255,255,255,0.88)';
        c.font = `500 25px ${FONT}`;
        const lines = labels[i];
        lines.forEach((line, k) => c.fillText(line, x, bLabels - (lines.length - 1 - k) * 30));
        c.fillStyle = TEXT;
        c.font = `700 ${row.valueSize}px ${FONT}`;
        c.fillText(criterion.value.toFixed(1), x, bValues);
      });

      c.font = `800 37px ${FONT}`;
      const brandW = trackedWidth(c, 'THE BITTER', 5.2);
      const brandX = cx - (brandW + 16) / 2;
      c.fillStyle = TEXT;
      drawTracked(c, 'THE BITTER', brandX, bBrand, 5.2, 'left');
      c.fillStyle = ACCENT;
      c.beginPath();
      c.arc(brandX + brandW + 10, bBrand - 5.5, 5.5, 0, Math.PI * 2);
      c.fill();
    },
  };
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

function blockFor(ctx: CanvasRenderingContext2D, layout: PhotoStoryLayout, data: PhotoStoryData) {
  return layout === 'releve' ? releveBlock(ctx, data) : seanceBlock(ctx, data);
}

/** Taille du bloc à l'échelle 1, pour placer et borner le sticker. */
export function measureBlock(layout: PhotoStoryLayout, data: PhotoStoryData): Size {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { width: 900, height: 640 };
  return blockFor(ctx, layout, data).size;
}

function shadowFor(c: CanvasRenderingContext2D, transparent: boolean) {
  c.shadowColor = transparent ? 'rgba(0,0,0,0.45)' : 'rgba(0,0,0,0.35)';
  c.shadowBlur = transparent ? 8 : 30;
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

  const block = blockFor(ctx, o.layout, o.data);
  const s = o.placement.scale;
  const w = block.size.width * s;
  const h = block.size.height * s;
  const left = o.placement.cx - w / 2;
  const top = o.placement.cy - h / 2;
  const a = veilAlpha(o.layout, sampleLuminance(ctx, left, top, w, h));

  if (o.layout === 'releve') {
    // Un halo sombre suit le bloc, où qu'on le pose.
    ctx.save();
    ctx.translate(o.placement.cx, o.placement.cy);
    ctx.scale(1, h / w);
    const g = ctx.createRadialGradient(0, 0, 0, 0, 0, w * 0.9);
    g.addColorStop(0, `rgba(0,0,0,${a.toFixed(3)})`);
    g.addColorStop(0.45, `rgba(0,0,0,${(a * 0.92).toFixed(3)})`);
    g.addColorStop(0.75, `rgba(0,0,0,${(a * 0.45).toFixed(3)})`);
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
    const top0 = ctx.createLinearGradient(0, 0, 0, 560);
    top0.addColorStop(0, 'rgba(0,0,0,0.38)');
    top0.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = top0;
    ctx.fillRect(0, 0, STORY_W, 560);
    drawSeanceFrame(ctx, o);
  }

  ctx.save();
  ctx.translate(left, top);
  ctx.scale(s, s);
  shadowFor(ctx, false);
  block.draw(ctx);
  ctx.restore();
  ctx.restore();
  return { left, top, width: w, height: h, size: block.size };
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
export function renderStickerOnly(layout: PhotoStoryLayout, data: PhotoStoryData): HTMLCanvasElement {
  const probe = document.createElement('canvas').getContext('2d');
  if (!probe) throw new Error('Canvas non supporté');
  const block = blockFor(probe, layout, data);
  const pad = 48;
  const canvas = document.createElement('canvas');
  canvas.width = Math.ceil(block.size.width + pad * 2);
  canvas.height = Math.ceil(block.size.height + pad * 2);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non supporté');
  ctx.translate(pad, pad);
  shadowFor(ctx, true);
  block.draw(ctx);
  return canvas;
}

export function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Image non générée'))), type, quality),
  );
}

