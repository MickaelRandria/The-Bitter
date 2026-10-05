import React, { useRef, useState } from 'react';
import { Check, Film, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { TodoItem } from '../services/spaceTodo';
import { formatRating, formatSlot } from '../supabase/functions/notify/messages.ts';
import { getDisplayWeightedRating } from '../utils/rating';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { haptics } from '../utils/haptics';

/** Une action de carte : rend vrai quand elle a abouti, et la carte s'en va. */
type Act = () => Promise<boolean>;
/** Un côté de la carte : une réponse (`act`), ou l'ouverture de la grille (`open`). */
type Side = { label: string; act?: Act; open?: () => void };

interface Props {
  items: TodoItem[];
  currentUserId: string;
  memberNames: Record<string, string>;
  votes: { movie_id: string; profile_id: string; interested: boolean }[];
  ratings: { movie_id: string; profile_id: string }[];
  onWatch: (item: TodoItem, interested: boolean) => Promise<boolean>;
  onPublish: (item: TodoItem) => Promise<boolean>;
  onRate: (item: TodoItem) => void;
  onAcceptSlot: (item: TodoItem, slotId: string) => Promise<boolean>;
  onSkip: (item: TodoItem) => void;
}

/** Au-delà de cette distance, lâcher la carte vaut réponse. */
const SWIPE_THRESHOLD = 110;

/** « Léa », « Léa et Tom », « Léa, Tom et Sam ». */
const joinNames = (names: string[], and: string) =>
  names.length <= 1 ? names[0] ?? '' : `${names.slice(0, -1).join(', ')} ${and} ${names[names.length - 1]}`;

/**
 * « À toi de jouer » : les demandes du groupe, une carte à la fois.
 *
 * Chaque carte se règle d'un appui, ou d'un glissé : à droite la réponse
 * principale (partant, publier, confirmer), à gauche l'autre. Le geste est
 * celui du Deck, déjà connu dans l'app. Une séance à plusieurs créneaux ne se
 * glisse pas à droite : il faut choisir lequel.
 */
const SpaceTodoStack: React.FC<Props> = ({
  items,
  currentUserId,
  memberNames,
  votes,
  ratings,
  onWatch,
  onPublish,
  onRate,
  onAcceptSlot,
  onSkip,
}) => {
  const { t } = useLanguage();
  /** Cartes réglées pendant la visite : elles partent tout de suite, sans attendre la relecture. */
  const [answered, setAnswered] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(0);
  const [leaving, setLeaving] = useState<0 | 1 | -1>(0);
  const start = useRef<{ x: number; y: number; id: number } | null>(null);
  /** Toutes les demandes vues pendant la visite : la relecture retire celles déjà réglées. */
  const seen = useRef<Set<string>>(new Set());
  items.forEach((i) => seen.current.add(i.key));

  const queue = items.filter((i) => !answered.has(i.key));
  if (!items.length && !answered.size) return null;

  const item = queue[0];
  const total = seen.current.size;
  const position = total - queue.length + 1;

  const settle = async (act: Act, direction: 1 | -1) => {
    if (busy || !item) return;
    setBusy(true);
    setLeaving(direction);
    const ok = await act();
    if (ok) {
      haptics.success();
      setAnswered((prev) => new Set(prev).add(item.key));
    } else {
      haptics.error();
    }
    setLeaving(0);
    setDrag(0);
    setBusy(false);
  };

  /** Ouvrir la grille n'est pas répondre : la carte reste, elle partira quand la note sera là. */
  const run = (side: Side | null | undefined, direction: 1 | -1) => {
    if (!side) return;
    if (side.open) {
      setDrag(0);
      side.open();
      return;
    }
    if (side.act) void settle(side.act, direction);
  };

  /** Les deux réponses de la carte, et ce que fait chaque côté du glissé. */
  const actions = ((): { left: Side; right: Side | null } | null => {
    if (!item) return null;
    const skip: Act = async () => {
      onSkip(item);
      return true;
    };
    if (item.kind === 'watch') {
      return {
        left: { label: t('todo.notKeen'), act: () => onWatch(item, false) },
        right: { label: t('todo.keen'), act: () => onWatch(item, true) },
      };
    }
    if (item.kind === 'rate') {
      if (item.mine) {
        return {
          left: { label: t('todo.rate'), open: () => onRate(item) },
          right: {
            label: t('todo.publish', { rating: formatRating(getDisplayWeightedRating(item.mine)) ?? '' }),
            act: () => onPublish(item),
          },
        };
      }
      return {
        left: { label: t('todo.notSeen'), act: skip },
        right: { label: t('todo.rate'), open: () => onRate(item) },
      };
    }
    const slots = item.plan?.slots ?? [];
    return {
      left: { label: t('todo.notAvailable'), act: skip },
      right: slots.length === 1 ? { label: t('todo.confirm'), act: () => onAcceptSlot(item, slots[0].id) } : null,
    };
  })();

  const text = (() => {
    if (!item) return null;
    const movie = item.movie;
    const others = (ids: string[]) =>
      joinNames(
        ids.filter((id) => id !== currentUserId).map((id) => memberNames[id]).filter(Boolean),
        t('spaceSync.and')
      );
    const metaParts = [movie.director, movie.year, movie.runtime ? `${movie.runtime} min` : null].filter(Boolean);
    if (item.kind === 'watch') {
      const keen = votes.filter((v) => v.movie_id === movie.id && v.interested).map((v) => v.profile_id);
      const names = others(keen);
      return {
        kicker: t('todo.proposedBy', { name: memberNames[movie.added_by ?? ''] || t('shared.member') }),
        meta: metaParts.join(' · '),
        hint: names ? t(keen.length > 1 ? 'todo.keenMany' : 'todo.keenOne', { names }) : t('todo.noAnswerYet'),
      };
    }
    if (item.kind === 'rate') {
      const count = ratings.filter((r) => r.movie_id === movie.id && r.profile_id !== currentUserId).length;
      return {
        kicker: item.mine ? t('todo.ratedAlone') : t('todo.seenTogether'),
        meta: metaParts.join(' · '),
        hint: count ? t('todo.ratingsWaiting', { count: String(count) }) : t('todo.firstVerdict'),
      };
    }
    const plan = item.plan!;
    const slots = plan.slots;
    const cinema = slots[0]?.cinema_name;
    return {
      kicker: t('todo.planBy', { name: memberNames[plan.proposer_id] || t('shared.member') }),
      meta: slots.length === 1 ? formatSlot(slots[0]) : t('todo.slots', { count: String(slots.length) }),
      hint: slots.length === 1 ? cinema || '' : t('todo.pickSlot'),
    };
  })();

  const onPointerDown = (e: React.PointerEvent) => {
    if (busy) return;
    start.current = { x: e.clientX, y: e.clientY, id: e.pointerId };
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!start.current || start.current.id !== e.pointerId) return;
    const dx = e.clientX - start.current.x;
    const dy = e.clientY - start.current.y;
    // Un défilement vertical reste un défilement : la carte ne suit que l'horizontal.
    if (Math.abs(dy) > Math.abs(dx) && Math.abs(drag) < 8) return;
    if (Math.abs(dx) > 8) (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    setDrag(dx);
  };
  const onPointerUp = () => {
    if (!start.current) return;
    start.current = null;
    if (drag > SWIPE_THRESHOLD && actions?.right) run(actions.right, 1);
    else if (drag < -SWIPE_THRESHOLD && actions) run(actions.left, -1);
    else setDrag(0);
  };

  const offset = leaving ? leaving * 420 : drag;
  const stamp = Math.min(1, Math.abs(drag) / SWIPE_THRESHOLD);

  return (
    <section aria-label={t('todo.title')} className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h2 className="text-lg font-black tracking-tight text-charcoal dark:text-white">{t('todo.title')}</h2>
        <span className="text-[11px] font-black text-stone-500 dark:text-stone-400">
          {item ? `${position} / ${total}` : t('todo.upToDateShort')}
        </span>
      </div>

      {item && text && actions ? (
        <>
          <div className="relative pb-[18px]">
            {queue.length > 2 && (
              <div className="absolute left-[22px] right-[22px] bottom-0 h-16 rounded-[1.75rem] bg-stone-200 dark:bg-[#1c1c1c]" />
            )}
            {queue.length > 1 && (
              <div className="absolute left-[11px] right-[11px] bottom-[9px] h-16 rounded-[1.75rem] bg-sand dark:bg-[#232323] border border-stone-200 dark:border-white/5" />
            )}
            <div
              key={item.key}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerCancel={onPointerUp}
              className="relative bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 rounded-[1.75rem] p-[18px] shadow-[0_12px_30px_-12px_rgba(26,26,26,0.25)] touch-pan-y select-none animate-[fadeIn_0.25s_ease-out]"
              style={{
                transform: `translateX(${offset}px) rotate(${offset / 22}deg)`,
                transition: start.current ? 'none' : 'transform 0.28s cubic-bezier(0.16,1,0.3,1)',
              }}
            >
              {drag !== 0 && (
                <span
                  aria-hidden
                  className={`absolute top-6 z-10 px-3 py-1.5 rounded-xl border-[3px] text-base font-black tracking-wider ${drag > 0 ? 'left-6 -rotate-12 border-bitter-lime text-forest dark:text-bitter-lime bg-white/90 dark:bg-black/60' : 'right-6 rotate-12 border-stone-400 text-stone-500 bg-white/90 dark:bg-black/60'}`}
                  style={{ opacity: drag > 0 && !actions.right ? 0 : stamp }}
                >
                  {drag > 0 ? actions.right?.label ?? '' : actions.left.label}
                </span>
              )}
              <div className="flex gap-4">
                <div className="w-[84px] h-[126px] shrink-0 rounded-2xl overflow-hidden bg-stone-200 dark:bg-[#161616]">
                  {item.movie.poster_url ? (
                    <img
                      src={resizeTmdbImage(item.movie.poster_url, 'w185')}
                      alt=""
                      draggable={false}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <div className="w-full h-full flex items-center justify-center text-stone-400">
                      <Film size={18} />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0 flex flex-col gap-1.5 pt-0.5">
                  <span className="text-[10px] font-black uppercase tracking-[0.16em] text-forest dark:text-lime-500">
                    {text.kicker}
                  </span>
                  <span className="text-[19px] font-black tracking-tight leading-[1.12] text-charcoal dark:text-white line-clamp-2">
                    {item.movie.title}
                  </span>
                  {text.meta && (
                    <span className="text-xs font-semibold text-stone-500 dark:text-stone-400 leading-snug">{text.meta}</span>
                  )}
                  {text.hint && (
                    <span className="mt-auto text-[11px] font-bold text-stone-500 dark:text-stone-500 leading-snug">
                      {text.hint}
                    </span>
                  )}
                </div>
              </div>

              {item.kind === 'plan' && !actions.right ? (
                <div className="mt-4 space-y-2">
                  {item.plan!.slots.map((slot) => (
                    <button
                      key={slot.id}
                      disabled={busy}
                      onClick={() => void settle(() => onAcceptSlot(item, slot.id), 1)}
                      className="w-full h-12 rounded-[1.1rem] bg-charcoal dark:bg-white text-bitter-lime dark:text-charcoal text-xs font-black active:scale-[0.98] transition-transform"
                    >
                      {formatSlot(slot)}
                    </button>
                  ))}
                  <button
                    disabled={busy}
                    onClick={() => run(actions.left, -1)}
                    className="w-full h-11 text-xs font-black text-stone-500 dark:text-stone-400"
                  >
                    {actions.left.label}
                  </button>
                </div>
              ) : (
                <div className="flex gap-2.5 mt-4">
                  <button
                    disabled={busy}
                    onClick={() => run(actions.left, -1)}
                    className="flex-1 h-12 rounded-[1.1rem] border-[1.5px] border-stone-300 dark:border-white/15 bg-white dark:bg-transparent text-charcoal dark:text-white text-xs font-black active:scale-95 transition-transform"
                  >
                    {actions.left.label}
                  </button>
                  {actions.right && (
                    <button
                      disabled={busy}
                      onClick={() => run(actions.right, 1)}
                      className="flex-[1.4] h-12 rounded-[1.1rem] bg-charcoal dark:bg-bitter-lime text-bitter-lime dark:text-charcoal text-xs font-black active:scale-95 transition-transform flex items-center justify-center"
                    >
                      {busy ? <Loader2 size={16} className="animate-spin" /> : actions.right.label}
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          <p className="text-center text-[11px] font-bold text-stone-500 dark:text-stone-500">{t('todo.swipeHint')}</p>
        </>
      ) : (
        <div className="bg-sand dark:bg-[#1a1a1a] rounded-[1.75rem] p-5 flex items-center gap-3.5 animate-[fadeIn_0.3s_ease-out]">
          <span className="w-11 h-11 rounded-full bg-bitter-lime flex items-center justify-center shrink-0">
            <Check size={20} strokeWidth={3} className="text-charcoal" />
          </span>
          <div>
            <p className="text-[15px] font-black text-charcoal dark:text-white">{t('todo.upToDate')}</p>
            <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">{t('todo.upToDateBody')}</p>
          </div>
        </div>
      )}
    </section>
  );
};

export default SpaceTodoStack;
