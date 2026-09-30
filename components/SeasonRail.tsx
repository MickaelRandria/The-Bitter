import React from 'react';
import { RailStep } from '../utils/upNext';

const STEP_CLASS: Record<RailStep, string> = {
  seen: 'bg-bitter-lime',
  next: 'bg-white animate-pulse',
  aired: 'bg-white/30',
  upcoming: 'bg-white/10',
};

/**
 * La saison d'un coup d'œil : un trait par épisode, vus en citron, le prochain
 * qui bat, les inédits à peine tracés. Posée sur une image sombre, jamais sur
 * le fond clair de l'app. Purement visuelle : le texte voisin dit la même chose
 * aux lecteurs d'écran.
 */
const SeasonRail: React.FC<{ steps: RailStep[]; className?: string }> = ({ steps, className = '' }) =>
  steps.length === 0 ? null : (
    <div aria-hidden className={`flex ${steps.length > 30 ? 'gap-px' : 'gap-[3px]'} ${className}`}>
      {steps.map((step, index) => (
        <span key={index} className={`h-1 min-w-0 flex-1 rounded-full ${STEP_CLASS[step]}`} />
      ))}
    </div>
  );

export default SeasonRail;
