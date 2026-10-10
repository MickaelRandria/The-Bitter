import React from 'react';
import { Film } from 'lucide-react';
import { avatarSrc } from '../../utils/avatar';
import { TmdbImageSize, resizeTmdbImage } from '../../utils/tmdbImage';

/** Ce qu'il faut d'un membre pour le dessiner. */
export interface VerdictPerson {
  id: string;
  name: string;
  avatarUrl?: string | null;
  /** Couleur de ses marques dans les graphiques : `var(--vd-cN)`. */
  color: string;
  isMe: boolean;
}

/**
 * Avatar d'un membre : sa photo, sinon son initiale. Le liseré porte sa couleur
 * de graphique, pour qu'on le reconnaisse d'une réglette à l'autre.
 */
export const Avatar: React.FC<{ person: VerdictPerson; size?: number; ring?: boolean; dashed?: boolean; className?: string }> = ({
  person,
  size = 28,
  ring = false,
  dashed = false,
  className = '',
}) => {
  const src = avatarSrc(person.avatarUrl);
  return (
    <span
      className={`shrink-0 rounded-full overflow-hidden flex items-center justify-center font-black text-white ${dashed ? 'opacity-60' : ''} ${className}`}
      style={{
        width: size,
        height: size,
        fontSize: Math.round(size * 0.4),
        background: person.color,
        boxShadow: ring ? `0 0 0 2px var(--vd-surface, #FDFCF8), 0 0 0 4px ${person.color}` : undefined,
        outline: dashed ? `2px dashed ${person.color}` : undefined,
        outlineOffset: dashed ? 2 : undefined,
      }}
      aria-hidden
    >
      {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : (person.name || '?')[0].toUpperCase()}
    </span>
  );
};

/** Anneau « 2/3 » : combien de notes sont posées sur combien attendues. */
export const ProgressRing: React.FC<{ done: number; total: number; size?: number }> = ({ done, total, size = 44 }) => {
  const r = 18;
  const c = 2 * Math.PI * r;
  return (
    <svg width={size} height={size} viewBox="0 0 44 44" className="shrink-0" role="img" aria-label={`${done}/${total}`}>
      <circle cx="22" cy="22" r={r} fill="none" strokeWidth="4" className="stroke-sand dark:stroke-white/10" />
      <circle
        cx="22"
        cy="22"
        r={r}
        fill="none"
        strokeWidth="4"
        strokeLinecap="round"
        className="stroke-forest dark:stroke-bitter-lime"
        strokeDasharray={c.toFixed(1)}
        strokeDashoffset={(c * (1 - (total ? done / total : 0))).toFixed(1)}
        transform="rotate(-90 22 22)"
      />
      <text x="22" y="26" textAnchor="middle" className="fill-charcoal dark:fill-white" style={{ font: '900 11px Inter, sans-serif' }}>
        {done}/{total}
      </text>
    </svg>
  );
};

/** Affiche TMDB, ou un fond neutre si elle manque ou ne charge pas. */
export const Poster: React.FC<{ url?: string | null; size?: 'w92' | 'w185' | 'w342'; className?: string; children?: React.ReactNode }> = ({
  url,
  size = 'w185',
  className = '',
  children,
}) => (
  <span className={`relative block overflow-hidden bg-stone-200 dark:bg-[#1a1a1a] ${className}`}>
    {url ? (
      <img
        src={resizeTmdbImage(url, size as TmdbImageSize)}
        alt=""
        className="absolute inset-0 w-full h-full object-cover"
        loading="lazy"
        decoding="async"
        onError={(e) => {
          e.currentTarget.style.visibility = 'hidden';
        }}
      />
    ) : (
      <span className="absolute inset-0 flex items-center justify-center text-stone-400">
        <Film size={14} />
      </span>
    )}
    {children}
  </span>
);
