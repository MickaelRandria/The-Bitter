import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Instagram, LayoutTemplate, Loader2, Share2, Sparkles, X } from 'lucide-react';
import { Movie } from '../types';
import { getDisplayRatingCriteria, getDisplayWeightedRating } from '../utils/rating';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

type StoryFormat = 'classic' | 'editorial';

interface ShareStoryButtonSimpleProps {
  movie: Movie;
  compact?: boolean;
}

/**
 * Feuille de choix du visuel. Rendue dans un portail : la MovieCard applique un
 * `transform` (swipe) sur un parent, ce qui piègerait un `position: fixed` rendu
 * en place. Les événements React remontent quand même l'arbre des composants,
 * d'où les stopPropagation sur l'overlay (sinon la carte se replie ou swipe).
 */
const StoryFormatSheet: React.FC<{
  onSelect: (format: StoryFormat) => void;
  onClose: () => void;
}> = ({ onSelect, onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('story.pickTitle'));

  const stop = (e: React.SyntheticEvent) => e.stopPropagation();

  return (
    <div
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-xl animate-[fadeIn_0.25s_ease-out]"
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
        className="relative w-full sm:max-w-md bg-[#0c0c0c] rounded-t-[3rem] sm:rounded-[3rem] border border-white/10 shadow-2xl overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] px-7 pt-7"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.75rem)' }}
      >
        <div className="absolute top-[-30%] right-[-20%] w-[260px] h-[260px] bg-lime-400/10 rounded-full blur-[120px] pointer-events-none" />

        <div className="relative z-10 flex items-start justify-between gap-4 mb-6">
          <div className="min-w-0">
            <h2 className="text-2xl font-black text-white tracking-tighter leading-tight">
              {t('story.pickTitle')}
            </h2>
            <p className="text-[11px] font-medium text-stone-400 mt-1 leading-relaxed">
              {t('story.pickDesc')}
            </p>
          </div>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onClose();
            }}
            aria-label={t('common.close')}
            className="w-9 h-9 shrink-0 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        <div className="relative z-10 space-y-3">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect('classic');
            }}
            className="w-full flex items-start gap-4 text-left p-5 rounded-[1.75rem] border border-white/10 bg-white/5 active:scale-[0.98] transition-all hover:bg-white/10 group"
          >
            <span className="w-11 h-11 shrink-0 rounded-2xl bg-white/10 border border-white/10 text-white flex items-center justify-center">
              <LayoutTemplate size={19} strokeWidth={2} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-black uppercase tracking-widest text-white leading-tight">
                {t('story.classic')}
              </span>
              <span className="block text-[11px] font-medium text-stone-400 mt-1.5 leading-relaxed">
                {t('story.classicDesc')}
              </span>
            </span>
            <ArrowRight
              size={18}
              strokeWidth={2.5}
              className="shrink-0 mt-1 text-stone-500 group-hover:translate-x-1 group-hover:text-white transition-all"
            />
          </button>

          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onSelect('editorial');
            }}
            className="w-full flex items-start gap-4 text-left p-5 rounded-[1.75rem] border border-lime-400/30 bg-lime-400/10 active:scale-[0.98] transition-all hover:bg-lime-400/15 group"
          >
            <span className="w-11 h-11 shrink-0 rounded-2xl bg-lime-400 text-black flex items-center justify-center">
              <Sparkles size={19} strokeWidth={2.2} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="flex items-center gap-2 flex-wrap">
                <span className="text-[12px] font-black uppercase tracking-widest text-white leading-tight">
                  {t('story.variant')}
                </span>
                <span className="px-2 py-0.5 rounded-full bg-lime-400 text-black text-[9px] font-black uppercase tracking-widest">
                  {t('story.beta')}
                </span>
              </span>
              <span className="block text-[11px] font-medium text-stone-400 mt-1.5 leading-relaxed">
                {t('story.variantDesc')}
              </span>
            </span>
            <ArrowRight
              size={18}
              strokeWidth={2.5}
              className="shrink-0 mt-1 text-lime-400/60 group-hover:translate-x-1 group-hover:text-lime-400 transition-all"
            />
          </button>
        </div>

        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onClose();
          }}
          className="relative z-10 w-full mt-4 py-4 text-[10px] font-black uppercase tracking-widest text-stone-500 hover:text-white transition-colors"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );
};

