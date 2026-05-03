import React from 'react';
import { Globe } from 'lucide-react';
import { UserProfile } from '../types';

interface Props {
  profiles: UserProfile[];
  onLink: (profileId: string) => void;
  onSkip: () => void;
}

export default function ProfileLinkingModal({ profiles, onLink, onSkip }: Props) {
  return (
    <div className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
      <div className="relative bg-white dark:bg-[#1a1a1a] w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden border border-sand dark:border-white/10">

        {/* Drag handle */}
        <div className="flex justify-center pt-3 pb-1 sm:hidden">
          <div className="w-12 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-8 pt-6 pb-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-2xl bg-forest/10 dark:bg-forest/15 flex items-center justify-center shrink-0">
              <Globe size={18} className="text-forest" strokeWidth={2} />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-charcoal dark:text-white leading-tight">
                Quel profil associer à ton compte ?
              </h2>
            </div>
          </div>
          <p className="text-[11px] text-stone-400 leading-relaxed">
            Ce profil sera visible dans les Espaces Partagés — tes 5 films les mieux notés, tes stats. Choix modifiable plus tard.
          </p>
        </div>

        {/* Profile list */}
        <div className="px-6 pb-2 flex flex-col gap-2 overflow-y-auto">
          {profiles.map((profile) => {
            const watchedCount = profile.movies.filter((m) => m.status === 'watched').length;
            const initial = (profile.firstName || '?')[0].toUpperCase();
            return (
              <div
                key={profile.id}
                className="flex items-center gap-4 p-4 rounded-2xl bg-stone-50 dark:bg-white/5 border border-stone-100 dark:border-white/8"
              >
                {/* Avatar */}
                <div className="w-11 h-11 rounded-full bg-forest/15 dark:bg-forest/20 flex items-center justify-center shrink-0">
                  <span className="text-base font-black text-forest">{initial}</span>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-black text-charcoal dark:text-white truncate">
                    {profile.firstName}
                  </p>
                  <p className="text-[10px] text-stone-400 mt-0.5">
                    {watchedCount} film{watchedCount !== 1 ? 's' : ''} vu{watchedCount !== 1 ? 's' : ''}
                  </p>
                </div>

                {/* Link button */}
                <button
                  onClick={() => onLink(profile.id)}
                  className="shrink-0 px-4 py-2 bg-forest text-white text-[11px] font-black uppercase tracking-[0.12em] rounded-xl active:scale-95 transition-transform"
                >
                  Associer
                </button>
              </div>
            );
          })}
        </div>

        {/* Skip */}
        <div className="px-8 pt-3 pb-8">
          <button
            onClick={onSkip}
            className="w-full py-3 text-[11px] font-black uppercase tracking-[0.15em] text-stone-400 dark:text-stone-500"
          >
            Plus tard
          </button>
        </div>
      </div>
    </div>
  );
}
