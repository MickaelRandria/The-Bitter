/**
 * Dessin d'une affiche « Mon année » en 1080 × 1920, le format story d'Instagram.
 *
 * Reproduit la maquette validée (https://claude.ai/artifact/Cbc43V46ffpMssqxHAnVPs) :
 * affiche du film en plein cadre, couronne de festival, titre géant en Anton,
 * générique de film en Antonio. Tout est dessiné à la main dans un canvas pour
 * que l'image partagée soit identique sur tous les téléphones.
 */

export type PosterVariant = 'affiche' | 'revelation' | 'navet';

export interface PosterSegment {
  text: string;
  /** small = mot de liaison, big = information, lime = l'information mise en avant. */
  tone: 'small' | 'big' | 'lime';
}

export interface PosterSpec {
  variant: PosterVariant;
  /** Images de fond, essayées dans l'ordre. */
  imageUrls: string[];
  presents: string;
  byline: string;
  laurel: { label: string; title: string; score: string };
  sub: string;
  title: string;
  /** Lignes du générique. */
  bill: PosterSegment[][];
  foot: string;
}

const W = 1080;
const H = 1920;
const LIME = '#D9FF00';

// ── Polices ─────────────────────────────────────────────────────────────────

let fontsPromise: Promise<void> | null = null;

/** Anton et Antonio sont servies par le site (public/fonts), Inter est déjà chargée par l'app. */
export function ensurePosterFonts(): Promise<void> {
  if (fontsPromise) return fontsPromise;
  fontsPromise = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return;
    const faces: [string, string, FontFaceDescriptors][] = [
      ['Anton', '/fonts/anton-latin.woff2', { weight: '400' }],
      ['Antonio', '/fonts/antonio-latin.woff2', { weight: '100 700' }],
    ];
    const work = Promise.all([
      ...faces.map(async ([family, url, descriptors]) => {
        try {
          const face = new FontFace(family, `url(${url}) format('woff2')`, descriptors);
          await face.load();
          document.fonts.add(face);
        } catch {
          // Police de secours : l'affiche reste lisible, en moins fidèle.
        }
      }),
      document.fonts.load('300 40px "Inter"'),
      document.fonts.load('italic 300 40px "Inter"'),
      document.fonts.load('500 28px "Inter"'),
      document.fonts.load('600 34px "Inter"'),
    ]).catch(() => undefined);
    await Promise.race([work, new Promise((resolve) => window.setTimeout(resolve, 6000))]);
  })();
  return fontsPromise;
}

const DISPLAY = '"Anton", "Impact", "Arial Narrow", sans-serif';
const BILL = '"Antonio", "Arial Narrow", sans-serif';
const BODY = '"Inter", system-ui, sans-serif';

// ── Outils de dessin ────────────────────────────────────────────────────────

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      resolve(result);
    };
    const timer = window.setTimeout(() => finish(null), 12000);
    image.onload = () => finish(image.naturalWidth > 0 ? image : null);
    image.onerror = () => finish(null);
    image.src = url;
  });

/** Largeur d'un texte espacé : `tracking` en pixels entre chaque lettre. */
const trackedWidth = (ctx: CanvasRenderingContext2D, text: string, tracking: number) => {
  const chars = [...text];
  return chars.reduce((w, c) => w + ctx.measureText(c).width, 0) + tracking * Math.max(0, chars.length - 1);
};

/** Dessine un texte espacé à partir de `x` (bord gauche), sur la ligne de base `y`. */
const drawTracked = (ctx: CanvasRenderingContext2D, text: string, x: number, y: number, tracking: number) => {
  if (!tracking) {
    ctx.fillText(text, x, y);
    return;
  }
  let cursor = x;
  for (const c of text) {
    ctx.fillText(c, cursor, y);
    cursor += ctx.measureText(c).width + tracking;
  }
};

/** Texte centré, réduit jusqu'à tenir dans `maxWidth`. Rend la taille retenue. */
const drawCenteredFit = (
  ctx: CanvasRenderingContext2D,
  text: string,
  y: number,
  font: (size: number) => string,
  size: number,
  trackingEm: number,
  maxWidth: number,
  minSize = size * 0.5
) => {
  let s = size;
  ctx.font = font(s);
  while (s > minSize && trackedWidth(ctx, text, s * trackingEm) > maxWidth) {
    s -= 1;
    ctx.font = font(s);
  }
  const width = trackedWidth(ctx, text, s * trackingEm);
  drawTracked(ctx, text, W / 2 - width / 2, y, s * trackingEm);
  return s;
};

