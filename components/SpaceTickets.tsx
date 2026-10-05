import React from 'react';
import { Check, Plus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { SharedSpace } from '../services/supabase';
import { SpaceOverview } from '../services/spaceTodo';
import { haptics } from '../utils/haptics';
import { avatarSrc } from '../utils/avatar';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { tintOf } from '../utils/spaceLook';

interface Props {
  spaces: SharedSpace[];
  /** Demandes, affiches et membres de chaque espace (voir `loadSpaceOverview`). */
  overview: Map<string, SpaceOverview>;
  currentUserId: string;
  onOpen: (space: SharedSpace) => void;
  onCreate: () => void;
}

/** Teintes des autres membres sur le billet ; la mienne est le jaune-vert. */
const MEMBER_TINTS = ['#B45309', '#3E5238', '#3D405B', '#7F5539', '#2F3E46', '#6B705C'];

/**
 * Les espaces en billets de cinéma, en haut de l'accueil.
 *
 * Ils remplacent les bulles façon stories, qui rappelaient Instagram plus que
 * le cinéma. Un billet par espace : son nom, ses trois dernières affiches et
 * ses membres ; sur le talon, ce qui m'y attend. L'espace qui attend le plus
 * passe devant. Le dernier billet, en pointillés, crée ou rejoint un espace.
 */
const SpaceTickets: React.FC<Props> = ({ spaces, overview, currentUserId, onOpen, onCreate }) => {
  const { t } = useLanguage();
  const pendingOf = (space: SharedSpace) => overview.get(space.id)?.pending ?? 0;
  const sorted = [...spaces].sort((a, b) => pendingOf(b) - pendingOf(a));

  return (
    <section aria-label={t('spaces.bubblesTitle')} className="-mx-6">
      <p className="px-6 mb-3 text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-500">
        {t('spaces.bubblesTitle')}
      </p>
      <div className="flex gap-3 overflow-x-auto no-scrollbar px-6 scroll-px-6 pt-2 pb-7 -mb-4 snap-x snap-mandatory">
        {sorted.map((space) => {
          const info = overview.get(space.id);
          const pending = info?.pending ?? 0;
          const posters = info?.posters ?? [];
          const others = (info?.members ?? []).filter((m) => m.profile_id !== currentUserId);
          const me = (info?.members ?? []).find((m) => m.profile_id === currentUserId);
          const shown = [...others.slice(0, 3), ...(me ? [me] : [])];
          return (
            <button
              key={space.id}
              onClick={() => {
                haptics.soft();
                onOpen(space);
              }}
              aria-label={
                pending
                  ? t('spaces.bubbleWaiting', { name: space.name, count: String(pending) })
                  : t('spaces.bubbleOpen', { name: space.name })
              }
              className="snap-start shrink-0 w-[300px] h-[118px] flex text-left active:scale-[0.98] transition-transform drop-shadow-[0_8px_12px_rgba(26,26,26,0.10)] dark:drop-shadow-none"
            >
              {/* Le billet */}
              <span className="flex-1 min-w-0 h-full bg-white dark:bg-[#1a1a1a] rounded-l-[18px] pl-4 pr-3.5 py-3.5 flex flex-col justify-between">
                <span className="flex items-center gap-2 min-w-0">
                  <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ background: tintOf(space) }} />
                  <span className="truncate text-[17px] font-black tracking-tight text-charcoal dark:text-white">
                    {space.name}
                  </span>
                </span>
                <span className="flex items-end gap-[5px]">
                  {[0, 1, 2].map((i) =>
                    posters[i] ? (
                      <img
                        key={i}
                        src={resizeTmdbImage(posters[i], 'w154')}
                        alt=""
                        loading="lazy"
                        decoding="async"
                        className="w-7 h-[42px] rounded-md object-cover bg-stone-200 dark:bg-white/10"
                      />
                    ) : (
                      <span key={i} className="w-7 h-[42px] rounded-md bg-stone-100 dark:bg-white/5" />
                    )
                  )}
                  <span className="ml-1.5 flex">
                    {shown.map((m, i) => {
                      const isMe = m.profile_id === currentUserId;
                      const src = avatarSrc(m.avatar_url);
                      return (
                        <span
                          key={m.profile_id}
                          className={`w-5 h-5 rounded-full overflow-hidden border-2 border-white dark:border-[#1a1a1a] flex items-center justify-center text-[8px] font-black ${i ? '-ml-1.5' : ''} ${isMe ? 'bg-bitter-lime text-charcoal' : 'text-white'}`}
                          style={isMe ? undefined : { background: MEMBER_TINTS[i % MEMBER_TINTS.length] }}
                        >
                          {src ? (
                            <img src={src} alt="" className="w-full h-full object-cover" />
                          ) : (
                            (m.first_name || '?')[0].toUpperCase()
                          )}
                        </span>
                      );
                    })}
                  </span>
                </span>
              </span>

              {/* La perforation, avec ses deux encoches de la couleur de la page */}
              <span className="relative w-0 h-full border-l-2 border-dashed border-stone-300 dark:border-white/15">
                <span className="absolute -top-[9px] -left-[10px] w-[18px] h-[18px] rounded-full bg-cream dark:bg-[#0c0c0c]" />
                <span className="absolute -bottom-[9px] -left-[10px] w-[18px] h-[18px] rounded-full bg-cream dark:bg-[#0c0c0c]" />
              </span>

              {/* Le talon */}
              <span
                className={`w-[86px] h-full rounded-r-[18px] flex flex-col items-center justify-center gap-0.5 ${pending ? 'bg-charcoal dark:bg-bitter-lime' : 'bg-sand dark:bg-[#232323]'}`}
              >
                {pending ? (
                  <>
                    <span className="text-[40px] font-black tracking-[-0.06em] leading-none text-bitter-lime dark:text-charcoal">
                      {pending}
                    </span>
                    <span className="text-[10px] font-extrabold text-stone-300 dark:text-charcoal/70">
                      {pending > 1 ? t('spaces.ticketWaitingMany') : t('spaces.ticketWaitingOne')}
                    </span>
                  </>
                ) : (
                  <>
                    <Check size={22} strokeWidth={3} className="text-forest dark:text-lime-400" />
                    <span className="text-[10px] font-extrabold text-stone-500 dark:text-stone-400">
                      {t('spaces.ticketUpToDate')}
                    </span>
                  </>
                )}
              </span>
            </button>
          );
        })}

        <button
          onClick={() => {
            haptics.soft();
            onCreate();
          }}
          aria-label={t('spaces.create')}
          className="snap-start shrink-0 w-[118px] h-[118px] rounded-[18px] border-2 border-dashed border-stone-300 dark:border-white/15 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
        >
          <Plus size={22} strokeWidth={2.6} className="text-stone-500" />
          <span className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400 text-center leading-tight">
            {t('spaces.ticketNew')}
          </span>
        </button>
      </div>
    </section>
  );
};

export default SpaceTickets;
