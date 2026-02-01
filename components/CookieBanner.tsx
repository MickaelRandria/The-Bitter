
import React from 'react';
import { Cookie, ShieldCheck, X } from 'lucide-react';

interface CookieBannerProps {
  onAccept: () => void;
  onDecline: () => void;
}

const CookieBanner: React.FC<CookieBannerProps> = ({ onAccept, onDecline }) => {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] p-4 sm:p-6 pointer-events-none flex justify-center">
      <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl border border-stone-200 p-6 pointer-events-auto animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] relative overflow-hidden">
        
        {/* Background decorative blob */}
        <div className="absolute top-0 right-0 w-32 h-32 bg-sand/30 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />

        <div className="flex flex-col relative z-10">
          <div className="flex items-start gap-4 mb-4">
            <div className="w-12 h-12 bg-stone-50 text-charcoal rounded-2xl flex items-center justify-center shrink-0 shadow-sm">
               <Cookie size={24} strokeWidth={1.5} />
            </div>
            <div>
              <h3 className="text-lg font-black text-charcoal tracking-tight leading-none mb-2">Cookies & Confidentialité</h3>
              <p className="text-xs font-medium text-stone-500 leading-relaxed">
                Nous utilisons des traceurs anonymes pour comprendre comment vous utilisez <span className="font-bold text-charcoal">The Bitter</span> et améliorer votre expérience. Aucune donnée personnelle n'est revendue.
              </p>
            </div>
          </div>

          <div className="flex gap-3 mt-2">
            <button 
              onClick={onDecline}
              className="flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-stone-100 text-stone-500 hover:bg-stone-200 active:scale-95 transition-all"
            >
              Refuser
            </button>
            <button 
              onClick={onAccept}
              className="flex-[2] py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest bg-charcoal text-white hover:bg-black shadow-lg shadow-charcoal/20 active:scale-95 transition-all flex items-center justify-center gap-2"
            >
              <ShieldCheck size={14} />
              Accepter & Continuer
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CookieBanner;
