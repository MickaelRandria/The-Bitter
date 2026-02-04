
import React, { useState, useEffect } from 'react';
import { ArrowLeft, ArrowRight, Film, UserPlus, Users, Heart, Sparkles, User, Check, Trash2, AlertTriangle, X, Tv, Ticket, Clapperboard, ChevronLeft } from 'lucide-react';
import { UserProfile } from '../types';
import { haptics } from '../utils/haptics';

interface WelcomePageProps {
  existingProfiles: UserProfile[];
  onSelectProfile: (profileId: string) => void;
  onCreateProfile: (firstName: string, lastName: string, gender: 'h' | 'f', age: number, viewingPreference: 'cinema' | 'streaming' | 'both', streamingPlatforms: string[]) => void;
  onDeleteProfile: (profileId: string) => void;
}

const PLATFORMS = [
  { id: 'netflix', name: 'Netflix', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Netflix_icon.svg/500px-Netflix_icon.svg.png' },
  { id: 'prime', name: 'Prime', logo: 'https://img.icons8.com/fluent/1200/amazon-prime-video.jpg' },
  { id: 'disney', name: 'Disney+', logo: 'https://store-images.s-microsoft.com/image/apps.14187.14495311847124170.7646206e-bd82-4cf0-8b8c-d06a67bc302c.2e474878-acb7-4afb-a503-c2a1a32feaa8?h=210' },
  { id: 'canal', name: 'Canal+', logo: 'https://play-lh.googleusercontent.com/Z2HJDfXSpjq2liULCCujhfzmRoTOZ1z-6A4JO_SrY-Iw92FZ1owOZ_5AlDqOtAvnrw' },
];

const WelcomePage: React.FC<WelcomePageProps> = ({ existingProfiles, onSelectProfile, onCreateProfile, onDeleteProfile }) => {
  const [step, setStep] = useState<'landing' | 'select' | 'create'>('landing');
  
  const [formData, setFormData] = useState({ 
    firstName: '', 
    lastName: '', 
    gender: 'h' as 'h' | 'f',
    age: 25,
    viewingPreference: 'streaming' as 'cinema' | 'streaming' | 'both',
    streamingPlatforms: [] as string[]
  });
  
  const [lastProfileId, setLastProfileId] = useState<string | null>(null);
  const [isManaging, setIsManaging] = useState(false);
  const [profileToDelete, setProfileToDelete] = useState<string | null>(null);

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
        formData.gender,
        formData.age,
        formData.viewingPreference,
        formData.streamingPlatforms
      );
    }
  };

  const togglePlatform = (id: string) => {
    haptics.soft();
    setFormData(prev => ({
      ...prev,
      streamingPlatforms: prev.streamingPlatforms.includes(id) 
        ? prev.streamingPlatforms.filter(p => p !== id) 
        : [...prev.streamingPlatforms, id]
    }));
  };

  const sortedProfiles = [...existingProfiles].sort((a, b) => {
    if (a.id === lastProfileId) return -1;
    if (b.id === lastProfileId) return 1;
    return b.createdAt - a.createdAt;
  });

  const confirmDelete = () => {
    if (profileToDelete) {
      onDeleteProfile(profileToDelete);
      setProfileToDelete(null);
      haptics.error();
      // Si on a tout supprimé, on repasse sur landing ou création
      if (existingProfiles.length <= 1) {
        setIsManaging(false);
        setStep('landing');
      }
    }
  };

  const goBack = () => {
    haptics.soft();
    setStep('landing');
    setIsManaging(false);
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col relative overflow-hidden font-sans selection:bg-forest selection:text-white">
      <div className="absolute top-[-5%] right-[-15%] w-[80vh] h-[80vh] bg-sand rounded-full blur-[140px] opacity-30 animate-blob" />
      <div className="absolute bottom-[-5%] left-[-5%] w-[60vh] h-[60vh] bg-stone-100 rounded-full blur-[120px] opacity-50 animate-blob" style={{ animationDelay: '-5s' }} />

      {/* Navigation Retour Persistante */}
      {step !== 'landing' && (
        <button 
          onClick={goBack} 
          className="absolute top-8 left-6 z-50 flex items-center gap-2 px-4 py-2 bg-white/80 backdrop-blur-md rounded-full border border-sand shadow-sm active:scale-95 transition-all group"
        >
          <ChevronLeft size={18} className="group-hover:-translate-x-1 transition-transform" />
          <span className="text-[10px] font-black uppercase tracking-widest text-charcoal">Retour</span>
        </button>
      )}

      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 relative z-10 w-full max-w-xl mx-auto">
        
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
                  <button onClick={() => { haptics.medium(); setStep('select'); }} className="w-full flex items-center justify-between bg-charcoal text-white px-10 py-7 rounded-[2.5rem] font-black text-[12px] uppercase tracking-widest shadow-2xl shadow-charcoal/20 active:scale-95 transition-all hover:bg-black group">
                    <div className="flex items-center gap-5"><Users size={22} strokeWidth={2} /> Mes Profils</div>
                    <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform duration-300" />
                  </button>
                  <button onClick={() => { haptics.medium(); setStep('create'); }} className="w-full flex items-center justify-center gap-5 bg-white border border-sand text-charcoal px-10 py-7 rounded-[2.5rem] font-black text-[12px] uppercase tracking-widest active:scale-95 transition-all hover:bg-sand shadow-sm">
                    <UserPlus size={22} strokeWidth={2} /> Nouveau Compte
                  </button>
                </>
              ) : (
                <button onClick={() => { haptics.medium(); setStep('create'); }} className="w-full flex items-center justify-between bg-charcoal text-white px-10 py-7 rounded-[2.5rem] font-black text-[12px] uppercase tracking-widest shadow-2xl shadow-charcoal/20 active:scale-95 transition-all hover:bg-forest group">
                  <div className="flex items-center gap-5">Commencer l'aventure</div>
                  <ArrowRight size={22} className="group-hover:translate-x-2 transition-transform duration-300" />
                </button>
              )}
            </div>
          </div>
        )}

        {step === 'select' && (
          <div className="w-full animate-[fadeIn_0.5s_ease-out]">
            <div className="mb-10 flex justify-between items-end">
                <div className="text-left">
                    <h2 className="text-5xl font-black text-charcoal tracking-tighter leading-none mb-3">Re-Bienvenue.</h2>
                    <p className="text-stone-400 font-bold text-base">Choisissez votre carnet de bord.</p>
                </div>
                {existingProfiles.length > 0 && (
                    <button onClick={() => { haptics.soft(); setIsManaging(!isManaging); }} className={`text-[10px] font-black uppercase tracking-widest px-4 py-2 rounded-xl transition-all ${isManaging ? 'bg-charcoal text-white' : 'text-stone-300 hover:bg-stone-100 hover:text-stone-500'}`}>
                        {isManaging ? 'Terminer' : 'Gérer'}
                    </button>
                )}
            </div>

            {existingProfiles.length > 0 ? (
              <div className="grid gap-6 max-h-[60vh] overflow-y-auto no-scrollbar px-4 pt-4 pb-12 -mx-4">
                {sortedProfiles.map(p => {
                  const isLast = p.id === lastProfileId;
                  return (
                    <div 
                      key={p.id} 
                      onClick={() => !isManaging && onSelectProfile(p.id)} 
                      role={!isManaging ? "button" : undefined}
                      className={`relative flex items-center gap-6 p-6 rounded-[2.5rem] transition-all text-left group w-full ${isLast && !isManaging ? 'bg-white border-2 border-forest/15 shadow-2xl shadow-forest/10 active:scale-[0.98]' : 'bg-white border border-sand shadow-lg shadow-black/[0.02]'} ${!isManaging ? 'hover:border-forest/30 hover:shadow-xl active:scale-[0.98] cursor-pointer' : 'opacity-100 cursor-default'}`}
                    >
                      <div className={`w-16 h-16 rounded-[1.25rem] flex items-center justify-center font-black text-2xl transition-all duration-500 shadow-inner shrink-0 ${isLast && !isManaging ? 'bg-forest text-white' : 'bg-sand text-stone-400 group-hover:bg-charcoal group-hover:text-white'}`}>
                        {p.firstName[0]}{p.lastName[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-black text-xl text-charcoal tracking-tight group-hover:text-forest transition-colors truncate">{p.firstName} {p.lastName}</p>
                        <p className="text-[11px] font-black uppercase text-stone-400 tracking-[0.1em] mt-1">{p.movies.length} FILMS</p>
                      </div>
                      {isManaging && (
                          <button 
                              type="button"
                              onClick={(e) => { 
                                e.stopPropagation(); 
                                e.preventDefault(); 
                                haptics.medium(); 
                                setProfileToDelete(p.id); 
                              }} 
                              className="w-12 h-12 bg-red-50 text-red-500 rounded-full flex items-center justify-center cursor-pointer hover:bg-red-500 hover:text-white transition-all active:scale-90 shadow-sm border border-red-100 z-20"
                          >
                              <Trash2 size={20} strokeWidth={2.5} />
                          </button>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="py-20 flex flex-col items-center text-center animate-[fadeIn_0.5s_ease-out]">
                  <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-200">
                      <Users size={32} />
                  </div>
                  <h3 className="text-xl font-black text-charcoal mb-2">Aucun profil trouvé</h3>
                  <p className="text-stone-400 text-sm max-w-[240px] mb-10 leading-relaxed">Commencez votre héritage cinématographique en créant votre premier compte.</p>
                  <button onClick={() => { haptics.medium(); setStep('create'); }} className="bg-charcoal text-white px-8 py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest shadow-xl flex items-center gap-3 active:scale-95 transition-all">
                      <UserPlus size={16} /> Créer un profil
                  </button>
              </div>
            )}
          </div>
        )}

        {step === 'create' && (
          <form onSubmit={handleSubmit} className="w-full animate-[slideUp_0.5s_ease-out] pb-20 no-scrollbar max-h-[80vh] overflow-y-auto pr-2 mt-12">
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
                    <input required type="text" placeholder="Jean" className="w-full bg-white border-2 border-sand rounded-[1.5rem] p-5 font-black text-lg outline-none focus:border-forest/40 transition-all shadow-sm" value={formData.firstName} onChange={e => setFormData({...formData, firstName: e.target.value})} />
                  </div>
                  <div className="group/field">
                    <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] mb-3 block ml-1">Nom</label>
                    <input required type="text" placeholder="Bitter" className="w-full bg-white border-2 border-sand rounded-[1.5rem] p-5 font-black text-lg outline-none focus:border-forest/40 transition-all shadow-sm" value={formData.lastName} onChange={e => setFormData({...formData, lastName: e.target.value})} />
                  </div>
              </div>

              <div className="grid grid-cols-2 gap-6 items-end">
                  <div>
                    <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] mb-3 block ml-1">Sexe</label>
                    <div className="flex bg-stone-100 p-1.5 rounded-2xl border border-sand">
                       <button type="button" onClick={() => { haptics.soft(); setFormData({...formData, gender: 'h'}); }} className={`flex-1 flex items-center justify-center py-3.5 rounded-xl text-[10px] font-black transition-all ${formData.gender === 'h' ? 'bg-charcoal text-white shadow-lg' : 'text-stone-500'}`}>HOMME</button>
                       <button type="button" onClick={() => { haptics.soft(); setFormData({...formData, gender: 'f'}); }} className={`flex-1 flex items-center justify-center py-3.5 rounded-xl text-[10px] font-black transition-all ${formData.gender === 'f' ? 'bg-charcoal text-white shadow-lg' : 'text-stone-500'}`}>FEMME</button>
                    </div>
                  </div>
                  <div>
                    <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] mb-3 block ml-1">Âge</label>
                    <div className="relative">
                        <input required type="number" className="w-full bg-white border-2 border-sand rounded-2xl p-4 font-black text-lg outline-none focus:border-forest/40 transition-all shadow-sm pr-12" value={formData.age} onChange={e => setFormData({...formData, age: Number(e.target.value)})} />
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[10px] font-black text-stone-400 uppercase">ANS</span>
                    </div>
                  </div>
              </div>

              <div className="space-y-4">
                  <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] block ml-1">Où regardez-vous vos films ?</label>
                  <div className="grid grid-cols-3 gap-3">
                      <button 
                        type="button" 
                        onClick={() => { haptics.medium(); setFormData({...formData, viewingPreference: 'streaming'}); }}
                        className={`p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border-2 transition-all flex flex-col items-center gap-2 sm:gap-3 ${formData.viewingPreference === 'streaming' ? 'bg-forest border-forest text-white shadow-xl' : 'bg-white border-sand text-stone-400'}`}
                      >
                          <Tv size={24} className="sm:w-7 sm:h-7" />
                          <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-center">Stream</span>
                      </button>
                      <button 
                        type="button" 
                        onClick={() => { haptics.medium(); setFormData({...formData, viewingPreference: 'cinema'}); }}
                        className={`p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border-2 transition-all flex flex-col items-center gap-2 sm:gap-3 ${formData.viewingPreference === 'cinema' ? 'bg-forest border-forest text-white shadow-xl' : 'bg-white border-sand text-stone-400'}`}
                      >
                          <Ticket size={24} className="sm:w-7 sm:h-7" />
                          <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-center">Cinéma</span>
                      </button>
                      <button 
                        type="button" 
                        onClick={() => { haptics.medium(); setFormData({...formData, viewingPreference: 'both'}); }}
                        className={`p-4 sm:p-6 rounded-[1.5rem] sm:rounded-[2rem] border-2 transition-all flex flex-col items-center gap-2 sm:gap-3 ${formData.viewingPreference === 'both' ? 'bg-forest border-forest text-white shadow-xl' : 'bg-white border-sand text-stone-400'}`}
                      >
                          <Clapperboard size={24} className="sm:w-7 sm:h-7" />
                          <span className="text-[8px] sm:text-[10px] font-black uppercase tracking-widest text-center">Les Deux</span>
                      </button>
                  </div>
              </div>

              {(formData.viewingPreference === 'streaming' || formData.viewingPreference === 'both') && (
                  <div className="animate-[fadeIn_0.3s_ease-out] space-y-4">
                      <label className="text-[11px] font-black uppercase text-stone-500 tracking-[0.2em] block ml-1">Vos plateformes favorites</label>
                      <div className="grid grid-cols-4 gap-3">
                          {PLATFORMS.map(p => {
                              const isSelected = formData.streamingPlatforms.includes(p.id);
                              return (
                                  <button 
                                    key={p.id} 
                                    type="button"
                                    onClick={() => togglePlatform(p.id)}
                                    className={`relative aspect-square rounded-2xl overflow-hidden border-2 transition-all p-1 ${isSelected ? 'border-forest shadow-lg scale-105' : 'border-transparent grayscale'}`}
                                  >
                                      <img src={p.logo} alt={p.name} className="w-full h-full object-cover rounded-xl" />
                                      {isSelected && (
                                          <div className="absolute inset-0 bg-forest/20 flex items-center justify-center">
                                              <Check size={20} className="text-white" strokeWidth={4} />
                                          </div>
                                      )}
                                  </button>
                              );
                          })}
                      </div>
                  </div>
              )}
            </div>

            <button type="submit" className="w-full bg-charcoal text-white py-7 rounded-[2.5rem] font-black text-[12px] uppercase tracking-[0.2em] shadow-xl mt-12 active:scale-95 transition-all hover:bg-forest">
              Établir mon profil
            </button>
          </form>
        )}
      </div>

      <div className="p-8 text-center relative z-10 mt-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-200 opacity-60">The Bitter — Edition Heritage</p>
      </div>

      {profileToDelete && (
          <div className="fixed inset-0 z-[150] flex items-center justify-center p-6">
              <div className="absolute inset-0 bg-charcoal/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]" onClick={() => setProfileToDelete(null)} />
              <div className="bg-white p-8 rounded-[2.5rem] shadow-2xl relative z-10 w-full max-w-sm text-center animate-[scaleIn_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                  <div className="w-16 h-16 bg-red-50 text-red-500 rounded-full flex items-center justify-center mx-auto mb-6 shadow-sm">
                      <AlertTriangle size={32} strokeWidth={2} />
                  </div>
                  <h3 className="text-2xl font-black text-charcoal mb-2">Êtes-vous sûr ?</h3>
                  <p className="text-stone-400 font-medium text-sm leading-relaxed mb-8">
                      Cette action supprimera définitivement le profil et tout son historique. C'est irréversible.
                  </p>
                  <div className="flex flex-col gap-3">
                      <button 
                        type="button"
                        onClick={confirmDelete} 
                        className="w-full bg-red-500 text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-lg hover:bg-red-600 transition-all active:scale-95"
                      >
                          Supprimer définitivement
                      </button>
                      <button 
                        type="button"
                        onClick={() => setProfileToDelete(null)} 
                        className="w-full bg-stone-100 text-stone-500 py-4 rounded-2xl font-black text-xs uppercase tracking-widest hover:bg-stone-200 transition-all"
                      >
                          Annuler
                      </button>
                  </div>
              </div>
          </div>
      )}
    </div>
  );
};

export default WelcomePage;
