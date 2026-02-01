import React from 'react';
import { ScanEye, Fingerprint, ShieldCheck } from 'lucide-react';

interface ConsentModalProps {
  onAccept: () => void;
}

const ConsentModal: React.FC<ConsentModalProps> = ({ onAccept }) => {
  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-4 sm:p-6">
      {/* Backdrop sombre et flou pour bloquer l'interaction */}
      <div className="absolute inset-0 bg-charcoal/90 backdrop-blur-md animate-[fadeIn_0.5s_ease-out]" />

      <div className="relative z-10 bg-white w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)] border border-stone-100">
        
        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-stone-50 rounded-2xl flex items-center justify-center text-charcoal mb-6 shadow-sm rotate-3">
            <ScanEye size={32} strokeWidth={1.5} />
          </div>

          <h2 className="text-2xl font-black text-charcoal tracking-tight mb-3">
            Transparence
          </h2>

          <p className="text-stone-500 font-medium leading-relaxed text-sm mb-8">
            Pour améliorer l'expérience The Bitter, nous avons activé des traceurs d'activité.
            <br /><br />
            Nous suivons désormais votre navigation et vos interactions au sein de l'application à des fins d'analyse et de statistiques.
          </p>

          <button
            onClick={onAccept}
            className="w-full bg-charcoal text-white py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-forest active:scale-95 transition-all flex items-center justify-center gap-3"
          >
            <ShieldCheck size={18} />
            D'accord
          </button>
          
          <p className="mt-4 text-[9px] font-bold text-stone-300 uppercase tracking-widest">
            Merci de votre confiance
          </p>
        </div>
      </div>
    </div>
  );
};

export default ConsentModal;