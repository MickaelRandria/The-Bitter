import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, Check, Sparkles, X, MousePointerClick } from 'lucide-react';
import type { TourStep } from '../constants/tour';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

/** Marge entre le contour lumineux et l'élément mis en avant. */
const SPOTLIGHT_PADDING = 10;
/** Espace laissé entre le trou et la carte d'explication. */
const CARD_GAP = 16;
/** Hauteur retenue pour calculer la bande libre tant que la carte n'est pas mesurée. */
const CARD_FALLBACK_HEIGHT = 260;
/** Au-delà, on considère que la cible n'existe pas sur cette page et on affiche la carte seule. */
const FIND_TIMEOUT_MS = 3000;
/** Laisse l'app réagir au geste (navigation, accordéon) avant de changer d'étape. */
const ACTION_SETTLE_MS = 380;

type Placement = 'above' | 'below' | 'center';

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

/** Premier ancêtre qui défile réellement (contenu des modales, page, etc.). */
const findScroller = (el: HTMLElement): HTMLElement | null => {
  let node = el.parentElement;
  while (node) {
    const overflowY = getComputedStyle(node).overflowY;
    if (/(auto|scroll|overlay)/.test(overflowY) && node.scrollHeight > node.clientHeight) return node;
    node = node.parentElement;
  }
  return null;
};

/**
 * Amène la cible dans la bande d'écran que la carte ne couvre pas.
 *
 * `scrollIntoView({ block: 'center' })` centre dans la fenêtre entière, donc sur la
 * moitié occupée par la carte : une cible haute se retrouvait à moitié masquée. On
 * vise ici le centre de la bande libre, et si la cible est plus haute que la bande
 * on cale son début pour qu'on la lise depuis le haut.
 */
const scrollIntoBand = (el: HTMLElement, bandTop: number, bandBottom: number) => {
  const bandHeight = bandBottom - bandTop;
  if (bandHeight <= 0) return;

  const r = el.getBoundingClientRect();
  const delta =
    r.height > bandHeight
      ? r.top - bandTop
      : r.top + r.height / 2 - (bandTop + bandBottom) / 2;
  if (Math.abs(delta) < 2) return;

  const scroller = findScroller(el);
  if (scroller) scroller.scrollBy({ top: delta, behavior: 'smooth' });
  else window.scrollBy({ top: delta, behavior: 'smooth' });
};

/**
 * Suit la position à l'écran de l'élément portant `data-tour="<target>"` et décide
 * de quel côté poser la carte.
 *
 * La cible n'est pas forcément montée au moment où l'étape démarre (changement de
 * page, Suspense, ouverture d'une modale) : on la cherche image par image pendant
 * quelques secondes. Une fois trouvée, on continue de mesurer à chaque frame plutôt
 * que d'écouter resize/scroll, ce qui suit aussi le défilement fluide, les animations
 * d'entrée et les reflows internes des modales. Le côté de la carte est figé au
 * premier repérage : le recalculer à chaque frame ferait osciller la carte pendant
 * le défilement. Renvoie un rect null tant que rien n'est trouvé, l'appelant retombe
 * alors sur une carte centrée sans spotlight.
 */
const useSpotlight = (target: string | null, cardHeightRef: React.RefObject<number>) => {
  const [rect, setRect] = useState<Rect | null>(null);
  const [placement, setPlacement] = useState<Placement>('center');

  useEffect(() => {
    setRect(null);
    setPlacement('center');
    if (!target) return;

    let raf = 0;
    let aligned = false;
    let last: Rect | null = null;
    const start = performance.now();

    const tick = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

      if (!el) {
        if (performance.now() - start < FIND_TIMEOUT_MS) raf = requestAnimationFrame(tick);
        return;
      }

      if (!aligned) {
        aligned = true;
        const first = el.getBoundingClientRect();
        const vh = window.innerHeight;
        const cardH = cardHeightRef.current || CARD_FALLBACK_HEIGHT;
        // Cible dans la moitié basse : la carte va au-dessus, et inversement.
        const side: Placement = first.top + first.height / 2 > vh / 2 ? 'above' : 'below';
        setPlacement(side);
        scrollIntoBand(
          el,
          side === 'above' ? cardH + CARD_GAP * 2 : CARD_GAP,
          side === 'above' ? vh - CARD_GAP : vh - cardH - CARD_GAP * 2
        );
      }

      const r = el.getBoundingClientRect();
      const next = { top: r.top, left: r.left, width: r.width, height: r.height };
      if (
        !last ||
        last.top !== next.top ||
        last.left !== next.left ||
        last.width !== next.width ||
        last.height !== next.height
      ) {
        last = next;
        setRect(next);
      }
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, cardHeightRef]);

  return { rect, placement };
};

/** Indices des points de progression, extrait pour garder le JSX lisible. */
const tourDots = (total: number) => Array.from({ length: total }, (_, i) => i);

