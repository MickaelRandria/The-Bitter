import React from 'react';
import { Check } from 'lucide-react';
import { Platform } from '../utils/platforms';

/**
 * Une plateforme à choisir : la couleur de la marque en fond et son nom en
 * filigrane quand elle est choisie ; un fond neutre, le filigrane à peine
 * visible, sinon.
 */
const PlatformCard: React.FC<{
  platform: Platform;
  selected: boolean;
  /** Sous le nom : « Ajouter », un nombre de titres… */
  caption?: string;
  onToggle: () => void;
}> = ({ platform, selected, caption, onToggle }) => (
  <button
    type="button"
    onClick={onToggle}
    aria-pressed={selected}
    style={{ '--c': platform.color } as React.CSSProperties}
    className={`relative isolate overflow-hidden h-[62px] rounded-2xl px-3 py-2.5 text-left flex flex-col justify-between active:scale-[0.97] transition-all duration-300 ${
      selected
        ? 'bg-[var(--c)] text-white shadow-md'
        : 'bg-stone-100 dark:bg-white/5 text-stone-400 dark:text-stone-500'
    }`}
  >
    {selected && (
      <span className="absolute inset-0 -z-10 bg-[radial-gradient(120%_140%_at_100%_0%,rgba(255,255,255,0.28),transparent_55%),linear-gradient(160deg,transparent_30%,rgba(0,0,0,0.45))]" />
    )}
    <span
      aria-hidden="true"
      className={`absolute -right-1.5 -bottom-3.5 -z-10 text-[40px] font-black tracking-[-0.07em] leading-none whitespace-nowrap ${
        selected ? 'opacity-[0.16]' : 'opacity-[0.07] text-[var(--c)] dark:text-white dark:opacity-[0.05]'
      }`}
    >
      {platform.mark}
    </span>
    <b className="text-[12.5px] font-black tracking-[-0.02em] pr-6">{platform.name}</b>
    {caption && <small className="text-[9.5px] font-extrabold opacity-80">{caption}</small>}
    <span
      className={`absolute top-2 right-2 w-[18px] h-[18px] rounded-full flex items-center justify-center ${
        selected ? 'bg-bitter-lime text-charcoal' : 'border-[1.5px] border-stone-300 dark:border-white/20'
      }`}
    >
      {selected && <Check size={11} strokeWidth={3.5} />}
    </span>
  </button>
);

export default PlatformCard;
