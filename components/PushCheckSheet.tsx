import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { BellRing, Check, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { btnPrimary, btnSecondary, sheetFrame } from '../utils/ui';
import { testPushNotification } from '../services/pushNotifications';
import PushStatusCard from './PushStatusCard';

/**
 * « Tes notifications » : une vérification unique, montrée à tout le monde au
 * démarrage suivant, abonné ou pas. On montre l'état de cet appareil ; abonné,
 * on propose une notification de test, pour voir qu'elle arrive vraiment.
 *
 * Une fois par appareil (`SEEN_KEY`). Changer la version de la clé la remontre
 * à tous.
 */

export const PUSH_CHECK_SEEN_KEY = 'bitter_push_check_2026_11';

export const pushCheckSeen = () => {
  try {
    return localStorage.getItem(PUSH_CHECK_SEEN_KEY) === '1';
  } catch {
    // Sans stockage, on ne la montrerait jamais qu'une fois par session : autant ne pas insister.
    return true;
  }
};

const PushCheckSheet: React.FC<{ onClose: () => void; onToast?: (message: string) => void }> = ({ onClose, onToast }) => {
  const { t } = useLanguage();
  const close = () => {
    try {
      localStorage.setItem(PUSH_CHECK_SEEN_KEY, '1');
    } catch {
      // Rien à faire.
    }
    onClose();
  };
  const dialog = useDialog(close, t('pushCheck.title'));
  const [state, setState] = useState<string>('loading');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const test = async () => {
    setTesting(true);
    setTestResult(null);
    const result = await testPushNotification();
    setTesting(false);
    if (result.ok) {
      haptics.success();
      setTestResult({ ok: true, message: t('pushCheck.testSent') });
    } else {
      haptics.error();
      setTestResult({ ok: false, message: 'message' in result ? result.message : t('social.failed') });
    }
  };

  return createPortal(
    <div {...dialog.props} className="fixed inset-0 z-[220] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
      <div
        onClick={(event) => event.stopPropagation()}
        className={`w-full max-w-md bg-cream px-5 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-6 text-charcoal dark:bg-[#161616] dark:text-white ${sheetFrame}`}
      >
        <div className="flex h-14 w-14 items-center justify-center rounded-[18px] bg-bitter-lime text-[#111]">
          <BellRing size={26} />
        </div>
        <h2 className="mt-4 text-[26px] font-black leading-[1.02] tracking-[-0.045em]">{t('pushCheck.title')}</h2>
        <p className="mt-2 text-sm leading-relaxed text-stone-600 dark:text-stone-300">{t('pushCheck.body')}</p>

        <div className="mt-5">
          <PushStatusCard source="profile" onToast={onToast} onChange={setState} />
        </div>

        {state === 'on' && (
          <div className="mt-3 flex flex-col gap-2">
            <button type="button" onClick={test} disabled={testing} className={`${btnSecondary} w-full`}>
              {testing ? <Loader2 size={15} className="animate-spin" /> : <BellRing size={15} />}
              {t('pushCheck.test')}
            </button>
            {testResult && (
              <p
                role={testResult.ok ? 'status' : 'alert'}
                className={`text-center text-xs font-bold ${testResult.ok ? 'text-forest dark:text-bitter-lime' : 'text-[#C2410C] dark:text-[#F08A24]'}`}
              >
                {testResult.message}
              </p>
            )}
          </div>
        )}

        <button type="button" onClick={close} className={`${btnPrimary} mt-5 w-full`}>
          <Check size={15} />
          {t('pushCheck.done')}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default PushCheckSheet;