interface GuidedTourProps {
  step: TourStep;
  stepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

/**
 * Visite guidée « spotlight » : on assombrit toute la page sauf l'élément décrit,
 * et on explique ce qu'il fait dans une carte. Rien n'est simulé, l'utilisateur
 * regarde sa vraie app. Sur les étapes interactives, la cible reste cliquable et
 * c'est son geste qui fait avancer le tuto.
 */
const GuidedTour: React.FC<GuidedTourProps> = ({
  step,
  stepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onSkip, t(step.titleKey));

  // La hauteur réelle de la carte sert à calculer la bande libre pour la cible.
  const cardRef = useRef<HTMLDivElement>(null);
  const cardHeightRef = useRef(0);
  useLayoutEffect(() => {
    cardHeightRef.current = cardRef.current?.offsetHeight ?? 0;
  });

  const { rect, placement } = useSpotlight(step.target, cardHeightRef);

  const isFirst = stepIndex === 0;
  const isLast = stepIndex === totalSteps - 1;
  const isInteractive = step.action === 'click' && rect !== null;

  // onNext change à chaque rendu du parent : on le lit via une ref pour ne pas
  // réenregistrer l'écouteur de clic (et perdre le garde anti-double-avance).
  const onNextRef = useRef(onNext);
  onNextRef.current = onNext;
  const firedRef = useRef(false);

  useEffect(() => {
    firedRef.current = false;
  }, [step.id]);

  // Étape interactive : c'est le clic de l'utilisateur sur la vraie cible qui fait
  // avancer. On écoute au niveau du document car la cible peut être remplacée par
  // un rendu React entre-temps.
  useEffect(() => {
    if (step.action !== 'click' || !step.target) return;
    const selector = `[data-tour="${step.target}"]`;

    const onClick = (e: MouseEvent) => {
      if (firedRef.current) return;
      const el = e.target as HTMLElement | null;
      if (!el?.closest?.(selector)) return;
      firedRef.current = true;
      window.setTimeout(() => onNextRef.current(), ACTION_SETTLE_MS);
    };

    document.addEventListener('click', onClick);
    return () => document.removeEventListener('click', onClick);
  }, [step.action, step.target]);

  const hole = rect
    ? {
        top: rect.top - SPOTLIGHT_PADDING,
        left: rect.left - SPOTLIGHT_PADDING,
        width: rect.width + SPOTLIGHT_PADDING * 2,
        height: rect.height + SPOTLIGHT_PADDING * 2,
      }
    : null;

  // La carte se pose du côté décidé au repérage, jamais par-dessus la cible : ce
  // qu'on décrit doit rester visible pendant qu'on le décrit, et cliquable sur les
  // étapes interactives. La hauteur max est portée par la carte elle-même : sur un
  // conteneur en hauteur automatique, un `max-height: 100%` interne ne contraint
  // rien et la carte débordait sur la cible.
  const cardStyle: React.CSSProperties = (() => {
    if (!hole || placement === 'center') {
      return { top: '50%', transform: 'translateY(-50%)', maxHeight: 'calc(100dvh - 3rem)' };
    }
    if (placement === 'below') {
      const top = hole.top + hole.height + CARD_GAP;
      return { top, maxHeight: Math.max(120, window.innerHeight - top - CARD_GAP) };
    }
    const bottom = window.innerHeight - hole.top + CARD_GAP;
    return { bottom, maxHeight: Math.max(120, hole.top - CARD_GAP * 2) };
  })();

  const handleNext = () => {
    haptics.soft();
    onNext();
  };

  const handlePrev = () => {
    haptics.soft();
    onPrev();
  };

  const handleSkip = () => {
    haptics.medium();
    onSkip();
  };

  const bullets = step.bullets
    ? Array.from({ length: step.bullets }, (_, i) => t(`tour.${step.id}.b${i + 1}`))
    : [];

  return createPortal(
    // Le conteneur laisse passer les clics : ce sont les panneaux ci-dessous qui
    // bloquent la page, en épargnant le trou quand l'étape est interactive.
    <div
      {...dialog.props}
      className="fixed inset-0 z-[500] overflow-hidden pointer-events-none animate-[fadeIn_0.3s_ease-out]"
    >
      {isInteractive && hole ? (
        <>
          <div
            className="absolute left-0 right-0 top-0 pointer-events-auto"
            style={{ height: Math.max(0, hole.top) }}
          />
          <div
            className="absolute left-0 right-0 bottom-0 pointer-events-auto"
            style={{ top: hole.top + hole.height }}
          />
          <div
            className="absolute left-0 pointer-events-auto"
            style={{ top: hole.top, height: hole.height, width: Math.max(0, hole.left) }}
          />
          <div
            className="absolute right-0 pointer-events-auto"
            style={{ top: hole.top, height: hole.height, left: hole.left + hole.width }}
          />
        </>
      ) : (
        <div className="absolute inset-0 pointer-events-auto" />
      )}

      {hole ? (
        <>
          {/* L'ombre portée géante assombrit tout l'écran SAUF ce rectangle : c'est le
              trou du spotlight. Purement visuel, il ne capte aucun clic. Son opacité
              doit rester fixe, sinon c'est toute la page qui clignoterait. */}
          <div
            className="absolute rounded-[1.5rem] pointer-events-none transition-all duration-300 ease-out"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              boxShadow: '0 0 0 9999px rgba(12,12,12,0.78)',
              outline: '2px solid rgba(217,255,0,0.75)',
            }}
          />
          {/* Anneau séparé : lui seul pulse, pour signaler « c'est ici qu'on clique ». */}
          {isInteractive && (
            <div
              className="absolute rounded-[1.5rem] pointer-events-none border-2 border-[#D9FF00] animate-pulse transition-all duration-300 ease-out"
              style={{
                top: hole.top,
                left: hole.left,
                width: hole.width,
                height: hole.height,
              }}
            />
          )}
        </>
      ) : (
        <div className="absolute inset-0 bg-[#0c0c0c]/[0.78] pointer-events-none" />
      )}

