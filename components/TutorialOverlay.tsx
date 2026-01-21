import React, { useState } from 'react';
import { ArrowRight, Sparkles, Search, PieChart, Activity, PiggyBank, LayoutGrid } from 'lucide-react';

export interface TutorialStep {
  title: string;
  desc: string;
  icon: React.ReactNode;
}

interface TutorialOverlayProps {
  steps: TutorialStep[];
  onComplete: () => void;
}

const TutorialOverlay: React.FC<TutorialOverlayProps> = ({ steps, onComplete }) => {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onComplete();
    }
  };

  const current = steps[step];

  return (
    <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center p-6">
      <div className="absolute inset-0 bg-charcoal/85 backdrop-blur-md animate-[fadeIn_0.4s_ease-out]" />
      
      <div className="relative z-10 bg-cream p-8 rounded-[2.5rem] shadow-2xl max-w-sm w-full animate-[scaleIn_0.3s_ease-out]">
        <div className="w-14 h-14 bg-sand rounded-2xl flex items-center justify-center mb-6 text-forest shadow-sm">
          {current.icon}
        </div>
        
        <h3 className="text-2xl font-black text-charcoal mb-3 tracking-tight leading-tight">
          {current.title}
        </h3>
        
        <p className="text-stone-500 font-medium leading-relaxed mb-8">
          {current.desc}
        </p>
        
        <div className="flex items-center justify-between mt-auto">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div 
                key={i} 
                className={`h-1.5 rounded-full transition-all duration-300 ${i === step ? 'w-6 bg-forest' : 'w-1.5 bg-stone-200'}`} 
              />
            ))}
          </div>
          
          <button 
            onClick={handleNext}
            className="flex items-center gap-2 bg-charcoal text-white px-6 py-3.5 rounded-2xl font-bold text-sm hover:scale-105 active:scale-95 transition-all shadow-lg"
          >
            {step === steps.length - 1 ? 'Terminer' : 'Suivant'}
            <ArrowRight size={16} strokeWidth={3} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default TutorialOverlay;