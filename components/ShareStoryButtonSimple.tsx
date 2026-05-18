import React, { useState } from 'react';
import { Instagram, Loader2, Share2 } from 'lucide-react';
import { Movie } from '../types';
import { getDisplayRatingCriteria, getDisplayWeightedRating } from '../utils/rating';

interface ShareStoryButtonSimpleProps {
  movie: Movie;
  compact?: boolean;
}

const ShareStoryButtonSimple: React.FC<ShareStoryButtonSimpleProps> = ({
  movie,
  compact = false,
}) => {
  const [isSharing, setIsSharing] = useState(false);

  const adaptive = movie.adaptiveRating;
  const globalRating = getDisplayWeightedRating(movie).toFixed(1);
  const profileLabel = adaptive?.profile.label;

  const generateStoryImage = async (): Promise<string> => {
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

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
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
      const imageDataUrl = await generateStoryImage();
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

  if (compact) {
    return (
      <button
        onClick={handleShare}
        disabled={isSharing}
        className={`p-4 rounded-2xl ${gradientStyles} text-white active:scale-90 transition-all duration-150 shadow-lg disabled:opacity-50`}
      >
        {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Share2 size={20} />}
      </button>
    );
  }

  return (
    <button
      onClick={handleShare}
      disabled={isSharing}
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
};

const haptics = {
  medium: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }
  },
};

export default ShareStoryButtonSimple;