      <div
        ref={cardRef}
        style={cardStyle}
        className="absolute left-4 right-4 max-w-md mx-auto pointer-events-auto flex flex-col overflow-hidden bg-[#0c0c0c] border border-white/10 rounded-[1.75rem] shadow-2xl animate-[scaleIn_0.3s_cubic-bezier(0.16,1,0.3,1)]"
      >
        <div className="absolute top-[-40%] left-[-20%] w-[200px] h-[200px] bg-[#D9FF00]/10 rounded-full blur-[90px] pointer-events-none" />

        <button
          onClick={handleSkip}
          aria-label={t('tour.skip')}
          className="absolute top-4 right-4 z-10 w-7 h-7 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
        >
          <X size={12} strokeWidth={2.5} />
        </button>

        <div className="relative flex-1 min-h-0 overflow-y-auto no-scrollbar p-5">
          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-[#D9FF00]/30 bg-[#D9FF00]/10 text-[#D9FF00] text-[9px] font-black uppercase tracking-widest mb-3">
            <Sparkles size={10} />
            {stepIndex + 1} / {totalSteps}
          </div>

          <h2 className="text-xl font-black text-white tracking-tight leading-snug mb-1.5 pr-8">
            {t(step.titleKey)}
          </h2>
          <p className="text-[13px] font-medium text-stone-400 leading-relaxed">
            {t(step.bodyKey)}
          </p>

          {bullets.length > 0 && (
            <ul className="mt-3 space-y-1.5">
              {bullets.map((line) => (
                <li key={line} className="flex gap-2 text-[12px] leading-snug text-stone-300">
                  <span className="text-[#D9FF00] shrink-0 font-black">·</span>
                  <span className="font-medium">{line}</span>
                </li>
              ))}
            </ul>
          )}

          {isInteractive && step.ctaKey && (
            <div className="mt-4 flex items-center gap-2 rounded-xl border border-[#D9FF00]/30 bg-[#D9FF00]/10 px-3 py-2.5 text-[#D9FF00]">
              <MousePointerClick size={13} strokeWidth={2.5} className="shrink-0" />
              <span className="text-[10px] font-black uppercase tracking-wider leading-tight">
                {t(step.ctaKey)}
              </span>
            </div>
          )}
        </div>

        <div className="relative shrink-0 px-5 pb-4 pt-1">
          <div className="flex items-center gap-1 mb-3">
            {tourDots(totalSteps).map((i) => (
              <span
                key={i}
                className={`h-1 rounded-full transition-all duration-300 ${
                  i === stepIndex
                    ? 'w-4 bg-[#D9FF00]'
                    : i < stepIndex
                      ? 'w-1 bg-white/40'
                      : 'w-1 bg-white/15'
                }`}
              />
            ))}
          </div>

          <div className="flex items-center gap-2">
            {!isFirst && (
              <button
                onClick={handlePrev}
                aria-label={t('common.back')}
                className="shrink-0 w-10 h-10 rounded-xl bg-white/5 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/10"
              >
                <ChevronLeft size={16} strokeWidth={2.5} />
              </button>
            )}

            {isInteractive ? (
              // La cible est cliquable : c'est le geste qui fait avancer. Ce lien
              // discret évite seulement de rester bloqué.
              <button
                onClick={handleNext}
                data-testid="tour-next"
                className="ml-auto px-3 py-2 text-[10px] font-bold text-stone-500 hover:text-white uppercase tracking-widest transition-colors"
              >
                {t('tour.skipStep')}
              </button>
            ) : (
              <button
                onClick={handleNext}
                data-testid="tour-next"
                className="flex-1 bg-[#D9FF00] text-black py-3 rounded-xl font-black text-[11px] uppercase tracking-[0.18em] flex items-center justify-center gap-2 active:scale-95 transition-all hover:brightness-95"
              >
                {isLast ? (
                  <>
                    <Check size={13} strokeWidth={3} /> {t('common.done')}
                  </>
                ) : (
                  <>
                    {t('common.next')} <ChevronRight size={13} strokeWidth={3} />
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

export default GuidedTour;
