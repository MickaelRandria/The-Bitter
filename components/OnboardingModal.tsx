import React, { useState, useEffect } from 'react';
import { ArrowRight, Check, Activity, Scale, Timer, Layers, Loader2, Fingerprint, Sparkles } from 'lucide-react';
import { haptics } from '../utils/haptics';
import { getArchetype } from '../utils/archetypes';

interface OnboardingModalProps {
  initialName: string;
  onComplete: (data: { name: string; severityIndex: number; patienceLevel: number; favoriteGenres: string[]; role: string }) => void;
}

const GENRES_LIST = ['Science-Fiction', 'Thriller', 'Drame', 'Comédie', 'Horreur', 'Animation', 'Action', 'Documentaire'];

const OnboardingModal: React.FC<OnboardingModalProps> = ({ initialName, onComplete }) => {
  const [step, setStep] = useState(1);
  const [name, setName] = useState(initialName);
  const [severityIndex, setSeverityIndex] = useState(5);
  const [patienceLevel, setPatienceLevel] = useState(5);
  const [favoriteGenres, setFavoriteGenres] = useState<string[]>([]);
  
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [archetype, setArchetype] = useState<{title: string, description: string, icon: string} | null>(null);

  const totalSteps = 4; // Steps de saisie (le 5eme est la révélation)

  const handleNext = () => {
    haptics.medium();
    if (step < totalSteps) {
      setStep(step + 1);
    } else if (step === totalSteps) {
      // Transition vers l'analyse
      setIsAnalyzing(true);
      
      // Simulation du calcul (pour l'effet dramatique)
      setTimeout(() => {
        const result = getArchetype(severityIndex, patienceLevel);
        setArchetype(result);
        setIsAnalyzing(false);
        setStep(5); // Étape Révélation
        haptics.success();
      }, 2000);
    }
  };

  const handleFinalValidation = () => {
    haptics.success();
    if (archetype) {
      onComplete({ 
        name, 
        severityIndex, 
        patienceLevel, 
        favoriteGenres,
        role: archetype.title
      });
    }
  };

  const toggleGenre = (genre: string) => {
    haptics.soft();
    setFavoriteGenres(prev => 
      prev.includes(genre) ? prev.filter(g => g !== genre) : [...prev, genre]
    );
  };

  // Helpers pour les descriptions dynamiques
  const getSeverityDescription = (val: number) => {
    if (val <= 3) return { label: 'Public Enthousiaste', desc: 'Le plaisir et l\'immersion avant tout. Vous êtes bon public.', color: 'text-forest' };
    if (val <= 7) return { label: 'Critique Équilibré', desc: 'Le juste milieu entre analyse technique et ressenti émotionnel.', color: 'text-charcoal' };
    return { label: 'Critique Intransigeant', desc: 'L\'exigence est la seule mesure de la qualité. Rien ne vous échappe.', color: 'text-tz-orange' };
  };

  const getPatienceDescription = (val: number) => {
    if (val <= 3) return { label: 'Recherche d\'Intensité', desc: 'Besoin de rythme et de stimulation constante.', color: 'text-tz-orange' };
    if (val <= 7) return { label: 'Spectateur Modulé', desc: 'Capable de s\'adapter au rythme imposé par le réalisateur.', color: 'text-charcoal' };
    return { label: 'Amateur de Contemplation', desc: 'Vous appréciez la lenteur, les plans fixes et les silences.', color: 'text-forest' };
  };

  const severityInfo = getSeverityDescription(severityIndex);
  const patienceInfo = getPatienceDescription(patienceLevel);

  // ECRAN DE CHARGEMENT
  if (isAnalyzing) {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-white/90 backdrop-blur-xl">
        <div className="flex flex-col items-center animate-[fadeIn_0.5s_ease-out]">
          <Loader2 size={48} className="text-charcoal animate-spin mb-6" strokeWidth={1.5} />
          <h3 className="text-xl font-black text-charcoal uppercase tracking-widest animate-pulse">Analyse du profil...</h3>
          <p className="text-stone-400 font-medium mt-2">Calibration de vos métriques</p>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-white/80 backdrop-blur-md">
      <div className="w-full max-w-lg bg-white rounded-[2.5rem] shadow-2xl p-8 sm:p-10 relative overflow-hidden animate-[scaleIn_0.4s_cubic-bezier(0.16,1,0.3,1)] border border-stone-100">
        
        {/* Progress Bar (Masquée à l'étape finale) */}
        {step <= totalSteps && (
          <div className="absolute top-0 left-0 h-1.5 bg-stone-100 w-full">
            <div 
              className="h-full bg-charcoal transition-all duration-500 ease-out" 
              style={{ width: `${(step / totalSteps) * 100}%` }}
            />
          </div>
        )}

        {/* STEP 1: IDENTITÉ */}
        {step === 1 && (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center text-charcoal shadow-sm mb-4">
               <Activity size={24} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-charcoal tracking-tighter leading-none mb-3">Initialisation de l'Analyste</h2>
              <p className="text-stone-400 font-medium leading-relaxed">
                Bienvenue sur The Bitter. Avant d'accéder aux données, nous devons calibrer votre profil critique.
              </p>
            </div>
            
            <div className="group">
              <label className="text-[10px] font-black uppercase text-stone-400 tracking-[0.2em] mb-3 block">Identifiant</label>
              <input 
                type="text" 
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full text-2xl font-black text-charcoal border-b-2 border-stone-100 py-2 outline-none focus:border-charcoal transition-colors bg-transparent placeholder:text-stone-200"
                placeholder="Votre nom"
                autoFocus
              />
            </div>
          </div>
        )}

        {/* STEP 2: SÉVÉRITÉ */}
        {step === 2 && (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center text-charcoal shadow-sm mb-4">
               <Scale size={24} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-charcoal tracking-tighter leading-none mb-3">Votre posture critique</h2>
              <p className="text-stone-400 font-medium leading-relaxed">
                Comment jugez-vous une œuvre ? Êtes-vous indulgent ou impitoyable ?
              </p>
            </div>

            <div className="py-4">
               <div className="flex justify-between items-end mb-6">
                  <div>
                    <span className={`text-lg font-black block mb-1 ${severityInfo.color}`}>{severityInfo.label}</span>
                    <span className="text-xs font-medium text-stone-400 leading-tight block max-w-xs">{severityInfo.desc}</span>
                  </div>
                  <span className="text-4xl font-black text-charcoal">{severityIndex}<span className="text-sm text-stone-300">/10</span></span>
               </div>
               <input 
                 type="range" 
                 min="0" max="10" 
                 step="0.5"
                 value={severityIndex}
                 onChange={(e) => { haptics.soft(); setSeverityIndex(Number(e.target.value)); }}
                 className="w-full h-2 bg-stone-100 rounded-full appearance-none cursor-pointer accent-charcoal"
               />
               <div className="flex justify-between mt-3 text-[9px] font-black text-stone-300 uppercase tracking-widest">
                  <span>Indulgent</span>
                  <span>Sévère</span>
               </div>
            </div>
          </div>
        )}

        {/* STEP 3: PATIENCE */}
        {step === 3 && (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center text-charcoal shadow-sm mb-4">
               <Timer size={24} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-charcoal tracking-tighter leading-none mb-3">Votre rapport au rythme</h2>
              <p className="text-stone-400 font-medium leading-relaxed">
                Supportez-vous les longueurs ou avez-vous besoin d'action immédiate ?
              </p>
            </div>

            <div className="py-4">
               <div className="flex justify-between items-end mb-6">
                  <div>
                    <span className={`text-lg font-black block mb-1 ${patienceInfo.color}`}>{patienceInfo.label}</span>
                    <span className="text-xs font-medium text-stone-400 leading-tight block max-w-xs">{patienceInfo.desc}</span>
                  </div>
                  <span className="text-4xl font-black text-charcoal">{patienceLevel}<span className="text-sm text-stone-300">/10</span></span>
               </div>
               <input 
                 type="range" 
                 min="0" max="10" 
                 step="0.5"
                 value={patienceLevel}
                 onChange={(e) => { haptics.soft(); setPatienceLevel(Number(e.target.value)); }}
                 className="w-full h-2 bg-stone-100 rounded-full appearance-none cursor-pointer accent-charcoal"
               />
               <div className="flex justify-between mt-3 text-[9px] font-black text-stone-300 uppercase tracking-widest">
                  <span>Impatient</span>
                  <span>Contemplatif</span>
               </div>
            </div>
          </div>
        )}

        {/* STEP 4: GENRES */}
        {step === 4 && (
          <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div className="w-14 h-14 bg-stone-50 rounded-2xl flex items-center justify-center text-charcoal shadow-sm mb-4">
               <Layers size={24} strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-3xl font-black text-charcoal tracking-tighter leading-none mb-3">Zone de confort</h2>
              <p className="text-stone-400 font-medium leading-relaxed">
                Sélectionnez vos genres refuges pour affiner l'algorithme de suggestion.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {GENRES_LIST.map(genre => {
                const isSelected = favoriteGenres.includes(genre);
                return (
                  <button
                    key={genre}
                    onClick={() => toggleGenre(genre)}
                    className={`px-4 py-3.5 rounded-xl text-xs font-black uppercase tracking-wide transition-all duration-300 border-2 ${isSelected ? 'bg-charcoal text-white border-charcoal shadow-lg' : 'bg-white text-stone-400 border-stone-100 hover:border-stone-200'}`}
                  >
                    {genre}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* STEP 5: RÉVÉLATION */}
        {step === 5 && archetype && (
          <div className="space-y-8 animate-[scaleIn_0.6s_cubic-bezier(0.16,1,0.3,1)] text-center">
            
            <div className="flex justify-center mb-4">
               <div className="w-20 h-20 bg-forest text-white rounded-[2rem] rotate-3 flex items-center justify-center shadow-2xl text-4xl relative">
                  {archetype.icon}
                  <div className="absolute -top-2 -right-2 bg-white text-forest p-1.5 rounded-full shadow-lg">
                    <Sparkles size={16} fill="currentColor" />
                  </div>
               </div>
            </div>

            <div>
              <p className="text-[10px] font-black uppercase text-stone-300 tracking-[0.3em] mb-4">VOTRE PROFIL EST DÉFINI</p>
              <h2 className="text-4xl sm:text-5xl font-black text-charcoal tracking-tighter leading-[0.9] mb-6">
                {archetype.title}
              </h2>
              <p className="text-stone-500 font-serif italic text-lg leading-relaxed max-w-sm mx-auto">
                "{archetype.description}"
              </p>
            </div>

            <div className="flex justify-center gap-4">
                <div className="bg-stone-50 border border-stone-100 px-4 py-2 rounded-xl text-center">
                    <span className="block text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Sévérité</span>
                    <span className="text-xl font-black text-charcoal">{severityIndex}/10</span>
                </div>
                <div className="bg-stone-50 border border-stone-100 px-4 py-2 rounded-xl text-center">
                    <span className="block text-[9px] font-black text-stone-400 uppercase tracking-widest mb-1">Patience</span>
                    <span className="text-xl font-black text-charcoal">{patienceLevel}/10</span>
                </div>
            </div>

            <div className="pt-4">
                <button 
                onClick={handleFinalValidation}
                className="w-full bg-charcoal text-white px-8 py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-black active:scale-95 transition-all flex items-center justify-center gap-3"
                >
                <Fingerprint size={18} />
                Assumer mon Rôle
                </button>
            </div>
          </div>
        )}

        {step <= totalSteps && (
            <div className="mt-10 flex justify-end">
            <button 
                onClick={handleNext}
                disabled={step === 1 && !name.trim()}
                className="flex items-center gap-3 bg-charcoal text-white px-8 py-4 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:bg-forest active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {step === totalSteps ? 'Lancer l\'Analyse' : 'Suivant'}
                {step === totalSteps ? <Check size={16} strokeWidth={3} /> : <ArrowRight size={16} strokeWidth={3} />}
            </button>
            </div>
        )}
      </div>
    </div>
  );
};

export default OnboardingModal;