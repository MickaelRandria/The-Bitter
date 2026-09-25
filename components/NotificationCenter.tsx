import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bell, Loader2 } from 'lucide-react';
import { Movie } from '../types';
import {
  AppNotification,
  computeNotifications,
  markAsRead,
  markAllAsRead,
  getNotificationPrefs,
} from '../utils/notifications';
import {
  SocialNotification,
  answerWatchInvite,
  getNotifications,
  markNotificationsRead,
  subscribeToNotifications,
} from '../services/social';
import { socialMessage, formatSlot, listNames } from '../supabase/functions/notify/messages.ts';
import { acceptSlot } from '../services/plans';
import { enablePushNotifications, hasPushSubscription, isPushSupported } from '../services/pushNotifications';
import { avatarSrc } from '../utils/avatar';
import { haptics } from '../utils/haptics';
import { trackEvent } from '../utils/analytics';
import { useLanguage } from '../contexts/LanguageContext';

interface NotificationCenterProps {
  movies: Movie[];
  /** Compte connecté : sans lui, seules les notifications locales existent. */
  userId?: string | null;
  /** Incrémenté pour ouvrir le panneau de l'extérieur (lien d'une notification push). */
  openSignal?: number;
  /** Ouvre l'espace d'une notification ; `rate` ouvre la notation du film. */
  onOpenSpace?: (spaceId: string, sharedMovieId: string | null, rate: boolean) => void;
  onToast?: (message: string) => void;
  /** « Voir avec… » sur un film de la liste : envie commune, sortie, streaming. */
  onWatchWith?: (tmdbId: number, mediaType: 'movie' | 'tv', preselect?: string[]) => void;
}

const typeIcon: Record<AppNotification['type'], string> = {
  streak: '🔥',
  weekly: '📅',
  unrated: '🎬',
  monthly: '📊',
};

const ago = (iso: string): string => {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `il y a ${hours} h`;
  const days = Math.round(hours / 24);
  return days === 1 ? 'hier' : `il y a ${days} j`;
};

