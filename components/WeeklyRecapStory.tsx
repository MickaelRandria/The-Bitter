import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarRange, HelpCircle, Loader2, Shuffle, X } from 'lucide-react';
import { Movie } from '../types';
import { getDisplayRatingCriteria, getDisplayWeightedRating } from '../utils/rating';
import { dominantGenre } from '../utils/movieStats';
import { resizeTmdbImage, TmdbImageSize } from '../utils/tmdbImage';
import { useLanguage, Language } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { shareImage } from '../utils/shareImage';

/*
 * Bilan de la semaine — story 1080x1920, grille bento en 3 blocs.
 *
 *   ┌──────────────────────────────┐
 *   │  BLOC 1 — le mieux noté      │   affiche plein bloc + titre + note
 *   ├──────────────┬───────────────┤
 *   │  BLOC 2      │  BLOC 3       │   films 2 et 3, ou tuiles de stats
 *   └──────────────┴───────────────┘
 *
 * Trois états selon le nombre de films de la semaine :
 *   3 films et + → top 3, aucune stat
 *   2 films      → film n°2 à gauche, une stat à droite (note moyenne incluse)
 *   1 film       → deux stats (note moyenne exclue : doublon avec la note du haut)
 *
 * Les tuiles de stats sont cyclables au doigt dans la prévisualisation, et
 * réglées sur « Aléatoire » par défaut.
 */

interface WeeklyRecapStoryProps {
  /** Historique des films vus. Le configurateur les regroupe par semaine calendaire. */
  movies: Movie[];
  className?: string;
}

type TFunction = (key: string, params?: Record<string, string | number>) => string;

// ── Direction artistique ────────────────────────────────────────────────────
const CANVAS_W = 1080;
const CANVAS_H = 1920;
const MARGIN = 44;
const GUTTER = 20;

const COLOR_BG = '#000000';
const COLOR_BLOCK = '#111111';
const COLOR_TEXT = '#FFFFFF';
const COLOR_LIME = '#D9FF00';
const COLOR_MUTED = 'rgba(255, 255, 255, 0.55)';
const COLOR_HAIRLINE = 'rgba(255, 255, 255, 0.14)';

const RADIUS_HERO = 36;
const RADIUS_TILE = 32;

interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const HEADER_Y = 56;
const HERO: Rect = { x: MARGIN, y: 132, w: CANVAS_W - MARGIN * 2, h: 1274 };
const TILE_W = (CANVAS_W - MARGIN * 2 - GUTTER) / 2;
const TILE_Y = HERO.y + HERO.h + GUTTER;
const TILE_H = CANVAS_H - MARGIN - TILE_Y;
const TILE_LEFT: Rect = { x: MARGIN, y: TILE_Y, w: TILE_W, h: TILE_H };
const TILE_RIGHT: Rect = { x: MARGIN + TILE_W + GUTTER, y: TILE_Y, w: TILE_W, h: TILE_H };

// ── Statistiques ────────────────────────────────────────────────────────────

/** Ordre du cycle imposé par le produit ; « avgScore » n'est proposé qu'à 2 films. */
const STAT_ORDER = ['watchtime', 'director', 'bestAspect', 'vsPublic', 'genre', 'avgScore'] as const;
type StatId = (typeof STAT_ORDER)[number];
const RANDOM_ID = 'random';
type StatSelection = StatId | typeof RANDOM_ID;

interface StatTile {
  id: StatId;
  topLabel: string;
  value: string;
  name: string;
  caption: string;
}

const isKnownDirector = (director: string | undefined) =>
  !!director && !/^(inconnu|unknown|n\/?a)$/i.test(director.trim());

/**
 * Toutes les stats calculables pour la semaine, dans l'ordre du cycle.
 * Une stat absente de la liste est simplement absente du cycle : pas de tuile
 * vide, pas d'option qui ne mène nulle part.
 */
const buildStatOptions = (
  movies: Movie[],
  ranked: Movie[],
  allowAvgScore: boolean,
  t: TFunction,
  language: Language
): StatTile[] => {
  const topLabel = t('recap.thisWeek');
  const options: StatTile[] = [];

  const totalMinutes = movies.reduce((acc, movie) => acc + (movie.runtime || 0), 0);
  if (totalMinutes > 0) {
    options.push({
      id: 'watchtime',
      topLabel,
      value: formatWatchTime(totalMinutes, language),
      name: t('recap.watchtime'),
      caption: t('recap.watchtimeCaption'),
    });
  }

  // Réalisateur le plus vu ; à égalité, celui du film le mieux noté gagne
  // (on parcourt la liste déjà triée par note).
  const directorCounts = new Map<string, number>();
  ranked.forEach((movie) => {
    if (!isKnownDirector(movie.director)) return;
    const name = movie.director.trim();
    directorCounts.set(name, (directorCounts.get(name) ?? 0) + 1);
  });
  const topDirector = [...directorCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topDirector) {
    const [name, count] = topDirector;
    const firstFilm = ranked.find((movie) => movie.director.trim() === name);
    options.push({
      id: 'director',
      topLabel,
      value: name.toUpperCase(),
      name: t('recap.director'),
      caption:
        count > 1
          ? t('recap.directorCaptionFilms', { count: String(count) })
          : (firstFilm?.title ?? '').toUpperCase(),
    });
  }

  // Meilleur aspect : moyenne de chaque critère sur la semaine, on garde le plus haut.
  const criteriaTotals = new Map<string, { sum: number; count: number }>();
  movies.forEach((movie) =>
    getDisplayRatingCriteria(movie).forEach((criterion) => {
      const entry = criteriaTotals.get(criterion.label) ?? { sum: 0, count: 0 };
      entry.sum += criterion.value;
      entry.count += 1;
      criteriaTotals.set(criterion.label, entry);
    })
  );
  const bestAspect = [...criteriaTotals.entries()]
    .map(([label, entry]) => ({ label, value: entry.sum / entry.count }))
    .sort((a, b) => b.value - a.value)[0];
  if (bestAspect) {
    options.push({
      id: 'bestAspect',
      topLabel,
      value: bestAspect.label.toUpperCase(),
      name: t('recap.bestAspect'),
      caption: t('recap.bestAspectCaption', { value: bestAspect.value.toFixed(1) }),
    });
  }

  // Écart avec le public : seulement sur les films qui ont une note TMDB.
  const rated = movies.filter((movie) => typeof movie.tmdbRating === 'number' && movie.tmdbRating > 0);
  if (rated.length > 0) {
    const mine = rated.reduce((acc, movie) => acc + getDisplayWeightedRating(movie), 0) / rated.length;
    const theirs = rated.reduce((acc, movie) => acc + (movie.tmdbRating ?? 0), 0) / rated.length;
    const delta = mine - theirs;
    options.push({
      id: 'vsPublic',
      topLabel,
      value: `${delta >= 0 ? '+' : '-'}${Math.abs(delta).toFixed(1)}`,
      name: t('recap.vsPublic'),
      caption: t('recap.vsPublicCaption', { value: theirs.toFixed(1) }),
    });
  }

  const genre = dominantGenre(movies);
  if (genre) {
    const count = movies.filter((movie) => movie.genre === genre).length;
    options.push({
      id: 'genre',
      topLabel,
      value: genre.toUpperCase(),
      name: t('recap.genre'),
      caption: t(count > 1 ? 'recap.genreCaptionFilms' : 'recap.genreCaptionFilm', {
        count: String(count),
      }),
    });
  }

  // À 1 seul film, la moyenne de la semaine = la note déjà affichée en grand
  // dans le bloc du haut. On la sort du cycle plutôt que d'imprimer un doublon.
  if (allowAvgScore && movies.length > 0) {
    const average = movies.reduce((acc, movie) => acc + getDisplayWeightedRating(movie), 0) / movies.length;
    options.push({
      id: 'avgScore',
      topLabel,
      value: average.toFixed(1),
      name: t('recap.avgScore'),
      caption: t('recap.avgScoreCaption'),
    });
  }

  return options.sort(
    (a, b) => STAT_ORDER.indexOf(a.id) - STAT_ORDER.indexOf(b.id)
  );
};

