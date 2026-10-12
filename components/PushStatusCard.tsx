import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Loader2, Smartphone } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { trackEvent } from '../utils/analytics';
import {
  PushSetupResult,
  disablePushNotifications,
  enablePushNotifications,
  hasPushSubscription,
  isIosDevice,
  isLikelyInstalledPwa,
  isPushSupported,
} from '../services/pushNotifications';

/**
 * Les notifications de cet appareil, au même endroit dans le profil et dans la
 * cloche : activées, à activer, bloquées dans les réglages, ou impossibles tant
 * que l'app n'est pas sur l'écran d'accueil (iPhone).
 *
 * « Activer » abonne vraiment l'appareil aux push (permission + abonnement
 * enregistré côté serveur), pas seulement l'autorisation du navigateur.
 */
type PushState = 'loading' | 'on' | 'off' | 'denied' | 'ios-home' | 'unsupported';

const readState = async (): Promise<PushState> => {
  if (isIosDevice() && !isLikelyInstalledPwa()) return 'ios-home';
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  return (await hasPushSubscription()) ? 'on' : 'off';
};

interface Props {
  /** `compact` : une ligne, pour la cloche. */
  variant?: 'full' | 'compact';
  /** Masquer la carte une fois les notifications activées (cloche). */
  hideWhenOn?: boolean;
  source: 'profile' | 'bell';
  onToast?: (message: string) => void;
  onChange?: (state: PushState) => void;
}

const PushStatusCard: React.FC<Props> = ({ variant = 'full', hideWhenOn = false, source, onToast, onChange }) => {
  const { t } = useLanguage();
  const [state, setState] = useState<PushState>('loading');
  const [busy, setBusy] = useState(false);
  /** Dernier échec, affiché sous le texte : là où il n'y a pas de toast (profil). */
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    readState().then((s) => alive && setState(s));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    onChange?.(state);
  }, [state]);

  const enable = async () => {
    haptics.medium();
    setBusy(true);
    setNote(null);
    const result = await enablePushNotifications();
    setBusy(false);
    if (result.ok) {
      setState('on');
      haptics.success();
      trackEvent('social', 'push_enabled', source);
      onToast?.(t('pushCard.enabledToast'));
      return;
    }
    const failure = result as Extract<PushSetupResult, { ok: false }>;
    if (failure.code === 'permission-denied') setState('denied');
    if (failure.code === 'not-installed') setState('ios-home');
    haptics.error();
    setNote(failure.message);
    onToast?.(failure.message);
  };

  const disable = async () => {
    haptics.soft();
    setBusy(true);
    const ok = await disablePushNotifications();
    setBusy(false);
    if (ok) {
      setState('off');
      onToast?.(t('pushCard.disabledToast'));
    } else {
      setNote(t('social.failed'));
      onToast?.(t('social.failed'));
    }
  };

  if (state === 'loading' || state === 'unsupported' || (hideWhenOn && state === 'on')) return null;

  const copy = {
    on: { icon: <BellRing size={17} />, title: t('pushCard.onTitle'), body: t('pushCard.onBody') },
    off: { icon: <Bell size={17} />, title: t('pushCard.offTitle'), body: t('pushCard.offBody') },
    denied: { icon: <BellOff size={17} />, title: t('pushCard.deniedTitle'), body: isIosDevice() ? t('pushCard.deniedIos') : t('pushCard.deniedAndroid') },
    'ios-home': { icon: <Smartphone size={17} />, title: t('pushCard.iosTitle'), body: t('pushCard.iosBody') },
  }[state];

  const button =
    state === 'off' ? (
      <button
        type="button"
        onClick={enable}
        disabled={busy}
        className="shrink-0 h-10 px-4 rounded-xl bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal text-[12px] font-black flex items-center gap-1.5 active:scale-95 transition-transform disabled:opacity-60"
      >
        {busy && <Loader2 size={13} className="animate-spin" />}
        {t('pushCard.enable')}
      </button>
    ) : state === 'on' && variant === 'full' ? (
      <button
        type="button"
        onClick={disable}
        disabled={busy}
        className="shrink-0 h-10 px-3 rounded-xl text-[11.5px] font-extrabold text-stone-500 dark:text-stone-400 hover:text-charcoal dark:hover:text-white disabled:opacity-60"
      >
        {busy ? <Loader2 size={13} className="animate-spin" /> : t('pushCard.disable')}
      </button>
    ) : null;

  const tone =
    state === 'on'
      ? 'bg-forest/10 dark:bg-bitter-lime/10 text-forest dark:text-bitter-lime'
      : state === 'off'
        ? 'bg-bitter-lime/25 dark:bg-bitter-lime/15 text-charcoal dark:text-bitter-lime'
        : 'bg-orange-100 dark:bg-orange-400/15 text-orange-700 dark:text-orange-300';

  if (variant === 'compact') {
    return (
      <div className="flex items-center gap-3 px-4 py-3 bg-stone-50 dark:bg-stone-800/50">
        <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{copy.icon}</span>
        <span className="flex-1 min-w-0">
          <b className="block text-[12.5px] font-black text-stone-900 dark:text-stone-100 leading-tight">{copy.title}</b>
          <small className="block mt-0.5 text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-snug">{copy.body}</small>
          {note && <small className="block mt-1 text-[11px] font-bold text-orange-700 dark:text-orange-300 leading-snug">{note}</small>}
        </span>
        {button}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-3 rounded-2xl bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/5 p-3">
      <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${tone}`}>{copy.icon}</span>
      <span className="flex-1 min-w-0 pt-0.5">
        <b className="block text-[12.5px] font-black text-charcoal dark:text-white leading-tight">{copy.title}</b>
        <small className="block mt-0.5 text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-snug">{copy.body}</small>
      </span>
      {button}
    </div>
  );
};

export default PushStatusCard;
