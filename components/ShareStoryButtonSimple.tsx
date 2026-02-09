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
    // Créer un canvas HTML5 natif (PAS de librairie externe)
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 1920;
    const ctx = canvas.getContext('2d');
    
    if (!ctx) throw new Error('Canvas non supporté');

    // 1. FOND NOIR
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, 1080, 1920);

    // 2. CHARGER L'AFFICHE (si disponible)
    if (movie.posterUrl) {
      try {
        const img = new Image();
        img.crossOrigin = 'anonymous'; // CRITICAL pour CORS
        
        await new Promise<void>((resolve) => {
          img.onload = () => resolve();
          img.onerror = () => {
            console.warn('Affiche non chargée, on continue sans');
            resolve();
          };
          // Utilisation de l'URL originale pour une meilleure qualité en Story
          const posterUrl = movie.posterUrl?.replace('w780', 'original');
          if (posterUrl) img.src = posterUrl;
          else resolve();
        });

        // Si l'image a chargé, la dessiner en mode "cover"
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

    // 3. GRADIENT OVERLAY (Pour la lisibilité)
    const gradient = ctx.createLinearGradient(0, 0, 0, 1920);
    gradient.addColorStop(0, 'rgba(0, 0, 0, 0.75)');
    gradient.addColorStop(0.4, 'rgba(0, 0, 0, 0.3)');
    gradient.addColorStop(0.7, 'rgba(0, 0, 0, 0.6)');
    gradient.addColorStop(1, 'rgba(0, 0, 0, 0.95)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1080, 1920);

    // 4. CONFIGURATION TEXTE
    ctx.textBaseline = 'top';

    // 5. HEADER "THE BITTER"
    ctx.fillStyle = '#ffffff';
    ctx.font = '900 36px "Inter", sans-serif';
    ctx.fillText('THE', 60, 100);
    
    // Soulignage vert
    ctx.fillStyle = '#D9FF00';
    ctx.fillRect(60, 145, 90, 6);
    
    ctx.fillStyle = '#ffffff';
    ctx.fillText('BITTER', 165, 100);

    // 6. ANNÉE
    ctx.fillStyle = '#d6d3d1';
    ctx.font = '700 32px "Inter", sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(movie.year.toString(), 1020, 100);
    ctx.textAlign = 'left';

    // 7. TITRE DU FILM
    ctx.fillStyle = '#ffffff';
    let fontSize = 90;
    const maxWidth = 960;
    ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
    
    // Multi-ligne intelligent
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
    
    // Ajustement taille si trop de lignes
    if (lines.length > 3) {
      fontSize = 70;
      ctx.font = `900 ${fontSize}px "Inter", sans-serif`;
      lines = lines.slice(0, 3);
      lines[2] = lines[2] + '...';
    }
    
    const titleY = 1350;
    lines.forEach((line, i) => {
      ctx.fillText(line, 60, titleY + (i * (fontSize + 10)));
    });

    // 8. BADGE GENRE
    const genreY = titleY + (lines.length * (fontSize + 10)) + 40;
    const genreText = movie.genre.toUpperCase();
    
    ctx.font = '800 24px "Inter", sans-serif';
    const genreWidth = ctx.measureText(genreText).width;
    const badgeWidth = genreWidth + 60;
    const badgeHeight = 54;
    
    // Background du badge
    ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
    // @ts-ignore - roundRect est supporté sur les navigateurs modernes
    if (ctx.roundRect) ctx.roundRect(60, genreY, badgeWidth, badgeHeight, 27);
    else ctx.fillRect(60, genreY, badgeWidth, badgeHeight);
    ctx.fill();
    
    // Bordure du badge
    ctx.strokeStyle = 'rgba(217, 255, 0, 0.6)';
    ctx.lineWidth = 3;
    // @ts-ignore
    if (ctx.roundRect) ctx.roundRect(60, genreY, badgeWidth, badgeHeight, 27);
    ctx.stroke();
    
    // Texte du genre
    ctx.fillStyle = '#D9FF00';
    ctx.textBaseline = 'middle';
    ctx.fillText(genreText, 90, genreY + 27);
    ctx.textBaseline = 'top';

    // 9. NOTE GLOBALE (Gros impact visuel)
    const noteY = 1580;
    ctx.fillStyle = '#D9FF00';
    ctx.font = '900 320px "Inter", sans-serif';
    
    // Glow effect
    ctx.shadowColor = 'rgba(217, 255, 0, 0.5)';
    ctx.shadowBlur = 80;
    ctx.fillText(globalRating, 40, noteY);
    ctx.shadowBlur = 0;

    // 10. LABEL VERDICT
    ctx.fillStyle = '#ffffff';
    ctx.font = '800 28px "Inter", sans-serif';
    ctx.fillText('MON VERDICT CRITIQUE', 65, noteY + 270);

    // Convertir en PNG Haute Définition
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
          text: `Mon analyse sur ${movie.title} est tombée : ${globalRating}/10.`,
          files: [file]
        });
      } else {
        // Fallback: Téléchargement
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        
        alert('📥 Verdict généré ! Tu peux maintenant le partager en story.');
      }
      
    } catch (error) {
      console.error('Erreur partage Story:', error);
      alert('Erreur lors de la génération. Réessayez.');
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
        title="Partager mon verdict"
      >
        {isSharing ? (
          <Loader2 size={20} className="animate-spin" />
        ) : (
          <Share2 size={20} />
        )}
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
          <Loader2 size={14} className="animate-spin" />
          Verdict...
        </>
      ) : (
        <>
          <Instagram size={14} />
          Story
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
  }
};

export default ShareStoryButtonSimple;