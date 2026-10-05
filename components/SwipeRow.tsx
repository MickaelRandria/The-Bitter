import React, { useRef, useState } from 'react';
import { Check, X } from 'lucide-react';
import { haptics } from '../utils/haptics';

interface Props {
  children: React.ReactNode;
  rightLabel: string;
  leftLabel: string;
  onSwipeRight: () => void;
  onSwipeLeft: () => void;
  className?: string;
  /** Fond de la ligne qui glisse : opaque, pour cacher ce qu'elle révèle. */
  surfaceClassName?: string;
}

/** Au-delà de cette distance, lâcher la ligne vaut réponse. */
const THRESHOLD = 88;

/**
 * Une ligne qu'on fait glisser : à droite « partant », à gauche « pas envie ».
 *
 * La pile « À toi de jouer » ne montre que les films sans réponse ; quelqu'un
 * qui a déjà tout voté n'y voit jamais de carte, donc jamais le geste. On le
 * pose aussi sur chaque film de la liste, pour répondre ou changer d'avis.
 *
 * Le geste ne prend que l'horizontal (le défilement vertical reste libre), et
 * un glissé avalé ne déclenche pas le clic des boutons de la ligne.
 */
const SwipeRow: React.FC<Props> = ({
  children,
  rightLabel,
  leftLabel,
  onSwipeRight,
  onSwipeLeft,
  className = '',
  surfaceClassName = 'bg-white dark:bg-[#1a1a1a]',
}) => {
  const [drag, setDrag] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; id: number; locked: boolean } | null>(null);
  const moved = useRef(false);
  const armed = useRef(false);

  const onPointerDown = (e: React.PointerEvent) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId, locked: false };
    moved.current = false;
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const s = start.current;
    if (!s || s.id !== e.pointerId) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (!s.locked) {
      // Le premier mouvement franc décide : vertical, on laisse défiler.
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        start.current = null;
        return;
      }
      if (Math.abs(dx) < 10) return;
      s.locked = true;
      moved.current = true;
      setDragging(true);
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    }
    // Résistance au-delà du seuil : la ligne suit, mais de moins en moins.
    const resisted = Math.sign(dx) * Math.min(Math.abs(dx), THRESHOLD + (Math.abs(dx) - THRESHOLD) * 0.35);
    const crossed = Math.abs(dx) >= THRESHOLD;
    if (crossed !== armed.current) {
      armed.current = crossed;
      if (crossed) haptics.soft();
    }
    setDrag(Math.abs(dx) < THRESHOLD ? dx : resisted);
  };

  const finish = () => {
    const s = start.current;
    start.current = null;
    setDragging(false);
    armed.current = false;
    if (s?.locked) {
      if (drag >= THRESHOLD) onSwipeRight();
      else if (drag <= -THRESHOLD) onSwipeLeft();
    }
    setDrag(0);
  };

  const progress = Math.min(1, Math.abs(drag) / THRESHOLD);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      {/* Ce qui se révèle sous la ligne, selon le sens. */}
      <div
        aria-hidden
        className={`absolute inset-0 flex items-center px-5 ${drag >= 0 ? 'justify-start bg-bitter-lime text-charcoal' : 'justify-end bg-stone-300 dark:bg-stone-700 text-charcoal dark:text-white'}`}
        style={{ opacity: drag === 0 ? 0 : 0.35 + progress * 0.65 }}
      >
        <span
          className="flex items-center gap-2 text-xs font-black"
          style={{ transform: `scale(${0.85 + progress * 0.15})` }}
        >
          {drag >= 0 ? <Check size={16} strokeWidth={3} /> : null}
          {drag >= 0 ? rightLabel : leftLabel}
          {drag < 0 ? <X size={16} strokeWidth={3} /> : null}
        </span>
      </div>
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onClickCapture={(e) => {
          if (moved.current) {
            e.stopPropagation();
            e.preventDefault();
            moved.current = false;
          }
        }}
        className={`relative touch-pan-y select-none ${surfaceClassName}`}
        style={{
          transform: `translateX(${drag}px)`,
          transition: dragging ? 'none' : 'transform 0.3s cubic-bezier(0.16,1,0.3,1)',
        }}
      >
        {children}
      </div>
    </div>
  );
};

export default SwipeRow;
