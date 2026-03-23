import React, { useEffect, useState } from 'react';
import { X, Info } from 'lucide-react';

interface ContextualTooltipProps {
  id: string;
  title: string;
  content: React.ReactNode;
  onDismiss: () => void;
  position?: 'top' | 'bottom' | 'center';
}

export const ContextualTooltip: React.FC<ContextualTooltipProps> = ({
  id,
  title,
  content,
  onDismiss,
  position = 'bottom',
}) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Petit délai pour l'animation d'entrée
    const timer = setTimeout(() => setIsVisible(true), 500);
    return () => clearTimeout(timer);
  }, []);

  const handleDismiss = () => {
    setIsVisible(false);
    setTimeout(onDismiss, 300); // Attendre la fin de l'animation
  };

  const positionClasses = {
    top: 'top-24 left-6 right-6',
    bottom: 'bottom-32 left-6 right-6',
    center: 'top-1/2 left-6 right-6 -translate-y-1/2',
  };

  return (
    <div
      className={`fixed ${positionClasses[position]} z-50 transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isVisible ? 'opacity-100 translate-y-0 scale-100' : 'opacity-0 translate-y-4 scale-95 pointer-events-none'}`}
    >
      <div className="bg-charcoal/95 dark:bg-white/95 backdrop-blur-xl text-white dark:text-charcoal p-5 rounded-2xl shadow-2xl border border-white/10 dark:border-black/5 flex gap-4 relative overflow-hidden">
        <div className="absolute top-0 left-0 w-1 h-full bg-bitter-lime"></div>

        <div className="shrink-0 mt-1">
          <div className="w-8 h-8 rounded-full bg-white/10 dark:bg-black/5 flex items-center justify-center text-bitter-lime dark:text-forest">
            <Info size={18} strokeWidth={2.5} />
          </div>
        </div>

        <div className="flex-1 mr-2">
          <h4 className="text-sm font-black uppercase tracking-wider mb-1 text-bitter-lime dark:text-forest">
            {title}
          </h4>
          <div className="text-xs font-medium leading-relaxed opacity-90">{content}</div>
        </div>

        <button
          onClick={handleDismiss}
          className="shrink-0 h-8 w-8 flex items-center justify-center rounded-full hover:bg-white/10 dark:hover:bg-black/5 transition-colors -mt-1 -mr-1"
        >
          <X size={16} />
        </button>
      </div>
    </div>
  );
};
