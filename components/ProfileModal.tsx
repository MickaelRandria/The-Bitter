import React, { useMemo } from 'react';
import { X, LogOut, User, Info, SlidersHorizontal, Repeat, Calendar, Scale, Timer, Fingerprint, Mail, Film, Clock, Star, Zap, PieChart } from 'lucide-react';
import { UserProfile } from '../types';
import { haptics } from '../utils/haptics';
import { RELEASE_HISTORY } from '../constants/changelog';

interface ProfileModalProps {
  profile: UserProfile;
  session: any | null;
  onClose: () => void;
  onSwitchProfile: () => void;
  onRecalibrate: () => void;
  onShowTutorial: () => void;
  onSignOut: () => void;
}

// Données statiques pour l'affichage (copie simplifiée de archetypes.ts pour l'affichage UI)
const ARCHETYPE_INFO: Record<string, { icon: string, description: string }> = {
  "Le Déchiffreur": { icon: "🔍", description: "Tu ne regardes pas un film, tu le résous." },
  "L'Éponge Émotionnelle": { icon: "🥀", description: "Tu cherches la catharsis et l'émotion pure." },
  "L'Hédoniste": { icon: "🍿", description: "Le cinéma est une fête, le plaisir avant tout." },
  "L'Esthète": { icon: "👁️", description: "La forme prime sur le fond." },
  "L'Adrénaline Junkie": { icon: "🎢", description: "Tu vis pour le frisson et la tension." },
  "Le Stratège Noir": { icon: "🕵️", description: "L'intelligence rencontre la noirceur." },
  "Le Romantique Visionnaire": { icon: "🌅", description: "La beauté qui émeut." },
  "Le Philosophe Sensible": { icon: "🎭", description: "Tu veux comprendre ET ressentir." },
  "L'Omnivore": { icon: "🌍", description: "Ta force est ta curiosité sans limite." }
};

