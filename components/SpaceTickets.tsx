import React, { useState } from 'react';
import { Check, ChevronDown, Plus } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { SharedSpace } from '../services/supabase';
import { SpaceOverview, missingMembers, stubStateOf } from '../services/spaceTodo';
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
  /** Le talon orange : qui manque, la relance, « toujours d'actualité ? ». */
  onOpenWaiting: (space: SharedSpace) => void;
  onCreate: () => void;
}

/** Teintes des autres membres sur le billet ; la mienne est le jaune-vert. */
const MEMBER_TINTS = ['#E76F51', '#457B9D', '#8E7DBE', '#2A9D8F', '#E9C46A', '#B45309'];

const TICKET_W = 268;
const GAP = 12;
/** Réduits ou en billets : le choix reste sur ce téléphone. */
const COLLAPSED_KEY = 'bitter_space_tickets_collapsed';

const dotOf = (state: ReturnType<typeof stubStateOf>) =>
  state === 'me' ? 'bg-bitter-lime' : state === 'wait' || state === 'waitReminded' ? 'bg-[#F08A24]' : 'bg-[#9BD08C]';

/**
 * Les espaces en billets de cinéma, en haut de l'accueil, à faire défiler.
 *
 * Un billet par espace, en un geste : le corps ouvre l'espace (sa dernière
 * affiche floutée en fond, ses trois dernières en éventail, ses membres) ; le
 * talon dit et fait ce qui attend (voter, relancer, « toujours d'actualité ? »,
 * à jour). L'espace qui attend le plus passe devant ; le dernier billet, en
 * pointillés, crée ou rejoint un espace.
 *
 * Réduits, les billets deviennent une ligne de pastilles (affiche ronde, nom, ce
 * qui attend) qui ouvrent l'espace.
 */