const ShareStoryButtonSimple: React.FC<ShareStoryButtonSimpleProps> = ({
  movie,
  compact = false,
}) => {
  const { t } = useLanguage();
  const [isSharing, setIsSharing] = useState(false);
  const [showOptions, setShowOptions] = useState(false);

  const adaptive = movie.adaptiveRating;
  const globalRating = getDisplayWeightedRating(movie).toFixed(1);
  const profileLabel = adaptive?.profile.label;

  const generateClassicStoryImage = async (): Promise<string> => {
    // --- CONSTANTES DE DESIGN ---
    const CANVAS_W = 1080;
    const CANVAS_H = 1920;
    const MARGIN_X = 60;
    const COLOR_PRIMARY = '#D9FF00';
    const COLOR_TEXT = '#ffffff';
    const COLOR_BG = '#000000';

    // Créer un canvas HTML5 natif
    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('Canvas non supporté');

    // 1. FOND NOIR
    ctx.fillStyle = COLOR_BG;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 2. CHARGER L'AFFICHE
    if (movie.posterUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous';

        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => {
            console.warn('Affiche non chargée');
            resolve();
          };
          const posterUrl = movie.posterUrl?.replace('w780', 'original');
          if (posterUrl) img.src = posterUrl;
          else resolve();
        });

        if (img.complete && img.naturalWidth > 0) {
          const imgRatio = img.width / img.height;
          const canvasRatio = CANVAS_W / CANVAS_H;
          let drawWidth, drawHeight, offsetX, offsetY;

          if (imgRatio > canvasRatio) {
            drawHeight = CANVAS_H;
            drawWidth = img.width * (CANVAS_H / img.height);
            offsetX = (CANVAS_W - drawWidth) / 2;
            offsetY = 0;
          } else {
            drawWidth = CANVAS_W;
            drawHeight = img.height * (CANVAS_W / img.width);
            offsetX = 0;
            offsetY = (CANVAS_H - drawHeight) / 2;
          }
          ctx.globalAlpha = 0.85;
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          ctx.globalAlpha = 1.0;
        }
      } catch (err) {
        console.warn('Erreur affiche:', err);
      }
    }

    // 3. GRADIENT OVERLAY (Pour que le texte reste lisible)
    const gradient = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // 4. CONFIGURATION TEXTE DE BASE
    ctx.textBaseline = 'top';

    // 5. TITRE DU FILM
    ctx.fillStyle = COLOR_TEXT;
    let fontSize = 90;
    const maxTextWidth = CANVAS_W - MARGIN_X * 2;
    ctx.font = `900 ${fontSize}px "Inter", sans-serif`;

    const words = movie.title.toUpperCase().split(' ');
    let lines: string[] = [];
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxTextWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);

    if (lines.length > 3) {
      fontSize = 70;
      ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
      lines = lines.slice(0, 3);
      lines[2] = lines[2] + '...';
    }

    // --- NOUVEAU CALCUL DYNAMIQUE POUR TITLE Y ---
    // Hauteur de la zone sous le titre : genre + label + profil + specs (variable selon adaptiveRating)
    const displayCriteria = getDisplayRatingCriteria(movie);
    const hasSpecific = displayCriteria.some((c) => c.isSpecific);
    const specsGap = displayCriteria.length >= 5 ? 56 : 60;
    const specsBlockHeight = displayCriteria.length * specsGap + (hasSpecific ? 26 : 0);
    const tmdbOffset = movie.tmdbRating && movie.tmdbRating > 0 ? 70 : 0;
    // 200 px pour : genre badge (85) + label verdict + profil (62) + marges (~53)
    const totalBlockHeight = lines.length * (fontSize + 10) + 200 + specsBlockHeight + tmdbOffset;

    // On part de la position du footer (CANVAS_H - 250 = 1670)
    // On soustrait la hauteur du bloc, et on enlève 90px pour laisser une belle marge propre au-dessus du footer
    const titleY = CANVAS_H - 250 - totalBlockHeight - 90;

    lines.forEach((line, i) => {
      ctx.fillText(line, MARGIN_X, titleY + i * (fontSize + 10));
    });

    // 6. BADGE GENRE
    const genreY = titleY + lines.length * (fontSize + 10) + 25;
    const genreText = movie.genre.toUpperCase();

    ctx.font = '800 24px "Inter", sans-serif';
    const genreWidth = ctx.measureText(genreText).width;
    const badgeWidth = genreWidth + 60;
    const badgeHeight = 54;

    // Fond du badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    // @ts-ignore
    if (ctx.roundRect) ctx.roundRect(MARGIN_X, genreY, badgeWidth, badgeHeight, 27);
    else ctx.fillRect(MARGIN_X, genreY, badgeWidth, badgeHeight);
    ctx.fill();

    // Bordure du badge
    ctx.strokeStyle = 'rgba(217, 255, 0, 0.6)';
    ctx.lineWidth = 3;
    // @ts-ignore
    if (ctx.roundRect) ctx.roundRect(MARGIN_X, genreY, badgeWidth, badgeHeight, 27);
    ctx.stroke();

    // Texte du badge
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.textBaseline = 'middle';
    ctx.fillText(genreText, MARGIN_X + 30, genreY + 27);
    ctx.textBaseline = 'top';

    // 7. LABEL "MON VERDICT" + PROFIL
    const verdictY = genreY + 85;
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '800 24px "Inter", sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText('MON VERDICT CRITIQUE', MARGIN_X, verdictY);
    ctx.letterSpacing = '0px';

    // Petite ligne sous le label "MON VERDICT" : profil utilisé (ou "Notation classique" pour legacy)
    const profileLineText = profileLabel
      ? `PROFIL ${profileLabel.toUpperCase()}`
      : 'NOTATION CLASSIQUE';
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = '800 16px "Inter", sans-serif';
    ctx.letterSpacing = '2px';
    ctx.fillText(profileLineText, MARGIN_X, verdictY + 32);
    ctx.letterSpacing = '0px';

    // 8. NOTE GLOBALE (GAUCHE)
    const noteY = verdictY + 60;
    ctx.fillStyle = COLOR_PRIMARY;

    const blockX = 630;
    let noteSize = 250;
    ctx.font = `900 ${noteSize}px "Inter", sans-serif`;

    // Réduit la taille si la note (ex: "10.0") est trop large
    while (ctx.measureText(globalRating).width > blockX - MARGIN_X - 40 && noteSize > 150) {
      noteSize -= 5;
      ctx.font = `900 ${noteSize}px "Inter", sans-serif`;
    }

    ctx.shadowColor = 'rgba(217, 255, 0, 0.4)';
    ctx.shadowBlur = 60;
    // Décalage léger à gauche (-5) car la police crée un vide naturel
    ctx.fillText(globalRating, MARGIN_X - 5, noteY);
    ctx.shadowBlur = 0; // On désactive l'ombre pour la suite

    // 8b. NOTE TMDB (petite, sous la note globale)
    if (movie.tmdbRating && movie.tmdbRating > 0) {
      const tmdbY = noteY + noteSize + 15;

      ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
      ctx.font = '700 20px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.letterSpacing = '2px';
      ctx.fillText('MOY. TMDB', MARGIN_X, tmdbY);
      ctx.letterSpacing = '0px';

      ctx.fillStyle = 'rgba(255, 255, 255, 0.65)';
      ctx.font = '800 34px "Inter", sans-serif';
      ctx.fillText(`\u2605 ${movie.tmdbRating.toFixed(1)}`, MARGIN_X, tmdbY + 26);
    }

    // 9. CRITÈRES ADAPTATIFS (JAUGES À DROITE)
    //
    // Hiérarchie visuelle = importance du critère uniquement (poids du graisse + pips + pastille).
    // Aucune opacité ne dépend de la valeur de la note : un 3.4 reste aussi lisible qu'un 9.0.
    const specsY = noteY + 15;
    const blockWidth = CANVAS_W - blockX - MARGIN_X;

    // Dessine les pips d'importance (●●●) selon le poids du critère
    const drawWeightPips = (cx: number, cy: number, weight: number) => {
      const filled = weight >= 1.7 ? 3 : weight >= 1.3 ? 2 : weight >= 0.9 ? 1 : 0;
      const pipSize = 5;
      const pipGap = 4;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.arc(cx + i * (pipSize + pipGap), cy, pipSize / 2, 0, Math.PI * 2);
        ctx.fillStyle = i < filled ? COLOR_PRIMARY : 'rgba(255, 255, 255, 0.2)';
        ctx.fill();
      }
    };

    let cursorY = specsY;
    let firstSpecificRendered = false;

    displayCriteria.forEach((spec) => {
      // Séparateur léger "CE QUI COMPTE ICI" avant le premier critère spécifique
      if (spec.isSpecific && !firstSpecificRendered) {
        firstSpecificRendered = true;
        ctx.fillStyle = 'rgba(217, 255, 0, 0.35)';
        ctx.fillRect(blockX, cursorY + 4, 28, 2);
        ctx.fillStyle = COLOR_PRIMARY;
        ctx.font = '800 12px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.letterSpacing = '2.5px';
        ctx.fillText('CE QUI COMPTE ICI', blockX + 40, cursorY);
        ctx.letterSpacing = '0px';
        cursorY += 26;
      }

      const itemY = cursorY;
      const label = spec.label.toUpperCase();
      const isEssentiel = spec.weightLabel === 'Essentiel';
      const isImportant = spec.weightLabel === 'Important';
      const isHighlighted = spec.isHighlighted;

      // Pastille lime à gauche pour Essentiel / Important (importance, pas valeur)
      if (isHighlighted) {
        const dotSize = isEssentiel ? 8 : 6;
        ctx.fillStyle = isEssentiel ? COLOR_PRIMARY : 'rgba(217, 255, 0, 0.7)';
        ctx.beginPath();
        ctx.arc(blockX - 16, itemY + 9, dotSize / 2, 0, Math.PI * 2);
        ctx.fill();
      }

      // Label critère — graisse selon importance, opacité TOUJOURS pleine
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = `${isEssentiel ? 900 : isImportant ? 800 : 700} 18px "Inter", sans-serif`;
      ctx.textAlign = 'left';
      ctx.letterSpacing = '1.5px';
      ctx.fillText(label, blockX, itemY);
      ctx.letterSpacing = '0px';

      // Largeur réelle du label (pour positionner badge + pips à droite)
      ctx.font = `${isEssentiel ? 900 : isImportant ? 800 : 700} 18px "Inter", sans-serif`;
      ctx.letterSpacing = '1.5px';
      const labelWidth = ctx.measureText(label).width;
      ctx.letterSpacing = '0px';

      // Mini badge "ESSENTIEL" / "IMPORTANT" après le label (sobre)
      let cursorAfterLabel = blockX + labelWidth + 14;
      if (isHighlighted) {
        ctx.font = '800 11px "Inter", sans-serif';
        ctx.letterSpacing = '2px';
        ctx.fillStyle = isEssentiel
          ? COLOR_PRIMARY
          : 'rgba(217, 255, 0, 0.75)';
        const badgeText = isEssentiel ? 'ESSENTIEL' : 'IMPORTANT';
        ctx.fillText(badgeText, cursorAfterLabel, itemY + 4);
        const badgeWidth = ctx.measureText(badgeText).width;
        cursorAfterLabel += badgeWidth + 14;
        ctx.letterSpacing = '0px';
      }

      // Pips d'importance (●●● / ●●○ / ●○○ / ○○○)
      drawWeightPips(cursorAfterLabel, itemY + 9, spec.weight);

      // Valeur à droite — opacité PLEINE, lime, taille constante
      ctx.fillStyle = COLOR_PRIMARY;
      ctx.font = '900 20px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(spec.value.toFixed(1), blockX + blockWidth, itemY);

      // Track de la barre — pleine opacité quelle que soit l'importance
      const barY = itemY + 30;
      const barHeight = isEssentiel ? 8 : 6;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(blockX, barY, blockWidth, barHeight);

      // Remplissage de la barre — dégradé lime constant, glow uniquement pour highlight
      const fillWidth = (spec.value / 10) * blockWidth;
      const barGradient = ctx.createLinearGradient(blockX, barY, blockX + fillWidth, barY);
      barGradient.addColorStop(0, 'rgba(217, 255, 0, 0.25)');
      barGradient.addColorStop(1, COLOR_PRIMARY);

      ctx.fillStyle = barGradient;
      if (isHighlighted) {
        ctx.shadowColor = 'rgba(217, 255, 0, 0.55)';
        ctx.shadowBlur = isEssentiel ? 16 : 10;
      }
      ctx.fillRect(blockX, barY, fillWidth, barHeight);
      ctx.shadowBlur = 0;

      cursorY += specsGap;
    });

    ctx.textAlign = 'left';

    // 10. FOOTER MAGAZINE
    const footerHeight = 250;
    const footerY = CANVAS_H - footerHeight;

    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, footerY, CANVAS_W, footerHeight);

    // GAUCHE : Logo "THE BITTER"
    ctx.fillStyle = COLOR_PRIMARY;
    ctx.font = '900 68px "Inter", sans-serif';
    ctx.fillText('THE BITTER', MARGIN_X, footerY + 65);

    // Sous-titre
    ctx.fillStyle = '#666666';
    ctx.font = '700 18px "Inter", sans-serif';
    ctx.letterSpacing = '3px'; // <-- Un peu plus large ici pour faire premium
    ctx.fillText('AVAILABLE ON IOS & ANDROID', MARGIN_X, footerY + 155);
    ctx.letterSpacing = '0px'; // <-- Reset

    // DROITE : Slogan
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '900 48px "Inter", sans-serif';
    ctx.textAlign = 'right';

    const sloganX = CANVAS_W - MARGIN_X;
    ctx.fillText('JUDGE.', sloganX, footerY + 45);
    ctx.fillText('RATE.', sloganX, footerY + 105);
    ctx.fillText('HATE.', sloganX, footerY + 165);

    // 11. EFFET GRAIN PREMIUM (FILM NOISE)
    // On crée un mini-canvas en mémoire pour le motif
    const patternCanvas = document.createElement('canvas');
    const patternSize = 100;
    patternCanvas.width = patternSize;
    patternCanvas.height = patternSize;
    const pCtx = patternCanvas.getContext('2d');

    if (pCtx) {
      const imgData = pCtx.createImageData(patternSize, patternSize);
      const data = imgData.data;

      // Génération du bruit (points noirs et gris)
      for (let i = 0; i < data.length; i += 4) {
        const noise = Math.random() * 255;
        data[i] = noise; // Rouge
        data[i + 1] = noise; // Vert
        data[i + 2] = noise; // Bleu
        data[i + 3] = 12; // Alpha (Opacité très faible : 12 sur 255)
      }
      pCtx.putImageData(imgData, 0, 0);

      // On l'applique sur toute l'affiche principale
      const pattern = ctx.createPattern(patternCanvas, 'repeat');
      if (pattern) {
        ctx.fillStyle = pattern;
        // Le mode 'overlay' permet au grain de bien se fondre avec les couleurs en dessous
        ctx.globalCompositeOperation = 'overlay';
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.globalCompositeOperation = 'source-over'; // Reset du mode de fusion
      }
    }

    return canvas.toDataURL('image/png', 1.0);
  };

  const generateEditorialStoryImage = async (): Promise<string> => {
    const CANVAS_W = 1080;
    const CANVAS_H = 1920;
    const CENTER_X = CANVAS_W / 2;
    const CONTENT_X = 92;
    const CONTENT_RIGHT = 528;
    const SAFE_TOP = 200;
    const SAFE_BOTTOM = 220;
    const COLOR_TEXT = '#F4F2EC';
    const COLOR_ACCENT = '#D9FF00';
    const COLOR_META = 'rgba(244, 242, 236, 0.62)';

    const canvas = document.createElement('canvas');
    canvas.width = CANVAS_W;
    canvas.height = CANVAS_H;
    const ctx = canvas.getContext('2d');

    if (!ctx) throw new Error('Canvas non supporté');

    // Canvas measures and draws only after the requested faces are ready.
    if ('fonts' in document) {
      const fontSet = document.fonts;
      await Promise.all([
        fontSet.load('700 76px "Inter"', 'B'),
        fontSet.load('700 52px "Inter"', movie.title || 'THE BITTER'),
        fontSet.load('600 250px "Inter"', globalRating),
        fontSet.load('400 25px "Inter"', 'Scénario'),
        fontSet.load('800 25px "Inter"', '8.2'),
      ]).catch(() => undefined);
      await fontSet.ready;
    }

    // L'affiche devient le visuel plein écran de la story.
    ctx.fillStyle = '#111111';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    // Cadrage manuel type object-fit: cover sur l'intégralité du canvas.
    if (movie.posterUrl) {
      try {
        const originalPosterUrl = movie.posterUrl.replace(
          /\/t\/p\/[^/]+\//,
          '/t/p/original/',
        );
        const posterCandidates = Array.from(
          new Set([originalPosterUrl, movie.posterUrl].filter(Boolean)),
        );

        const loadPoster = async (url: string): Promise<HTMLImageElement | null> =>
          new Promise((resolve) => {
            const candidate = new Image();
            candidate.crossOrigin = 'anonymous';
            let settled = false;
            const finish = (image: HTMLImageElement | null) => {
              if (settled) return;
              settled = true;
              window.clearTimeout(timeoutId);
              resolve(image);
            };
            const timeoutId = window.setTimeout(() => finish(null), 10000);

            candidate.onload = () =>
              finish(candidate.naturalWidth > 0 && candidate.naturalHeight > 0 ? candidate : null);
            candidate.onerror = () => finish(null);
            candidate.src = url;
          });

        let img: HTMLImageElement | null = null;
        for (const posterUrl of posterCandidates) {
          img = await loadPoster(posterUrl);
          if (img) break;
        }

        if (img) {
          const scale = Math.max(CANVAS_W / img.naturalWidth, CANVAS_H / img.naturalHeight);
          const drawWidth = img.naturalWidth * scale;
          const drawHeight = img.naturalHeight * scale;
          // Biais vertical légèrement haut : il préserve mieux les visages sur les
          // affiches très longues, tout en gardant un centrage horizontal neutre.
          const offsetX = (CANVAS_W - drawWidth) * 0.5;
          const offsetY = (CANVAS_H - drawHeight) * 0.38;
          ctx.drawImage(
            img,
            0,
            0,
            img.naturalWidth,
            img.naturalHeight,
            offsetX,
            offsetY,
            drawWidth,
            drawHeight,
          );
        }
      } catch (err) {
        console.warn('Erreur affiche éditoriale:', err);
      }
    }

    // Texture the image layer before overlays and typography so all generated copy stays crisp.
    const patternCanvas = document.createElement('canvas');
    const patternSize = 100;
    patternCanvas.width = patternSize;
    patternCanvas.height = patternSize;
    const pCtx = patternCanvas.getContext('2d');

    if (pCtx) {
      const imgData = pCtx.createImageData(patternSize, patternSize);
      const data = imgData.data;

      for (let i = 0; i < data.length; i += 4) {
        const noise = Math.random() * 255;
        data[i] = noise;
        data[i + 1] = noise;
        data[i + 2] = noise;
        data[i + 3] = 18;
      }
      pCtx.putImageData(imgData, 0, 0);

      const pattern = ctx.createPattern(patternCanvas, 'repeat');
      if (pattern) {
        ctx.save();
        ctx.fillStyle = pattern;
        ctx.globalCompositeOperation = 'overlay';
        ctx.globalAlpha = 0.22;
        ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);
        ctx.restore();
      }
    }

    // Voiles cinématographiques : l'image reste lisible en haut et se fond dans
    // un noir légèrement pétrole derrière les informations.
    ctx.fillStyle = 'rgba(0, 0, 0, 0.07)';
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const lowerShade = ctx.createLinearGradient(0, 0, 0, CANVAS_H);
    lowerShade.addColorStop(0, 'rgba(0, 0, 0, 0)');
    lowerShade.addColorStop(0.44, 'rgba(0, 0, 0, 0)');
    lowerShade.addColorStop(0.53, 'rgba(0, 30, 26, 0.22)');
    lowerShade.addColorStop(0.7, 'rgba(0, 24, 20, 0.6)');
    lowerShade.addColorStop(0.86, 'rgba(0, 10, 8, 0.9)');
    lowerShade.addColorStop(1, 'rgba(0, 0, 0, 0.97)');
    ctx.fillStyle = lowerShade;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const sideShade = ctx.createLinearGradient(0, 0, CANVAS_W, 0);
    sideShade.addColorStop(0, 'rgba(0, 35, 31, 0.04)');
    sideShade.addColorStop(0.58, 'rgba(0, 12, 10, 0.08)');
    sideShade.addColorStop(1, 'rgba(0, 0, 0, 0.38)');
    ctx.fillStyle = sideShade;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    const vignette = ctx.createRadialGradient(CENTER_X - 90, 650, 220, CENTER_X, 920, 1220);
    vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vignette.addColorStop(0.68, 'rgba(0, 0, 0, 0.03)');
    vignette.addColorStop(1, 'rgba(0, 0, 0, 0.28)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, CANVAS_W, CANVAS_H);

    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';

    const measureTrackedText = (text: string, tracking: number) => {
      const characters = Array.from(text);
      return (
        characters.reduce((width, character) => width + ctx.measureText(character).width, 0) +
        Math.max(0, characters.length - 1) * tracking
      );
    };

    const drawTrackedText = (text: string, x: number, y: number, tracking: number) => {
      const previousAlign = ctx.textAlign;
      ctx.textAlign = 'left';
      let cursorX = x;

      Array.from(text).forEach((character, index, characters) => {
        ctx.fillText(character, cursorX, y);
        cursorX += ctx.measureText(character).width;
        if (index < characters.length - 1) cursorX += tracking;
      });

      ctx.textAlign = previousAlign;
    };

    // Monogramme minimal avec contraste automatique sur les affiches claires.
    const logoY = SAFE_TOP;
    let logoLuminance = 0;
    try {
      const logoSample = ctx.getImageData(CONTENT_X - 12, logoY - 12, 128, 96).data;
      let luminanceSum = 0;
      let sampleCount = 0;
      for (let i = 0; i < logoSample.length; i += 32) {
        luminanceSum +=
          logoSample[i] * 0.2126 + logoSample[i + 1] * 0.7152 + logoSample[i + 2] * 0.0722;
        sampleCount += 1;
      }
      logoLuminance = sampleCount ? luminanceSum / sampleCount : 0;
    } catch {
      // Le blanc cassé reste le fallback sûr si le canvas ne permet pas l'échantillonnage.
    }

    const logoOnLightBackground = logoLuminance > 176;
    const logoColor = logoOnLightBackground ? 'rgba(10, 18, 15, 0.9)' : COLOR_TEXT;
    ctx.font = '700 86px "Inter", sans-serif';
    const monogramMetrics = ctx.measureText('B');
    const monogramWidth = monogramMetrics.width;
    // Correction optique explicite : le bord visible du B suit exactement
    // le même axe gauche que la première lettre du titre.
    const logoX = CONTENT_X - monogramMetrics.actualBoundingBoxLeft - 10;

    ctx.save();
    ctx.fillStyle = logoColor;
    ctx.shadowColor = logoOnLightBackground
      ? 'rgba(255, 255, 255, 0.22)'
      : 'rgba(0, 0, 0, 0.42)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1;
    ctx.fillText('B', logoX, logoY);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = COLOR_ACCENT;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.28)';
    ctx.shadowBlur = 4;
    ctx.beginPath();
    ctx.arc(logoX + monogramWidth + 12, logoY + 67, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const displayCriteria = getDisplayRatingCriteria(movie);
    const footerSloganY = CANVAS_H - SAFE_BOTTOM + 152;
    const footerBrandY = footerSloganY - 48;
    const footerRuleY = footerBrandY - 30;
    const criteriaGap =
      displayCriteria.length <= 4 ? 62 : displayCriteria.length === 5 ? 50 : 44;
    // Les notes gardent leur position indépendamment du footer afin de créer
    // un vrai espace de respiration entre les deux blocs.
    const lastCriteriaY = CANVAS_H - SAFE_BOTTOM - 128;
    const firstCriteriaY = displayCriteria.length
      ? lastCriteriaY - (displayCriteria.length - 1) * criteriaGap
      : lastCriteriaY;
    const metadataY = firstCriteriaY - 314;
    const scoreBaselineY = firstCriteriaY - 46;

    const title = movie.title.trim().toUpperCase() || 'SANS TITRE';
    const titleMaxWidth = CANVAS_W - CONTENT_X - 80;
    let titleFontSize = 58;
    let titleTracking = 7.5;

    const wrapTitle = () => {
      ctx.font = `700 ${titleFontSize}px "Inter", sans-serif`;
      const words = title.split(/\s+/);
      const lines: string[] = [];
      let currentLine = '';

      words.forEach((word) => {
        const candidate = currentLine ? `${currentLine} ${word}` : word;
        if (currentLine && measureTrackedText(candidate, titleTracking) > titleMaxWidth) {
          lines.push(currentLine);
          currentLine = word;
        } else {
          currentLine = candidate;
        }
      });

      if (currentLine) lines.push(currentLine);
      return lines;
    };

    let titleLines = wrapTitle();
    while (
      (titleLines.length > 2 ||
        titleLines.some((line) => measureTrackedText(line, titleTracking) > titleMaxWidth)) &&
      titleFontSize > 34
    ) {
      titleFontSize -= 2;
      titleTracking = Math.max(4, titleTracking - 0.75);
      titleLines = wrapTitle();
    }

    if (titleLines.length > 2) {
      const firstLine = titleLines[0];
      let secondLine = titleLines.slice(1).join(' ');
      while (
        measureTrackedText(`${secondLine}…`, titleTracking) > titleMaxWidth &&
        secondLine.length > 1
      ) {
        secondLine = secondLine.slice(0, -1).trimEnd();
      }
      titleLines = [firstLine, `${secondLine}…`];
    }

    const titleLineHeight = Math.round(titleFontSize * 1.18);
    const genre = movie.genre.trim().toUpperCase();
    const titleY = metadataY - 22 - titleLines.length * titleLineHeight;
    ctx.save();
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = `700 ${titleFontSize}px "Inter", sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.34)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    titleLines.forEach((line, index) => {
      drawTrackedText(line, CONTENT_X, titleY + index * titleLineHeight, titleTracking);
    });
    ctx.restore();

    const director = movie.director.trim();
    const hasDirector = director && !/^(inconnu|unknown|n\/?a)$/i.test(director);
    let metadata = [genre, String(movie.year), hasDirector ? director.toUpperCase() : '']
      .filter(Boolean)
      .join(' · ');
    let metadataFontSize = 18;
    let metadataTracking = 4.5;
    const metadataMaxWidth = CANVAS_W - CONTENT_X - 130;
    ctx.font = `500 ${metadataFontSize}px "Inter", sans-serif`;

    while (
      measureTrackedText(metadata, metadataTracking) > metadataMaxWidth &&
      (metadataTracking > 2.5 || metadataFontSize > 12)
    ) {
      if (metadataTracking > 2.5) metadataTracking -= 0.5;
      else metadataFontSize -= 1;
      ctx.font = `500 ${metadataFontSize}px "Inter", sans-serif`;
    }

    if (measureTrackedText(metadata, metadataTracking) > metadataMaxWidth) {
      while (
        measureTrackedText(`${metadata}…`, metadataTracking) > metadataMaxWidth &&
        metadata.length > 1
      ) {
        metadata = metadata.slice(0, -1).trimEnd();
      }
      metadata = `${metadata}…`;
    }

    ctx.save();
    ctx.fillStyle = COLOR_META;
    ctx.font = `500 ${metadataFontSize}px "Inter", sans-serif`;
    ctx.shadowColor = 'rgba(0, 0, 0, 0.3)';
    ctx.shadowBlur = 5;
    drawTrackedText(metadata, CONTENT_X, metadataY, metadataTracking);
    ctx.restore();

    // Note monumentale, sans suffixe /10, terminée par le point lime de la marque.
    let scoreFontSize = 232;
    const scoreGap = 14;
    ctx.font = `600 ${scoreFontSize}px "Inter", sans-serif`;
    let scoreDotRadius = 14;
    let scoreMaxWidth = CONTENT_RIGHT - CONTENT_X - scoreGap - scoreDotRadius * 2;
    while (ctx.measureText(globalRating).width > scoreMaxWidth && scoreFontSize > 160) {
      scoreFontSize -= 2;
      ctx.font = `600 ${scoreFontSize}px "Inter", sans-serif`;
      scoreMaxWidth = CONTENT_RIGHT - CONTENT_X - scoreGap - scoreDotRadius * 2;
    }

    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = COLOR_TEXT;
    ctx.fillText(globalRating, CONTENT_X, scoreBaselineY);
    const scoreWidth = ctx.measureText(globalRating).width;
    ctx.fillStyle = COLOR_ACCENT;
    ctx.beginPath();
    const scoreDotCenterX = CONTENT_X + scoreWidth + scoreGap + scoreDotRadius;
    ctx.arc(
      scoreDotCenterX,
      scoreBaselineY - scoreDotRadius,
      scoreDotRadius,
      0,
      Math.PI * 2,
    );
    ctx.fill();
    ctx.textBaseline = 'top';

    // Liste en colonnes, sans séparateurs, alignée sur le point de la note finale.
    const criteriaFontSize = displayCriteria.length >= 5 ? 26 : 28;
    displayCriteria.forEach((criterion, index) => {
      const rowY = firstCriteriaY + index * criteriaGap;
      let labelFontSize = criteriaFontSize;
      ctx.font = `400 ${labelFontSize}px "Inter", sans-serif`;
      while (
        ctx.measureText(criterion.label).width > CONTENT_RIGHT - CONTENT_X - 92 &&
        labelFontSize > 15
      ) {
        labelFontSize -= 1;
        ctx.font = `400 ${labelFontSize}px "Inter", sans-serif`;
      }

      ctx.fillStyle = COLOR_TEXT;
      ctx.textAlign = 'left';
      ctx.fillText(criterion.label, CONTENT_X, rowY);

      ctx.fillStyle = COLOR_ACCENT;
      ctx.font = `800 ${criteriaFontSize}px "Inter", sans-serif`;
      ctx.textAlign = 'left';
      const criterionValue = criterion.value.toFixed(1);
      ctx.fillText(criterionValue, scoreDotCenterX + scoreDotRadius, rowY);
    });

    // Signature basse, entièrement alignée sur la grille gauche.
    ctx.textAlign = 'left';
    ctx.fillStyle = COLOR_ACCENT;
    ctx.fillRect(CONTENT_X + 2, footerRuleY, 64, 4);

    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '700 30px "Inter", sans-serif';
    drawTrackedText('THE BITTER', CONTENT_X + 2, footerBrandY, 6);

    ctx.fillStyle = COLOR_ACCENT;
    ctx.font = '700 22px "Inter", sans-serif';
    drawTrackedText('JUDGE. RATE. HATE.', CONTENT_X + 2, footerSloganY, 5);

    return canvas.toDataURL('image/png', 1.0);
  };

  const handleOpenOptions = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.preventDefault();
    e.stopPropagation();
    haptics.medium();
    setShowOptions(true);
  };

  const closeOptions = () => setShowOptions(false);

  const handleShare = async (type: StoryFormat) => {
    setShowOptions(false);
    setIsSharing(true);
    haptics.medium();

    const downloadFallback = (imageDataUrl: string, fileName: string) => {
      const link = document.createElement('a');
      link.href = imageDataUrl;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      alert('📥 Verdict prêt pour ta story !');
    };

    try {
      const imageDataUrl =
        type === 'classic' ? await generateClassicStoryImage() : await generateEditorialStoryImage();
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const fileName = `bitter-verdict-${movie.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      // Native share API: available on mobile + some desktops, but often fails
      // on desktop Chrome with AbortError even when canShare() returns true.
      // We try it first, and fall back to download on any non-cancellation error.
      const canUseShare =
        typeof navigator !== 'undefined' &&
        typeof navigator.share === 'function' &&
        typeof navigator.canShare === 'function' &&
        navigator.canShare({ files: [file] });

      if (canUseShare) {
        try {
          await navigator.share({
            title: `Verdict Bitter: ${movie.title}`,
            text: `Analyse de ${movie.title} : ${globalRating}/10.`,
            files: [file],
          });
        } catch (shareErr) {
          const isAbort = shareErr instanceof Error && shareErr.name === 'AbortError';
          // AbortError can mean either "user cancelled" (do nothing) or
          // "browser refused to open the share sheet" (fall back to download).
          // We can't reliably distinguish on desktop, so we fall back to download
          // when the page is focused (= the user hasn't actually interacted with
          // a native share sheet). On mobile, the share sheet steals focus, so
          // document.hasFocus() returns false → we correctly treat it as a cancel.
          if (isAbort && document.hasFocus()) {
            // Likely the browser couldn't open the share UI at all → download instead
            downloadFallback(imageDataUrl, fileName);
          } else if (!isAbort) {
            throw shareErr;
          }
          // else: real user cancel on mobile → do nothing
        }
      } else {
        downloadFallback(imageDataUrl, fileName);
      }
    } catch (error) {
      console.error('Erreur Story:', error);
      alert(`Impossible de générer la story : ${error instanceof Error ? error.message : 'erreur inconnue'}`);
    } finally {
      setIsSharing(false);
    }
  };

  const gradientStyles = 'bg-gradient-to-tr from-[#833ab4] via-[#fd1d1d] to-[#fcb045]';

  // Le bouton garde toujours sa place dans la grille : le choix du visuel passe
  // par une feuille modale, jamais par un remplacement du déclencheur.
  const trigger = compact ? (
    <button
      type="button"
      onClick={handleOpenOptions}
      disabled={isSharing}
      aria-haspopup="dialog"
      aria-expanded={showOptions}
      aria-label={t('story.pickTitle')}
      className={`p-4 rounded-2xl ${gradientStyles} text-white active:scale-90 transition-all duration-150 shadow-lg disabled:opacity-50`}
    >
      {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
    </button>
  ) : (
    <button
      type="button"
      onClick={handleOpenOptions}
      disabled={isSharing}
      aria-haspopup="dialog"
      aria-expanded={showOptions}
      className={`flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest ${gradientStyles} text-white active:scale-95 transition-all duration-150 shadow-lg disabled:opacity-50 disabled:scale-100`}
    >
      {isSharing ? (
        <>
          <Loader2 size={14} className="animate-spin" /> Verdict...
        </>
      ) : (
        <>
          <Instagram size={14} /> Story
        </>
      )}
    </button>
  );

  return (
    <>
      {trigger}
      {showOptions &&
        typeof document !== 'undefined' &&
        createPortal(
          <StoryFormatSheet onSelect={handleShare} onClose={closeOptions} />,
          document.body,
        )}
    </>
  );
};

const haptics = {
  medium: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }
  },
};

export default ShareStoryButtonSimple;