const ProfileModal: React.FC<ProfileModalProps> = ({ 
  profile, 
  session, 
  onClose, 
  onSwitchProfile, 
  onRecalibrate,
  onShowTutorial,
  onSignOut 
}) => {
  
  const initial = profile.firstName?.[0]?.toUpperCase() || '?';
  const joinDate = new Date(profile.createdAt).toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const email = session?.user?.email;

  // Calcul des statistiques en temps réel
  const stats = useMemo(() => {
    const watched = profile.movies.filter(m => m.status === 'watched');
    const watchlist = profile.movies.filter(m => m.status === 'watchlist');
    
    // Genre Dominant
    const genreCounts: Record<string, number> = {};
    watched.forEach(m => {
        if (m.genre) genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1;
    });
    const dominantGenre = Object.entries(genreCounts).sort((a, b) => b[1] - a[1])[0]?.[0] || 'Aucun';

    return {
        watchedCount: watched.length,
        dominantGenre
    };
  }, [profile.movies]);

  // Info Archétype
  const currentArchetypeInfo = profile.role ? ARCHETYPE_INFO[profile.role] : null;
  const isArchetypeConfirmed = stats.watchedCount >= 10;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      
      <div className="relative z-10 bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20">
        
        {/* Drag Handle */}
        <div className="w-full flex justify-center pt-3 pb-1 bg-white dark:bg-[#1a1a1a] cursor-grab active:cursor-grabbing" onClick={onClose}>
            <div className="w-12 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 pb-4 border-b border-sand dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#1a1a1a]">
          <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white">Mon Profil</h2>
          <button 
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar bg-cream dark:bg-[#0c0c0c]">
          
          {/* SECTION 1: IDENTITY */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 bg-forest text-white rounded-[2rem] flex items-center justify-center text-3xl font-black shadow-xl shadow-forest/20 shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black text-charcoal dark:text-white tracking-tight leading-none mb-2 truncate">
                {profile.firstName} {profile.lastName}
              </h1>
              
              <div className="flex flex-col gap-1.5">
                {email ? (
                    <div className="flex items-center gap-1.5 text-stone-400 dark:text-stone-500">
                        <Mail size={12} />
                        <span className="text-[10px] font-bold truncate">{email}</span>
                    </div>
                ) : (
                    <div className="flex items-center gap-1.5 text-orange-400">
                        <Fingerprint size={12} />
                        <span className="text-[10px] font-bold uppercase tracking-wide">Compte Invité</span>
                    </div>
                )}
                
                <div className="flex items-center gap-1.5 text-stone-400 dark:text-stone-500">
                    <Calendar size={12} />
                    <span className="text-[10px] font-medium">Membre depuis {joinDate}</span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: ARCHETYPE */}
          {profile.role && currentArchetypeInfo && (
              <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 shadow-sm border border-sand dark:border-white/5 relative overflow-hidden">
                  <div className="absolute top-0 right-0 w-32 h-32 bg-forest/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
                  
                  <div className="flex items-start gap-4 relative z-10">
                      <div className="text-4xl bg-stone-50 dark:bg-[#252525] w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner">
                          {currentArchetypeInfo.icon}
                      </div>
                      <div className="flex-1">
                          <div className="flex items-center gap-2 mb-1">
                              <h3 className="text-lg font-black text-charcoal dark:text-white leading-none">{profile.role}</h3>
                              <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${isArchetypeConfirmed ? 'bg-forest/10 text-forest dark:text-lime-500' : 'bg-stone-100 text-stone-400 dark:bg-stone-800'}`}>
                                  {isArchetypeConfirmed ? 'Confirmé' : 'Provisoire'}
                              </span>
                          </div>
                          <p className="text-xs font-medium text-stone-500 dark:text-stone-400 italic leading-relaxed">
                              "{currentArchetypeInfo.description}"
                          </p>
                      </div>
                  </div>
              </div>
          )}

          {/* SECTION 3: STATS GRID */}
          <div className="grid grid-cols-2 gap-3">
              <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-[1.8rem] border border-sand dark:border-white/5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-stone-400 dark:text-stone-500">
                      <Film size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Vus</span>
                  </div>
                  <span className="text-3xl font-black text-charcoal dark:text-white">{stats.watchedCount}</span>
              </div>
              <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-[1.8rem] border border-sand dark:border-white/5 shadow-sm">
                  <div className="flex items-center gap-2 mb-2 text-stone-400 dark:text-stone-500">
                      <PieChart size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">Genre</span>
                  </div>
                  <span className="text-xl font-black text-charcoal dark:text-white truncate block">{stats.dominantGenre}</span>
              </div>
          </div>

          {/* SECTION 4: PREFERENCES */}
          <div>
            <div className="flex items-center justify-between mb-4">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 ml-1">Calibrage</h3>
                <button onClick={() => { haptics.soft(); onRecalibrate(); }} className="text-[9px] font-black uppercase tracking-widest text-forest dark:text-lime-500 hover:opacity-80 transition-opacity flex items-center gap-1">
                    <SlidersHorizontal size={12} /> Recalibrer
                </button>
            </div>
            
            <div className="space-y-3">
                <div className="bg-stone-50 dark:bg-[#1a1a1a] p-4 rounded-[1.5rem] border border-stone-100 dark:border-white/5">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2 text-stone-400 dark:text-stone-500">
                            <Scale size={14} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Exigence</span>
                        </div>
                        <span className="text-[9px] font-bold text-charcoal dark:text-white">{profile.severityIndex}/10</span>
                    </div>
                    <div className="h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                        <div className="h-full bg-charcoal dark:bg-white" style={{ width: `${(profile.severityIndex || 5) * 10}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[8px] font-bold text-stone-300 dark:text-stone-600 uppercase tracking-wider">
                        <span>Indulgent</span>
                        <span>Sévère</span>
                    </div>
                </div>

                <div className="bg-stone-50 dark:bg-[#1a1a1a] p-4 rounded-[1.5rem] border border-stone-100 dark:border-white/5">
                    <div className="flex justify-between items-center mb-2">
                        <div className="flex items-center gap-2 text-stone-400 dark:text-stone-500">
                            <Timer size={14} />
                            <span className="text-[9px] font-black uppercase tracking-widest">Rythme</span>
                        </div>
                        <span className="text-[9px] font-bold text-charcoal dark:text-white">{profile.patienceLevel}/10</span>
                    </div>
                    <div className="h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                        <div className="h-full bg-charcoal dark:bg-white" style={{ width: `${(profile.patienceLevel || 5) * 10}%` }} />
                    </div>
                    <div className="flex justify-between mt-1 text-[8px] font-bold text-stone-300 dark:text-stone-600 uppercase tracking-wider">
                        <span>Contemplatif</span>
                        <span>Intense</span>
                    </div>
                </div>
            </div>

            {profile.favoriteGenres && profile.favoriteGenres.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                    {profile.favoriteGenres.map(g => (
                        <span key={g} className="px-3 py-1.5 bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/5 rounded-lg text-[9px] font-black uppercase tracking-wide text-stone-500 dark:text-stone-400">
                            {g}
                        </span>
                    ))}
                </div>
            )}
          </div>

          {/* SECTION 5: ACTIONS */}
          <div className="pt-4 border-t border-sand dark:border-white/5 space-y-1">
            <button onClick={() => { haptics.soft(); onSwitchProfile(); }} className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform"><Repeat size={14} /></div>
                    <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">Changer de profil</span>
                </div>
            </button>

            <button onClick={() => { haptics.soft(); onShowTutorial(); }} className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group">
                <div className="flex items-center gap-4">
                    <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform"><Info size={14} /></div>
                    <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">Revoir le tutoriel</span>
                </div>
            </button>

            {session && (
                <button onClick={() => { haptics.medium(); onSignOut(); }} className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group mt-2">
                    <div className="flex items-center gap-4">
                        <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform"><LogOut size={14} /></div>
                        <span className="text-xs font-black uppercase tracking-wide text-red-500">Se déconnecter</span>
                    </div>
                </button>
            )}
          </div>

        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 dark:bg-[#0a0a0a] text-center border-t border-sand dark:border-white/5">
            <p className="text-[8px] font-black text-stone-300 dark:text-stone-700 uppercase tracking-[0.3em]">
                The Bitter {RELEASE_HISTORY[0].version}
            </p>
        </div>
      </div>
    </div>
  );
};

export default ProfileModal;