// ── Police d'affichage ──────────────────────────────────────────────────────
// Même famille que la story Variante afin de garder une identité de marque
// cohérente entre les deux formats.
const DISPLAY_FAMILY = 'Inter';

let displayFontPromise: Promise<boolean> | null = null;

/**
 * Inter est déjà chargée par l'app. On attend simplement qu'elle soit prête
 * avant de dessiner le canvas pour éviter un export avec la police de secours.
 */
const ensureDisplayFont = (): Promise<boolean> => {
  if (displayFontPromise) return displayFontPromise;

  displayFontPromise = (async () => {
    if (typeof document === 'undefined' || !('fonts' in document)) return false;

    try {
      await Promise.race([
        document.fonts.load(`700 120px "${DISPLAY_FAMILY}"`, 'THE BITTER'),
        new Promise((resolve) => window.setTimeout(resolve, 4000)),
      ]);
      return document.fonts.check(`700 120px "${DISPLAY_FAMILY}"`);
    } catch {
      return false;
    }
  })();

  return displayFontPromise;
};

// ── Helpers canvas ──────────────────────────────────────────────────────────

/** roundRect() n'existe pas avant Safari 16 : on trace le chemin à la main. */
const roundRectPath = (ctx: CanvasRenderingContext2D, rect: Rect, radius: number) => {
  const r = Math.min(radius, rect.w / 2, rect.h / 2);
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.lineTo(rect.x + rect.w - r, rect.y);
  ctx.quadraticCurveTo(rect.x + rect.w, rect.y, rect.x + rect.w, rect.y + r);
  ctx.lineTo(rect.x + rect.w, rect.y + rect.h - r);
  ctx.quadraticCurveTo(rect.x + rect.w, rect.y + rect.h, rect.x + rect.w - r, rect.y + rect.h);
  ctx.lineTo(rect.x + r, rect.y + rect.h);
  ctx.quadraticCurveTo(rect.x, rect.y + rect.h, rect.x, rect.y + rect.h - r);
  ctx.lineTo(rect.x, rect.y + r);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  ctx.closePath();
};

const loadImage = (url: string): Promise<HTMLImageElement | null> =>
  new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = 'anonymous';
    let settled = false;
    const finish = (result: HTMLImageElement | null) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutId);
      resolve(result);
    };
    const timeoutId = window.setTimeout(() => finish(null), 10000);

    image.onload = () => finish(image.naturalWidth > 0 && image.naturalHeight > 0 ? image : null);
    image.onerror = () => finish(null);
    image.src = url;
  });

