import React, { useState, useEffect } from 'react';
import { ArrowRight, Film, UserPlus, Users, Heart, Sparkles, User, ChevronRight, Check } from 'lucide-react';
import { UserProfile } from '../types';

interface WelcomePageProps {
  existingProfiles: UserProfile[];
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (firstName: string, lastName: string, favoriteMovie: string, gender: 'h' | 'f', age: number) => void;
}

const WelcomePage: React.FC<WelcomePageProps> = ({ existingProfiles, onSelectProfile, onCreateProfile }) => {
  // On commence TOUJOURS par 'landing'
  const [step, setStep] = useState<'landing' | 'select' | 'create'>('landing');
  
  const [formData, setFormData] = useState({ 
    firstName: '', 
    lastName: '', 
    favoriteMovie: '',
    gender: 'h' as 'h' | 'f',
    age: 25
  });
  
  const [lastProfileId, setLastProfileId] = useState<string | null>(null);

  useEffect(() => {
    const last = localStorage.getItem('the_bitter_last_profile');
    setLastProfileId(last);
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.firstName && formData.lastName) {
      onCreateProfile(
        formData.firstName, 
        formData.lastName, 
        formData.favoriteMovie,
        formData.gender,
        formData.age
      );
    }
  };

  const sortedProfiles = [...existingProfiles].sort((a, b) => {
    if (a.id === lastProfileId) return -1;
    if (b.id === lastProfileId) return 1;
    return b.createdAt - a.createdAt;
  });

  return (
    <div className="min-h-screen bg-cream flex flex-col relative overflow-hidden font-sans selection:bg-forest selection:text-white">
      {/* Blobs d'ambiance */}
      <div className="absolute top-[-5%] right-[-15%] w-[80vh] h-[80vh] bg-sand rounded-full blur-[140px] opacity-30 animate-blob" />
      <div className="absolute bottom-[-5%] left-[-5%] w-[60vh] h-[60vh] bg-stone-100 rounded-full blur-[120px] opacity-50 animate-blob" style={{ animationDelay: '-5s' }} />

      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 relative z-10 w-full max-w-xl mx-auto">
        
        {/* STEP 1: LANDING - BIENVENUE */}
        {step === 'landing' && (
          <div className="text-center animate-[slideUp_0.6s_ease-out] w-full flex flex-col items-center">
            <div className="mb-12 relative inline-block group">
               <div className="w-28 h-28 bg-charcoal text-white rounded-[2.5rem] rotate-3 flex items-center justify-center shadow-2xl relative z-10 group-hover:rotate-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <Film size={48} strokeWidth={1.2} />
               </div>
               <div className="absolute -top-3 -right-3 w-11 h-11 bg-forest rounded-full flex items-center justify-center text-white shadow-xl animate-bounce z-20">
                  <Heart size={20} fill="currentColor" />
               </div>
            </div>
            
            <h1 className="text-7xl sm:text-8xl font-black text-charcoal tracking-tighter mb-4 leading-none select-none">
              The<br/><span className="text-forest">Bitter</span>
            </h1>
            <p className="text-stone-400 font-bold mb-14 text-[11px] uppercase tracking-[0.3em] opacity-80">
              Héritage Cinématographique.
            </p>
            
            <div className="space-y-5 w-full max-w-sm sm:max-w-md">
              {existingProfiles.length > 0 ? (
                <>
                  <button 
                    onClick={() => setStep('select')}
                    className="w-full flex items-center justify-between bg-charcoal text-white px-10 py-7 rounded-[2.5rem] font-black text-[12px] uppercase tracking-widest shadow-2xl shadow-charcoal/20 active:scale-95 transition-all hover:bg-black group"
                  >
                    <div className="flex items-center gap-5"><Users size={22} strokeWidth={2} /> Mes Profils</div>
                    <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform duration-300" />
                  </button>
                  <button 
                    onClick={() => setStep('create')}
                    className="w-full flex items-center justify-center gap-5 bg-white border border-sand text-charcoal px-10 py-7 rounded-[2.5rem] font-black text-[12px] uppercase tracking-widest active:scale-95 transition-all hover:bg-sand shadow-sm"
                  >
                    <UserPlus size={22} strokeWidth={2} /> Nouveau Compte
                  </button>
                </>
              ) : (
                <button 
                  onClick={() => setStep('create')}
                  className="w-full flex items-center justify-between bg-charcoal text-white px-10 py-7 rounded-[2.5rem] font-black text-[12px] uppercase tracking-widest shadow-2xl shadow-charcoal/20 active:scale-95 transition-all hover:bg-forest group"
                >
                  <div className="flex items-center gap-5">Commencer l'aventure</div>
                  <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform duration-300" />
                </button>
              )}
            </div>
          </div>
        )}

        {/* STEP 2: SELECT PROFILE */}
        {step === 'select' && (
          <div className="w-full animate-[fadeIn_0.5s_ease-out]">
            <div className="mb-12 text-center sm:text-left">
                <h2 className="text-5xl font-black text-charcoal tracking-tighter leading-none mb-3">Re-Bienvenue.</h2>
                <p className="text-stone-400 font-bold text-base">Choisissez votre carnet de bord.</p>
            </div>

            <div className="grid gap-8 max-h-[60vh] overflow-y-auto no-scrollbar px-4 pt-10 pb-12 -mx-4">
              {sortedProfiles.map(p => {
                const isLast = p.id === lastProfileId;
                return (
                  <button 
                    key={p.id}
                    onClick={() => onSelectProfile(p.id)}
                    className={`
                      relative flex items-center gap-6 p-7 rounded-[2.5rem] transition-all active:scale-[0.98] text-left group
                      ${isLast 
                        ? 'bg-white border-2 border-forest/15 shadow-2xl shadow-forest/10' 
                        : 'bg-white border border-sand hover:border-forest/30 shadow-lg shadow-black/[0.02] hover:shadow-xl'}
                    `}
                  >
                    <div className={`w-16 h-16 rounded-[1.25rem] flex items-center justify-center font-black text-2xl transition-all duration-500 shadow-inner shrink-0 ${isLast ? 'bg-forest text-white' : 'bg-sand text-stone-400 group-hover:bg-charcoal group-hover:text-white'}`}>
                      {p.firstName[0]}{p.lastName[0]}
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="font-black text-xl text-charcoal tracking-tight group-hover:text-forest transition-colors truncate">{p.firstName} {p.lastName}</p>
                      <p className="text-[11px] font-black uppercase text-stone-400 tracking-[0.1em] mt-1">{p.movies.length} FILMS</p>
                    </div>
                  </button>
                );
              })}
            </div>
            
            <button onClick={() => setStep('landing')} className="mt-6 flex items-center gap-3 text-stone-300 font-black text-[11px] uppercase tracking-widest hover:text-charcoal transition-all group mx-auto">
              <div className="p-2 bg-stone-50 rounded-full group-hover:bg-sand transition-colors"><ArrowRight size={14} className="rotate-180 group-hover:-translate-x-1 transition-transform" /></div>
              Retour
            </button>
          </div>
        )}

        {/* STEP 3: INSCRIPTION (CRÉATION) */}
        {step === 'create' && (
          <form onSubmit={handleSubmit} className="w-full animate-[slideUp_0.5s_ease-out] pb-20 no-scrollbar">
            <div className="flex items-center gap-5 mb-10">
               <div className="p-5 bg-forest text-white rounded-[1.5rem] shadow-xl shadow-forest/20"><Sparkles size={32} /></div>
               <div>
                  <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Inscription.</h2>
                  <p className="text-[10px] font-black text-stone-400 uppercase tracking-widest mt-2">VOTRE IDENTITÉ CINÉPHILE</p>
               </div>
            </div>

            <div className="space-y-8">
              <div className="grid grid-cols-2 gap-5">
                  <div className="group/field">
                    <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] mb-3 block ml-1">Prénom</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Jean"
                      className="w-full bg-white border-2 border-sand rounded-[1.5rem] p-5 font-black text-lg outline-none focus:border-forest/40 transition-all shadow-sm"
                      value={formData.firstName}
                      onChange={e => setFormData({...formData, firstName: e.target.value})}
                    />
                  </div>
                  <div className="group/field">
                    <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] mb-3 block ml-1">Nom</label>
                    <input 
                      required
                      type="text" 
                      placeholder="Bitter"
                      className="w-full bg-white border-2 border-sand rounded-[1.5rem] p-5 font-black text-lg outline-none focus:border-forest/40 transition-all shadow-sm"
                      value={formData.lastName}
                      onChange={e => setFormData({...formData, lastName: e.target.value})}
                    />
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-6 items-end">
                  <div>
                    <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] mb-3 block ml-1">Sexe</label>
                    <div className="flex bg-stone-100 p-1.5 rounded-2xl border border-sand">
                       <button type="button" onClick={() => setFormData({...formData, gender: 'h'})} className={`flex-1 flex items-center justify-center py-3.5 rounded-xl text-[10px] font-black transition-all ${formData.gender === 'h' ? 'bg-charcoal text-white shadow-lg' : 'text-stone-500'}`}>HOMME</button>
                       <button type="button" onClick={() => setFormData({...formData, gender: 'f'})} className={`flex-1 flex items-center justify-center py-3.5 rounded-xl text-[10px] font-black transition-all ${formData.gender === 'f' ? 'bg-charcoal text-white shadow-lg' : 'text-stone-500'}`}>FEMME</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] mb-3 block ml-1">Âge</label>
                    <div className="relative">
                        <input 
                            required
                            type="number" 
                            className="w-full bg-white border-2 border-sand rounded-2xl p-4 font-black text-lg outline-none focus:border-forest/40 transition-all shadow-sm pr-12"
                            value={formData.age}
                            onChange={e => setFormData({...formData, age: Number(e.target.value)})}
                        />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-stone-400 uppercase">ANS</span>
                    </div>
                  </div>
              </div>

              <div className="group/field">
                <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] mb-3 block ml-1">Film de chevet</label>
                <input 
                  type="text" 
                  placeholder="Ex: Interstellar..."
                  className="w-full bg-white border-2 border-sand rounded-[1.5rem] p-6 font-bold text-lg outline-none focus:border-forest/40 transition-all shadow-sm"
                  value={formData.favoriteMovie}
                  onChange={e => setFormData({...formData, favoriteMovie: e.target.value})}
                />
              </div>
            </div>

            <button 
              type="submit"
              className="w-full bg-charcoal text-white py-7 rounded-[2.5rem] font-black text-[12px] uppercase tracking-[0.2em] shadow-xl mt-12 active:scale-95 transition-all hover:bg-forest"
            >
              Établir mon profil
            </button>
            <button 
                type="button"
                onClick={() => setStep('landing')}
                className="w-full mt-6 text-stone-300 font-black text-[10px] uppercase tracking-widest hover:text-charcoal transition-colors text-center"
              >
                Retour
              </button>
          </form>
        )}
      </div>

      <div className="p-8 text-center relative z-10 mt-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-200 opacity-60">The Bitter — Edition Heritage</p>
      </div>
    </div>
  );
};

export default WelcomePage;