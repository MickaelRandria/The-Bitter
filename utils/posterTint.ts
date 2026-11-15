import { useEffect, useState } from 'react';

/**
 * Une teinte sombre tirée d'une affiche, pour habiller une carte aux couleurs
 * du film. On réduit l'image à quelques pixels, on en fait la moyenne, puis on
 * l'assombrit assez pour qu'un texte blanc reste lisible dessus.
 *
 * Les affiches TMDB sont servies avec CORS ouvert : le canvas peut les lire.
 * Sans image, ou si le navigateur refuse, on rend null et l'appelant garde son
 * fond neutre.
 */

interface PosterColors {
  /** Moyenne assombrie : un fond sur lequel un texte blanc reste lisible. */
  tint: string;
  /** La couleur la plus vive de l'affiche, éclaircie : petits titres sur ce fond. */
  accent: string;
  /** Un fond nuit qui garde la teinte de l'affiche (l'indigo d'un ciel, le rouge d'un néon). */
  deep: string;
}

/** Teinte de la moyenne, saturation relevée, luminosité de nuit : la couleur sans le gris. */
const deepOf = (r: number, g: number, b: number) => {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  let hue = 0;
  if (max !== min) {
    const d = max - min;
    const [rn, gn, bn] = [r / 255, g / 255, b / 255];
    hue = max === rn ? ((gn - bn) / d) % 6 : max === gn ? (bn - rn) / d + 2 : (rn - gn) / d + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  const lightness = (max + min) / 2;
  const saturation = max === min ? 0 : (max - min) / (1 - Math.abs(2 * lightness - 1));
  const s = Math.min(0.55, Math.max(0.18, saturation * 1.8));
  return `hsl(${Math.round(hue)}, ${Math.round(s * 100)}%, 13%)`;
};

const cache = new Map<string, PosterColors | null>();
const pending = new Map<string, Promise<PosterColors | null>>();

/** Part de noir dans le mélange : 0.62 garde la couleur sans gêner la lecture. */
const DARKEN = 0.62;
const INK = 12; // #0c0c0c, le fond de l'app en mode sombre
/** Part de blanc dans l'accent : assez pour se lire sur la teinte sombre. */
const LIGHTEN = 0.45;

const colorsOf = (url: string) => {
  const known = pending.get(url);
  if (known) return known;
  const job = new Promise<PosterColors | null>((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const size = 12;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, size, size);
        const { data } = ctx.getImageData(0, 0, size, size);
        let r = 0;
        let g = 0;
        let b = 0;
        let vivid = [255, 255, 255];
        let best = -1;
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
          const max = Math.max(data[i], data[i + 1], data[i + 2]);
          const min = Math.min(data[i], data[i + 1], data[i + 2]);
          // Vif et clair à la fois : un ciel de lever de soleil, pas un noir saturé.
          const score = (max - min) * max;
          if (score > best) {
            best = score;
            vivid = [data[i], data[i + 1], data[i + 2]];
          }
        }
        const mix = (channel: number) => Math.round((channel / pixels) * (1 - DARKEN) + INK * DARKEN);
        const light = (channel: number) => Math.round(channel * (1 - LIGHTEN) + 255 * LIGHTEN);
        resolve({
          deep: deepOf(r / pixels, g / pixels, b / pixels),
          tint: `rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`,
          accent: `rgb(${light(vivid[0])}, ${light(vivid[1])}, ${light(vivid[2])})`,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    // Une autre adresse que l'affiche affichée : la même image, déjà chargée par
    // un <img> sans CORS, sortirait du cache sans son en-tête et le canvas la
    // refuserait. La petite taille TMDB suffit pour douze pixels.
    img.src = /\/t\/p\/(w\d+|original)\//.test(url)
      ? url.replace(/\/t\/p\/(w\d+|original)\//, '/t/p/w92/')
      : `${url}${url.includes('?') ? '&' : '?'}tint=1`;
  }).then((found) => {
    cache.set(url, found);
    pending.delete(url);
    return found;
  });
  pending.set(url, job);
  return job;
};

/** Teinte et accent d'une affiche ; null tant qu'ils ne sont pas connus. */
export function usePosterColors(url?: string): PosterColors | null {
  const [colors, setColors] = useState<PosterColors | null>(() => (url ? cache.get(url) ?? null : null));
  useEffect(() => {
    if (!url) {
      setColors(null);
      return;
    }
    if (cache.has(url)) {
      setColors(cache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    void colorsOf(url).then((found) => {
      if (!cancelled) setColors(found);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return colors;
}

export function usePosterTint(url?: string): string | null {
  return usePosterColors(url)?.tint ?? null;
}
