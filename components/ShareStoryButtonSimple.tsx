import React, { useState } from 'react';
import { Instagram, Loader2, Share2 } from 'lucide-react';
import { Movie } from '../types';

interface ShareStoryButtonSimpleProps {
  movie: Movie;
  compact?: boolean;
}

const ShareStoryButtonSimple: React.FC<ShareStoryButtonSimpleProps> = ({
  movie,
  compact = false,
}) => {
  const [isSharing, setIsSharing] = useState(false);

  const globalRating = (
    (movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) /
    4
  ).toFixed(1);

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
    // On calcule la hauteur totale que va prendre le bloc (titre + marges + notes = environ 390px fixes)
    const tmdbOffset = movie.tmdbRating && movie.tmdbRating > 0 ? 70 : 0;
    const totalBlockHeight = lines.length * (fontSize + 10) + 390 + tmdbOffset;

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

    // 7. LABEL "MON VERDICT"
    const verdictY = genreY + 85;
    ctx.fillStyle = COLOR_TEXT;
    ctx.font = '800 24px "Inter", sans-serif';
    ctx.letterSpacing = '2px'; // <-- Ajout de l'espacement
    ctx.fillText('MON VERDICT CRITIQUE', MARGIN_X, verdictY);
    ctx.letterSpacing = '0px'; // <-- Reset obligatoire

    // 8. NOTE GLOBALE (GAUCHE)
    const noteY = verdictY + 30;
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

    // 9. TECHNICAL SPECS (JAUGES AVEC DÉGRADÉ À DROITE)
    const specsY = noteY + 15;
    const blockWidth = CANVAS_W - blockX - MARGIN_X; // Prend l'espace restant jusqu'à la marge droite
    const gapY = 60;

    const specs = [
      { label: 'SCRIPT', val: movie.ratings.story },
      { label: 'ACTING', val: movie.ratings.acting },
      { label: 'VISUEL', val: movie.ratings.visuals },
      { label: 'SON', val: movie.ratings.sound },
    ];

    specs.forEach((spec, i) => {
      const itemY = specsY + i * gapY;

      // Dans la boucle specs.forEach...
      ctx.fillStyle = COLOR_TEXT;
      ctx.font = '700 18px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.letterSpacing = '1.5px'; // <-- Ajout
      ctx.fillText(spec.label, blockX, itemY);
      ctx.letterSpacing = '0px'; // <-- Reset

      ctx.fillStyle = COLOR_PRIMARY;
      ctx.font = '900 20px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(spec.val.toFixed(1), blockX + blockWidth, itemY);

      // Track de la barre
      const barY = itemY + 30;
      const barHeight = 6;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.15)';
      ctx.fillRect(blockX, barY, blockWidth, barHeight);

      // Remplissage avec dégradé et volume
      const fillWidth = (spec.val / 10) * blockWidth;
      const barGradient = ctx.createLinearGradient(blockX, barY, blockX + fillWidth, barY);
      barGradient.addColorStop(0, 'rgba(217, 255, 0, 0.2)');
      barGradient.addColorStop(1, COLOR_PRIMARY);

      ctx.fillStyle = barGradient;
      ctx.shadowColor = 'rgba(217, 255, 0, 0.6)';
      ctx.shadowBlur = 12;
      ctx.fillRect(blockX, barY, fillWidth, barHeight);
      ctx.shadowBlur = 0; // Reset
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

    try {
      const imageDataUrl = await generateStoryImage();
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      const fileName = `bitter-verdict-${movie.title.toLowerCase().replace(/[^a-z0-9]/g, '-')}.png`;
      const file = new File([blob], fileName, { type: 'image/png' });

      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: `Verdict Bitter: ${movie.title}`,
          text: `Analyse de ${movie.title} : ${globalRating}/10.`,
          files: [file],
        });
      } else {
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        alert('📥 Verdict prêt pour ta story !');
      }
    } catch (error) {
      if (import.meta.env.DEV) console.error('Erreur Story:', error);
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
