/**
 * Stories avec la photo de l'utilisateur : « La séance » et « Le relevé ».
 *
 * Ici, uniquement la géométrie et les règles, sans canvas ni import, pour être
 * testées sous Node (tests/photoStory.test.mjs). Le dessin vit dans
 * utils/photoStoryRender.ts.
 */

export type PhotoStoryLayout = 'seance' | 'releve';

export const STORY_W = 1080;
export const STORY_H = 1920;
/**
 * Bandes recouvertes par Instagram : la barre de progression et le profil en
 * haut, le champ « Envoyer un message » en bas. Rien d'important n'y va.
 */
export const SAFE_TOP = 250;
export const SAFE_BOTTOM = 220;

/** Le bloc de textes se déplace et se redimensionne comme un sticker. */
export interface StickerPlacement {
  /** Centre du bloc, en pixels de la story. */
  cx: number;
  cy: number;
  scale: number;
}

export const STICKER_MIN_SCALE = 0.55;
export const STICKER_MAX_SCALE = 1.25;
/** Distance sous laquelle le bloc s'aimante sur l'axe vertical du milieu. */
export const SNAP_DISTANCE = 28;

export interface Size {
  width: number;
  height: number;
}

export const clamp = (value: number, min: number, max: number) =>
  Math.min(max, Math.max(min, value));

/** Placement de départ : au milieu pour le relevé, en bas pour la séance. */
export function defaultPlacement(layout: PhotoStoryLayout, box: Size): StickerPlacement {
  if (layout === 'releve') return { cx: STORY_W / 2, cy: 915, scale: 1 };
  // La séance pose son bloc au-dessus de la signature, calé à gauche.
  return { cx: STORY_W / 2, cy: STORY_H - SAFE_BOTTOM - 150 - box.height / 2, scale: 1 };
}

/**
 * Garde le bloc dans la zone visible : il peut frôler les bords, jamais passer
 * sous les bandes d'Instagram. Trop grand pour tenir, il reste centré.
 */
export function clampPlacement(p: StickerPlacement, box: Size): StickerPlacement {
  const scale = clamp(p.scale, STICKER_MIN_SCALE, STICKER_MAX_SCALE);
  const halfW = (box.width * scale) / 2;
  const halfH = (box.height * scale) / 2;
  const minX = halfW + 24;
  const maxX = STORY_W - halfW - 24;
  const minY = SAFE_TOP + halfH;
  const maxY = STORY_H - SAFE_BOTTOM - halfH;
  return {
    scale,
    cx: minX > maxX ? STORY_W / 2 : clamp(p.cx, minX, maxX),
    cy: minY > maxY ? (SAFE_TOP + STORY_H - SAFE_BOTTOM) / 2 : clamp(p.cy, minY, maxY),
  };
}

/** Aimante le centre du bloc sur l'axe du milieu. Rend aussi si l'aimant a pris. */
export function snapToCenter(cx: number): { cx: number; snapped: boolean } {
  const snapped = Math.abs(cx - STORY_W / 2) <= SNAP_DISTANCE;
  return { cx: snapped ? STORY_W / 2 : cx, snapped };
}

/**
 * Voile sous les textes, réglé sur la luminosité mesurée de la photo derrière
 * eux (0 = noir, 1 = blanc) : léger sur une salle sombre, dense sur un hall clair.
 */
export function veilAlpha(layout: PhotoStoryLayout, luminance: number): number {
  const l = clamp(luminance, 0, 1);
  return layout === 'releve' ? clamp(0.3 + l * 0.9, 0.3, 0.85) : clamp(0.55 + l * 0.8, 0.55, 0.9);
}

/** Cadrage de la photo : zoom (1 = elle couvre juste la story) et décalage. */
export interface PhotoFraming {
  zoom: number;
  /** Décalage du centre de la photo, en pixels de la story. */
  panX: number;
  panY: number;
}

export const FRAMING_MAX_ZOOM = 3;
export const DEFAULT_FRAMING: PhotoFraming = { zoom: 1, panX: 0, panY: 0 };

/**
 * Rectangle où dessiner la photo pour qu'elle couvre toute la story, comme
 * object-fit: cover, puis zoomée et décalée sans jamais laisser de bord vide.
 */
export function coverRect(photo: Size, framing: PhotoFraming) {
  const zoom = clamp(framing.zoom, 1, FRAMING_MAX_ZOOM);
  const base = Math.max(STORY_W / photo.width, STORY_H / photo.height);
  const width = photo.width * base * zoom;
  const height = photo.height * base * zoom;
  const maxPanX = (width - STORY_W) / 2;
  const maxPanY = (height - STORY_H) / 2;
  const panX = clamp(framing.panX, -maxPanX, maxPanX);
  const panY = clamp(framing.panY, -maxPanY, maxPanY);
  return {
    x: (STORY_W - width) / 2 + panX,
    y: (STORY_H - height) / 2 + panY,
    width,
    height,
    framing: { zoom, panX, panY },
  };
}

/** Le relevé aligne ses notes sur une ligne : la largeur suit le nombre de critères. */
export function criteriaRowMetrics(count: number) {
  if (count >= 6) return { itemWidth: 144, gap: 16, valueSize: 59 };
  if (count === 5) return { itemWidth: 165, gap: 27, valueSize: 69 };
  return { itemWidth: 197, gap: 27, valueSize: 69 };
}

/** « 13.09.26 », comme sur la story Variante. */
export function shortDate(timestamp: number): string {
  const d = new Date(timestamp);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${String(d.getFullYear()).slice(-2)}`;
}

/**
 * Coupe un avis en trois lignes au plus, sur des mots entiers. `measure` rend la
 * largeur d'un texte ; sous Node, les tests passent une mesure en caractères.
 */
export function wrapLines(
  text: string,
  maxWidth: number,
  maxLines: number,
  measure: (s: string) => number,
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (current && measure(candidate) > maxWidth) {
      lines.push(current);
      current = word;
      if (lines.length === maxLines) break;
    } else {
      current = candidate;
    }
  }
  if (lines.length < maxLines && current) {
    lines.push(current);
    current = '';
  }
  const consumed = lines.join(' ').split(/\s+/).filter(Boolean).length;
  if (consumed < words.length) {
    let last = lines[lines.length - 1];
    while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1).trimEnd();
    lines[lines.length - 1] = `${last.replace(/[\s,.;:!?«»"]+$/u, '')}…`;
  }
  return lines;
}

/** Dernier choix de visuel, mis en avant à la prochaine ouverture. */
export type StoryChoice = 'classic' | 'editorial' | PhotoStoryLayout;
export const LAST_STORY_KEY = 'bitter:story-format:last';

export function parseStoryChoice(raw: string | null): StoryChoice | null {
  return raw === 'classic' || raw === 'editorial' || raw === 'seance' || raw === 'releve' ? raw : null;
}
