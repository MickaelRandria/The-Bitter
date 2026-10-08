import React, { useEffect, useMemo, useState } from 'react';
import { Bell, Check, Copy, MessageCircle, Send, X } from 'lucide-react';
import { SharedSpace, deleteSharedMovie } from '../services/supabase';
import { SpaceOverview, WaitingItem, keepProposal } from '../services/spaceTodo';
import { REMINDER_COOLDOWN_DAYS, membersWithPush, remindVote, voteLink } from '../services/voteReminders';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { resizeTmdbImage } from '../utils/tmdbImage';

interface Props {
  space: SharedSpace;
  overview: SpaceOverview;
  currentUserId: string;
  onClose: () => void;
  /** Après une relance, un retrait ou « garder » : l'accueil relit les billets. */
  onChanged: () => void;
  onToast?: (message: string) => void;
}

const DAY = 86_400_000;

/**
 * Le talon orange, déplié : ce que le groupe attend, film par film.
 *
 * Pour chaque proposition restée sans réponse : qui manque, et de quoi le
 * relancer. Avec les notifications, un geste suffit ; sans — le cas le plus
 * courant —, un message prêt à partir par WhatsApp ou SMS, avec un lien qui
 * ouvre directement la carte de vote. Le serveur limite à une relance tous les
 * 5 jours par film et par personne. Au-delà de 30 jours sans aucune réponse, la
 * question n'est plus « qui relancer » mais « toujours d'actualité ? ».
 */