const drawCover = (ctx: CanvasRenderingContext2D, image: HTMLImageElement) => {
  const scale = Math.max(W / image.naturalWidth, H / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  // Une affiche 2:3 remplit exactement la hauteur : on rogne les côtés, et le haut reste visible.
  ctx.drawImage(image, (W - w) / 2, (H - h) * 0.2, w, h);
};

const verticalShade = (ctx: CanvasRenderingContext2D, stops: [number, number][]) => {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  for (const [at, alpha] of stops) g.addColorStop(at, `rgba(0,0,0,${alpha})`);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
};

const ellipseGradient = (
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  stops: [number, string][]
) => {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(1, ry / rx);
  const g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
  for (const [at, color] of stops) g.addColorStop(at, color);
  ctx.fillStyle = g;
  ctx.fillRect(-rx, -rx, rx * 2, rx * 2);
  ctx.restore();
};

const applyGrain = (ctx: CanvasRenderingContext2D) => {
  const tile = document.createElement('canvas');
  tile.width = tile.height = 256;
  const t = tile.getContext('2d');
  if (!t) return;
  const data = t.createImageData(256, 256);
  for (let i = 0; i < data.data.length; i += 4) {
    const v = Math.random() * 255;
    data.data[i] = data.data[i + 1] = data.data[i + 2] = v;
    data.data[i + 3] = 255;
  }
  t.putImageData(data, 0, 0);
  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.14;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, W, H);
  ctx.restore();
};

// ── Couronne de festival ────────────────────────────────────────────────────

const LAUREL = { x: (W - 560) / 2, y: 896, w: 560, h: 298 };

/** Deux branches de feuilles le long d'un arc, dessinées dans un repère 470 × 250. */
const drawLaurel = (ctx: CanvasRenderingContext2D, flip: boolean) => {
  const cx = 235;
  const cy = 122;
  const R = 128;
  const N = 12;
  const D = Math.PI / 180;
  ctx.save();
  ctx.translate(LAUREL.x, LAUREL.y);
  ctx.scale(LAUREL.w / 470, LAUREL.h / 250);
  if (flip) {
    ctx.translate(0, 250);
    ctx.scale(1, -1);
  }
  const leaf = (x: number, y: number, rot: number, rx: number, ry: number, alpha: number) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rot * D);
    ctx.beginPath();
    ctx.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.fill();
    ctx.restore();
  };
  for (const side of [-1, 1]) {
    ctx.beginPath();
    for (let k = 0; k < N; k++) {
      const th = (102 + (k / (N - 1)) * 128) * D;
      let sx = cx + Math.cos(th) * R;
      const sy = cy + Math.sin(th) * R * 0.86;
      if (side > 0) sx = 2 * cx - sx;
      if (k === 0) ctx.moveTo(sx, sy);
      else ctx.lineTo(sx, sy);
    }
    ctx.strokeStyle = 'rgba(255,255,255,0.75)';
    ctx.lineWidth = 2.4;
    ctx.lineCap = 'round';
    ctx.stroke();
    for (let k = 0; k < N; k++) {
      const t = k / (N - 1);
      const th = (102 + t * 128) * D;
      const tang = Math.atan2(Math.cos(th), -Math.sin(th)) / D;
      const s = 1 - t * 0.38;
      let ox = cx + Math.cos(th) * (R + 13);
      const oy = cy + Math.sin(th) * (R + 13) * 0.86;
      let ix = cx + Math.cos(th) * (R - 11);
      const iy = cy + Math.sin(th) * (R - 11) * 0.86;
      let ro = tang - 90 - 32;
      let ri = tang - 90 + 32;
      if (side > 0) {
        ox = 2 * cx - ox;
        ix = 2 * cx - ix;
        ro = -ro;
        ri = -ri;
      }
      leaf(ox, oy, ro + 180, 8.5 * s, 21 * s, 0.95);
      leaf(ix, iy, ri + 180, 7.65 * s, 18.9 * s, 0.7);
    }
  }
  ctx.restore();
};

/**
 * Le titre du film dans la couronne : une ligne s'il tient à 34 px au moins,
 * sinon deux lignes coupées après « : » ou sur l'espace le plus proche du milieu.
 */
