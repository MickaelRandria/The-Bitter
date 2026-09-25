import React, { useEffect, useState } from 'react';
import { X, Check, Loader2, Send, Share2, Bell, Users, CalendarClock, ChevronDown } from 'lucide-react';
import PlanComposer from './PlanComposer';
import { SlotDraft } from '../services/plans';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { avatarSrc } from '../utils/avatar';
import { trackEvent } from '../utils/analytics';
import {
  Companion,
  ShareKind,
  asShareable,
  createShareLink,
  getCompanions,
  proposeToPeople,
  shareLink,
} from '../services/social';
import {
  enablePushNotifications,
  hasPushSubscription,
  isLikelyInstalledPwa,
  isPushSupported,
} from '../services/pushNotifications';
import { FavoriteCinema, Movie, MovieFormData } from '../types';

interface Props {
  kind: ShareKind;
  movie: Movie | MovieFormData;
  onClose: () => void;
  /** Message de confirmation, affiché par l'app une fois la feuille refermée. */
  onDone?: (message: string) => void;
  /** Pour proposer les vraies séances du film en même temps que l'invitation. */
  favoriteCinema?: FavoriteCinema;
  /** Personnes déjà cochées : celles qui attendent aussi le film. */
  preselect?: string[];
  /** Ouvre d'emblée la proposition de date : l'envie est déjà partagée, reste le quand. */
  openDates?: boolean;
}

/**
 * « Tu veux le voir avec quelqu'un ? » / « Demander son avis à quelqu'un ».
 *
 * On choisit des PERSONNES, pas un espace : personne ne pense « espace », tout le
 * monde pense « Léa ». Le serveur range le film dans le plus petit espace qui
 * vous réunit, ou en crée un à deux.
 *
 * « Quelqu'un d'autre » fabrique un lien pour qui n'a pas l'app : il part par le
 * partage du téléphone, dans la conversation de la personne qui invite.
 */
