import React, { useState } from 'react';
import { CalendarClock, Check, ExternalLink, Loader2, X } from 'lucide-react';
import PlanComposer from './PlanComposer';
import { SlotDraft, WatchPlan, acceptSlot, cancelPlan, chosenSlotOf, proposePlan } from '../services/plans';
import { formatSlot } from '../supabase/functions/notify/messages.ts';
import { FavoriteCinema } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { trackEvent } from '../utils/analytics';

interface Props {
  plan: WatchPlan | null;
  sharedMovieId: string;
  title: string;
  currentUserId: string;
  /** Prénoms des membres de l'espace, par identifiant. */
  names: Record<string, string>;
  favoriteCinema?: FavoriteCinema;
  onChanged: () => void;
  onToast?: (message: string) => void;
}

/**
 * « On y va quand ? » : la séance d'un film de l'espace, à chaque étape.
 *
 * - rien de proposé : on propose un à trois créneaux ;
 * - proposé par l'autre : on choisit, ou on propose autre chose ;
 * - proposé par soi : on attend, on peut changer ou annuler ;
 * - calé : l'heure, qui vient, et le lien pour réserver sa place.
 */
const PlanPanel: React.FC<Props> = ({
  plan,
  sharedMovieId,
  title,
  currentUserId,
  names,
  favoriteCinema,
  onChanged,
  onToast,
}) => {
  const { t } = useLanguage();
  const [composing, setComposing] = useState(false);
  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = async (key: string, action: () => Promise<{ ok: boolean; error?: string }>, success: string) => {
    setBusy(key);
    setError(null);
    const result = await action();
    setBusy(null);
    if (!result.ok) {
      setError(result.error ?? t('social.failed'));
      haptics.error();
      return false;
    }
    haptics.success();
    onToast?.(success);
    onChanged();
    return true;
  };

  const submit = async () => {
    if (!slots.length) return;
    const ok = await run('propose', () => proposePlan(sharedMovieId, slots), t('plan.proposed'));
    if (ok) {
      trackEvent('social', 'plan_proposed', 'space', slots.length);
      setComposing(false);
      setSlots([]);
    }
  };

  const nameOf = (id: string) => names[id] || t('shared.member');
  const chosen = chosenSlotOf(plan);
  const isPast = !!chosen && new Date(chosen.starts_at).getTime() < Date.now();
  const iAmIn = !!plan && plan.participant_ids.includes(currentUserId);
  const iProposed = plan?.proposer_id === currentUserId;

  const composer = (
    <div className="space-y-3">
      <PlanComposer titles={[title]} favoriteCinema={favoriteCinema} value={slots} onChange={setSlots} />
      <div className="flex gap-2">
        <button
          onClick={submit}
          disabled={!slots.length || busy === 'propose'}
          className="flex-1 py-3 rounded-xl bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-1.5"
        >
          {busy === 'propose' && <Loader2 size={12} className="animate-spin" />}
          {t('plan.propose')}
        </button>
        <button
          onClick={() => {
            setComposing(false);
            setSlots([]);
          }}
          className="px-4 py-3 rounded-xl bg-stone-100 dark:bg-white/5 text-stone-500 text-[11px] font-black uppercase tracking-widest"
        >
          {t('common.cancel')}
        </button>
      </div>
    </div>
  );

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      className="rounded-2xl border border-forest/20 dark:border-lime-400/20 bg-forest/5 dark:bg-lime-400/5 p-4 space-y-3"
    >
      <p className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-forest dark:text-lime-400">
        <CalendarClock size={14} /> {t('plan.title')}
      </p>

      {plan?.status === 'agreed' && chosen ? (
        <div className="space-y-3">
          <p className="text-sm font-black text-charcoal dark:text-white">
            {isPast ? t('plan.seen', { when: formatSlot(chosen) }) : t('plan.agreed', { when: formatSlot(chosen) })}
          </p>
          <p className="text-xs text-stone-500 dark:text-stone-400">
            {t('plan.going', { names: plan.participant_ids.map(nameOf).join(', ') })}
          </p>
          {!isPast && (
            <div className="flex flex-wrap gap-2">
              {iAmIn && chosen.booking_url && (
                <a
                  href={chosen.booking_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => trackEvent('social', 'plan_booking_opened', 'space')}
                  className="flex-1 min-w-[10rem] py-3 rounded-xl bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
                >
                  <ExternalLink size={12} /> {t('plan.book')}
                </a>
              )}
              {!iAmIn && (
                <button
                  onClick={() => run('join', () => acceptSlot(chosen.id), t('plan.joined'))}
                  disabled={busy === 'join'}
                  className="flex-1 py-3 rounded-xl bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5 disabled:opacity-40"
                >
                  {busy === 'join' ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />} {t('plan.join')}
                </button>
              )}
              {iAmIn && (
                <button
                  onClick={() => run('cancel', () => cancelPlan(plan.id), t('plan.cancelled'))}
                  disabled={busy === 'cancel'}
                  className="px-4 py-3 rounded-xl bg-white dark:bg-white/5 border border-stone-200 dark:border-white/10 text-stone-500 text-[11px] font-black uppercase tracking-widest flex items-center gap-1.5 disabled:opacity-40"
                >
                  {busy === 'cancel' ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />} {t('plan.cancel')}
                </button>
              )}
            </div>
          )}
          {isPast && !composing && (
            <button
              onClick={() => setComposing(true)}
              className="text-xs font-bold text-stone-500 dark:text-stone-400 hover:text-charcoal dark:hover:text-white"
            >
              {t('plan.again')}
            </button>
          )}
          {isPast && composing && composer}
        </div>
      ) : plan?.status === 'open' && !composing ? (
        <div className="space-y-3">
          <p className="text-sm font-bold text-charcoal dark:text-white">
            {iProposed ? t('plan.youProposed') : t('plan.theyProposed', { name: nameOf(plan.proposer_id) })}
          </p>
          <ul className="space-y-1.5">
            {plan.slots
              .filter((slot) => new Date(slot.starts_at).getTime() > Date.now())
              .map((slot) => (
                <li
                  key={slot.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/5 px-3 py-2"
                >
                  <span className="text-xs font-bold text-charcoal dark:text-white truncate">
                    {formatSlot(slot)}
                    {slot.version ? ` · ${slot.version}` : ''}
                  </span>
                  {!iProposed && (
                    <button
                      onClick={() => run(slot.id, () => acceptSlot(slot.id), t('plan.accepted'))}
                      disabled={!!busy}
                      className="shrink-0 px-3 py-1.5 rounded-lg bg-charcoal dark:bg-white text-white dark:text-charcoal text-[10px] font-black uppercase tracking-wider disabled:opacity-40 flex items-center gap-1"
                    >
                      {busy === slot.id ? <Loader2 size={11} className="animate-spin" /> : <Check size={11} />}
                      {t('plan.works')}
                    </button>
                  )}
                </li>
              ))}
          </ul>
          <div className="flex gap-3 text-xs font-bold">
            <button onClick={() => setComposing(true)} className="text-stone-500 dark:text-stone-400 hover:text-charcoal dark:hover:text-white">
              {iProposed ? t('plan.change') : t('plan.counter')}
            </button>
            {iProposed && (
              <button
                onClick={() => run('cancel', () => cancelPlan(plan.id), t('plan.withdrawn'))}
                className="text-stone-400 hover:text-red-500"
              >
                {t('plan.withdraw')}
              </button>
            )}
          </div>
        </div>
      ) : composing ? (
        composer
      ) : (
        <button
          onClick={() => setComposing(true)}
          className="w-full py-3 rounded-xl bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black uppercase tracking-widest flex items-center justify-center gap-1.5"
        >
          <CalendarClock size={13} /> {t('plan.when')}
        </button>
      )}

      {error && <p className="text-xs font-bold text-red-500">{error}</p>}
    </div>
  );
};

export default PlanPanel;
