import { Movie } from '../types';
import { CalendarWatch } from './calendarAgenda';
import { resizeTmdbImage } from './tmdbImage';
import { shareImage } from './shareImage';

/** Les mêmes affiches et les mêmes notes que l'année, dans une story exportable. */
export async function shareCalendarYear(
  year: number,
  best: (CalendarWatch | null)[],
  movies: Movie[],
  months: string[],
  labels: { title: string; summary: string; empty: string; future: string; record: string },
  today: string
) {
  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1920;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('canvas-unavailable');
  ctx.fillStyle = '#0c0c0c';
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.fillStyle = '#D9FF00';
  ctx.font = '900 30px sans-serif';
  ctx.fillText('THE BITTER', 60, 82);
  ctx.fillStyle = '#FFFFFF';
  ctx.font = '900 82px sans-serif';
  ctx.fillText(String(year), 60, 180);
  ctx.font = '700 28px sans-serif';
  ctx.fillText(labels.title, 60, 236);
  ctx.fillStyle = '#aaa69e';
  ctx.font = '600 24px sans-serif';
  ctx.fillText(labels.summary, 60, 282);
  const images = await Promise.all(
    best.map(async (entry) => {
      const poster = movies.find((movie) => movie.id === entry?.movieId)?.posterUrl;
      if (!poster) return null;
      return new Promise<HTMLImageElement | null>((resolve) => {
        const image = new Image();
        image.crossOrigin = 'anonymous';
        const timer = window.setTimeout(() => resolve(null), 5_000);
        image.onload = () => {
          clearTimeout(timer);
          resolve(image);
        };
        image.onerror = () => {
          clearTimeout(timer);
          resolve(null);
        };
        image.src = resizeTmdbImage(poster, 'w342');
      });
    })
  );
  for (let month = 0; month < 12; month++) {
    const x = 60 + (month % 4) * 246;
    const y = 346 + Math.floor(month / 4) * 400;
    const width = 222;
    const height = 333;
    ctx.fillStyle = '#1a1a19';
    ctx.beginPath();
    ctx.roundRect(x, y, width, height, 16);
    ctx.fill();
    const image = images[month];
    if (image) {
      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, width, height, 16);
      ctx.clip();
      const scale = Math.max(width / image.width, height / image.height);
      ctx.drawImage(
        image,
        x + (width - image.width * scale) / 2,
        y + (height - image.height * scale) / 2,
        image.width * scale,
        image.height * scale
      );
      ctx.restore();
    } else {
      ctx.fillStyle = '#888883';
      ctx.font = '700 20px sans-serif';
      const label =
        `${year}-${String(month + 1).padStart(2, '0')}` > today.slice(0, 7)
          ? labels.future
          : labels.empty;
      ctx.fillText(label, x + 12, y + height / 2, width - 24);
    }
    if (best[month]) {
      ctx.fillStyle = '#D9FF00';
      ctx.beginPath();
      ctx.roundRect(x + 10, y + height - 48, 72, 34, 17);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = '900 23px sans-serif';
      ctx.fillText(best[month]!.rating.toFixed(1), x + 21, y + height - 23);
    }
    ctx.fillStyle = '#aaa69e';
    ctx.font = '900 20px sans-serif';
    ctx.fillText(months[month].toUpperCase(), x, y + height + 32, width);
  }
  ctx.fillStyle = '#D9FF00';
  ctx.font = '900 26px sans-serif';
  ctx.fillText(labels.record, 60, 1640, 960);
  ctx.fillStyle = '#888883';
  ctx.font = '600 23px sans-serif';
  ctx.fillText('thebitter.watch', 60, 1848);
  return shareImage(canvas.toDataURL('image/png'), `the-bitter-${year}.png`, {
    title: labels.title,
    text: labels.summary,
  });
}
