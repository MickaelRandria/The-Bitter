
import React, { useState } from 'react';
import { Instagram, Loader2, Share2 } from 'lucide-react';
import { toPng } from 'html-to-image';
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
    // 1. Pré-chargement de l'image en Base64 pour éviter les problèmes CORS / html-to-image
    const posterUrl = movie.posterUrl ? movie.posterUrl.replace('w780', 'original') : '';
    let finalPosterSrc = posterUrl;

    if (posterUrl) {
      try {
        // Ajout d'un timestamp pour éviter le cache opaque du navigateur qui bloque CORS
        const urlWithCacheBust = `${posterUrl}${posterUrl.includes('?') ? '&' : '?'}t=${new Date().getTime()}`;
        const response = await fetch(urlWithCacheBust, { mode: 'cors' });
        const blob = await response.blob();
        finalPosterSrc = await new Promise<string>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => resolve(reader.result as string);
          reader.readAsDataURL(blob);
        });
      } catch (err) {
        console.warn("Erreur chargement poster base64", err);
      }
    }

    const canvas = document.createElement('div');
    canvas.style.width = '1080px';
    canvas.style.height = '1920px';
    canvas.style.position = 'absolute';
    canvas.style.left = '-9999px';
    canvas.style.top = '0';
    
    // On utilise une structure HTML simple pour html-to-image
    canvas.innerHTML = `
      <div style="
        width: 1080px;
        height: 1920px;
        background: #000000;
        position: relative;
        font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
        color: white;
        overflow: hidden;
      ">
        
        ${finalPosterSrc ? `
          <img 
            src="${finalPosterSrc}"
            crossorigin="anonymous"
            style="
              position: absolute;
              inset: 0;
              width: 100%;
              height: 100%;
              object-fit: cover;
              object-position: center;
              opacity: 0.85;
              filter: blur(2px);
            "
          />
        ` : `
          <div style="
            position: absolute;
            inset: 0;
            background: linear-gradient(135deg, #1a1a1a 0%, #0c0c0c 100%);
          "></div>
        `}
        
        <div style="
          position: absolute;
          inset: 0;
          background: linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.75) 0%,
            rgba(0, 0, 0, 0.4) 40%,
            rgba(0, 0, 0, 0.6) 70%,
            rgba(0, 0, 0, 0.95) 100%
          );
        "></div>
        
        <div style="
          position: absolute;
          inset: 0;
          padding: 80px 60px;
          display: flex;
          flex-direction: column;
          justify-content: space-between;
          z-index: 10;
        ">
          
          <div style="
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            margin-bottom: 60px;
          ">
            <div style="
              font-size: 36px;
              font-weight: 900;
              text-transform: uppercase;
              letter-spacing: 0.2em;
            ">
              <span style="
                border-bottom: 6px solid #a3e635;
                padding-bottom: 8px;
              ">The</span>
              <span style="margin-left: 12px;">Bitter</span>
            </div>
            <div style="
              font-size: 32px;
              font-weight: 700;
              color: #d6d3d1;
              letter-spacing: 0.1em;
            ">${movie.year || '2026'}</div>
          </div>
          
          <div>
            <h1 style="
              font-size: 100px;
              font-weight: 900;
              line-height: 0.95;
              margin: 0 0 50px 0;
              text-transform: uppercase;
              letter-spacing: -0.02em;
              text-shadow: 0 4px 20px rgba(0, 0, 0, 0.5);
            ">${movie.title}</h1>
            
            <div style="
              display: inline-block;
              border: 4px solid rgba(163, 230, 53, 0.6);
              color: #a3e635;
              padding: 14px 40px;
              border-radius: 999px;
              font-size: 26px;
              font-weight: 800;
              text-transform: uppercase;
              letter-spacing: 0.15em;
              background: rgba(0, 0, 0, 0.6);
              margin-bottom: 80px;
            ">${movie.genre}</div>
            
            <div style="position: relative; margin-top: 60px;">
              <div style="
                font-size: 340px;
                font-weight: 900;
                color: #a3e635;
                line-height: 0.75;
                margin-left: -20px;
                text-shadow: 
                  0 0 100px rgba(163, 230, 53, 0.4),
                  0 4px 30px rgba(0, 0, 0, 0.8);
              ">${globalRating}</div>
              <div style="
                position: absolute;
                bottom: 50px;
                left: 35px;
                font-size: 30px;
                font-weight: 800;
                text-transform: uppercase;
                letter-spacing: 0.3em;
                opacity: 0.95;
                text-shadow: 0 2px 10px rgba(0, 0, 0, 0.5);
                color: white;
              ">Mon Verdict</div>
            </div>
          </div>
        </div>
      </div>
    `;
    
    document.body.appendChild(canvas);
    
    try {
      // Délai pour assurer le chargement des fonts et de l'image (surtout sur iOS)
      await new Promise(resolve => setTimeout(resolve, 800));
      
      const dataUrl = await toPng(canvas, {
        width: 1080,
        height: 1920,
        quality: 1.0,
        pixelRatio: 1.5,
        cacheBust: true,
        useCORS: true, // Crucial pour les fallbacks
      });
      
      return dataUrl;
      
    } finally {
      document.body.removeChild(canvas);
    }
  };

  const handleShare = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsSharing(true);
    
    try {
      const imageDataUrl = await generateStoryImage();
      
      const response = await fetch(imageDataUrl);
      const blob = await response.blob();
      
      // Nom de fichier sécurisé
      const safeTitle = movie.title.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0, 50);
      const file = new File([blob], `bitter-${safeTitle}.png`, { 
        type: 'image/png' 
      });
      
      if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `Verdict: ${movie.title}`,
          text: `Mon avis sur ${movie.title} : ${globalRating}/10 #TheBitter`
        });
      } else {
        // Fallback téléchargement
        const link = document.createElement('a');
        link.href = imageDataUrl;
        link.download = `bitter-${safeTitle}.png`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
      
    } catch (error) {
      console.error('Erreur partage:', error);
      alert('Erreur lors de la génération de l\'image. Réessayez.');
    } finally {
      setIsSharing(false);
    }
  };

  if (compact) {
    return (
      <button
        onClick={handleShare}
        disabled={isSharing}
        className="p-4 rounded-2xl bg-gradient-to-tr from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white active:scale-90 transition-all duration-150 shadow-lg disabled:opacity-50"
        title="Partager en Story"
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
      className="flex-1 flex items-center justify-center gap-2 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest bg-gradient-to-tr from-[#833ab4] via-[#fd1d1d] to-[#fcb045] text-white active:scale-95 transition-all duration-150 shadow-lg disabled:opacity-50 disabled:scale-100"
    >
      {isSharing ? (
        <>
          <Loader2 size={14} className="animate-spin" />
          Génération...
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

export default ShareStoryButtonSimple;