const NotificationCenter: React.FC<NotificationCenterProps> = ({ movies, userId, openSignal, onOpenSpace, onToast, onWatchWith }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [social, setSocial] = useState<SocialNotification[]>([]);
  const [answering, setAnswering] = useState<string | null>(null);
  const [pushNeeded, setPushNeeded] = useState(false);
  const [pushBusy, setPushBusy] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setNotifications(computeNotifications(movies, getNotificationPrefs()));
  }, [movies]);

  const loadSocial = useCallback(async () => {
    if (!userId) {
      setSocial([]);
      return;
    }
    const result = await getNotifications();
    if (result.data) setSocial(result.data);
  }, [userId]);

  useEffect(() => {
    loadSocial();
    if (!userId) return;
    return subscribeToNotifications(userId, loadSocial);
  }, [userId, loadSocial]);

  useEffect(() => {
    if (!openSignal) return;
    setOpen(true);
    loadSocial();
  }, [openSignal, loadSocial]);

  useEffect(() => {
    if (!open || !userId) return;
    let alive = true;
    // Un compte, un appareil pas encore abonné : c'est ici que la question a du sens.
    hasPushSubscription().then((subscribed) => {
      if (alive) setPushNeeded(isPushSupported() && Notification.permission !== 'denied' && !subscribed);
    });
    return () => {
      alive = false;
    };
  }, [open, userId]);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const socialUnread = social.filter((n) => !n.read_at).length;
  const unreadCount = notifications.filter((n) => !n.read).length + socialUnread;

  const handleMarkOne = (id: string) => {
    markAsRead(id);
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
  };

  const handleMarkAll = () => {
    markAllAsRead(notifications.map((n) => n.id));
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    if (socialUnread > 0) {
      const now = new Date().toISOString();
      setSocial((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
      markNotificationsRead();
    }
  };

  const markSocialRead = (n: SocialNotification) => {
    if (n.read_at) return;
    const now = new Date().toISOString();
    setSocial((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: now } : x)));
    markNotificationsRead([n.id]);
  };

  const answer = async (n: SocialNotification, interested: boolean) => {
    if (!userId || !n.shared_movie_id || answering) return;
    setAnswering(n.id);
    const result = await answerWatchInvite(n.shared_movie_id, userId, interested);
    setAnswering(null);
    if (result.error) {
      onToast?.(result.error);
      haptics.error();
      return;
    }
    haptics.success();
    trackEvent('social', 'watch_invite_answered', interested ? 'yes' : 'no');
    markSocialRead(n);
    onToast?.(interested ? t('social.answeredYes', { name: n.actor?.first_name ?? '' }) : t('social.answeredNo'));
  };

  /** Un créneau choisi depuis la cloche : oui au film et séance calée, d'un geste. */
  const pickSlot = async (n: SocialNotification, slotId: string) => {
    if (answering) return;
    setAnswering(n.id);
    const result = await acceptSlot(slotId);
    setAnswering(null);
    if (!result.ok) {
      onToast?.(result.error ?? t('social.failed'));
      haptics.error();
      return;
    }
    haptics.success();
    trackEvent('social', 'plan_accepted', 'bell');
    markSocialRead(n);
    onToast?.(t('plan.acceptedWith', { name: n.actor?.first_name ?? '' }));
  };

  const openNotification = (n: SocialNotification, rate = false) => {
    markSocialRead(n);
    if (n.space_id && onOpenSpace) {
      setOpen(false);
      onOpenSpace(n.space_id, n.shared_movie_id, rate);
    }
  };

  const requestBrowserPermission = async () => {
    if ('Notification' in window && Notification.permission === 'default') {
      await Notification.requestPermission();
    }
  };

  const enablePush = async () => {
    setPushBusy(true);
    const result = await enablePushNotifications();
    setPushBusy(false);
    if (result.ok) {
      setPushNeeded(false);
      trackEvent('social', 'push_enabled', 'bell');
      onToast?.(t('social.pushOn'));
    } else {
      onToast?.('message' in result ? result.message : t('social.failed'));
    }
  };

  const isEmpty = notifications.length === 0 && social.length === 0;

  return (
    <div className="relative" ref={panelRef}>
      <button
        onClick={() => {
          setOpen((v) => !v);
          if (!open) loadSocial();
        }}
        className="relative p-2 rounded-full text-stone-500 dark:text-stone-400 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
        aria-label="Notifications"
      >
        <Bell size={20} />
        {unreadCount > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[16px] h-4 bg-bitter-lime text-stone-900 text-[10px] font-black rounded-full flex items-center justify-center px-0.5 leading-none">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 w-auto sm:w-96 top-14 sm:top-full sm:mt-2 bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-700 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stone-100 dark:border-stone-800">
            <span className="font-bold text-stone-900 dark:text-stone-100 text-sm">
              Notifications
            </span>
            {unreadCount > 0 && (
              <button
                onClick={handleMarkAll}
                className="text-xs text-stone-400 hover:text-bitter-lime transition-colors font-medium"
              >
                Tout marquer lu
              </button>
            )}
          </div>

          <div className="max-h-[70vh] sm:max-h-96 overflow-y-auto divide-y divide-stone-100 dark:divide-stone-800">
            {isEmpty ? (
              <div className="px-4 py-8 text-center text-stone-400 dark:text-stone-500 text-sm">
                Aucune notification pour le moment.
              </div>
            ) : (
              <>
                {social.map((n) => {
                  // Un film dont la séance est déjà proposée ou calée : plus besoin de « on y va quand ? ».
                  const planned = social.some(
                    (x) =>
                      x.shared_movie_id === n.shared_movie_id &&
                      ['plan_proposed', 'plan_agreed'].includes(x.kind)
                  );
                  const message = socialMessage({
                    kind: n.kind,
                    actor: n.actor?.first_name,
                    guestName: n.guest_name,
                    title: n.title,
                    rating: n.rating,
                    linkKind: n.kind === 'link_answered' ? (n.rating != null ? 'verdict' : 'watch') : null,
                    payload: n.payload,
                  });
                  const unread = !n.read_at;
                  const avatar = avatarSrc(n.actor?.avatar_url);
                  const pendingInvite = unread && n.kind === 'watch_invite' && !!n.shared_movie_id;
                  const pendingVerdict = unread && (n.kind === 'verdict_request' || n.kind === 'plan_rate') && !!n.space_id;
                  const pendingPlan = unread && n.kind === 'plan_proposed' && !!n.space_id;
                  // Créneaux encore à venir d'une invitation ou d'une proposition.
                  const openSlots = (n.payload?.slots ?? []).filter(
                    (slot) => slot.id && new Date(slot.starts_at).getTime() > Date.now()
                  );
                  const offersSlots = (pendingInvite || pendingPlan) && openSlots.length > 0;
                  // Quelqu'un vient de dire oui : c'est le moment de proposer une date.
                  const canPlan = n.kind === 'watch_accepted' && !!n.space_id && !!n.shared_movie_id && !planned;
                  // Un film de ma liste : envie commune, sortie en salle, arrivée en streaming.
                  const wishTmdb = ['common_wish', 'release_today', 'now_streaming'].includes(n.kind)
                    ? n.payload?.tmdb_id
                    : undefined;
                  const watchWith = () => {
                    if (!wishTmdb || !onWatchWith) return;
                    markSocialRead(n);
                    setOpen(false);
                    onWatchWith(
                      wishTmdb,
                      n.payload?.media_type === 'tv' ? 'tv' : 'movie',
                      n.kind === 'common_wish' && n.actor_id ? [n.actor_id] : undefined
                    );
                  };
                  const interactive = pendingInvite || pendingVerdict || pendingPlan;
                  return (
                    <div
                      key={n.id}
                      onClick={() => (wishTmdb ? watchWith() : !interactive && openNotification(n))}
                      className={`flex gap-3 px-4 py-3 transition-colors ${
                        interactive ? '' : 'cursor-pointer hover:bg-stone-50 dark:hover:bg-stone-800'
                      } ${unread ? 'bg-lime-50 dark:bg-stone-800/60' : ''}`}
                    >
                      <div className="relative shrink-0">
                        {n.poster_url ? (
                          <img src={n.poster_url} alt="" className="w-10 h-14 rounded-lg object-cover" />
                        ) : (
                          <span className="w-10 h-14 rounded-lg bg-stone-100 dark:bg-stone-800 flex items-center justify-center text-lg">🎬</span>
                        )}
                        {avatar && (
                          <img src={avatar} alt="" className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full border-2 border-white dark:border-stone-900" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p
                            className={`text-sm font-semibold leading-tight ${
                              unread ? 'text-stone-900 dark:text-stone-100' : 'text-stone-600 dark:text-stone-400'
                            }`}
                          >
                            {message.title}
                          </p>
                          {unread && <span className="shrink-0 w-2 h-2 rounded-full bg-bitter-lime mt-1" />}
                        </div>
                        <p className="text-xs text-stone-500 dark:text-stone-500 mt-0.5 leading-snug">
                          {message.body} · {ago(n.created_at)}
                        </p>
                        {offersSlots && (
                          <div className="mt-2.5 space-y-1.5">
                            {openSlots.map((slot) => (
                              <button
                                key={slot.id}
                                onClick={() => pickSlot(n, slot.id!)}
                                disabled={answering === n.id}
                                className="w-full flex items-center justify-between gap-2 rounded-xl bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 px-3 py-2 text-left disabled:opacity-50"
                              >
                                <span className="text-xs font-bold text-stone-800 dark:text-stone-100 truncate">{formatSlot(slot)}</span>
                                <span className="shrink-0 text-[10px] font-black uppercase tracking-wider text-forest dark:text-lime-400">
                                  {t('plan.works')}
                                </span>
                              </button>
                            ))}
                            <div className="flex gap-3 pt-0.5 text-[11px] font-bold">
                              <button
                                onClick={() => openNotification(n)}
                                className="text-stone-500 dark:text-stone-400 hover:text-stone-800 dark:hover:text-white"
                              >
                                {t('plan.counter')}
                              </button>
                              {pendingInvite && (
                                <button onClick={() => answer(n, false)} className="text-stone-400 hover:text-stone-700 dark:hover:text-stone-200">
                                  {t('social.no')}
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {wishTmdb && onWatchWith && (
                          <div className="mt-2 flex items-center gap-3">
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                watchWith();
                              }}
                              className="text-[11px] font-black uppercase tracking-wider text-forest dark:text-lime-400"
                            >
                              {n.kind === 'common_wish' && n.actor?.first_name
                                ? t('wish.watchWithNames', { names: n.actor.first_name })
                                : n.payload?.also?.length
                                  ? t('wish.watchWithNames', { names: listNames(n.payload.also) })
                                  : t('social.watchWith')}
                            </button>
                            {/* TMDB tient ses données de streaming de JustWatch, qui demande d'être cité. */}
                            {n.kind === 'now_streaming' && (
                              <span className="text-[10px] text-stone-400">{t('wish.justwatch')}</span>
                            )}
                          </div>
                        )}
                        {canPlan && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              openNotification(n);
                            }}
                            className="mt-2 text-[11px] font-black uppercase tracking-wider text-forest dark:text-lime-400"
                          >
                            {t('plan.when')}
                          </button>
                        )}
                        {pendingInvite && !offersSlots && (
                          <div className="flex gap-2 mt-2.5">
                            <button
                              onClick={() => answer(n, true)}
                              disabled={answering === n.id}
                              className="flex-1 py-2 rounded-full bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black uppercase tracking-wider disabled:opacity-50 flex items-center justify-center gap-1.5"
                            >
                              {answering === n.id && <Loader2 size={12} className="animate-spin" />}
                              {t('social.yes')}
                            </button>
                            <button
                              onClick={() => answer(n, false)}
                              disabled={answering === n.id}
                              className="flex-1 py-2 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-[11px] font-black uppercase tracking-wider disabled:opacity-50"
                            >
                              {t('social.no')}
                            </button>
                          </div>
                        )}
                        {pendingVerdict && (
                          <div className="flex gap-2 mt-2.5">
                            <button
                              onClick={() => openNotification(n, true)}
                              className="flex-1 py-2 rounded-full bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black uppercase tracking-wider"
                            >
                              {t('social.rateIt')}
                            </button>
                            <button
                              onClick={() => {
                                markSocialRead(n);
                                onToast?.(t('social.notSeenYet'));
                              }}
                              className="flex-1 py-2 rounded-full bg-stone-100 dark:bg-stone-800 text-stone-600 dark:text-stone-300 text-[11px] font-black uppercase tracking-wider"
                            >
                              {t('social.notSeen')}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {notifications.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => handleMarkOne(n.id)}
                    className={`flex gap-3 px-4 py-3 cursor-pointer transition-colors hover:bg-stone-50 dark:hover:bg-stone-800 ${
                      !n.read ? 'bg-lime-50 dark:bg-stone-800/60' : ''
                    }`}
                  >
                    <span className="text-2xl leading-none mt-0.5">{typeIcon[n.type]}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <p
                          className={`text-sm font-semibold leading-tight ${
                            !n.read
                              ? 'text-stone-900 dark:text-stone-100'
                              : 'text-stone-600 dark:text-stone-400'
                          }`}
                        >
                          {n.title}
                        </p>
                        {!n.read && (
                          <span className="shrink-0 w-2 h-2 rounded-full bg-bitter-lime mt-1" />
                        )}
                      </div>
                      <p className="text-xs text-stone-500 dark:text-stone-500 mt-0.5 leading-snug">
                        {n.body}
                      </p>
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {userId && pushNeeded ? (
            <div className="px-4 py-3 border-t border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
              <button
                onClick={enablePush}
                disabled={pushBusy}
                className="text-xs font-bold text-stone-600 dark:text-stone-300 hover:text-bitter-lime transition-colors flex items-center gap-2 disabled:opacity-50"
              >
                {pushBusy ? <Loader2 size={12} className="animate-spin" /> : '🔔'} {t('social.pushBell')}
              </button>
            </div>
          ) : (
            !userId &&
            'Notification' in window &&
            Notification.permission === 'default' && (
              <div className="px-4 py-3 border-t border-stone-100 dark:border-stone-800 bg-stone-50 dark:bg-stone-800/50">
                <button
                  onClick={requestBrowserPermission}
                  className="text-xs text-stone-500 dark:text-stone-400 hover:text-bitter-lime transition-colors"
                >
                  🔔 Activer les notifications navigateur
                </button>
              </div>
            )
          )}
        </div>
      )}
    </div>
  );
};

export default NotificationCenter;
