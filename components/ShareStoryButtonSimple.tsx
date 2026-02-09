import React, { useState } from 'react';
import { Instagram, Loader2, Share2 } from 'lucide-react';
import { Movie } from '../types';

interface ShareStoryButtonSimpleProps {
  movie: Movie;
  compact?: boolean;
}

const ShareStoryButtonSimple: React.FC<ShareStoryButtonSimpleProps> = ({ 
  movie,
  compact = false 
}) => {
  const [isSharing, setIsSharing] = useState(false);

  const globalRating = ((movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4).toFixed(1);

  const generateStoryImage = async (): Promise<string> => {
    // Créer un canvas HTML5 natif
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Canvas non supporté');

    // 1. FOND NOIR
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1080, 1920);

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
          const canvasRatio = 1080 / 1920;
          let drawWidth, drawHeight, offsetX, offsetY;
          
          if (imgRatio > canvasRatio) {
            drawHeight = 1920;
            drawWidth = img.width * (1920 / img.height);
            offsetX = (1080 - drawWidth) / 2;
            offsetY = 0;
          } else {
            drawWidth = 1080;
            drawHeight = img.height * (1080 / img.width);
            offsetX = 0;
            offsetY = (1920 - drawHeight) / 2;
          }
          ctx.globalAlpha = 0.85;
          ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
          ctx.globalAlpha = 1.0;
        }
      } catch (err) {
        console.warn('Erreur affiche:', err);
      }
    }

    // 3. GRADIENT OVERLAY
    const gradient = ctx.createLinearGradient(0, 0, 0, 1920);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.2)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.5)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.9)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1920);

    // 4. CONFIGURATION TEXTE DE BASE
    ctx.textBaseline = 'top';

    // 5. TITRE DU FILM
    ctx.fillStyle = '#ffffff';
    let fontSize = 90;
    const maxWidth = 960;
    ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
    
    const words = movie.title.toUpperCase().split(' ');
    let lines: string[] = [];
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
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
    
    const titleY = 1000; 
    lines.forEach((line, i) => {
      ctx.fillText(line, 60, titleY + (i * (fontSize + 10)));
    });

    // 6. BADGE GENRE
    const genreY = titleY + (lines.length * (fontSize + 10)) + 20;
    const genreText = movie.genre.toUpperCase();
    
    ctx.font = '800 24px "Inter", sans-serif';
    const genreWidth = ctx.measureText(genreText).width;
    const badgeWidth = genreWidth + 60;
    const badgeHeight = 54;
    
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    // @ts-ignore
    if (ctx.roundRect) ctx.roundRect(60, genreY, badgeWidth, badgeHeight, 27);
    else ctx.fillRect(60, genreY, badgeWidth, badgeHeight);
    ctx.fill();
    
    ctx.strokeStyle = 'rgba(217, 255, 0, 0.6)';
    ctx.lineWidth = 3;
    // @ts-ignore
    if (ctx.roundRect) ctx.roundRect(60, genreY, badgeWidth, badgeHeight, 27);
    ctx.stroke();
    
    ctx.fillStyle = '#D9FF00';
    ctx.textBaseline = 'middle';
    ctx.fillText(genreText, 90, genreY + 27);
    ctx.textBaseline = 'top';

    // 7. NOTE GLOBALE (GAUCHE)
    const noteY = genreY + 40; 
    ctx.fillStyle = '#D9FF00';
    ctx.font = '900 320px "Inter", sans-serif';
    
    ctx.shadowColor = 'rgba(217, 255, 0, 0.4)';
    ctx.shadowBlur = 60;
    ctx.fillText(globalRating, 40, noteY);
    ctx.shadowBlur = 0;

    // 8. TECHNICAL SPECS (JAUGES FILAIRES À DROITE)
    const baselineY = noteY + 265; 
    const blockX = 580; // Début du bloc à droite de la note
    const blockWidth = 440; // Largeur fixe
    const gapY = 55; // Espace entre les jauges

    const specs = [
      { label: 'SCRIPT', val: movie.ratings.story },
      { label: 'ACTING', val: movie.ratings.acting },
      { label: 'VISUEL', val: movie.ratings.visuals },
      { label: 'SON', val: movie.ratings.sound }
    ];

    // On part du bas pour aligner sur la ligne de base
    specs.reverse().forEach((spec, i) => {
      const itemY = baselineY - (i * gapY) - 35; // 35px pour laisser de la place à la barre elle-même

      // LABEL (Gauche, Blanc)
      ctx.fillStyle = '#ffffff';
      ctx.font = '700 18px "Inter", sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(spec.label, blockX, itemY);

      // NOTE (Droite, Lime, Monospace)
      ctx.fillStyle = '#D9FF00';
      ctx.font = '900 20px "Courier New", monospace';
      ctx.textAlign = 'right';
      ctx.fillText(spec.val.toFixed(1), blockX + blockWidth, itemY);

      // BARRE (Juste en dessous du texte)
      const barY = itemY + 30;
      const barHeight = 4;
      
      // Track (Gris transparent)
      ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.fillRect(blockX, barY, blockWidth, barHeight);
      
      // Fill (Lime)
      ctx.fillStyle = '#D9FF00';
      const fillWidth = (spec.val / 10) * blockWidth;
      ctx.fillRect(blockX, barY, fillWidth, barHeight);
    });

    // Reset alignement
    ctx.textAlign = 'left';

    // 9. LABEL "MON VERDICT"
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 24px "Inter", sans-serif';
    ctx.fillText('MON VERDICT CRITIQUE', 65, noteY + 295);

    // 10. FOOTER MAGAZINE
    const footerHeight = 250; 
    const footerY = 1920 - footerHeight;

    ctx.fillStyle = '#0c0c0c';
    ctx.fillRect(0, footerY, 1080, footerHeight);

    // GAUCHE : Logo "THE BITTER"
    ctx.fillStyle = '#D9FF00';
    ctx.font = '900 68px "Inter", sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.fillText('THE BITTER', 60, footerY + 65);

    // Sous-titre
    ctx.fillStyle = '#666666';
    ctx.font = '700 18px "Inter", sans-serif';
    ctx.fillText('AVAILABLE ON IOS & ANDROID', 60, footerY + 155);

    // DROITE : Slogan
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 48px "Inter", sans-serif';
    ctx.textAlign = 'right';

    const sloganX = 1020;
    ctx.fillText('JUDGE.', sloganX, footerY + 45);
    ctx.fillText('RATE.', sloganX, footerY + 105);
    ctx.fillText('HATE.', sloganX, footerY + 165);

    // Reset final
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';

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
          files: [file]
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
      console.error('Erreur Story:', error);
    } finally {
      setIsSharing(false);
    }
  };

  const gradientStyles = "bg-gradient-to-tr from-[#833ab4] via-[#fd1d1d] to-[#fcb045]";

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
        <><Loader2 size={14} className="animate-spin" /> Verdict...</>
      ) : (
        <><Instagram size={14} /> Story</>
      )}
    </button>
  );
};

const haptics = {
  medium: () => {
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      navigator.vibrate(40);
    }
  }
};

export default ShareStoryButtonSimple;