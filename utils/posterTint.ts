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

const cache = new Map<string, string | null>();

/** Part de noir dans le mélange : 0.62 garde la couleur sans gêner la lecture. */
const DARKEN = 0.62;
const INK = 12; // #0c0c0c, le fond de l'app en mode sombre

const tintOf = (url: string) =>
  new Promise<string | null>((resolve) => {
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
        const pixels = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          r += data[i];
          g += data[i + 1];
          b += data[i + 2];
        }
        const mix = (channel: number) => Math.round((channel / pixels) * (1 - DARKEN) + INK * DARKEN);
        resolve(`rgb(${mix(r)}, ${mix(g)}, ${mix(b)})`);
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });

export function usePosterTint(url?: string): string | null {
  const [tint, setTint] = useState<string | null>(() => (url ? cache.get(url) ?? null : null));
  useEffect(() => {
    if (!url) {
      setTint(null);
      return;
    }
    if (cache.has(url)) {
      setTint(cache.get(url) ?? null);
      return;
    }
    let cancelled = false;
    tintOf(url).then((found) => {
      cache.set(url, found);
      if (!cancelled) setTint(found);
    });
    return () => {
      cancelled = true;
    };
  }, [url]);
  return tint;
}