const laurelTitleLines = (
  ctx: CanvasRenderingContext2D,
  title: string,
  font: (size: number) => string,
  maxWidth: number
): string[] => {
  ctx.font = font(34);
  if (trackedWidth(ctx, title, 34 * 0.06) <= maxWidth || !title.includes(' ')) return [title];
  const colon = title.indexOf(' : ') >= 0 ? title.indexOf(' : ') : title.indexOf(': ');
  if (colon > 0) {
    const head = title.slice(0, colon).trim();
    const tail = title.slice(colon).replace(/^\s*:\s*/, '').trim();
    if (head && tail) return [head, tail];
  }
  const middle = title.length / 2;
  let best = -1;
  for (let i = 0; i < title.length; i++) {
    if (title[i] === ' ' && (best < 0 || Math.abs(i - middle) < Math.abs(best - middle))) best = i;
  }
  return [title.slice(0, best), title.slice(best + 1)];
};

// ── Générique ───────────────────────────────────────────────────────────────

const BILL_TOP = 1676;
const BILL_STEP = 47;
const BILL_MAX = W - 120;

const segmentFont = (tone: PosterSegment['tone'], f: number) =>
  tone === 'small' ? `300 ${26 * f}px ${BILL}` : `600 ${40 * f}px ${BILL}`;
const segmentTracking = (tone: PosterSegment['tone'], f: number) => (tone === 'small' ? 26 * 0.08 : 40 * 0.015) * f;

const lineWidth = (ctx: CanvasRenderingContext2D, line: PosterSegment[], f: number) =>
  line.reduce((w, seg, i) => {
    ctx.font = segmentFont(seg.tone, f);
    const gap = i === 0 ? 0 : 26 * 0.4 * f;
    return w + gap + trackedWidth(ctx, seg.text.toUpperCase(), segmentTracking(seg.tone, f));
  }, 0);

const drawBill = (ctx: CanvasRenderingContext2D, lines: PosterSegment[][]) => {
  lines.forEach((line, index) => {
    let f = 1;
    while (f > 0.6 && lineWidth(ctx, line, f) > BILL_MAX) f -= 0.02;
    let x = W / 2 - lineWidth(ctx, line, f) / 2;
    const y = BILL_TOP + index * BILL_STEP;
    line.forEach((seg, i) => {
      if (i > 0) x += 26 * 0.4 * f;
      ctx.font = segmentFont(seg.tone, f);
      ctx.fillStyle = seg.tone === 'small' ? 'rgba(255,255,255,0.72)' : seg.tone === 'lime' ? LIME : 'rgba(255,255,255,0.9)';
      const text = seg.text.toUpperCase();
      const tracking = segmentTracking(seg.tone, f);
      // Les mots de liaison remontent un peu, comme sur un vrai générique d'affiche.
      drawTracked(ctx, text, x, seg.tone === 'small' ? y - 26 * 0.22 * f : y, tracking);
      x += trackedWidth(ctx, text, tracking);
    });
  });
};

// ── Affiche ─────────────────────────────────────────────────────────────────