const VoteWaitingSheet: React.FC<Props> = ({ space, overview, currentUserId, onClose, onChanged, onToast }) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, space.name);
  const [withPush, setWithPush] = useState<Set<string>>(new Set());
  const [done, setDone] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    membersWithPush().then(setWithPush);
  }, []);

  const names = useMemo(
    () => new Map(overview.members.map((m) => [m.profile_id, m.first_name || t('shared.member')])),
    [overview.members, t]
  );
  const staleIds = new Set(overview.stale.map((w) => w.movie.id));
  const items = [...overview.waiting].sort((a, b) => b.ageDays - a.ageDays);
  const total = new Set(items.flatMap((w) => w.missing)).size;
  const dateFmt = (d: Date) => d.toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' });
  const listNames = (ids: string[]) => {
    const n = ids.map((id) => names.get(id) ?? '?');
    return n.length <= 1 ? n[0] ?? '' : `${n.slice(0, -1).join(', ')} ${t('spaceSync.and')} ${n[n.length - 1]}`;
  };

  const remindedAt = (w: WaitingItem, id: string) => overview.reminded.get(`${w.movie.id}:${id}`);
  const canRemind = (w: WaitingItem, id: string) => {
    const at = remindedAt(w, id);
    return !at || Date.now() - at.getTime() >= REMINDER_COOLDOWN_DAYS * DAY;
  };

  const message = (w: WaitingItem) =>
    t('relance.message', { title: w.movie.title, space: space.name, link: voteLink(w.movie.id) });

  const record = async (w: WaitingItem, targets: string[], channel: 'push' | 'message') => {
    if (!targets.length) return;
    setBusy(`${w.movie.id}:${channel}`);
    const { results, error } = await remindVote(w.movie.id, targets, channel);
    setBusy(null);
    if (error) {
      haptics.error();
      onToast?.(t('relance.failed'));
      return;
    }
    const sent = results.filter((r) => r.status === 'sent').length;
    haptics.success();
    setDone((prev) => ({
      ...prev,
      [w.movie.id]: sent ? t('relance.doneUntil', { date: dateFmt(new Date(Date.now() + REMINDER_COOLDOWN_DAYS * DAY)) }) : t('relance.tooSoon'),
    }));
    onChanged();
  };

  const share = async (w: WaitingItem, targets: string[], how: 'whatsapp' | 'sms' | 'copy') => {
    const text = message(w);
    if (how === 'whatsapp') window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, '_blank', 'noopener');
    if (how === 'sms') window.location.href = `sms:?&body=${encodeURIComponent(text)}`;
    if (how === 'copy') {
      try {
        await navigator.clipboard.writeText(text);
        onToast?.(t('relance.copied'));
      } catch {
        onToast?.(text);
      }
    }
    await record(w, targets, 'message');
  };

  const keep = (w: WaitingItem) => {
    haptics.soft();
    keepProposal(currentUserId, w.movie.id);
    onChanged();
    onToast?.(t('relance.kept'));
  };

  const remove = async (w: WaitingItem) => {
    setBusy(`${w.movie.id}:remove`);
    const result = await deleteSharedMovie(w.movie.id);
    setBusy(null);
    if (!result.ok) {
      haptics.error();
      onToast?.(result.error ?? t('relance.failed'));
      return;
    }
    haptics.success();
    onToast?.(t('relance.removed', { title: w.movie.title }));
    onChanged();
  };

  const pill = 'inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-[10px] font-black uppercase tracking-wider transition-transform active:scale-95 disabled:opacity-40';

  return (
    <div {...dialog.props} className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      <div className="relative z-10 flex max-h-[88dvh] w-full flex-col overflow-hidden rounded-t-[2.5rem] bg-cream dark:bg-[#121212] shadow-2xl animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] sm:max-w-md sm:rounded-[2.5rem]">
        <div className="flex items-center justify-between gap-3 px-6 pb-2 pt-5">
          <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white">
            {total > 1
              ? t('relance.titleMany', { space: space.name, count: String(total) })
              : t('relance.titleOne', { space: space.name })}
          </h2>
          <button onClick={onClose} aria-label={t('common.close')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 text-stone-500 dark:bg-[#252525] dark:text-stone-400">
            <X size={17} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 space-y-2.5 overflow-y-auto px-6 pb-8 pt-2 no-scrollbar">
          {items.map((w) => {
            const stale = staleIds.has(w.movie.id);
            const pushTargets = w.missing.filter((id) => withPush.has(id) && canRemind(w, id));
            const msgTargets = w.missing.filter((id) => !withPush.has(id) && canRemind(w, id));
            const blocked = w.missing.filter((id) => !canRemind(w, id));
            const lastTimes = blocked.map((id) => (remindedAt(w, id) as Date).getTime());
            const nextAt = lastTimes.length ? new Date(Math.max(...lastTimes)) : null;
            return (
              <div
                key={w.movie.id}
                className={`grid grid-cols-[40px_minmax(0,1fr)] gap-3 rounded-2xl p-3 ${stale ? 'bg-[#FFF1E2] dark:bg-[#2A2116]' : 'bg-white dark:bg-[#1a1a1a]'}`}
              >
                <div
                  className="h-[60px] w-10 rounded-md bg-stone-200 bg-cover bg-center dark:bg-white/10"
                  style={{ backgroundImage: w.movie.poster_url ? `url(${resizeTmdbImage(w.movie.poster_url, 'w154')})` : undefined }}
                />
                <div className="min-w-0 space-y-1.5">
                  <p className="truncate text-[13.5px] font-black text-charcoal dark:text-white">{w.movie.title}</p>
                  {stale ? (
                    <>
                      <p className="text-[11.5px] font-extrabold leading-snug text-[#9A4F05] dark:text-[#F5B26B]">
                        {t('relance.staleQuestion', { days: String(w.ageDays) })}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button type="button" onClick={() => keep(w)} className={`${pill} bg-charcoal text-white dark:bg-white dark:text-charcoal`}>
                          {t('relance.keep')}
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(w)}
                          disabled={busy === `${w.movie.id}:remove`}
                          className={`${pill} text-charcoal shadow-[inset_0_0_0_1.5px_#D6D3CB] dark:text-white dark:shadow-[inset_0_0_0_1.5px_#3A3A38]`}
                        >
                          {t('relance.remove')}
                        </button>
                      </div>
                    </>
                  ) : (
                    <>
                      <p className="text-[11.5px] font-semibold leading-snug text-stone-500 dark:text-stone-400">
                        {t(w.missing.length > 1 ? 'relance.missingMany' : 'relance.missingOne', { names: listNames(w.missing) })} ·{' '}
                        {w.ageDays >= 1 ? t('votes.proposedAgo', { days: String(w.ageDays) }) : t('votes.proposedToday')}
                      </p>
                      {done[w.movie.id] ? (
                        <p className="flex items-center gap-1 text-[11.5px] font-extrabold text-forest dark:text-bitter-lime">
                          <Check size={13} strokeWidth={3} />
                          {done[w.movie.id]}
                        </p>
                      ) : (
                        <div className="flex flex-wrap gap-1.5">
                          {pushTargets.length > 0 && (
                            <button
                              type="button"
                              onClick={() => record(w, pushTargets, 'push')}
                              disabled={busy !== null}
                              className={`${pill} bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal`}
                            >
                              <Bell size={12} strokeWidth={2.5} />
                              {t('relance.notify', { names: listNames(pushTargets) })}
                            </button>
                          )}
                          {msgTargets.length > 0 && (
                            <>
                              <button type="button" onClick={() => share(w, msgTargets, 'whatsapp')} disabled={busy !== null} className={`${pill} bg-[#25D366] text-[#08280F]`}>
                                <Send size={12} strokeWidth={2.5} />
                                WhatsApp
                              </button>
                              <button type="button" onClick={() => share(w, msgTargets, 'sms')} disabled={busy !== null} className={`${pill} bg-charcoal text-white dark:bg-[#2a2a2a]`}>
                                <MessageCircle size={12} strokeWidth={2.5} />
                                SMS
                              </button>
                              <button type="button" onClick={() => share(w, msgTargets, 'copy')} disabled={busy !== null} className={`${pill} text-charcoal shadow-[inset_0_0_0_1.5px_#D6D3CB] dark:text-white dark:shadow-[inset_0_0_0_1.5px_#3A3A38]`}>
                                <Copy size={12} strokeWidth={2.5} />
                                {t('relance.copy')}
                              </button>
                            </>
                          )}
                          {!pushTargets.length && !msgTargets.length && nextAt && (
                            <p className="text-[11.5px] font-bold text-[#B8732F]">
                              {t('relance.remindedOn', {
                                date: dateFmt(nextAt),
                                next: dateFmt(new Date(nextAt.getTime() + REMINDER_COOLDOWN_DAYS * DAY)),
                              })}
                            </p>
                          )}
                        </div>
                      )}
                      {msgTargets.length > 0 && !done[w.movie.id] && (
                        <p className="text-[10.5px] font-semibold leading-snug text-stone-400 dark:text-stone-500">
                          {t(msgTargets.length > 1 ? 'relance.noPushMany' : 'relance.noPushOne', { names: listNames(msgTargets) })}
                        </p>
                      )}
                    </>
                  )}
                </div>
              </div>
            );
          })}
          <p className="pt-1 text-[11px] font-semibold leading-relaxed text-stone-400 dark:text-stone-500">{t('relance.foot')}</p>
        </div>
      </div>
    </div>
  );
};

export default VoteWaitingSheet;
