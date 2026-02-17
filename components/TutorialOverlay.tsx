import React, { useState } from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { haptics } from '../utils/haptics';

export interface TutorialStep {
  title: string;
  desc: React.ReactNode;
  icon: React.ReactNode;
  highlight?: boolean;
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  onComplete: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ steps, onComplete }) => {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    haptics.soft();
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const handleSkip = () => {
    haptics.soft();
    onComplete();
  };

  const current = steps[step];
  const isHighlight = current.highlight;

  return (
    <div className="fixed inset-0 z-[300] flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0 bg-charcoal/85 dark:bg-black/90 backdrop-blur-md animate-[fadeIn_0.4s_ease-out]" />
      
      <button
        onClick={handleSkip}
        className="absolute top-8 right-8 text-stone-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors z-20 active:scale-95"
      >
        Passer
      </button>

      <div className={`relative z-10 p-10 rounded-[3rem] shadow-2xl max-w-sm w-full animate-[scaleIn_0.3s_ease-out] transition-all duration-500 border overflow-hidden
        ${isHighlight 
          ? 'bg-bitter-lime text-charcoal border-transparent' 
          : 'bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white border-sand dark:border-white/10'}
      `}>
        {/* Decorative corner blob */}
        <div className={`absolute -top-12 -right-12 w-32 h-32 rounded-full blur-[60px] opacity-20 pointer-events-none ${isHighlight ? 'bg-black' : 'bg-forest'}`} />

        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-8 shadow-sm transition-all duration-500 relative z-10
            ${isHighlight 
              ? 'bg-charcoal text-bitter-lime' 
              : 'bg-stone-50 dark:bg-[#202020] text-forest dark:text-lime-500 border border-sand dark:border-white/5'}
        `}>
          {current.icon}
        </div>
        
        <h3 className="text-3xl font-black mb-4 tracking-tighter leading-none relative z-10">
          {current.title}
        </h3>
        
        <div className={`font-medium leading-relaxed mb-10 text-sm transition-colors duration-500 relative z-10 ${isHighlight ? 'text-charcoal/80' : 'text-stone-500 dark:text-stone-400'}`}>
          {current.desc}
        </div>
        
        <div className="flex items-end justify-between mt-auto relative z-10">
          <div className="flex flex-col items-start gap-2">
            <div className="flex gap-1.5">
                {steps.map((_, i) => (
                <div 
                    key={i} 
                    className={`h-1.5 rounded-full transition-all duration-300 
                        ${i === step 
                          ? (isHighlight ? 'w-8 bg-charcoal' : 'w-8 bg-forest dark:bg-lime-500') 
                          : (isHighlight ? 'w-1.5 bg-charcoal/20' : 'w-1.5 bg-stone-200 dark:bg-stone-800')}
                    `} 
                />
                ))}
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest transition-colors duration-300 ${isHighlight ? 'text-charcoal/50' : 'text-stone-400 dark:text-stone-600'}`}>
                {step + 1} sur {steps.length}
            </span>
          </div>
          
          <button 
            onClick={handleNext}
            className={`flex items-center gap-3 px-8 py-5 rounded-[1.8rem] font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-xl
                ${isHighlight ? 'bg-charcoal text-white shadow-black/20' : 'bg-charcoal dark:bg-forest text-white shadow-forest/10'}
            `}
          >
            {step === steps.length - 1 ? 'Terminer' : 'Suivant'}
            {step === steps.length - 1 ? <Check size={18} strokeWidth={3} /> : <ArrowRight size={18} strokeWidth={3} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;