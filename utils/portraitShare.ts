import type { Movie } from '../types';
import { shareImage } from './shareImage';
import { ratingOf } from './ratingHistory';
import { resizeTmdbImage } from './tmdbImage';

/** La carte partage uniquement l'identité cinéma et ses films-preuves. */
export async function shareCinemaPortrait(title: string, description: string, films: Movie[], labels: { summary: string; name: string }) {
  const canvas = document.createElement('canvas'); canvas.width = 1080; canvas.height = 1350;
  const ctx = canvas.getContext('2d'); if (!ctx) throw Error('canvas-unavailable');
  ctx.fillStyle = '#0c0c0c'; ctx.fillRect(0, 0, 1080, 1350);
  ctx.fillStyle = '#d9ff00'; ctx.font = '900 30px sans-serif'; ctx.fillText('THE BITTER', 70, 90);
  ctx.fillStyle = '#fff'; ctx.font = '900 76px sans-serif';
  const words = title.split(' '); let line = '', y = 230;
  for (const word of words) {
    if (line && ctx.measureText(`${line} ${word}`).width > 940) { ctx.fillText(line, 70, y); line = word; y += 88; }
    else line = line ? `${line} ${word}` : word;
  }
  ctx.fillText(line, 70, y);
  ctx.font = '700 27px sans-serif'; ctx.fillStyle = '#aaa69e'; ctx.fillText(labels.name, 70, y + 62, 940);
  ctx.font = '500 31px sans-serif'; line = ''; y += 128;
  for (const word of description.split(' ')) {
    if (line && ctx.measureText(`${line} ${word}`).width > 940) { ctx.fillText(line, 70, y); line = word; y += 41; }
    else line = line ? `${line} ${word}` : word;
  }
  ctx.fillText(line, 70, y);
  const images = await Promise.all(films.slice(0, 3).map(movie => new Promise<HTMLImageElement | null>(resolve => {
    const url = resizeTmdbImage(movie.posterUrl, 'w342'); if (!url) { resolve(null); return; }
    const image = new Image(); image.crossOrigin = 'anonymous';
    const timer = window.setTimeout(() => resolve(null), 5_000);
    image.onload = () => { clearTimeout(timer); resolve(image); };
    image.onerror = () => { clearTimeout(timer); resolve(null); }; image.src = url;
  })));
  films.slice(0, 3).forEach((movie, index) => {
    const x = 70 + index * 320;
    ctx.fillStyle = '#242420'; ctx.beginPath(); ctx.roundRect(x, 610, 290, 435, 20); ctx.fill();
    if (images[index]) {
      const image = images[index]!; const scale = Math.max(290 / image.width, 435 / image.height);
      ctx.save(); ctx.beginPath(); ctx.roundRect(x, 610, 290, 435, 20); ctx.clip();
      ctx.drawImage(image, x + (290 - image.width * scale) / 2, 610 + (435 - image.height * scale) / 2, image.width * scale, image.height * scale); ctx.restore();
    }
    ctx.fillStyle = '#d9ff00'; ctx.beginPath(); ctx.roundRect(x + 15, 990, 82, 37, 18); ctx.fill();
    ctx.fillStyle = '#111'; ctx.font = '900 23px sans-serif'; ctx.fillText((ratingOf(movie) ?? 0).toFixed(1), x + 32, 1016);
    ctx.fillStyle = '#fff'; ctx.font = '700 20px sans-serif'; ctx.fillText(movie.title, x, 1080, 290);
  });
  ctx.fillStyle = '#fff'; ctx.font = '700 29px sans-serif'; ctx.fillText(labels.summary, 70, 1190, 940);
  ctx.fillStyle = '#88847b'; ctx.font = '500 23px sans-serif'; ctx.fillText('thebitter.watch', 70, 1280);
  return shareImage(canvas.toDataURL('image/png'), 'the-bitter-mon-portrait.png', { title, text: description });
}
