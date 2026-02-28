import React, { useMemo } from 'react';
import { UserProfile } from '../types';
import { Sparkles, ChevronRight, Fingerprint } from 'lucide-react';

interface ProfileCompletionWidgetProps {
  profile: UserProfile;
  onCompleteProfile: () => void;
}

export const ProfileCompletionWidget: React.FC<ProfileCompletionWidgetProps> = ({ profile, onCompleteProfile }) => {
  const completion = useMemo(() => {
    let score = 0;
    const total = 5; // Nom, Sévérité, Patience, Genres, Rôle
    
    if (profile.firstName && profile.firstName !== 'Utilisateur') score++;
    if (profile.severityIndex !== undefined) score++;
    if (profile.patienceLevel !== undefined) score++;
    if (profile.favoriteGenres && profile.favoriteGenres.length > 0) score++;
    if (profile.role) score++;
    
    return Math.round((score / total) * 100);
  }, [profile]);

  if (completion >= 100) return null;

  return (
    <button 
      onClick={onCompleteProfile}
      className="w-full mb-8 group relative overflow-hidden rounded-[2rem] bg-stone-100 dark:bg-[#161616] p-1 transition-all active:scale-[0.98]"
    >
      <div className="relative flex items-center gap-4 p-4 pr-6 bg-white dark:bg-[#1a1a1a] rounded-[1.8rem] border border-stone-200/50 dark:border-white/5 shadow-sm z-10">
        <div className="relative shrink-0">
          <svg className="w-12 h-12 -rotate-90" viewBox="0 0 36 36">
            <path
              className="text-stone-100 dark:text-stone-800"
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="text-bitter-lime drop-shadow-[0_0_2px_rgba(217,255,0,0.5)] transition-all duration-1000 ease-out"
              strokeDasharray={`${completion}, 100`}
              d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
              fill="none"
              stroke="currentColor"
              strokeWidth="3"
              strokeLinecap="round"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center text-[10px] font-black text-charcoal dark:text-white">
            {completion}%
          </div>
        </div>
        
        <div className="flex-1 text-left">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xs font-black uppercase tracking-wider text-charcoal dark:text-white">Complète ton profil</h3>
            <Sparkles size={12} className="text-bitter-lime animate-pulse" />
          </div>
          <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-tight">
            Découvre ton archétype de cinéphile et affine tes recommandations.
          </p>
        </div>

        <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-charcoal dark:text-white group-hover:bg-bitter-lime group-hover:text-charcoal transition-colors">
          <ChevronRight size={16} strokeWidth={3} />
        </div>
      </div>
      
      {/* Background decoration */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-bitter-lime/20 blur-[40px] rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
    </button>
  );
};
