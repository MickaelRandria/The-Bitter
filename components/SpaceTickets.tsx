import React, { useState } from 'react';
import ActionSheet from './ActionSheet';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { SharedSpace } from '../services/supabase';
import { SpaceOverview, missingMembers, stubStateOf } from '../services/spaceTodo';
import { haptics } from '../utils/haptics';
import { avatarSrc } from '../utils/avatar';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { monogramOf, tintOf } from '../utils/spaceLook';

interface Props {
  spaces: SharedSpace[];
  /** Demandes, affiches et membres de chaque espace (voir `loadSpaceOverview`). */
  overview: Map<string, SpaceOverview>;
  currentUserId: string;
  onOpen: (space: SharedSpace) => void;
  /** Le talon orange : qui manque, la relance, « toujours d'actualité ? ». */
  onOpenWaiting: (space: SharedSpace) => void;
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
 *
 * Un billet compact ouvre une fenêtre de billets complets. Les affiches,
 * membres et talons gardent leurs actions sans allonger la collection.
 */
const SpaceTickets: React.FC<Props> = ({ spaces, overview, currentUserId, onOpen, onOpenWaiting, onCreate }) => {
  const { t } = useLanguage();
  const pendingOf = (space: SharedSpace) => overview.get(space.id)?.pending ?? 0;
  const sorted = [...spaces].sort((a, b) => pendingOf(b) - pendingOf(a));
  const totalPending = spaces.reduce((sum, space) => sum + pendingOf(space), 0);
  const [expanded, setExpanded] = useState(false);

  const toggle = () => { haptics.soft(); setExpanded(value => !value); };

  return (
    <section aria-label={t('spaces.bubblesTitle')} className="-mx-6">
      <div className="px-6">
        <button
          onClick={toggle}
          aria-expanded={expanded}
          aria-controls="space-tickets"
          aria-haspopup="dialog"
          className="relative w-full h-14 pl-3 pr-4 rounded-xl bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 flex items-center gap-3 text-left active:scale-[0.99] transition-transform"
        >
          <span className="flex shrink-0">
            {sorted.slice(0, 4).map((space, i) => (
              <span
                key={space.id}
                className={`w-8 h-8 rounded-full border-2 border-white dark:border-[#1a1a1a] flex items-center justify-center text-[10px] font-black text-white ${i ? '-ml-2' : ''}`}
                style={{ background: tintOf(space), zIndex: 4 - i }}
              >
                {monogramOf(space.name)}
              </span>
            ))}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block truncate text-[13px] font-black tracking-tight text-charcoal dark:text-white">
              {t('spaces.bubblesTitle')}
            </span>
            {/* Les noms plutôt qu'un compte : on sait d'un coup d'œil de quoi il s'agit. */}
            <span className="block text-[11px] font-bold text-stone-500 dark:text-stone-400 truncate">
              {sorted.map((space) => space.name).join(' · ')}
            </span>
          </span>
          {totalPending > 0 && (
            <span
              aria-label={t(totalPending > 1 ? 'spaces.totalWaitingMany' : 'spaces.totalWaitingOne', {
                count: String(totalPending),
              })}
              className="shrink-0 min-w-[28px] h-7 px-2 rounded-full bg-bitter-lime text-charcoal text-xs font-black flex items-center justify-center"
            >
              {totalPending}
            </span>
          )}
          <span aria-hidden="true" className="absolute right-14 inset-y-0 border-l border-dashed border-stone-300 dark:border-white/20"><i className="absolute -top-1.5 -left-1.5 h-3 w-3 rounded-full bg-cream dark:bg-[#0c0c0c]" /><i className="absolute -bottom-1.5 -left-1.5 h-3 w-3 rounded-full bg-cream dark:bg-[#0c0c0c]" /></span>
          <ChevronDown
            size={18}
            strokeWidth={2.6}
            className={`shrink-0 text-stone-500 transition-transform duration-300 ${expanded ? 'rotate-180' : ''}`}
          />
        </button>
      </div>

      {expanded && (
        <ActionSheet title={t('spaces.bubblesTitle')} onClose={() => setExpanded(false)}>
        <div
          id="space-tickets"
          className="space-ticket-list grid gap-4 py-2"
        >
          {sorted.map((space) => {
            const info = overview.get(space.id);
            const pending = info?.pending ?? 0;
            const posters = info?.posters ?? [];
            const others = (info?.members ?? []).filter((m) => m.profile_id !== currentUserId);
            const me = (info?.members ?? []).find((m) => m.profile_id === currentUserId);
            const shown = [...others.slice(0, 3), ...(me ? [me] : [])];
            const state = stubStateOf(info);
            const memberById = new Map<string, SpaceOverview['members'][number] & { index: number }>(
              (info?.members ?? []).map((m, i) => [m.profile_id, { ...m, index: i }])
            );
            const missing = info ? missingMembers(info) : [];
            // Seulement des votes à donner : on le dit, plutôt que « t'attend ».
            const onlyVotes = !!info && info.toVote.length === pending;
            const open = () => {
              haptics.soft();
              setExpanded(false);
              onOpen(space);
            };
            return (
              <div
                key={space.id}
                role="group"
                aria-label={space.name}
                className="w-full min-w-0 h-[118px] flex drop-shadow-[0_8px_12px_rgba(26,26,26,0.10)] dark:drop-shadow-none"
              >
                {/* Le billet : inchangé, il ouvre l'espace. */}
                <button
                  type="button"
                  onClick={open}
                  aria-label={
                    pending
                      ? t('spaces.bubbleWaiting', { name: space.name, count: String(pending) })
                      : t('spaces.bubbleOpen', { name: space.name })
                  }
                  className="flex-1 min-w-0 h-full text-left active:scale-[0.98] transition-transform bg-white dark:bg-[#1a1a1a] rounded-l-[18px] pl-4 pr-3.5 py-3.5 flex flex-col justify-between">
                  <span className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: tintOf(space) }}
                    />
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
                        <span
                          key={i}
                          className="w-7 h-[42px] rounded-md bg-stone-100 dark:bg-white/5"
                        />
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
                            style={
                              isMe
                                ? undefined
                                : { background: MEMBER_TINTS[i % MEMBER_TINTS.length] }
                            }
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
                </button>

                {/* La perforation, avec ses deux encoches de la couleur de la page */}
                <span className="relative w-0 h-full border-l-2 border-dashed border-stone-300 dark:border-white/15">
                  <span className="absolute -top-[9px] -left-[10px] w-[18px] h-[18px] rounded-full bg-cream dark:bg-[#0c0c0c]" />
                  <span className="absolute -bottom-[9px] -left-[10px] w-[18px] h-[18px] rounded-full bg-cream dark:bg-[#0c0c0c]" />
                </span>

                {/* Le talon : c'est lui qui dit où en est le groupe. */}
                <button
                  type="button"
                  onClick={() => {
                    if (state === 'me' || state === 'ok') return open();
                    haptics.soft();
                    setExpanded(false); onOpenWaiting(space);
                  }}
                  aria-label={
                    state === 'wait' || state === 'waitReminded'
                      ? t('spaces.stubWaitingLabel', { name: space.name, count: String(missing.length) })
                      : state === 'stale'
                        ? t('spaces.stubStaleLabel', { name: space.name })
                        : undefined
                  }
                  className={`w-[86px] h-full rounded-r-[18px] flex flex-col items-center justify-center gap-0.5 px-1.5 text-center active:scale-[0.97] transition-transform ${
                    state === 'me'
                      ? 'bg-charcoal dark:bg-bitter-lime'
                      : state === 'wait' || state === 'waitReminded'
                        ? 'bg-[#FFF1E2] dark:bg-[#2A2116]'
                        : state === 'stale'
                          ? 'bg-[#F3EFE6] dark:bg-[#232019]'
                          : 'bg-sand dark:bg-[#232323]'
                  }`}
                >
                  {state === 'me' ? (
                    <>
                      <span className="text-[40px] font-black tracking-[-0.06em] leading-none text-bitter-lime dark:text-charcoal">
                        {pending}
                      </span>
                      <span className="text-[10px] font-extrabold leading-tight text-stone-300 dark:text-charcoal/70">
                        {onlyVotes
                          ? pending > 1
                            ? t('spaces.ticketVotesMany')
                            : t('spaces.ticketVotesOne')
                          : pending > 1
                            ? t('spaces.ticketWaitingMany')
                            : t('spaces.ticketWaitingOne')}
                      </span>
                    </>
                  ) : state === 'wait' || state === 'waitReminded' ? (
                    <>
                      <span className="flex mb-0.5">
                        {missing.slice(0, 3).map((id, i) => {
                          const m = memberById.get(id);
                          const src = avatarSrc(m?.avatar_url ?? null);
                          return (
                            <span
                              key={id}
                              className={`w-6 h-6 rounded-full overflow-hidden border-2 border-[#FFF1E2] dark:border-[#2A2116] flex items-center justify-center text-[9px] font-black text-white ${i ? '-ml-2' : ''}`}
                              style={{ background: MEMBER_TINTS[(m?.index ?? i) % MEMBER_TINTS.length] }}
                            >
                              {src ? <img src={src} alt="" className="w-full h-full object-cover" /> : (m?.first_name || '?')[0].toUpperCase()}
                            </span>
                          );
                        })}
                      </span>
                      <span className="text-[11px] font-black leading-tight text-[#9A4F05] dark:text-[#F5B26B]">
                        {missing.length > 1
                          ? t('spaces.stubMissingMany', { count: String(missing.length) })
                          : t('spaces.stubMissingOne')}
                      </span>
                      {state === 'wait' ? (
                        <span className="mt-0.5 rounded-full bg-[#F08A24] px-2 py-0.5 text-[9px] font-black uppercase tracking-wider text-white">
                          {t('spaces.stubRemind')}
                        </span>
                      ) : (
                        <span className="text-[9.5px] font-bold text-[#B8732F]">{t('spaces.stubReminded')}</span>
                      )}
                    </>
                  ) : state === 'stale' ? (
                    <>
                      <span className="text-[22px] font-black leading-none text-[#9A4F05] dark:text-[#F5B26B]">?</span>
                      <span className="text-[9.5px] font-extrabold leading-tight text-stone-500 dark:text-stone-400">
                        {t('spaces.stubStale')}
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
                </button>
              </div>
            );
          })}

          <button
            onClick={() => {
              haptics.soft();
              setExpanded(false); onCreate();
            }}
            aria-label={t('spaces.create')}
            className="w-full min-h-16 rounded-[18px] border-2 border-dashed border-stone-300 dark:border-white/15 flex flex-col items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Plus size={22} strokeWidth={2.6} className="text-stone-500" />
            <span className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400 text-center leading-tight">
              {t('spaces.ticketNew')}
            </span>
          </button>
        </div>
        </ActionSheet>
      )}
    </section>
  );
};

export default SpaceTickets;
