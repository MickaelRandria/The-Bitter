import React, { useState } from 'react';
import {
  ArrowRight,
  Instagram,
  Share2,
  EyeOff,
  BarChart3,
  Radar,
  Bell,
} from 'lucide-react';
import { haptics } from '../utils/haptics';

interface NewFeaturesModalProps {
  onClose: () => void;
  onNeverShowAgain?: () => void;
}

const NewFeaturesModal: React.FC<NewFeaturesModalProps> = ({ onClose, onNeverShowAgain }) => {
  const [step, setStep] = useState(0);

  const handleNext = () => {
    haptics.medium();
    setStep((prev) => prev + 1);
  };

  const handleComplete = () => {
    haptics.success();
    onClose();
  };

  const handleNeverShowAgain = () => {
    haptics.medium();
    if (onNeverShowAgain) onNeverShowAgain();
  };

  return (
    <div className="fixed inset-0 z-[250] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-[#0c0c0c] sm:bg-[#0c0c0c]/90 sm:backdrop-blur-xl animate-[fadeIn_0.3s_ease-out]">
      <div className="w-full h-full sm:h-auto sm:max-h-[85vh] sm:max-w-md bg-[#0c0c0c] sm:rounded-[3rem] flex flex-col relative overflow-hidden animate-[scaleIn_0.4s_cubic-bezier(0.16,1,0.3,1)] border border-white/10">
        {/* Background Gradients */}
        <div className="absolute top-[-20%] left-[-20%] w-[300px] h-[300px] bg-[#a3e635]/10 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[250px] h-[250px] bg-white/5 rounded-full blur-[100px] pointer-events-none" />

        <div className="flex-1 flex flex-col min-h-0 p-8 sm:p-10 pt-16 sm:pt-10">

          {/* STEP 0: NOTIFICATIONS */}
          {step === 0 && (
            <div className="flex flex-col h-full min-h-0 justify-between animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[#a3e635]/30 bg-[#a3e635]/10 text-[#a3e635] text-[9px] font-black uppercase tracking-widest mb-6">
                  <Bell size={12} />
                  Nouveau v0.82
                </div>
                <h2 className="text-5xl font-black text-white tracking-tighter leading-[0.9] mb-4">
                  RESTE
                  <br />
                  <span className="text-bitter-lime">CONNECTÉ.</span>
                </h2>

                <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[2.5rem] mt-8 mb-8 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-bitter-lime/10 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="w-16 h-16 bg-[#0c0c0c] border border-white/10 rounded-3xl flex items-center justify-center text-bitter-lime mb-5 shadow-2xl relative">
                    <Bell size={28} strokeWidth={2} />
                    <div className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-bitter-lime rounded-full border-2 border-[#0c0c0c] flex items-center justify-center text-[9px] font-black text-black">
                      3
                    </div>
                  </div>
                  <div className="space-y-3">
                    {[
                      { e: '🔥', t: 'Streak', d: 'Jours consécutifs à regarder des films' },
                      { e: '📅', t: 'Récap hebdo', d: 'Films vus + note moyenne de la semaine' },
                      { e: '🎬', t: 'Rappel watchlist', d: 'Films qui attendent ta note' },
                      { e: '📊', t: 'Stats mensuelles', d: 'Ton activité cinéma du mois' },
                    ].map((item) => (
                      <div key={item.t} className="flex items-center gap-3">
                        <span className="text-xl w-7 text-center shrink-0">{item.e}</span>
                        <div>
                          <span className="text-white font-black text-sm">{item.t}</span>
                          <span className="text-stone-500 text-xs ml-2">{item.d}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="text-stone-500 text-[10px] font-bold uppercase tracking-widest mt-5">
                    Personnalisable dans ton profil
                  </p>
                </div>
              </div>

              <div className="mt-4 shrink-0">
                <button
                  onClick={handleNext}
                  className="w-full bg-[#a3e635] text-black py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-4 active:scale-95 transition-all hover:bg-[#8ec72e] shadow-xl shadow-[#a3e635]/20"
                >
                  Suivant <ArrowRight size={16} strokeWidth={3} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 1: ANALYTICS */}
          {step === 1 && (
            <div className="flex flex-col h-full min-h-0 justify-between animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-stone-100/10 bg-white/5 text-white text-[9px] font-black uppercase tracking-widest mb-6">
                  <BarChart3 size={12} />
                  Analytics v0.78
                </div>
                <h2 className="text-5xl font-black text-white tracking-tighter leading-[0.9] mb-4">
                  ANALYSE
                  <br />
                  <span className="text-bitter-lime">VISUELLE.</span>
                </h2>

                <div className="bg-[#1a1a1a] border border-white/10 p-8 rounded-[2.5rem] mt-8 mb-8 text-center relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-bitter-lime/10 blur-[60px] rounded-full -translate-y-1/2 translate-x-1/2" />
                  <div className="w-20 h-20 bg-[#0c0c0c] border border-white/10 rounded-3xl flex items-center justify-center text-bitter-lime mb-6 mx-auto shadow-2xl relative">
                    <Radar size={32} strokeWidth={2} />
                    <div className="absolute -top-2 -right-2 w-6 h-6 bg-bitter-lime rounded-full border-2 border-[#0c0c0c]" />
                  </div>
                  <p className="text-stone-300 text-sm font-medium leading-relaxed">
                    Découvrez votre <b>Radar ADN</b> et la <b>Distribution</b> de vos notes. Une
                    vision macro de votre identité de cinéphile.
                  </p>
                  <div className="flex justify-center gap-3 mt-6">
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-12 h-8 bg-white/5 rounded-lg flex items-end justify-center gap-0.5 p-1 border border-white/10">
                        <div className="w-1.5 h-2 bg-orange-400 rounded-t-sm" />
                        <div className="w-1.5 h-4 bg-stone-500 rounded-t-sm" />
                        <div className="w-1.5 h-6 bg-bitter-lime rounded-t-sm" />
                      </div>
                      <span className="text-[7px] font-black uppercase text-stone-500">
                        Distribution
                      </span>
                    </div>
                    <div className="w-px h-8 bg-white/10 self-center" />
                    <div className="flex flex-col items-center gap-1">
                      <div className="w-12 h-8 bg-white/5 rounded-lg flex items-center justify-center border border-white/10">
                        <Radar size={14} className="text-bitter-lime" />
                      </div>
                      <span className="text-[7px] font-black uppercase text-stone-500">
                        Radar ADN
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-4 shrink-0">
                <button
                  onClick={handleNext}
                  className="w-full bg-white text-black py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-4 active:scale-95 transition-all hover:bg-stone-200"
                >
                  Suivant <ArrowRight size={16} strokeWidth={3} />
                </button>
              </div>
            </div>
          )}

          {/* STEP 2: INSTAGRAM STORIES */}
          {step === 2 && (
            <div className="flex flex-col h-full min-h-0 justify-between animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
              <div className="flex-1 min-h-0 overflow-y-auto no-scrollbar">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-pink-500/30 bg-pink-500/10 text-pink-500 text-[9px] font-black uppercase tracking-widest mb-6">
                  <Instagram size={12} />
                  NOUVEAUTÉ BETA
                </div>
                <h2 className="text-5xl font-black text-white tracking-tighter leading-[0.9] mb-4">
                  PARTAGE TES
                  <br />
                  <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#833ab4] via-[#fd1d1d] to-[#fcb045]">
                    VERDICTS.
                  </span>
                </h2>

                <div className="bg-gradient-to-tr from-[#833ab4]/10 via-[#fd1d1d]/10 to-[#fcb045]/10 border border-white/10 p-8 rounded-[2.5rem] mt-8 mb-8 text-center relative overflow-hidden">
                  <div className="absolute inset-0 bg-gradient-to-tr from-[#833ab4]/20 via-transparent to-[#fcb045]/20 blur-2xl opacity-50" />
                  <div className="w-20 h-20 bg-gradient-to-tr from-[#833ab4] via-[#fd1d1d] to-[#fcb045] rounded-3xl flex items-center justify-center text-white mb-6 mx-auto shadow-2xl rotate-[-3deg]">
                    <Share2 size={36} strokeWidth={2.5} />
                  </div>
                  <p className="text-stone-200 text-sm font-medium leading-relaxed">
                    Partage tes notes, que ce soit pour tes films ou bien tes series, fais une{' '}
                    <b>Stories Instagram</b>. Affiche ton expertise auprès de ta communauté.
                  </p>
                  <p className="text-pink-400 text-[10px] font-black uppercase tracking-widest mt-4 flex items-center justify-center gap-2">
                    <Instagram size={12} /> Disponible sur tes films/series notés
                  </p>
                </div>
              </div>

              <div className="mt-4 shrink-0">
                <button
                  onClick={handleComplete}
                  className="w-full bg-[#a3e635] text-black py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] active:scale-95 transition-all hover:bg-[#8ec72e] shadow-xl shadow-[#a3e635]/20"
                >
                  C'EST PARTI
                </button>
              </div>
            </div>
          )}

          {/* Bottom Controls */}
          <div className="mt-8 shrink-0 flex flex-col items-center gap-6 pb-4 sm:pb-0">
            <div className="flex justify-center gap-2">
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ${step === 0 ? 'bg-bitter-lime w-6' : 'bg-white/20'}`}
              />
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ${step === 1 ? 'bg-bitter-lime w-6' : 'bg-white/20'}`}
              />
              <div
                className={`w-2 h-2 rounded-full transition-all duration-300 ${step === 2 ? 'bg-pink-500 w-6' : 'bg-white/20'}`}
              />
            </div>

            {onNeverShowAgain && (
              <button
                onClick={handleNeverShowAgain}
                className="flex items-center gap-2 text-[10px] font-bold text-stone-600 hover:text-stone-400 uppercase tracking-widest transition-colors opacity-60 hover:opacity-100"
              >
                <EyeOff size={12} />
                Ne plus afficher à l'ouverture
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default NewFeaturesModal;
