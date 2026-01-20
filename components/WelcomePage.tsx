import React from 'react';
import { ArrowRight, Film } from 'lucide-react';

interface WelcomePageProps {
  onEnter: () => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ onEnter }) => {
  return (
    <div className="min-h-screen bg-cream flex flex-col relative overflow-hidden font-sans selection:bg-forest selection:text-white">
      
      {/* --- Ambient Background --- */}
      <div className="absolute top-[-10%] right-[-20%] w-[70vh] h-[70vh] bg-sand rounded-full blur-[100px] opacity-60 animate-[pulse_8s_ease-in-out_infinite]" />
      <div className="absolute bottom-[-10%] left-[-10%] w-[50vh] h-[50vh] bg-stone-100 rounded-full blur-[80px] opacity-80" />
      <div className="absolute top-[20%] left-[10%] w-[20vh] h-[20vh] bg-forest/5 rounded-full blur-[60px]" />

      {/* --- Content --- */}
      <div className="flex-1 flex flex-col items-center justify-center px-8 relative z-10 text-center animate-[fadeIn_0.6s_ease-out]">
        
        {/* Icon Identity */}
        <div className="mb-10 relative group">
           <div className="absolute inset-0 bg-forest blur-2xl opacity-20 rounded-full scale-150 group-hover:scale-175 transition-transform duration-700" />
           
           <div className="relative">
             <div className="w-24 h-24 bg-sand rounded-[2rem] -rotate-6 absolute top-0 left-0 shadow-sm transition-transform duration-500 group-hover:rotate-12" />
             <div className="w-24 h-24 bg-charcoal text-white rounded-[2rem] rotate-3 flex items-center justify-center shadow-2xl shadow-forest/20 relative z-10 transition-transform duration-500 group-hover:-rotate-3">
                <Film size={40} strokeWidth={2.5} />
             </div>
           </div>
        </div>

        {/* Typography */}
        <h1 className="text-6xl sm:text-8xl font-black text-charcoal tracking-tighter mb-6 leading-[0.9]">
          The<br />
          <span className="text-forest">Bitter</span>
        </h1>
        
        <p className="text-stone-400 font-bold text-lg sm:text-xl max-w-xs mx-auto mb-16 leading-relaxed tracking-tight">
          Votre voyage cinématographique. <br />
          <span className="text-stone-500/60 font-medium">Analysez vos goûts avec précision.</span>
        </p>

        {/* Call to Action */}
        <button 
          onClick={onEnter}
          className="group relative flex items-center gap-5 bg-charcoal text-white pl-10 pr-8 py-6 rounded-full text-lg font-bold shadow-2xl shadow-charcoal/25 hover:scale-105 active:scale-95 transition-all duration-300"
        >
          <span className="tracking-wide">C'est parti</span>
          <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center group-hover:bg-white group-hover:text-charcoal transition-all duration-300">
            <ArrowRight size={20} strokeWidth={3} className="-ml-0.5" />
          </div>
        </button>

      </div>

      {/* --- Footer Minimal --- */}
      <div className="p-8 text-center relative z-10 animate-[fadeIn_1s_ease-out]">
        <div className="flex justify-center gap-2 mb-2">
            <div className="w-1.5 h-1.5 rounded-full bg-forest/40"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-forest/40"></div>
            <div className="w-1.5 h-1.5 rounded-full bg-forest/40"></div>
        </div>
        <p className="text-[10px] font-extrabold uppercase tracking-[0.2em] text-stone-300">
          Analyste Cinéma Personnel
        </p>
      </div>
    </div>
  );
};

export default WelcomePage;