const loadPoster = async (movie: Movie): Promise<HTMLImageElement | null> => {
  if (!movie.posterUrl) return null;
  // La version « original » évite le flou sur un bloc de 990px de large.
  const original = movie.posterUrl.replace(/\/t\/p\/[^/]+\//, '/t/p/original/');
  for (const url of Array.from(new Set([original, movie.posterUrl]))) {
    const image = await loadImage(url);
    if (image) return image;
  }
  return null;
};

/** Cadrage type object-fit: cover, biais vertical haut pour garder les visages. */
const drawCover = (
  ctx: CanvasRenderingContext2D,
  image: HTMLImageElement,
  rect: Rect,
  focusY = 0.38
) => {
  const scale = Math.max(rect.w / image.naturalWidth, rect.h / image.naturalHeight);
  const width = image.naturalWidth * scale;
  const height = image.naturalHeight * scale;
  ctx.drawImage(
    image,
    rect.x + (rect.w - width) * 0.5,
    rect.y + (rect.h - height) * focusY,
    width,
    height
  );
};

const formatWatchTime = (minutes: number, language: Language) => {
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${rest}${language === 'fr' ? 'MIN' : 'M'}`;
  if (rest === 0) return `${hours}H`;
  return `${hours}H ${String(rest).padStart(2, '0')}M`;
};

const formatRange = (start: Date, end: Date, language: Language) => {
  const locale = language === 'fr' ? 'fr-FR' : 'en-US';
  const day = new Intl.DateTimeFormat(locale, { day: '2-digit' }).format(start);
  const dayMonth = new Intl.DateTimeFormat(locale, { day: '2-digit', month: 'short' }).format(end);
  return `${day} · ${dayMonth}`.replace(/\./g, '').toUpperCase();
};

interface WeekOption {
  key: string;
  start: Date;
  end: Date;
  movies: Movie[];
  label: string;
}

const getCalendarWeekStart = (date: Date) => {
  const start = new Date(date);
  const day = start.getDay();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() + (day === 0 ? -6 : 1 - day));
  return start;
};

const buildWeekOptions = (movies: Movie[], language: Language): WeekOption[] => {
  const groups = new Map<number, Movie[]>();

  movies
    .filter((movie) => movie.status === 'watched' && movie.dateWatched)
    .forEach((movie) => {
      const start = getCalendarWeekStart(new Date(movie.dateWatched!));
      const key = start.getTime();
      groups.set(key, [...(groups.get(key) ?? []), movie]);
    });

  return [...groups.entries()]
    .sort(([a], [b]) => b - a)
    .map(([timestamp, weekMovies]) => {
      const start = new Date(timestamp);
      const end = new Date(timestamp);
      end.setDate(end.getDate() + 6);
      end.setHours(23, 59, 59, 999);
      return {
        key: String(timestamp),
        start,
        end,
        movies: weekMovies,
        label: formatRange(start, end, language),
      };
    });
};

const getDefaultFrameIds = (movies: Movie[]): (string | null)[] => {
  const ranked = [...movies].sort(
    (a, b) => getDisplayWeightedRating(b) - getDisplayWeightedRating(a)
  );
  return [ranked[0]?.id ?? null, ranked[1]?.id ?? null, ranked[2]?.id ?? null];
};

// ── Typographie canvas ──────────────────────────────────────────────────────

type DisplayText = ReturnType<typeof createDisplayText>;

/**
 * Titres et chiffres en Inter, avec une graisse adaptée à leur hiérarchie.
 */
const createDisplayText = (ctx: CanvasRenderingContext2D, hasDisplayFont: boolean) => {
  const apply = (size: number, weight = 700) => {
    ctx.font = hasDisplayFont
      ? `${weight} ${size}px "${DISPLAY_FAMILY}", sans-serif`
      : `${weight} ${size}px Arial, sans-serif`;
  };

  return {
    /** Hauteur de capitale : sert à empiler les blocs à partir de la ligne de base. */
    capHeight: (size: number) => size * 0.72,
    lineHeight: (size: number) => Math.round(size * 0.94),
    measure: (text: string, size: number, weight = 700) => {
      apply(size, weight);
      return ctx.measureText(text).width;
    },
    draw: (text: string, x: number, baseline: number, size: number, weight = 700) => {
      apply(size, weight);
      ctx.textAlign = 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(text, x, baseline);
    },
  };
};

const measureTracked = (ctx: CanvasRenderingContext2D, text: string, tracking: number) =>
  Array.from(text).reduce((width, char) => width + ctx.measureText(char).width, 0) +
  Math.max(0, Array.from(text).length - 1) * tracking;

/** Lettrage espacé : canvas n'a pas d'équivalent à letter-spacing. */
const drawTracked = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number
) => {
  const previousAlign = ctx.textAlign;
  ctx.textAlign = 'left';
  let cursor = x;
  Array.from(text).forEach((char, index, chars) => {
    ctx.fillText(char, cursor, y);
    cursor += ctx.measureText(char).width;
    if (index < chars.length - 1) cursor += tracking;
  });
  ctx.textAlign = previousAlign;
};

/** Idem, mais tronqué à la largeur utile : les titres de films et les noms de
 *  réalisateurs débordent sinon des tuiles. */
const drawTrackedFit = (
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  tracking: number,
  maxWidth: number
) => {
  let output = text;
  if (measureTracked(ctx, output, tracking) > maxWidth) {
    while (output.length > 1 && measureTracked(ctx, `${output}…`, tracking) > maxWidth) {
      output = output.slice(0, -1).trimEnd();
    }
    output = `${output}…`;
  }
  drawTracked(ctx, output, x, y, tracking);
};

const measureDisplayTracked = (
  display: DisplayText,
  text: string,
  size: number,
  tracking: number,
  weight = 700
) =>
  Array.from(text).reduce((width, char) => width + display.measure(char, size, weight), 0) +
  Math.max(0, Array.from(text).length - 1) * tracking;

const drawDisplayTracked = (
  display: DisplayText,
  text: string,
  x: number,
  baseline: number,
  size: number,
  tracking: number,
  weight = 700
) => {
  let cursor = x;
  Array.from(text).forEach((char, index, chars) => {
    display.draw(char, cursor, baseline, size, weight);
    cursor += display.measure(char, size, weight);
    if (index < chars.length - 1) cursor += tracking;
  });
};

const truncateToWidth = (
  display: DisplayText,
  text: string,
  maxWidth: number,
  size: number,
  tracking = 0,
  weight = 700
) => {
  let result = text;
  while (
    result.length > 1 &&
    measureDisplayTracked(display, `${result}…`, size, tracking, weight) > maxWidth
  ) {
    result = result.slice(0, -1).trimEnd();
  }
  return `${result}…`;
};

const wrapDisplay = (
  display: DisplayText,
  text: string,
  maxWidth: number,
  size: number,
  tracking = 0,
  weight = 700
) => {
  const lines: string[] = [];
  let current = '';

  text
    .split(/\s+/)
    .filter(Boolean)
    .forEach((word) => {
      const candidate = current ? `${current} ${word}` : word;
      if (
        current &&
        measureDisplayTracked(display, candidate, size, tracking, weight) > maxWidth
      ) {
        lines.push(current);
        current = word;
      } else {
        current = candidate;
      }
    });

  if (current) lines.push(current);
  return lines;
};

/** Descend la taille jusqu'à ce que le texte tienne, puis tronque en dernier recours. */
const fitDisplayLines = (
  display: DisplayText,
  text: string,
  maxWidth: number,
  maxLines: number,
  maxSize: number,
  minSize: number,
  tracking = 0,
  weight = 700
) => {
  for (let size = maxSize; size > minSize; size -= 4) {
    const lines = wrapDisplay(display, text, maxWidth, size, tracking, weight);
    if (
      lines.length <= maxLines &&
      lines.every(
        (line) => measureDisplayTracked(display, line, size, tracking, weight) <= maxWidth
      )
    ) {
      return { lines, size };
    }
  }

  const lines = wrapDisplay(display, text, maxWidth, minSize, tracking, weight);
  const kept = lines.slice(0, maxLines).map((line, index) => {
    const isLast = index === maxLines - 1 && lines.length > maxLines;
    if (
      isLast ||
      measureDisplayTracked(display, line, minSize, tracking, weight) > maxWidth
    ) {
      return truncateToWidth(display, line, maxWidth, minSize, tracking, weight);
    }
    return line;
  });

  return { lines: kept, size: minSize };
};

// ── Blocs ───────────────────────────────────────────────────────────────────

const withBlock = (
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number,
  paint: () => void
) => {
  ctx.save();
  roundRectPath(ctx, rect, radius);
  ctx.clip();
  ctx.fillStyle = COLOR_BLOCK;
  ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  paint();
  ctx.restore();
};

const drawHeroBlock = (
  ctx: CanvasRenderingContext2D,
  display: DisplayText,
  movie: Movie,
  poster: HTMLImageElement | null,
  rangeLabel: string,
  t: TFunction
) => {
  withBlock(ctx, HERO, RADIUS_HERO, () => {
    if (poster) {
      drawCover(ctx, poster, HERO);

      // Assombrissement : voile plat + dégradé bas pour la typo, dégradé
      // gauche pour décoller le titre de l'image.
      ctx.fillStyle = 'rgba(0, 0, 0, 0.34)';
      ctx.fillRect(HERO.x, HERO.y, HERO.w, HERO.h);

      const bottom = ctx.createLinearGradient(0, HERO.y, 0, HERO.y + HERO.h);
      bottom.addColorStop(0, 'rgba(0, 0, 0, 0)');
      bottom.addColorStop(0.42, 'rgba(0, 0, 0, 0.12)');
      bottom.addColorStop(0.72, 'rgba(0, 0, 0, 0.72)');
      bottom.addColorStop(1, 'rgba(0, 0, 0, 0.94)');
      ctx.fillStyle = bottom;
      ctx.fillRect(HERO.x, HERO.y, HERO.w, HERO.h);

      const side = ctx.createLinearGradient(HERO.x, 0, HERO.x + HERO.w, 0);
      side.addColorStop(0, 'rgba(0, 0, 0, 0.72)');
      side.addColorStop(0.62, 'rgba(0, 0, 0, 0.08)');
      side.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = side;
      ctx.fillRect(HERO.x, HERO.y, HERO.w, HERO.h);
    }

    const pad = 44;
    const left = HERO.x + pad;
    const innerWidth = HERO.w - pad * 2;

    // Suréligne + filet lime
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '800 21px "Inter", sans-serif';
    ctx.textBaseline = 'top';
    drawTracked(ctx, t('recap.bestOfWeek'), left, HERO.y + pad, 9);
    ctx.fillStyle = COLOR_LIME;
    ctx.fillRect(left, HERO.y + pad + 40, 62, 4);

    // Dates, calées à droite du bloc
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = '600 20px "Inter", sans-serif';
    drawTracked(
      ctx,
      rangeLabel,
      HERO.x + HERO.w - pad - measureTracked(ctx, rangeLabel, 7),
      HERO.y + pad + 2,
      7
    );

    // Pile basse : note, métadonnées, titre — construite du bas vers le haut.
    const scoreSize = 176;
    const scoreBaseline = HERO.y + HERO.h - pad - 6;
    const scoreValue = getDisplayWeightedRating(movie).toFixed(1);

    ctx.fillStyle = COLOR_LIME;
    display.draw(scoreValue, left, scoreBaseline, scoreSize, 600);

    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '800 40px "Inter", sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.textAlign = 'left';
    ctx.fillText('/10', left + display.measure(scoreValue, scoreSize, 600) + 14, scoreBaseline);

    const metaBaseline = scoreBaseline - display.capHeight(scoreSize) - 30;
    const meta = [
      String(movie.year),
      isKnownDirector(movie.director) ? movie.director.trim().toUpperCase() : '',
    ]
      .filter(Boolean)
      .join('  ·  ');

    ctx.fillStyle = COLOR_MUTED;
    ctx.font = '600 21px "Inter", sans-serif';
    ctx.textBaseline = 'alphabetic';
    drawTrackedFit(ctx, meta, left, metaBaseline, 6, innerWidth);

    // Le film principal reste dominant grâce au bloc et à la note, mais son
    // titre ne concurrence plus toute la composition.
    const titleTracking = 7.5;
    const titleWeight = 300;
    const title = fitDisplayLines(
      display,
      movie.title.toUpperCase(),
      innerWidth,
      3,
      92,
      46,
      titleTracking,
      titleWeight
    );
    const lineHeight = display.lineHeight(title.size);
    const titleBaseline = metaBaseline - 44;

    ctx.fillStyle = COLOR_TEXT;
    title.lines.forEach((line, index) => {
      const offset = (title.lines.length - 1 - index) * lineHeight;
      drawDisplayTracked(
        display,
        line,
        left,
        titleBaseline - offset,
        title.size,
        titleTracking,
        titleWeight
      );
    });

  });
};

const drawMovieTile = (
  ctx: CanvasRenderingContext2D,
  display: DisplayText,
  rect: Rect,
  movie: Movie,
  poster: HTMLImageElement | null,
  rank: 2 | 3
) => {
  withBlock(ctx, rect, RADIUS_TILE, () => {
    if (poster) {
      drawCover(ctx, poster, rect, 0.32);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);

      const shade = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
      shade.addColorStop(0, 'rgba(0, 0, 0, 0)');
      shade.addColorStop(0.45, 'rgba(0, 0, 0, 0.3)');
      shade.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
      ctx.fillStyle = shade;
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
    }

    const pad = 30;
    const left = rect.x + pad;
    // Le deuxième film garde une présence éditoriale nette. Le troisième est
    // volontairement plus compact pour rendre le classement lisible au
    // premier regard, même lorsque leurs affiches ont un contraste proche.
    const scoreSize = rank === 2 ? 88 : 70;
    const scoreBaseline = rect.y + rect.h - pad - 2;
    const scoreValue = getDisplayWeightedRating(movie).toFixed(1);

    ctx.fillStyle = COLOR_LIME;
    display.draw(scoreValue, left, scoreBaseline, scoreSize, 600);

    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `800 ${rank === 2 ? 23 : 19}px "Inter", sans-serif`;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('/10', left + display.measure(scoreValue, scoreSize, 600) + 9, scoreBaseline);

    const titleTracking = rank === 2 ? 5 : 4;
    const titleWeight = 300;
    const title = fitDisplayLines(
      display,
      movie.title.toUpperCase(),
      rect.w - pad * 2,
      2,
      rank === 2 ? 42 : 32,
      rank === 2 ? 25 : 21,
      titleTracking,
      titleWeight
    );
    const lineHeight = display.lineHeight(title.size);
    const titleBaseline = scoreBaseline - display.capHeight(scoreSize) - 26;

    ctx.fillStyle = COLOR_TEXT;
    title.lines.forEach((line, index) => {
      const offset = (title.lines.length - 1 - index) * lineHeight;
      drawDisplayTracked(
        display,
        line,
        left,
        titleBaseline - offset,
        title.size,
        titleTracking,
        titleWeight
      );
    });

    ctx.fillStyle = rank === 2 ? COLOR_TEXT : COLOR_MUTED;
    ctx.font = `800 ${rank === 2 ? 17 : 15}px "Inter", sans-serif`;
    ctx.textBaseline = 'top';
    drawTracked(ctx, `0${rank}`, rect.x + rect.w - pad - measureTracked(ctx, `0${rank}`, 5), rect.y + pad, 5);
  });
};

const drawStatTile = (
  ctx: CanvasRenderingContext2D,
  display: DisplayText,
  rect: Rect,
  stat: StatTile
) => {
  withBlock(ctx, rect, RADIUS_TILE, () => {
    const pad = 30;
    const left = rect.x + pad;
    const innerWidth = rect.w - pad * 2;

    // Étiquette haute + filet, comme une fiche de données
    ctx.fillStyle = COLOR_MUTED;
    ctx.font = '700 17px "Inter", sans-serif';
    ctx.textBaseline = 'top';
    drawTrackedFit(ctx, stat.topLabel, left, rect.y + pad, 6, innerWidth);

    ctx.fillStyle = COLOR_HAIRLINE;
    ctx.fillRect(left, rect.y + pad + 36, innerWidth, 1);

    // La valeur peut être un chiffre court (2H 15M) ou un nom long
    // (QUENTIN TARANTINO) : deux lignes maximum, corps ajusté à la largeur.
    const value = fitDisplayLines(display, stat.value, innerWidth, 2, 132, 40);
    const lineHeight = display.lineHeight(value.size);
    const capHeight = display.capHeight(value.size);

    // Centrée dans l'espace libre entre le filet et le nom de la statistique,
    // sinon une valeur courte laisse un grand vide d'un côté ou de l'autre.
    const nameBaseline = rect.y + rect.h - pad - 62;
    const valueTop = rect.y + pad + 46;
    const valueBottom = nameBaseline - 30;
    const blockHeight = capHeight + (value.lines.length - 1) * lineHeight;
    const valueBaseline =
      valueTop + capHeight + Math.max(0, valueBottom - valueTop - blockHeight) / 2;

    ctx.fillStyle = COLOR_LIME;
    value.lines.forEach((line, index) => {
      display.draw(line, left, valueBaseline + index * lineHeight, value.size);
    });

    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '800 22px "Inter", sans-serif';
    ctx.textBaseline = 'alphabetic';
    drawTrackedFit(ctx, stat.name, left, nameBaseline, 4, innerWidth);

    ctx.fillStyle = COLOR_HAIRLINE;
    ctx.fillRect(left, rect.y + rect.h - pad - 40, innerWidth, 1);

    ctx.fillStyle = COLOR_MUTED;
    ctx.font = '600 15px "Inter", sans-serif';
    ctx.textBaseline = 'alphabetic';
    drawTrackedFit(ctx, stat.caption, left, rect.y + rect.h - pad - 6, 4, innerWidth);
  });
};

/** Grain argentique : une tuile de bruit répétée en overlay sur tout le canvas. */
const applyGrain = (ctx: CanvasRenderingContext2D) => {
  const tile = document.createElement('canvas');
  const size = 100;
  tile.width = size;
  tile.height = size;
  const tileCtx = tile.getContext('2d');
  if (!tileCtx) return;

  const imageData = tileCtx.createImageData(size, size);
  const { data } = imageData;
  for (let i = 0; i < data.length; i += 4) {
    const noise = Math.random() * 255;
    data[i] = noise;
    data[i + 1] = noise;
    data[i + 2] = noise;
    data[i + 3] = 16;
  }
  tileCtx.putImageData(imageData, 0, 0);

  const pattern = ctx.createPattern(tile, 'repeat');
  if (!pattern) return;

  ctx.save();
  ctx.globalCompositeOperation = 'overlay';
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
  ctx.restore();
};

// ── Génération ──────────────────────────────────────────────────────────────

interface RenderInput {
  hero: Movie;
  /** Films des blocs 2 et 3 (null = emplacement occupé par une stat). */
  slots: (Movie | null)[];
  /** Stats résolues, consommées dans l'ordre pour les emplacements libres. */
  stats: StatTile[];
  rangeLabel: string;
  t: TFunction;
}

const renderRecapCanvas = async ({
  hero,
  slots,
  stats,
  rangeLabel,
  t,
}: RenderInput): Promise<string> => {
  const canvas = document.createElement('canvas');
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas non supporté');

  // Brutalisme : tout est plat, aucune ombre nulle part.
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';

  const hasDisplayFont = await ensureDisplayFont();
  if ('fonts' in document) {
    await Promise.all([
      document.fonts.load('800 30px "Inter"', 'WEEKLY RECAP'),
      document.fonts.load('300 92px "Inter"', hero.title || 'FILM'),
      document.fonts.load('600 20px "Inter"', rangeLabel),
      document.fonts.load('800 40px "Inter"', '/10'),
    ]).catch(() => undefined);
    await document.fonts.ready;
  }

  const display = createDisplayText(ctx, hasDisplayFont);

  ctx.fillStyle = COLOR_BG;
  ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

  ctx.fillStyle = COLOR_TEXT;
  ctx.font = '800 30px "Inter", sans-serif';
  ctx.textBaseline = 'top';
  const headerLabel = t('recap.header');
  drawTracked(ctx, headerLabel, (CANVAS_W - measureTracked(ctx, headerLabel, 18)) / 2, HEADER_Y, 18);

  // Monogramme de marque, calé sur la marge gauche de la grille.
  ctx.fillStyle = COLOR_TEXT;
  ctx.font = '800 48px "Inter", sans-serif';
  ctx.textBaseline = 'top';
  ctx.textAlign = 'left';
  ctx.fillText('B', MARGIN, HEADER_Y - 12);
  const logoWidth = ctx.measureText('B').width;
  ctx.fillStyle = COLOR_LIME;
  ctx.beginPath();
  ctx.arc(MARGIN + logoWidth + 7, HEADER_Y + 25, 5, 0, Math.PI * 2);
  ctx.fill();

  const [heroPoster, ...slotPosters] = await Promise.all([
    loadPoster(hero),
    ...slots.map((slot) => (slot ? loadPoster(slot) : Promise.resolve(null))),
  ]);

  drawHeroBlock(ctx, display, hero, heroPoster, rangeLabel, t);

  let statIndex = 0;
  [TILE_LEFT, TILE_RIGHT].forEach((rect, index) => {
    const movie = slots[index];
    if (movie) {
      drawMovieTile(ctx, display, rect, movie, slotPosters[index], index === 0 ? 2 : 3);
      return;
    }
    const stat = stats[statIndex];
    statIndex += 1;
    if (stat) drawStatTile(ctx, display, rect, stat);
  });

  applyGrain(ctx);

  return canvas.toDataURL('image/png', 1.0);
};

// ── Modale d'aide ───────────────────────────────────────────────────────────

const HelpSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('recap.helpTitle'));
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-[320] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-xl animate-[fadeIn_0.25s_ease-out]"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
    >
      <div
        {...dialog.props}
        onClick={stop}
        className="relative w-full sm:max-w-md bg-[#0c0c0c] rounded-t-[3rem] sm:rounded-[3rem] border border-white/10 px-7 pt-7"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.75rem)' }}
      >
        <div className="flex items-start justify-between gap-4 mb-6">
          <h2 className="text-2xl font-black text-white tracking-tighter leading-tight">
            {t('recap.helpTitle')}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-9 h-9 shrink-0 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <ul className="space-y-4">
          {['recap.help1', 'recap.help2', 'recap.help3'].map((key, index) => (
            <li key={key} className="flex gap-4">
              <span className="w-7 h-7 shrink-0 rounded-lg bg-lime-400 text-black text-[11px] font-black flex items-center justify-center">
                {index + 1}
              </span>
              <p className="text-[13px] font-medium text-stone-300 leading-relaxed pt-1">
                {t(key)}
              </p>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={onClose}
          className="w-full mt-7 py-4 rounded-2xl bg-white text-black font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all"
        >
          {t('common.done')}
        </button>
      </div>
    </div>
  );
};

// ── Prévisualisation ────────────────────────────────────────────────────────

interface PreviewSheetProps {
  hero: Movie;
  slots: (Movie | null)[];
  weekOptions: WeekOption[];
  selectedWeekKey: string;
  onWeekChange: (weekKey: string) => void;
  availableMovies: Movie[];
  frameMovieIds: (string | null)[];
  onFrameChange: (frameIndex: number, movieId: string | null) => void;
  options: StatTile[];
  selections: StatSelection[];
  onCycle: (slotIndex: number) => void;
  onShare: () => void;
  onClose: () => void;
  onHelp: () => void;
  isSharing: boolean;
  rangeLabel: string;
  /** L'aide passe par-dessus : elle reprend Échap, sinon les deux se ferment d'un coup. */
  helpOpen: boolean;
}

const PreviewSheet: React.FC<PreviewSheetProps> = ({
  hero,
  slots,
  weekOptions,
  selectedWeekKey,
  onWeekChange,
  availableMovies,
  frameMovieIds,
  onFrameChange,
  options,
  selections,
  onCycle,
  onShare,
  onClose,
  onHelp,
  isSharing,
  rangeLabel,
  helpOpen,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(helpOpen ? undefined : onClose, t('recap.previewTitle'));
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const hasStatSlots = slots.some((slot) => !slot);

  // L'aperçu tient dans une demi-hauteur d'écran : inutile de charger le w780
  // stocké dans posterUrl, le canvas ira chercher l'original de son côté.
  const posterStyle = (movie: Movie, size: TmdbImageSize) =>
    movie.posterUrl
      ? {
          backgroundImage: `linear-gradient(to bottom, rgba(0,0,0,0.25), rgba(0,0,0,0.9)), url(${resizeTmdbImage(movie.posterUrl, size)})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center 38%',
        }
      : undefined;

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/85 backdrop-blur-xl animate-[fadeIn_0.25s_ease-out]"
      onClick={(e) => {
        e.stopPropagation();
        onClose();
      }}
      onTouchStart={stop}
      onTouchMove={stop}
      onTouchEnd={stop}
    >
      <div
        {...dialog.props}
        onClick={stop}
        className="relative w-full h-[100dvh] sm:h-auto sm:max-h-[92vh] sm:max-w-md bg-[#0c0c0c] sm:rounded-[3rem] border border-white/10 flex flex-col overflow-hidden"
      >
        <div
          className="flex items-center justify-between gap-3 px-7 pt-7 pb-4 shrink-0"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.75rem)' }}
        >
          <div className="min-w-0">
            <h2 className="text-xl font-black text-white tracking-tighter leading-none">
              {t('recap.previewTitle')}
            </h2>
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mt-1.5">
              {rangeLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onHelp}
              aria-label={t('recap.help')}
              className="w-9 h-9 rounded-full bg-white/10 border border-white/10 text-stone-300 flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
            >
              <HelpCircle size={16} strokeWidth={2.5} />
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label={t('common.close')}
              className="w-9 h-9 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
            >
              <X size={16} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        {/* Aperçu de la grille bento, aux proportions du canvas */}
        <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar px-7 pb-4">
          <div className="mb-5 space-y-4 rounded-3xl border border-white/10 bg-white/[0.04] p-4">
            <label className="block">
              <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-stone-500">
                {t('recap.selectWeek')}
              </span>
              <select
                value={selectedWeekKey}
                onChange={(event) => onWeekChange(event.target.value)}
                className="w-full rounded-2xl border border-white/10 bg-[#171717] px-4 py-3 text-[11px] font-black uppercase tracking-wider text-white outline-none focus:border-lime-400/60"
              >
                {weekOptions.map((week) => (
                  <option key={week.key} value={week.key}>
                    {week.label} · {week.movies.length} {t(week.movies.length > 1 ? 'recap.films' : 'recap.film')}
                  </option>
                ))}
              </select>
            </label>

            <div>
              <span className="mb-2 block text-[9px] font-black uppercase tracking-[0.18em] text-stone-500">
                {t('recap.assignFrames')}
              </span>
              <div className="grid grid-cols-1 gap-2">
                {[t('recap.heroFrame'), t('recap.leftFrame'), t('recap.rightFrame')].map(
                  (label, frameIndex) => (
                    <label
                      key={label}
                      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-[#111] px-3 py-2.5"
                    >
                      <span className="w-24 shrink-0 text-[9px] font-black uppercase tracking-wider text-stone-500">
                        {label}
                      </span>
                      <select
                        value={frameMovieIds[frameIndex] ?? ''}
                        onChange={(event) =>
                          onFrameChange(frameIndex, event.target.value || null)
                        }
                        className="min-w-0 flex-1 bg-transparent text-[11px] font-bold text-white outline-none"
                      >
                        {frameIndex > 0 && <option value="">{t('recap.statFrame')}</option>}
                        {availableMovies.map((movie) => {
                          const usedElsewhere = frameMovieIds.some(
                            (selectedId, selectedIndex) =>
                              selectedIndex !== frameIndex && selectedId === movie.id
                          );
                          return (
                            <option key={movie.id} value={movie.id} disabled={usedElsewhere}>
                              {movie.title} · {getDisplayWeightedRating(movie).toFixed(1)}
                            </option>
                          );
                        })}
                      </select>
                    </label>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="flex flex-col gap-2 aspect-[9/16] w-full bg-black rounded-3xl p-2">
            <div
              className="relative rounded-2xl overflow-hidden bg-[#111] p-4 flex flex-col justify-end"
              style={{ flex: '1274 1 0%', ...posterStyle(hero, 'w342') }}
            >
              <span className="absolute top-4 left-4 text-[7px] font-black uppercase tracking-[0.2em] text-white">
                {t('recap.bestOfWeek')}
              </span>
              <span className="text-[11px] font-light uppercase text-white leading-[1.05] tracking-[0.12em] line-clamp-3">
                {hero.title}
              </span>
              <span className="text-[26px] font-black text-lime-400 leading-none mt-1">
                {getDisplayWeightedRating(hero).toFixed(1)}
                <span className="text-[10px] text-white ml-0.5">/10</span>
              </span>
            </div>

            <div className="flex gap-2" style={{ flex: '450 1 0%' }}>
              {slots.map((movie, index) =>
                movie ? (
                  <div
                    key={`slot-${index}`}
                    className="flex-1 rounded-2xl overflow-hidden bg-[#111] p-3 flex flex-col justify-end"
                    style={posterStyle(movie, 'w185')}
                  >
                    <span className={`font-light uppercase text-white leading-[1.05] tracking-[0.1em] line-clamp-2 ${index === 0 ? 'text-[8px]' : 'text-[7px]'}`}>
                      {movie.title}
                    </span>
                    <span className="text-[15px] font-black text-lime-400 leading-none mt-0.5">
                      {getDisplayWeightedRating(movie).toFixed(1)}
                    </span>
                  </div>
                ) : (
                  <StatPreviewTile
                    key={`slot-${index}`}
                    selection={selections[index]}
                    options={options}
                    onCycle={() => onCycle(index)}
                  />
                )
              )}
            </div>
          </div>

          {hasStatSlots && (
            <p className="text-[10px] font-bold text-stone-500 text-center mt-4 leading-relaxed">
              {t('recap.previewHint')}
            </p>
          )}
        </div>

        <div
          className="shrink-0 px-7 pt-2 pb-7"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.75rem)' }}
        >
          <button
            type="button"
            onClick={onShare}
            disabled={isSharing}
            className="w-full flex items-center justify-center gap-2 py-4 rounded-2xl bg-lime-400 text-black font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all disabled:opacity-50"
          >
            {isSharing ? (
              <>
                <Loader2 size={15} className="animate-spin" /> {t('recap.generating')}
              </>
            ) : (
              t('recap.share')
            )}
          </button>
        </div>
      </div>
    </div>
  );
};

const StatPreviewTile: React.FC<{
  selection: StatSelection;
  options: StatTile[];
  onCycle: () => void;
}> = ({ selection, options, onCycle }) => {
  const { t } = useLanguage();
  const stat = options.find((option) => option.id === selection);

  return (
    <button
      type="button"
      onClick={onCycle}
      className="flex-1 rounded-2xl bg-[#111] border border-white/10 p-3 flex flex-col justify-between text-left active:scale-95 transition-all hover:border-lime-400/40"
    >
      <span className="flex items-center justify-between gap-1">
        <span className="text-[7px] font-black uppercase tracking-[0.15em] text-stone-500 truncate">
          {stat ? stat.topLabel : t('recap.optionRandom')}
        </span>
        <Shuffle size={9} className={stat ? 'text-stone-600 shrink-0' : 'text-lime-400 shrink-0'} />
      </span>

      <span className="min-w-0">
        <span className="block text-[15px] font-black uppercase text-lime-400 leading-[0.95] line-clamp-2 break-words">
          {stat ? stat.value : t('recap.optionRandom')}
        </span>
        <span className="block text-[7px] font-black uppercase tracking-[0.12em] text-white mt-1 truncate">
          {stat ? stat.name : t('recap.randomCaption')}
        </span>
      </span>
    </button>
  );
};

// ── Composant principal ─────────────────────────────────────────────────────

const WeeklyRecapStory: React.FC<WeeklyRecapStoryProps> = ({
  movies,
  className = '',
}) => {
  const { t, language } = useLanguage();
  const [isSharing, setIsSharing] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [selections, setSelections] = useState<StatSelection[]>([RANDOM_ID, RANDOM_ID]);

  const weekOptions = useMemo(() => buildWeekOptions(movies, language), [movies, language]);
  const [selectedWeekKey, setSelectedWeekKey] = useState(() => weekOptions[0]?.key ?? '');
  const selectedWeek =
    weekOptions.find((week) => week.key === selectedWeekKey) ?? weekOptions[0] ?? null;
  const [frameMovieIds, setFrameMovieIds] = useState<(string | null)[]>(() =>
    getDefaultFrameIds(weekOptions[0]?.movies ?? [])
  );

  useEffect(() => {
    if (!selectedWeek) return;
    if (selectedWeek.key !== selectedWeekKey) {
      setSelectedWeekKey(selectedWeek.key);
      setFrameMovieIds(getDefaultFrameIds(selectedWeek.movies));
    }
  }, [selectedWeek, selectedWeekKey]);

  const handleWeekChange = (weekKey: string) => {
    const nextWeek = weekOptions.find((week) => week.key === weekKey);
    if (!nextWeek) return;
    setSelectedWeekKey(weekKey);
    setFrameMovieIds(getDefaultFrameIds(nextWeek.movies));
    setSelections([RANDOM_ID, RANDOM_ID]);
  };

  const handleFrameChange = (frameIndex: number, movieId: string | null) => {
    if (frameIndex === 0 && !movieId) return;
    setFrameMovieIds((current) =>
      current.map((selectedId, index) => {
        if (index === frameIndex) return movieId;
        if (movieId && selectedId === movieId) return null;
        return selectedId;
      })
    );
  };

  const recap = useMemo(() => {
    const activeMovies = selectedWeek?.movies ?? [];
    const ranked = [...activeMovies].sort(
      (a, b) => getDisplayWeightedRating(b) - getDisplayWeightedRating(a)
    );
    const findMovie = (movieId: string | null | undefined) =>
      activeMovies.find((movie) => movie.id === movieId) ?? null;
    const hero = findMovie(frameMovieIds[0]) ?? ranked[0] ?? null;
    const slots: (Movie | null)[] = [findMovie(frameMovieIds[1]), findMovie(frameMovieIds[2])];
    const statSlotCount = slots.filter((slot) => !slot).length;

    return {
      hero,
      slots,
      statSlotCount,
      rangeLabel: selectedWeek?.label ?? '',
      // « Note moyenne » n'a de sens qu'à partir de 2 films : à 1 film elle
      // répète la note déjà affichée en grand dans le bloc du haut.
      options: buildStatOptions(activeMovies, ranked, activeMovies.length >= 2, t, language),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedWeek, frameMovieIds, language]);

  /**
   * Cycle : les stats disponibles puis « Aléatoire », en sautant celle déjà
   * choisie par l'autre tuile — deux fois la même stat dans l'image n'a pas
   * d'intérêt, autant l'exclure du parcours plutôt que d'avoir à l'expliquer.
   */
  const handleCycle = (slotIndex: number) => {
    setSelections((current) => {
      // Seuls les autres emplacements *de stats* réservent une option : un
      // emplacement occupé par un film garde une sélection résiduelle qui ne
      // doit pas amputer le cycle.
      const taken = current.filter((_, i) => i !== slotIndex && !recap.slots[i]);
      const cycle: StatSelection[] = [
        ...recap.options.filter((option) => !taken.includes(option.id)).map((option) => option.id),
        RANDOM_ID,
      ];
      const position = cycle.indexOf(current[slotIndex]);
      const next = cycle[(position + 1) % cycle.length];

      return current.map((value, i) => (i === slotIndex ? next : value));
    });
  };

  /**
   * « Aléatoire » ne se résout qu'au moment du partage, sans doublon.
   * On parcourt les index des emplacements réellement libres : à 2 films le
   * carré de stats est celui de droite, sa sélection est donc selections[1].
   */
  const resolveStats = (): StatTile[] => {
    const statSlots = recap.slots
      .map((slot, index) => (slot ? -1 : index))
      .filter((index) => index >= 0);

    const used = new Set<StatId>();
    statSlots.forEach((index) => {
      const selection = selections[index];
      if (selection !== RANDOM_ID) used.add(selection);
    });

    return statSlots.map((index) => {
      const selection = selections[index];
      if (selection !== RANDOM_ID) {
        return recap.options.find((option) => option.id === selection) ?? recap.options[0];
      }
      const pool = recap.options.filter((option) => !used.has(option.id));
      const picked = pool[Math.floor(Math.random() * pool.length)] ?? recap.options[0];
      if (picked) used.add(picked.id);
      return picked;
    });
  };

  const handleShare = async () => {
    if (!recap.hero || isSharing) return;
    setIsSharing(true);

    try {
      const dataUrl = await renderRecapCanvas({
        hero: recap.hero,
        slots: recap.slots,
        stats: resolveStats().filter(Boolean),
        rangeLabel: recap.rangeLabel,
        t,
      });

      const outcome = await shareImage(
        dataUrl,
        `bitter-weekly-recap-${new Date().toISOString().slice(0, 10)}.png`,
        { title: t('recap.shareTitle'), text: t('recap.shareText') }
      );

      if (outcome === 'downloaded') alert(t('recap.downloaded'));
      if (outcome !== 'cancelled') setShowPreview(false);
    } catch (error) {
      console.error('Erreur Weekly Recap:', error);
      alert(`${t('recap.error')} ${error instanceof Error ? error.message : ''}`.trim());
    } finally {
      setIsSharing(false);
    }
  };

  const portalTarget = typeof document !== 'undefined' ? document.body : null;

  return (
    <>
      <div className={`flex items-center gap-2 ${className}`}>
        <button
          type="button"
          onClick={() => setShowPreview(true)}
          disabled={!recap.hero}
          aria-haspopup="dialog"
          className="flex-1 flex items-center justify-center gap-2 py-4 px-6 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-[#D9FF00] text-black shadow-lg shadow-lime-400/20 active:scale-95 transition-all disabled:opacity-40 disabled:shadow-none disabled:active:scale-100"
        >
          <CalendarRange size={14} strokeWidth={2.5} /> {t('recap.button')}
        </button>
        <button
          type="button"
          onClick={() => setShowHelp(true)}
          aria-label={t('recap.help')}
          aria-haspopup="dialog"
          className="w-11 h-11 shrink-0 rounded-2xl bg-white dark:bg-[#1a1a1a] border border-stone-200 dark:border-white/10 text-stone-400 dark:text-stone-500 flex items-center justify-center active:scale-90 transition-all hover:text-charcoal dark:hover:text-white"
        >
          <HelpCircle size={16} strokeWidth={2.5} />
        </button>
      </div>

      {showPreview &&
        recap.hero &&
        portalTarget &&
        createPortal(
          <PreviewSheet
            hero={recap.hero}
            slots={recap.slots}
            weekOptions={weekOptions}
            selectedWeekKey={selectedWeek?.key ?? ''}
            onWeekChange={handleWeekChange}
            availableMovies={selectedWeek?.movies ?? []}
            frameMovieIds={frameMovieIds}
            onFrameChange={handleFrameChange}
            options={recap.options}
            selections={selections}
            onCycle={handleCycle}
            onShare={handleShare}
            onClose={() => setShowPreview(false)}
            onHelp={() => setShowHelp(true)}
            isSharing={isSharing}
            rangeLabel={recap.rangeLabel}
            helpOpen={showHelp}
          />,
          portalTarget
        )}

      {showHelp &&
        portalTarget &&
        createPortal(<HelpSheet onClose={() => setShowHelp(false)} />, portalTarget)}
    </>
  );
};

export default WeeklyRecapStory;
