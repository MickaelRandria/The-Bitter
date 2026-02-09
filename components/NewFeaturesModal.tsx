import React, { useState } from 'react';
import { ArrowRight, Tv, Globe, Users, Merge, Sparkles, Instagram, Share2 } from 'lucide-react';
import { haptics } from '../utils/haptics';

interface NewFeaturesModalProps {
  onClose: () => void;
}

const NewFeaturesModal: React.FC<NewFeaturesModalProps> = ({ onClose }) => {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    haptics.medium();
    setStep(prev => prev + 1);
  };

  const handleComplete = () => {
    haptics.success();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-[#0c0c0c] sm:bg-[#0c0c0c]/90 sm:backdrop-blur-xl animate-[fadeIn_0.3s_ease-out]">
      <div className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-md bg-[#0c0c0c] sm:rounded-[3rem] flex flex-col relative overflow-hidden animate-[scaleIn_0.4s_cubic-bezier(0.16,1,0.3,1)] border border-white/10">
        
        {/* Background Gradients */}
        <div className="absolute top-[-20%] left-[-20%] w-[300px] h-[300px] bg-[#a3e635]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[250px] h-[250px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex-1 flex flex-col p-8 sm:p-10 pt-16 sm:pt-10">
          
          {/* STEP 0: TV SERIES FOCUS */}
          {step === 0 && (
            <div className="flex flex-col h-full justify-between animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#a3e635]/30 bg-[#a3e635]/10 text-[#a3e635] text-[9px] font-black uppercase tracking-widest mb-6">
                  <Sparkles size={12} />
                  Mise à jour v0.73
                </div>
                <h2 className="text-5xl font-black text-white tracking-tighter leading-[0.9] mb-4">
                  LES SÉRIES<br />
                  <span className="text-[#a3e635]">DÉBARQUENT.</span>
                </h2>
                
                {/* Visual Block */}
                <div className="bg-white/5 border border-white/10 p-8 rounded-[2.5rem] mt-8 mb-8 text-center relative overflow-hidden">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-[#a3e635]/20 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="w-20 h-20 bg-[#a3e635] rounded-3xl flex items-center justify-center text-black mb-6 mx-auto shadow-2xl shadow-[#a3e635]/30 rotate-3">
                      <Tv size={40} strokeWidth={2.5} />
                    </div>
                    <p className="text-stone-300 text-sm font-medium leading-relaxed">
                      The Bitter supporte enfin vos marathons. Retrouvez <b>Breaking Bad</b>, <b>The Bear</b> et toutes vos séries favorites.
                    </p>
                    <p className="text-stone-500 text-xs font-bold uppercase tracking-widest mt-4">
                      Notez les saisons • Suivez votre progression
                    </p>
                </div>
              </div>

              <div className="mt-4">
                <button 
                  onClick={handleNext}
                  className="w-full bg-white text-black py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-4 active:scale-95 transition-all hover:bg-stone-200"
                >
                  Suivant <ArrowRight size={16} strokeWidth={3} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: INSTAGRAM STORIES (NEW) */}
          {step === 1 && (
            <div className="flex flex-col h-full justify-between animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-500 text-[9px] font-black uppercase tracking-widest mb-6">
                  <Instagram size={12} />
                  NOUVEAUTÉ BETA
                </div>
                <h2 className="text-5xl font-black text-white tracking-tighter leading-[0.9] mb-4">
                  PARTAGE TES<br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]">VERDICTS.</span>
                </h2>
                
                <div className="bg-gradient-to-tr from-[#833ab4]/10 via-[#fd1d1d]/10 to-[#fcb045]/10 border border-white/10 p-8 rounded-[2.5rem] mt-8 mb-8 text-center relative overflow-hidden">
                    <div className="absolute inset-0 bg-gradient-to-tr from-[#833ab4]/20 via-transparent to-[#fcb045]/20 blur-2xl opacity-50" />
                    <div className="w-20 h-20 bg-gradient-to-tr from-[#833ab4] via-[#fd1d1d] to-[#fcb045] rounded-3xl flex items-center justify-center text-white mb-6 mx-auto shadow-2xl rotate-[-3deg]">
                      <Share2 size={36} strokeWidth={2.5} />
                    </div>
                    <p className="text-stone-200 text-sm font-medium leading-relaxed">
                      Génère instantanément une carte de score esthétique pour tes <b>Stories Instagram</b>. Affiche ton expertise auprès de ta communauté.
                    </p>
                    <p className="text-pink-400 text-[10px] font-black uppercase tracking-widest mt-4 flex items-center justify-center gap-2">
                      <Instagram size={12} /> Disponible sur tes films notés
                    </p>
                </div>
              </div>

              <div className="mt-4">
                <button 
                  onClick={handleNext}
                  className="w-full bg-white text-black py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-4 active:scale-95 transition-all hover:bg-stone-200"
                >
                  Suivant <ArrowRight size={16} strokeWidth={3} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: ESPACES (TUTO) */}
          {step === 2 && (
            <div className="flex flex-col h-full justify-between animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
              <div>
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/5 text-stone-300 text-[9px] font-black uppercase tracking-widest mb-6">
                  <Globe size={12} />
                  Master Class
                </div>
                <h2 className="text-5xl font-black text-white tracking-tighter leading-[0.9] mb-4">
                  MAÎTRISEZ<br />
                  LES <span className="text-stone-400">ESPACES.</span>
                </h2>
                <p className="text-stone-500 font-bold text-xs uppercase tracking-widest mb-10">
                  Comment collaborer avec vos amis
                </p>

                <div className="space-y-4 relative pl-4">
                  {/* Ligne verticale */}
                  <div className="absolute left-[27px] top-4 bottom-4 w-0.5 bg-gradient-to-b from-[#a3e635] via-white/20 to-transparent" />

                  {/* Step 1 */}
                  <div className="flex gap-6 items-start relative z-10">
                    <div className="w-6 h-6 rounded-full bg-[#a3e635] flex items-center justify-center text-black font-black text-[10px] shrink-0 mt-1 shadow-[0_0_15px_rgba(163,230,53,0.4)]">1</div>
                    <div>
                      <h4 className="text-white font-black text-lg mb-1 flex items-center gap-2"><Globe size={16} className="text-[#a3e635]" /> CRÉER</h4>
                      <p className="text-stone-400 text-sm font-medium leading-relaxed">Lancez une Room privée pour votre groupe, ciné-club ou famille.</p>
                    </div>
                  </div>

                  {/* Step 2 */}
                  <div className="flex gap-6 items-start relative z-10 pt-4">
                    <div className="w-6 h-6 rounded-full bg-white flex items-center justify-center text-black font-black text-[10px] shrink-0 mt-1">2</div>
                    <div>
                      <h4 className="text-white font-black text-lg mb-1 flex items-center gap-2"><Users size={16} /> INVITER</h4>
                      <p className="text-stone-400 text-sm font-medium leading-relaxed">Envoyez le Code Unique à vos amis pour qu'ils rejoignent l'espace.</p>
                    </div>
                  </div>

                  {/* Step 3 */}
                  <div className="flex gap-6 items-start relative z-10 pt-4">
                    <div className="w-6 h-6 rounded-full bg-stone-800 border border-white/20 flex items-center justify-center text-white font-black text-[10px] shrink-0 mt-1">3</div>
                    <div>
                      <h4 className="text-white font-black text-lg mb-1 flex items-center gap-2"><Merge size={16} /> FUSIONNER</h4>
                      <p className="text-stone-400 text-sm font-medium leading-relaxed">Chacun ajoute ses films. La liste se synchronise instantanément pour tous.</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-8">
                <button 
                  onClick={handleComplete}
                  className="w-full bg-[#a3e635] text-black py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all hover:bg-[#8ec72e] shadow-xl shadow-[#a3e635]/20"
                >
                  C'EST PARTI
                </button>
              </div>
            </div>
          )}

          {/* Dots Indicator */}
          <div className="flex justify-center gap-2 mt-8 pb-4 sm:pb-0">
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${step === 0 ? 'bg-[#a3e635] w-6' : 'bg-white/20'}`} />
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${step === 1 ? 'bg-pink-500 w-6' : 'bg-white/20'}`} />
            <div className={`w-2 h-2 rounded-full transition-all duration-300 ${step === 2 ? 'bg-[#a3e635] w-6' : 'bg-white/20'}`} />
          </div>

        </div>
      </div>
    </div>
  );
};

export default NewFeaturesModal;