const SpaceTickets: React.FC<Props> = ({ spaces, overview, currentUserId, onOpen, onOpenWaiting, onCreate }) => {
  const { t } = useLanguage();
  const pendingOf = (space: SharedSpace) => overview.get(space.id)?.pending ?? 0;
  const sorted = [...spaces].sort((a, b) => pendingOf(b) - pendingOf(a));
  const totalPending = spaces.reduce((sum, space) => sum + pendingOf(space), 0);
  const [page, setPage] = useState(0);
  const pages = sorted.length + 1;
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });

  const toggle = () => {
    haptics.soft();
    const next = !collapsed;
    setCollapsed(next);
    try {
      localStorage.setItem(COLLAPSED_KEY, next ? '1' : '0');
    } catch {
      // Sans stockage, le choix vaut pour cette visite.
    }
  };

  const open = (space: SharedSpace) => {
    haptics.soft();
    onOpen(space);
  };

  return (
    <section aria-label={t('spaces.bubblesTitle')} className="-mx-6">
      <div className="flex items-center gap-2 px-6">
        <h2 className="mr-auto text-[17px] font-black tracking-[-0.04em] text-charcoal dark:text-white">
          {t('spaces.bubblesTitle')} <span className="font-extrabold text-stone-400">{spaces.length}</span>
        </h2>
        {totalPending > 0 && (
          <span className="flex items-center gap-1.5 rounded-full bg-charcoal py-1.5 pl-2 pr-2.5 text-[11px] font-black text-bitter-lime dark:bg-bitter-lime dark:text-charcoal">
            <span aria-hidden="true" className="h-[7px] w-[7px] rounded-full bg-bitter-lime dark:bg-charcoal" />
            {t(totalPending > 1 ? 'spaces.totalWaitingMany' : 'spaces.totalWaitingOne', { count: String(totalPending) })}
          </span>
        )}
        <button
          type="button"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls="space-tickets"
          aria-label={t(collapsed ? 'spaces.ticketsShowLabel' : 'spaces.ticketsHideLabel')}
          className="flex h-[30px] items-center gap-1 rounded-full border border-stone-200 bg-white pl-3 pr-2.5 text-[11px] font-black text-charcoal transition-transform active:scale-95 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white"
        >
          {t(collapsed ? 'spaces.ticketsShow' : 'spaces.ticketsHide')}
          <ChevronDown size={14} strokeWidth={2.8} className={`transition-transform ${collapsed ? '' : 'rotate-180'}`} />
        </button>
      </div>

      {collapsed ? (
        <div
          id="space-tickets"
          className="mt-3 flex gap-2 overflow-x-auto px-6 pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {sorted.map((space) => {
            const info = overview.get(space.id);
            const pending = info?.pending ?? 0;
            const poster = info?.posters?.[0];
            const state = stubStateOf(info);
            const onlyVotes = !!info && info.toVote.length === pending;
            return (
              <button
                key={space.id}
                type="button"
                onClick={() => open(space)}
                aria-label={
                  pending
                    ? t('spaces.bubbleWaiting', { name: space.name, count: String(pending) })
                    : t('spaces.bubbleOpen', { name: space.name })
                }
                className="flex h-10 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-stone-200 bg-white pl-1 pr-3 text-[12px] font-extrabold text-charcoal transition-transform active:scale-95 dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white"
              >
                <span aria-hidden="true" className="relative h-8 w-8 shrink-0">
                  {poster ? (
                    <img src={resizeTmdbImage(poster, 'w92')} alt="" className="h-8 w-8 rounded-full object-cover" />
                  ) : (
                    <span className="block h-8 w-8 rounded-full" style={{ background: tintOf(space) }} />
                  )}
                  <span className={`absolute -bottom-px -right-px h-2.5 w-2.5 rounded-full border-2 border-white dark:border-[#1a1a1a] ${dotOf(state)}`} />
                </span>
                {space.name}
                {state === 'me' && (
                  <span className="rounded-full bg-bitter-lime px-[7px] py-[3px] text-[10px] font-black text-charcoal">
                    {onlyVotes
                      ? t(pending > 1 ? 'spaces.chipVotesMany' : 'spaces.chipVotesOne', { count: String(pending) })
                      : t(pending > 1 ? 'spaces.totalWaitingMany' : 'spaces.totalWaitingOne', { count: String(pending) })}
                  </span>
                )}
                {state === 'wait' && (
                  <span className="rounded-full bg-[#FFF1E2] px-[7px] py-[3px] text-[10px] font-black text-[#9A4F05] dark:bg-[#2A2116] dark:text-[#F5B26B]">
                    {t('spaces.stubRemind')}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ) : (
      <>
      <div
        id="space-tickets"
        onScroll={(event) => {
          const next = Math.round(event.currentTarget.scrollLeft / (TICKET_W + GAP));
          if (next !== page) setPage(next);
        }}
        className="mt-3 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-4 pt-0.5 scroll-px-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {sorted.map((space, index) => {
          const info = overview.get(space.id);
          const pending = info?.pending ?? 0;
          const posters = info?.posters ?? [];
          const members = info?.members ?? [];
          const others = members.filter((m) => m.profile_id !== currentUserId);
          const shown = [...others.slice(0, 3), ...members.filter((m) => m.profile_id === currentUserId)];
          const state = stubStateOf(info);
          const memberIndex = new Map<string, number>(members.map((m, i) => [m.profile_id, i]));
          const missing = info ? missingMembers(info) : [];
          // Seulement des votes à donner : on le dit, plutôt que « t'attend ».
          const onlyVotes = !!info && info.toVote.length === pending;
          const tint = tintOf(space);
          const dot = dotOf(state);

          return (
            <div
              key={space.id}
              role="group"
              aria-label={space.name}
              className="flex h-[112px] shrink-0 snap-start drop-shadow-[0_8px_12px_rgba(26,26,26,0.16)] dark:drop-shadow-none"
              style={{ width: TICKET_W }}
            >
              {/* Le corps du billet : il ouvre l'espace. */}
              <button
                type="button"
                onClick={() => open(space)}
                aria-label={
                  pending
                    ? t('spaces.bubbleWaiting', { name: space.name, count: String(pending) })
                    : t('spaces.bubbleOpen', { name: space.name })
                }
                className="relative flex h-full min-w-0 flex-1 flex-col justify-between overflow-hidden rounded-l-[16px] px-3 py-[11px] text-left text-white transition-transform active:scale-[0.98]"
                style={{ background: posters[0] ? '#151515' : tint }}
              >
                {posters[0] && (
                  <img
                    src={resizeTmdbImage(posters[0], 'w154')}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute -inset-5 h-[calc(100%+40px)] w-[calc(100%+40px)] max-w-none object-cover opacity-75 blur-[18px] saturate-[1.3]"
                  />
                )}
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(12,12,12,0.82)_0%,rgba(12,12,12,0.55)_55%,rgba(12,12,12,0.2)_100%)]"
                />
                {posters.length > 0 && (
                  <span aria-hidden="true" className="pointer-events-none absolute -right-0.5 top-2.5 h-[92px] w-[74px]">
                    {posters[2] && (
                      <img
                        src={resizeTmdbImage(posters[2], 'w154')}
                        alt=""
                        loading="lazy"
                        className="absolute left-0 top-2.5 h-[60px] w-10 -rotate-[13deg] rounded-md object-cover shadow-[0_10px_22px_rgba(0,0,0,0.45)]"
                      />
                    )}
                    {posters[1] && (
                      <img
                        src={resizeTmdbImage(posters[1], 'w154')}
                        alt=""
                        loading="lazy"
                        className="absolute left-[15px] top-0.5 h-[63px] w-[42px] -rotate-3 rounded-md object-cover shadow-[0_10px_22px_rgba(0,0,0,0.45)]"
                      />
                    )}
                    <img
                      src={resizeTmdbImage(posters[0], 'w154')}
                      alt=""
                      loading="lazy"
                      className="absolute left-[30px] top-1.5 h-[66px] w-11 rotate-[9deg] rounded-md object-cover shadow-[0_12px_26px_rgba(0,0,0,0.5)]"
                    />
                  </span>
                )}
                <span className="relative flex items-center gap-1.5 text-[8px] font-black uppercase tracking-[0.18em] text-white/70">
                  <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                  {t(members.length > 1 ? 'spaces.ticketKickerMany' : 'spaces.ticketKickerOne', {
                    n: String(index + 1),
                    count: String(members.length),
                  })}
                </span>
                <span className="relative flex flex-col gap-1.5">
                  <span className="line-clamp-2 max-w-[120px] text-[18px] font-black leading-[0.95] tracking-[-0.05em] [text-shadow:0_2px_12px_rgba(0,0,0,0.4)]">
                    {space.name}
                  </span>
                  <span className="flex min-w-0 items-center gap-2">
                    <span className="flex shrink-0">
                      {shown.map((m, i) => {
                        const isMe = m.profile_id === currentUserId;
                        const src = avatarSrc(m.avatar_url);
                        return (
                          <span
                            key={m.profile_id}
                            className={`flex h-[18px] w-[18px] items-center justify-center overflow-hidden rounded-full border-2 border-[#141414] text-[8px] font-black ${i ? '-ml-1.5' : ''} ${isMe ? 'bg-bitter-lime text-charcoal' : 'text-white'}`}
                            style={isMe ? undefined : { background: MEMBER_TINTS[i % MEMBER_TINTS.length] }}
                          >
                            {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (m.first_name || '?')[0].toUpperCase()}
                          </span>
                        );
                      })}
                    </span>
                  </span>
                </span>
              </button>

              {/* La perforation, avec ses deux encoches de la couleur de la page. */}
              <span aria-hidden="true" className="relative h-full w-0 border-l-2 border-dashed border-charcoal/20 bg-[#151515]">
                <span className="absolute -left-[9px] -top-2 h-4 w-4 rounded-full bg-cream dark:bg-[#0c0c0c]" />
                <span className="absolute -bottom-2 -left-[9px] h-4 w-4 rounded-full bg-cream dark:bg-[#0c0c0c]" />
              </span>

              {/* Le talon : il dit où en est le groupe, et le fait. */}
              <button
                type="button"
                onClick={() => {
                  if (state === 'me' || state === 'ok') return open(space);
                  haptics.soft();
                  onOpenWaiting(space);
                }}
                aria-label={
                  state === 'wait' || state === 'waitReminded'
                    ? t('spaces.stubWaitingLabel', { name: space.name, count: String(missing.length) })
                    : state === 'stale'
                      ? t('spaces.stubStaleLabel', { name: space.name })
                      : state === 'me'
                        ? t('spaces.bubbleWaiting', { name: space.name, count: String(pending) })
                        : undefined
                }
                className={`flex h-full w-[70px] flex-col items-center justify-center gap-0.5 rounded-r-[16px] px-1 text-center transition-transform active:scale-[0.97] ${
                  state === 'me'
                    ? 'bg-bitter-lime text-charcoal'
                    : state === 'wait' || state === 'waitReminded'
                      ? 'bg-[#FFF1E2] dark:bg-[#2A2116]'
                      : state === 'stale'
                        ? 'bg-[#F3EFE6] dark:bg-[#232019]'
                        : 'bg-sand dark:bg-[#232323]'
                }`}
              >
                {state === 'me' ? (
                  <>
                    <span className="text-[30px] font-black leading-[0.9] tracking-[-0.07em]">{pending}</span>
                    <span className="mt-1.5 rounded-full bg-charcoal px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-bitter-lime">
                      {onlyVotes ? t('spaces.ticketVote') : t('spaces.ticketSee')}
                    </span>
                  </>
                ) : state === 'wait' || state === 'waitReminded' ? (
                  <>
                    <span className="mb-0.5 flex">
                      {missing.slice(0, 2).map((id, i) => {
                        const at = memberIndex.get(id) ?? i;
                        const m = members[at];
                        const src = avatarSrc(m?.avatar_url ?? null);
                        return (
                          <span
                            key={id}
                            className={`flex h-[22px] w-[22px] items-center justify-center overflow-hidden rounded-full border-2 border-[#FFF1E2] text-[9px] font-black text-white dark:border-[#2A2116] ${i ? '-ml-1.5' : ''}`}
                            style={{ background: MEMBER_TINTS[at % MEMBER_TINTS.length] }}
                          >
                            {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (m?.first_name || '?')[0].toUpperCase()}
                          </span>
                        );
                      })}
                    </span>
                    <span className="text-[9px] font-black leading-tight text-[#9A4F05] dark:text-[#F5B26B]">
                      {missing.length > 1
                        ? t('spaces.stubMissingMany', { count: String(missing.length) })
                        : t('spaces.stubMissingOne')}
                    </span>
                    {state === 'wait' ? (
                      <span className="mt-1 rounded-full bg-[#F08A24] px-2 py-1 text-[8px] font-black uppercase tracking-[0.1em] text-charcoal">
                        {t('spaces.stubRemind')}
                      </span>
                    ) : (
                      <span className="mt-0.5 text-[8.5px] font-bold text-[#B8732F]">{t('spaces.stubReminded')}</span>
                    )}
                  </>
                ) : state === 'stale' ? (
                  <>
                    <span className="text-[22px] font-black leading-none text-[#9A4F05] dark:text-[#F5B26B]">?</span>
                    <span className="text-[9px] font-extrabold leading-tight text-stone-600 dark:text-stone-300">{t('spaces.stubStale')}</span>
                  </>
                ) : (
                  <>
                    <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full bg-forest text-bitter-lime">
                      <Check size={16} strokeWidth={3} />
                    </span>
                    <span className="mt-1 text-[9px] font-extrabold leading-tight text-stone-600 dark:text-stone-300">
                      {t('spaces.ticketUpToDate')}
                    </span>
                  </>
                )}
              </button>
            </div>
          );
        })}

        <button
          type="button"
          onClick={() => {
            haptics.soft();
            onCreate();
          }}
          aria-label={t('spaces.create')}
          className="flex h-[112px] w-24 shrink-0 snap-start flex-col items-center justify-center gap-1.5 rounded-[16px] border-2 border-dashed border-stone-300 text-stone-500 transition-transform active:scale-95 dark:border-white/15 dark:text-stone-400"
        >
          <Plus size={18} strokeWidth={2.6} />
          <span className="px-2 text-center text-[11px] font-extrabold leading-tight">{t('spaces.ticketNew')}</span>
        </button>
      </div>

      {pages > 1 && (
        <div aria-hidden="true" className="-mt-2 flex justify-center gap-1.5">
          {Array.from({ length: pages }, (_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === page ? 'w-[18px] bg-charcoal dark:bg-white' : 'w-1.5 bg-stone-300 dark:bg-white/20'}`}
            />
          ))}
        </div>
      )}
      </>
      )}
    </section>
  );
};

export default SpaceTickets;
