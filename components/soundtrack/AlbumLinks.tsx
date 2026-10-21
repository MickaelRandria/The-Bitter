import React from 'react';
import { appleMusicSearchUrl, spotifySearchUrl, type SoundtrackAlbum } from '../../services/soundtrack';

/**
 * L'album complet hors de l'appli. Deezer a un lien direct ; Spotify et Apple
 * Music n'ouvrent qu'une recherche, faute d'API ouverte (Spotify l'a fermée aux
 * petites applis en février 2026).
 */
const AlbumLinks: React.FC<{ album: SoundtrackAlbum; tone: 'light' | 'dark' }> = ({ album, tone }) => {
  const dark = tone === 'dark';
  const primary = dark
    ? 'bg-bitter-lime text-charcoal'
    : 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal';
  const secondary = dark
    ? 'bg-white/10 text-white'
    : 'bg-white border border-stone-200 text-charcoal dark:bg-white/5 dark:border-white/10 dark:text-white';
  const base = 'h-11 rounded-2xl flex items-center justify-center text-xs font-black active:scale-[0.98] transition-transform';
  return (
    <div className="grid grid-cols-3 gap-2">
      <a href={album.link} target="_blank" rel="noopener noreferrer" className={`${base} ${primary}`}>
        Deezer
      </a>
      <a href={spotifySearchUrl(album)} target="_blank" rel="noopener noreferrer" className={`${base} ${secondary}`}>
        Spotify
      </a>
      <a href={appleMusicSearchUrl(album)} target="_blank" rel="noopener noreferrer" className={`${base} ${secondary}`}>
        Apple Music
      </a>
    </div>
  );
};

export default AlbumLinks;