const WatchWithSheet: React.FC<Props> = ({ kind, movie, onClose, onDone, favoriteCinema, preselect, openDates }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose);
  const [companions, setCompanions] = useState<Companion[] | null>(null);
  const [selected, setSelected] = useState<string[]>(preselect ?? []);
  const [sending, setSending] = useState(false);
  const [linking, setLinking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Après l'envoi : on propose d'être prévenu de la réponse. */
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [pushState, setPushState] = useState<'idle' | 'busy' | 'on' | 'error'>('idle');
  const [pushError, setPushError] = useState<string | null>(null);
  /** Séance jointe à l'invitation, facultative : « on se fait Dune samedi 20 h 30 ? » */
  const [slots, setSlots] = useState<SlotDraft[]>([]);
  const [datesOpen, setDatesOpen] = useState(!!openDates);

  useEffect(() => {
    let alive = true;
    getCompanions().then((result) => {
      if (!alive) return;
      if (result.error) setError(result.error);
      setCompanions(result.data ?? []);
    });
    return () => {
      alive = false;
    };
  }, []);

  const toggle = (id: string) => {
    haptics.soft();
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const names = (ids: string[]) => {
    const list = (companions ?? []).filter((c) => ids.includes(c.profile_id)).map((c) => c.first_name);
    if (list.length <= 1) return list[0] ?? '';
    return `${list.slice(0, -1).join(', ')} ${t('social.and')} ${list[list.length - 1]}`;
  };

  const send = async () => {
    if (!selected.length || sending) return;
    setSending(true);
    setError(null);
    const result = await proposeToPeople(kind, asShareable(movie), selected, slots);
    setSending(false);
    if (result.error || !result.data) {
      setError(result.error ?? t('social.failed'));
      haptics.error();
      return;
    }
    haptics.success();
    trackEvent('social', 'watch_invite_sent', `${kind}:app`, selected.length);
    const who = names(selected);
    // Déjà abonné, ou refusé sur cet appareil : pas d'étape de plus, on referme.
    const canAskPush =
      isPushSupported() &&
      typeof Notification !== 'undefined' &&
      Notification.permission !== 'denied' &&
      !(await hasPushSubscription());
    if (!canAskPush) {
      onDone?.(kind === 'verdict' ? t('social.askedTo', { name: who }) : t('social.proposedTo', { name: who }));
      onClose();
      return;
    }
    setSentTo(who);
  };

  const sendLink = async () => {
    if (linking) return;
    setLinking(true);
    setError(null);
    const result = await createShareLink(kind, asShareable(movie), slots);
    if (result.error || !result.data) {
      setLinking(false);
      setError(result.error ?? t('social.failed'));
      return;
    }
    const outcome = await shareLink(kind, movie.title, result.data.url, slots);
    setLinking(false);
    if (outcome === 'failed') {
      setError(t('social.linkCopyFailed', { url: result.data.url }));
      return;
    }
    if (outcome === 'cancelled') return;
    trackEvent('social', 'watch_invite_sent', `${kind}:link`);
    haptics.success();
    onDone?.(outcome === 'copied' ? t('social.linkCopied') : t('social.linkSent'));
    onClose();
  };

  const enablePush = async () => {
    setPushState('busy');
    setPushError(null);
    const result = await enablePushNotifications();
    if (result.ok) {
      setPushState('on');
      trackEvent('social', 'push_enabled', 'watch_with');
      haptics.success();
      return;
    }
    setPushState('error');
    setPushError('message' in result ? result.message : t('social.failed'));
  };

  const finish = () => {
    if (sentTo) {
      onDone?.(kind === 'verdict' ? t('social.askedTo', { name: sentTo }) : t('social.proposedTo', { name: sentTo }));
    }
    onClose();
  };

  const title = kind === 'verdict' ? t('social.verdictTitle') : t('social.watchTitle');
  const subtitle = kind === 'verdict' ? t('social.verdictSubtitle') : t('social.watchSubtitle');

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      onClick={finish}
    >
      <div
        className="relative w-full sm:max-w-md bg-white dark:bg-[#1a1a1a] rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-sand dark:border-white/10 shadow-2xl p-7 pb-[calc(1.75rem+env(safe-area-inset-bottom))] space-y-5 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {movie.posterUrl && (
              <img src={movie.posterUrl} alt="" className="w-11 h-16 rounded-xl object-cover shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="text-lg font-black tracking-tight text-charcoal dark:text-white leading-tight">
                {sentTo ? t('social.sentTitle') : title}
              </h3>
              <p className="text-xs text-stone-500 dark:text-stone-400 mt-1 truncate">{movie.title}</p>
            </div>
          </div>
          <button
            onClick={finish}
            aria-label={t('common.close')}
            className="p-2.5 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 hover:text-charcoal dark:hover:text-white shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        {sentTo ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3 rounded-2xl bg-forest/5 dark:bg-lime-500/10 border border-forest/15 dark:border-lime-500/20 p-4">
              <Check size={18} className="text-forest dark:text-lime-400 shrink-0 mt-0.5" />
              <p className="text-sm text-charcoal dark:text-white leading-relaxed">
                {kind === 'verdict' ? t('social.askedTo', { name: sentTo }) : t('social.proposedTo', { name: sentTo })}
              </p>
            </div>
            {pushState === 'on' ? (
              <p className="text-sm text-stone-500 dark:text-stone-400 text-center">{t('social.pushOn')}</p>
            ) : (
              <div className="rounded-2xl border border-stone-200 dark:border-white/10 p-4 space-y-3">
                <p className="text-sm font-bold text-charcoal dark:text-white">
                  {t('social.pushAsk', { name: sentTo })}
                </p>
                {!isLikelyInstalledPwa() && /iphone|ipad/i.test(navigator.userAgent) ? (
                  <p className="text-xs text-stone-500 dark:text-stone-400 leading-relaxed">{t('social.pushIosInstall')}</p>
                ) : (
                  <button
                    onClick={enablePush}
                    disabled={pushState === 'busy'}
                    className="w-full py-3.5 rounded-2xl bg-charcoal dark:bg-white text-white dark:text-charcoal font-black text-[11px] uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
                  >
                    {pushState === 'busy' ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
                    {t('social.pushEnable')}
                  </button>
                )}
                {pushError && <p className="text-xs text-red-500">{pushError}</p>}
              </div>
            )}
            <button
              onClick={finish}
              className="w-full py-3.5 rounded-2xl bg-stone-100 dark:bg-white/5 text-charcoal dark:text-white font-black text-[11px] uppercase tracking-widest"
            >
              {t('common.close')}
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-stone-500 dark:text-stone-400 -mt-2">{subtitle}</p>

            {companions === null ? (
              <div className="flex justify-center py-6">
                <Loader2 size={20} className="animate-spin text-stone-400" />
              </div>
            ) : (
              <div className="grid grid-cols-4 gap-3">
                {companions.map((c) => {
                  const on = selected.includes(c.profile_id);
                  const src = avatarSrc(c.avatar_url);
                  return (
                    <button
                      key={c.profile_id}
                      onClick={() => toggle(c.profile_id)}
                      aria-pressed={on}
                      className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform"
                    >
                      <span
                        className={`relative w-14 h-14 rounded-full overflow-hidden flex items-center justify-center text-lg font-black border-2 transition-colors ${
                          on
                            ? 'border-forest dark:border-lime-400'
                            : 'border-transparent bg-stone-100 dark:bg-white/5 text-charcoal dark:text-white'
                        }`}
                      >
                        {src ? (
                          <img src={src} alt="" className="w-full h-full object-cover" />
                        ) : (
                          (c.first_name || '?').charAt(0).toUpperCase()
                        )}
                        {on && (
                          <span
                            className={`absolute inset-0 flex items-center justify-center ${
                              src ? 'bg-forest/70 dark:bg-lime-400/70' : 'bg-forest dark:bg-lime-400'
                            }`}
                          >
                            <Check size={20} className="text-white dark:text-charcoal" strokeWidth={3} />
                          </span>
                        )}
                      </span>
                      <span className="text-[11px] font-bold text-charcoal dark:text-white truncate max-w-full">
                        {c.first_name}
                      </span>
                    </button>
                  );
                })}

                <button
                  onClick={sendLink}
                  disabled={linking}
                  className="flex flex-col items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-50"
                >
                  <span className="w-14 h-14 rounded-full border-2 border-dashed border-stone-300 dark:border-white/20 flex items-center justify-center text-stone-500 dark:text-stone-400">
                    {linking ? <Loader2 size={18} className="animate-spin" /> : <Share2 size={18} />}
                  </span>
                  <span className="text-[11px] font-bold text-stone-500 dark:text-stone-400 leading-tight text-center">
                    {t('social.someoneElse')}
                  </span>
                </button>
              </div>
            )}

            {companions !== null && companions.length === 0 && (
              <p className="text-xs text-stone-500 dark:text-stone-400 flex items-start gap-2 leading-relaxed">
                <Users size={14} className="shrink-0 mt-0.5" />
                {t('social.noCompanions')}
              </p>
            )}

            {/* La date se propose avec l'invitation, facultativement. Pour quelqu'un
                sans l'app, c'est même la seule occasion : le lien ne le préviendra
                pas d'une proposition faite plus tard. */}
            {kind === 'watch' && (
              <div className="rounded-2xl border border-stone-200 dark:border-white/10">
                <button
                  onClick={() => setDatesOpen((open) => !open)}
                  aria-expanded={datesOpen}
                  className="w-full flex items-center justify-between gap-2 px-4 py-3 text-left"
                >
                  <span className="flex items-center gap-2 text-sm font-bold text-charcoal dark:text-white">
                    <CalendarClock size={15} />
                    {slots.length ? t('plan.slotsChosen', { count: String(slots.length) }) : t('plan.addDates')}
                  </span>
                  <ChevronDown size={15} className={`text-stone-400 transition-transform ${datesOpen ? 'rotate-180' : ''}`} />
                </button>
                {datesOpen && (
                  <div className="px-4 pb-4">
                    <PlanComposer
                      titles={[movie.title]}
                      favoriteCinema={movie.mediaType === 'tv' ? undefined : favoriteCinema}
                      value={slots}
                      onChange={setSlots}
                    />
                  </div>
                )}
              </div>
            )}

            <button
              onClick={send}
              disabled={!selected.length || sending}
              className="w-full py-4 rounded-2xl bg-charcoal dark:bg-white text-white dark:text-charcoal font-black text-[11px] uppercase tracking-widest disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {sending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
              {selected.length
                ? kind === 'verdict'
                  ? t('social.askCta', { name: names(selected) })
                  : t('social.proposeCta', { name: names(selected) })
                : t('social.pickSomeone')}
            </button>
          </>
        )}

        {error && <p className="text-xs font-bold text-red-500 text-center break-words">{error}</p>}
      </div>
    </div>
  );
};

export default WatchWithSheet;
