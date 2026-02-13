
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
      <div className="absolute inset-0 bg-charcoal/85 backdrop-blur-md animate-[fadeIn_0.4s_ease-out]" />
      
      <button
        onClick={handleSkip}
        className="absolute top-6 right-6 text-stone-400 hover:text-white text-[10px] font-black uppercase tracking-widest transition-colors z-20 active:scale-95"
      >
        Passer
      </button>

      <div className={`relative z-10 p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full animate-[scaleIn_0.3s_ease-out] transition-colors duration-500 border
        ${isHighlight ? 'bg-bitter-lime text-charcoal border-transparent' : 'bg-cream text-charcoal border-white/20'}
      `}>
        <div className={`w-16 h-16 rounded-2xl flex items-center justify-center mb-6 shadow-sm transition-colors duration-500
            ${isHighlight ? 'bg-charcoal text-bitter-lime' : 'bg-white text-forest border border-sand'}
        `}>
          {current.icon}
        </div>
        
        <h3 className="text-3xl font-black mb-3 tracking-tighter leading-none">
          {current.title}
        </h3>
        
        <div className={`font-medium leading-relaxed mb-8 text-sm transition-colors duration-500 ${isHighlight ? 'text-charcoal/80' : 'text-stone-500'}`}>
          {current.desc}
        </div>
        
        <div className="flex items-end justify-between mt-auto">
          <div className="flex flex-col items-start gap-2">
            <div className="flex gap-1.5">
                {steps.map((_, i) => (
                <div 
                    key={i} 
                    className={`h-1.5 rounded-full transition-all duration-300 
                        ${i === step ? (isHighlight ? 'w-6 bg-charcoal' : 'w-6 bg-forest') : (isHighlight ? 'w-1.5 bg-charcoal/20' : 'w-1.5 bg-stone-200')}
                    `} 
                />
                ))}
            </div>
            <span className={`text-[9px] font-black uppercase tracking-widest transition-colors duration-300 ${isHighlight ? 'text-charcoal/50' : 'text-stone-400'}`}>
                {step + 1} sur {steps.length}
            </span>
          </div>
          
          <button 
            onClick={handleNext}
            className={`flex items-center gap-2 px-6 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:scale-105 active:scale-95 transition-all shadow-lg
                ${isHighlight ? 'bg-charcoal text-white' : 'bg-charcoal text-white'}
            `}
          >
            {step === steps.length - 1 ? 'Terminer' : 'Suivant'}
            {step === steps.length - 1 ? <Check size={16} strokeWidth={3} /> : <ArrowRight size={16} strokeWidth={3} />}
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;