export async function renderYearPoster(spec: PosterSpec): Promise<string> {
  await ensurePosterFonts();
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non supporté');
  ctx.textBaseline = 'alphabetic';
  ctx.textAlign = 'left';

  ctx.fillStyle = '#050403';
  ctx.fillRect(0, 0, W, H);

  let image: HTMLImageElement | null = null;
  for (const url of spec.imageUrls) {
    image = await loadImage(url);
    if (image) break;
  }
  if (image) {
    drawCover(ctx, image);
    if (spec.variant === 'navet') {
      // Couleurs passées : le navet a pris la poussière. `ctx.filter` manque à Safari, le mode de fusion non.
      ctx.save();
      ctx.globalCompositeOperation = 'saturation';
      ctx.fillStyle = 'rgba(128,128,128,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    }
  } else {
    ellipseGradient(ctx, W / 2, H * 0.35, W, H * 0.5, [[0, '#2a2622'], [1, '#050403']]);
  }

  verticalShade(
    ctx,
    spec.variant === 'affiche'
      ? [[0, 0.72], [0.22, 0], [0.4, 0], [0.56, 0.55], [0.74, 0.96], [1, 1]]
      : [[0, 0.78], [0.2, 0.2], [0.34, 0.12], [0.5, 0.62], [0.68, 0.95], [1, 1]]
  );

  // En-tête
  ctx.fillStyle = '#FFFFFF';
  drawCenteredFit(ctx, spec.presents.toUpperCase(), 186, (s) => `500 ${s}px ${BODY}`, 28, 0.42, 900);
  ctx.fillStyle = 'rgba(255,255,255,0.86)';
  drawCenteredFit(ctx, spec.byline, 246, (s) => `italic 300 ${s}px ${BODY}`, 40, 0, 900);

  // Couronne
  ellipseGradient(ctx, W / 2, LAUREL.y + LAUREL.h / 2, (LAUREL.w - 80) / 2, (LAUREL.h - 20) / 2, [
    [0, 'rgba(0,0,0,0.55)'],
    [1, 'rgba(0,0,0,0)'],
  ]);
  drawLaurel(ctx, spec.variant === 'navet');
  // Couronne à l'envers : les branches se rejoignent en haut, le texte descend d'autant.
  const flipped = spec.variant === 'navet';
  const textTop = LAUREL.y + (flipped ? 110 : 77);
  const inner = flipped ? 0.86 : 1;
  const titleFont = (size: number) => `700 ${size}px ${BILL}`;
  const titleMax = 250 * inner;
  const titleLines = laurelTitleLines(ctx, spec.laurel.title.toUpperCase(), titleFont, titleMax);
  // Sur deux lignes, le bloc remonte à peine : plus haut, le libellé toucherait les feuilles.
  const top = textTop - (titleLines.length - 1) * 8;
  ctx.fillStyle = 'rgba(255,255,255,0.82)';
  drawCenteredFit(ctx, spec.laurel.label.toUpperCase(), top + 18, (s) => `600 ${s}px ${BILL}`, 21, 0.24, 196 * inner, 13);
  ctx.fillStyle = '#FFFFFF';
  const lineSize = titleLines.length > 1 ? 33 : 46;
  titleLines.forEach((line, i) => {
    drawCenteredFit(ctx, line, top + 21 + 10 + lineSize * 0.87 + i * (lineSize + 1), titleFont, lineSize, 0.06, titleMax, 22);
  });
  ctx.fillStyle = LIME;
  const scoreTop = top + 21 + 10 + titleLines.length * (lineSize + 1) + 4;
  drawCenteredFit(ctx, spec.laurel.score, scoreTop + 58, (s) => `400 ${s}px ${DISPLAY}`, 64, 0, 250, 36);

  // Sous-titre et titre géant
  ctx.fillStyle = 'rgba(255,255,255,0.9)';
  drawCenteredFit(ctx, spec.sub, 1252, (s) => `300 ${s}px ${BODY}`, 40, 0, 960);
  ctx.fillStyle = '#FFFFFF';
  let size = 350;
  ctx.font = `400 ${size}px ${DISPLAY}`;
  while (size > 160 && trackedWidth(ctx, spec.title, -size * 0.01) > 980) {
    size -= 4;
    ctx.font = `400 ${size}px ${DISPLAY}`;
  }
  const cap = ctx.measureText('H').actualBoundingBoxAscent || size * 0.86;
  const titleWidth = trackedWidth(ctx, spec.title, -size * 0.01);
  // Le haut des capitales reste au même endroit quelle que soit la taille retenue.
  drawTracked(ctx, spec.title, W / 2 - titleWidth / 2, 1292 + cap + (350 - size) * 0.45, -size * 0.01);

  drawBill(ctx, spec.bill.slice(0, 4));

  // Pied
  ctx.fillStyle = 'rgba(255,255,255,0.5)';
  ctx.font = `400 21px ${BODY}`;
  drawTracked(ctx, spec.foot.toUpperCase(), 70, 1860, 21 * 0.08);
  ctx.font = `600 34px ${BODY}`;
  ctx.fillStyle = '#FFFFFF';
  const mark = 'The Bitter';
  const markWidth = trackedWidth(ctx, mark, -34 * 0.02);
  const dot = 34 * 0.24;
  const markX = W - 70 - markWidth - dot - 2;
  drawTracked(ctx, mark, markX, 1862, -34 * 0.02);
  ctx.fillStyle = LIME;
  ctx.beginPath();
  ctx.arc(markX + markWidth + 2 + dot / 2, 1862 - dot / 2, dot / 2, 0, Math.PI * 2);
  ctx.fill();

  // Matière
  ellipseGradient(ctx, W / 2, H * 0.45, W * 1.2, H * 0.9, [
    [0, 'rgba(0,0,0,0)'],
    [0.55, 'rgba(0,0,0,0)'],
    [1, 'rgba(0,0,0,0.55)'],
  ]);
  applyGrain(ctx);

  return canvas.toDataURL('image/png');
}
