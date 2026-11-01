import React, { useState } from 'react';
import { X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import PushStatusCard from './PushStatusCard';

/**
 * Sur l'accueil : des notifications attendent dans la cloche, et cet appareil
 * ne les reçoit pas. On propose de les activer, là où on les consulte.
 *
 * Rien tant que l'état de l'appareil n'est pas connu, ni quand il est abonné.
 * « Plus tard » le range trois jours, sur cet appareil.
 */

const DISMISS_KEY = 'bitter_home_push_banner_dismissed_at';
const DISMISS_MS = 3 * 24 * 60 * 60_000;

const dismissedRecently = () => {
  try {
    return Date.now() - Number(localStorage.getItem(DISMISS_KEY) || 0) < DISMISS_MS;
  } catch {
    return false;
  }
};

const HomePushBanner: React.FC<{ unread: number; onToast?: (message: string) => void }> = ({ unread, onToast }) => {
  const { t } = useLanguage();
  const [hidden, setHidden] = useState(dismissedRecently);
  const [needed, setNeeded] = useState(false);

  if (hidden || unread <= 0) return null;

  return (
    <section
      aria-label={t('homePush.label')}
      className={`${needed ? '' : 'hidden'} rounded-[24px] border border-stone-200 bg-sand/60 p-3 dark:border-white/10 dark:bg-white/[0.04]`}
    >
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className="text-[12px] font-black tracking-tight text-charcoal dark:text-white">
          {t(unread > 1 ? 'homePush.titleMany' : 'homePush.titleOne', { n: unread })}
        </p>
        <button
          type="button"
          onClick={() => {
            try {
              localStorage.setItem(DISMISS_KEY, String(Date.now()));
            } catch {
              // Sans stockage, le bandeau reviendra : sans gravité.
            }
            setHidden(true);
          }}
          aria-label={t('homePush.later')}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-stone-500 transition active:scale-95 dark:text-stone-400"
        >
          <X size={16} />
        </button>
      </div>
      <PushStatusCard
        source="bell"
        hideWhenOn
        onToast={onToast}
        onChange={(state) => setNeeded(state === 'off' || state === 'denied' || state === 'ios-home')}
      />
    </section>
  );
};

export default HomePushBanner;
