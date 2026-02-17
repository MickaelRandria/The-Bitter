import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, Activity, Scale, Timer, Layers, Loader2, Fingerprint, Sparkles } from 'lucide-react';
import { haptics } from '../utils/haptics';
import { getArchetypeFromOnboarding, inferDepthFromGenres } from '../utils/archetypes';
import { supabase } from '../services/supabase';

interface OnboardingModalProps {
  initialName: string;
  userId?: string;
  onComplete: (data: { name: string; severityIndex: number; patienceLevel: number; favoriteGenres: string[]; role: string }) => void;
}

const GENRES_LIST = ['Science-Fiction', 'Thriller', 'Drame', 'Comédie', 'Horreur', 'Animation', 'Action', 'Documentaire'];

const OnboardingModal: React.FC<OnboardingModalProps> = ({ initialName, userId, onComplete }) => {
  const [step, setStep] = useState(1);
  const [name] = useState(initialName);
  const [severityIndex, setSeverityIndex] = useState(5);
  // patienceLevel est renommé conceptuellement en rhythmIndex dans l'UI, mais on garde le nom de variable
  // pour compatibilité avec la DB (patience_level) qui stockera cette valeur.
  const [patienceLevel, setPatienceLevel] = useState(5); 
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [archetype, setArchetype] = useState<{title: string, description: string, icon: string} | null>(null);
  const totalSteps = 4;

  const handleNext = () => {
    haptics.medium();
    if (step < totalSteps) setStep(step + 1);
    else if (step === totalSteps) {
      setIsAnalyzing(true);
      
      // Inférence de la profondeur basée sur les genres
      const depthIndex = inferDepthFromGenres(favoriteGenres);
      
      setTimeout(() => {
        // Calcul Phase 1 : Déclaratif
        const result = getArchetypeFromOnboarding(severityIndex, patienceLevel, depthIndex);
        setArchetype(result);
        setIsAnalyzing(false);
        setStep(5);
        haptics.success();
      }, 1500);
    }
  };

  const handleFinalValidation = async () => {
    haptics.success();
    if (archetype) {
      if (supabase && userId) {
        await supabase.from('profiles').update({ 
            severity_index: severityIndex, 
            patience_level: patienceLevel, // Stocké comme "Rythme" logiquement
            favorite_genres: favoriteGenres, 
            role: archetype.title, 
            is_onboarded: true 
        }).eq('id', userId);
      }
      onComplete({ name, severityIndex, patienceLevel, favoriteGenres, role: archetype.title });
    }
  };

  const toggleGenre = (genre: string) => {
    haptics.soft();
    setFavoriteGenres(prev => prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]);
  };

  if (isAnalyzing) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-white/90 dark:bg-black/90 backdrop-blur-xl transition-colors">
        <div className="flex flex-col items-center animate-[fadeIn_0.5s_ease-out]">
          <Loader2 size={48} className="text-charcoal dark:text-white animate-spin mb-6" strokeWidth={1.5} />
          <h3 className="text-xl font-black text-charcoal dark:text-white uppercase tracking-widest animate-pulse">Calibrage...</h3>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-white/80 dark:bg-black/80 backdrop-blur-md transition-colors">
      <div className="w-full max-w-lg bg-white dark:bg-[#1a1a1a] rounded-[2.5rem] shadow-2xl dark:shadow-black/60 p-8 sm:p-10 relative overflow-hidden animate-[scaleIn_0.4s_cubic-bezier(0.16,1,0.3,1)] border border-stone-100 dark:border-white/10 transition-all">
        {step <= totalSteps && (
          <div className="absolute top-0 left-0 h-1.5 bg-stone-100 dark:bg-[#202020] w-full"><div className="h-full bg-charcoal dark:bg-forest transition-all duration-500" style={{ width: `${(step / totalSteps) * 100}%` }} /></div>
        )}

        {step === 1 && (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-14 h-14 bg-stone-50 dark:bg-[#161616] rounded-2xl flex items-center justify-center text-charcoal dark:text-white shadow-sm mb-4"><Activity size={24} /></div>
            <div>
              <h2 className="text-3xl font-black text-charcoal dark:text-white tracking-tighter leading-none mb-3">Calibration</h2>
              <p className="text-stone-400 dark:text-stone-500 font-medium">Configurez vos critères de notation pour personnaliser votre expérience.</p>
            </div>
            <div className="group">
              <label className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-[0.2em] mb-3 block ml-1">Identifiant</label>
              <input type="text" value={name} readOnly disabled className="w-full bg-stone-50 dark:bg-[#161616] border-2 border-sand dark:border-white/10 rounded-[1.5rem] py-5 px-6 font-black text-xl outline-none text-stone-500 dark:text-stone-400 cursor-not-allowed transition-colors" />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-14 h-14 bg-stone-50 dark:bg-[#161616] rounded-2xl flex items-center justify-center text-charcoal dark:text-white shadow-sm mb-4"><Scale size={24} /></div>
            <div>
              <h2 className="text-3xl font-black text-charcoal dark:text-white tracking-tighter leading-none mb-3">Posture critique</h2>
              <p className="text-stone-400 dark:text-stone-500 font-medium">Définissez votre sévérité habituelle lors de la notation.</p>
            </div>
            <div className="py-4">
              <div className="flex justify-between items-end mb-6">
                <span className="text-4xl font-black text-charcoal dark:text-white">{severityIndex}<span className="text-sm text-stone-300 dark:text-stone-600">/10</span></span>
              </div>
              <input type="range" min="0" max="10" step="0.5" value={severityIndex} onChange={e => { haptics.soft(); setSeverityIndex(Number(e.target.value)); }} className="w-full h-2 bg-stone-100 dark:bg-[#202020] rounded-full appearance-none cursor-pointer accent-charcoal dark:accent-forest" />
              <div className="flex justify-between mt-3 text-[9px] font-black text-stone-300 dark:text-stone-500 uppercase tracking-widest"><span>Indulgent</span><span>Sévère</span></div>
            </div>
          </div>
        )}
        
        {step === 3 && (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-14 h-14 bg-stone-50 dark:bg-[#161616] rounded-2xl flex items-center justify-center text-charcoal dark:text-white shadow-sm mb-4"><Timer size={24} /></div>
            <div>
              <h2 className="text-3xl font-black text-charcoal dark:text-white tracking-tighter leading-none mb-3">Rythme narratif</h2>
              <p className="text-stone-400 dark:text-stone-500 font-medium">Quelle est votre tolérance aux films lents ou contemplatifs ?</p>
            </div>
            <div className="py-4">
               <div className="flex justify-between items-end mb-6">
                  <span className="text-4xl font-black text-charcoal dark:text-white">{patienceLevel}<span className="text-sm text-stone-300 dark:text-stone-600">/10</span></span>
               </div>
               <input type="range" min="0" max="10" step="0.5" value={patienceLevel} onChange={e => { haptics.soft(); setPatienceLevel(Number(e.target.value)); }} className="w-full h-2 bg-stone-100 dark:bg-[#202020] rounded-full appearance-none cursor-pointer accent-charcoal dark:accent-forest" />
               <div className="flex justify-between mt-3 text-[9px] font-black text-stone-300 dark:text-stone-500 uppercase tracking-widest"><span>Contemplatif</span><span>Intense</span></div>
            </div>
          </div>
        )}
        
        {step === 4 && (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-14 h-14 bg-stone-50 dark:bg-[#161616] rounded-2xl flex items-center justify-center text-charcoal dark:text-white shadow-sm mb-4"><Layers size={24} /></div>
            <h2 className="text-3xl font-black text-charcoal dark:text-white tracking-tighter leading-none mb-3">Zone de confort</h2>
            <div className="grid grid-cols-2 gap-3">
              {GENRES_LIST.map(genre => (
                <button key={genre} onClick={() => toggleGenre(genre)} className={`px-4 py-3.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all border-2 ${favoriteGenres.includes(genre) ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal border-charcoal dark:border-white shadow-lg' : 'bg-white dark:bg-[#202020] text-stone-400 dark:text-stone-600 border-stone-100 dark:border-white/5 hover:border-stone-200 dark:hover:border-white/10'}`}>{genre}</button>
              ))}
            </div>
          </div>
        )}

        {step === 5 && archetype && (
          <div className="space-y-8 animate-[scaleIn_0.6s_cubic-bezier(0.16,1,0.3,1)] text-center">
            <div className="flex justify-center mb-4"><div className="w-20 h-20 bg-forest text-white rounded-[2rem] rotate-3 flex items-center justify-center shadow-2xl text-4xl">{archetype.icon}</div></div>
            <div>
              <p className="text-[10px] font-black uppercase text-stone-300 dark:text-stone-500 tracking-[0.3em] mb-4">PROFIL DÉFINI</p>
              <h2 className="text-4xl sm:text-5xl font-black text-charcoal dark:text-white tracking-tighter leading-[0.9] mb-6">{archetype.title}</h2>
              <p className="text-stone-500 dark:text-stone-400 font-serif italic text-lg leading-relaxed max-w-sm mx-auto">"{archetype.description}"</p>
            </div>
            <div className="pt-4"><button onClick={handleFinalValidation} className="w-full bg-charcoal dark:bg-forest text-white px-8 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all flex items-center justify-center gap-3"><Fingerprint size={18} /> Assumer mon Rôle</button></div>
          </div>
        )}

        {step <= totalSteps && (
            <div className="mt-10 flex justify-end">
            <button onClick={handleNext} className="flex items-center gap-3 bg-charcoal dark:bg-forest text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all">{step === totalSteps ? 'Finaliser' : 'Suivant'} <ArrowRight size={16} strokeWidth={3} /></button>
            </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingModal;