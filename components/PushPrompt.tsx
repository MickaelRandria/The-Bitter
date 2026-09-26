import React, { useState } from 'react';
import { Bell, Loader2, Share, X } from 'lucide-react';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { trackEvent } from '../utils/analytics';
import {
  enablePushNotifications,
  isIosDevice,
  isLikelyInstalledPwa,
  markPushOffered,
} from '../services/pushNotifications';

interface Props {
  /** Pourquoi maintenant : « pour savoir quand Mika répond ». */
  reason: string;
  /** D'où vient la question, pour mesurer ce qui convainc. */
  source: string;
  onClose: () => void;
  onToast?: (message: string) => void;
}

/**
 * La question des notifications, posée au moment où elle a un sens.
 *
 * Sur iPhone, hors écran d'accueil, Safari ne propose pas les push : un bouton
 * « Activer » y échouerait à coup sûr. On explique alors comment ajouter l'app,
 * ce qui est la seule façon de les recevoir.
 */
const PushPrompt: React.FC<Props> = ({ reason, source, onClose, onToast }) => {
  const { t } = useLanguage();
  const close = () => {
    markPushOffered();
    onClose();
  };
  const dialog = useDialog(close);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const iosInstall = isIosDevice() && !isLikelyInstalledPwa();

  const enable = async () => {
    setBusy(true);
    setError(null);
    const result = await enablePushNotifications();
    setBusy(false);
    if (result.ok) {
      haptics.success();
      trackEvent('social', 'push_enabled', source);
      onToast?.(t('social.pushOn'));
      close();
      return;
    }
    setError('message' in result ? result.message : t('social.failed'));
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[310] flex items-end sm:items-center justify-center bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      onClick={close}
    >
      <div
        className="relative w-full sm:max-w-md bg-white dark:bg-[#1a1a1a] rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-sand dark:border-white/10 shadow-2xl p-7 pb-[calc(1.75rem+env(safe-area-inset-bottom))] space-y-5 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="w-11 h-11 rounded-2xl bg-lime-400 text-charcoal flex items-center justify-center shrink-0">
              <Bell size={20} />
            </span>
            <h3 className="text-lg font-black tracking-tight text-charcoal dark:text-white leading-tight">
              {t('push.title')}
            </h3>
          </div>
          <button
            onClick={close}
            aria-label={t('common.close')}
            className="p-2.5 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 hover:text-charcoal dark:hover:text-white shrink-0"
          >
            <X size={16} />
          </button>
        </div>

        <p className="text-sm text-stone-600 dark:text-stone-300 leading-relaxed">{reason}</p>

        {iosInstall ? (
          <ol className="space-y-2 text-sm text-charcoal dark:text-white">
            <li className="flex items-start gap-2">
              <span className="font-black">1.</span>
              <span className="flex items-center gap-1.5 flex-wrap">
                {t('push.iosStep1')} <Share size={14} className="inline" />
              </span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-black">2.</span>
              <span>{t('push.iosStep2')}</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="font-black">3.</span>
              <span>{t('push.iosStep3')}</span>
            </li>
          </ol>
        ) : (
          <button
            onClick={enable}
            disabled={busy}
            className="w-full py-4 rounded-2xl bg-charcoal dark:bg-white text-white dark:text-charcoal font-black text-[11px] uppercase tracking-widest disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {busy ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />}
            {t('social.pushEnable')}
          </button>
        )}

        {error && <p className="text-xs font-bold text-red-500">{error}</p>}

        <button
          onClick={close}
          className="w-full text-[11px] font-black uppercase tracking-widest text-stone-400 hover:text-charcoal dark:hover:text-white"
        >
          {iosInstall ? t('push.understood') : t('push.later')}
        </button>
      </div>
    </div>
  );
};

export default PushPrompt;
