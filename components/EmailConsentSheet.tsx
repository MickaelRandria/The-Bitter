import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { getMarketingConsent, setMarketingConsent } from '../services/social';
import { btnPrimary, btnSecondary, sectionLabel, sheetFrame, sheetPad } from '../utils/ui';

/**
 * La question de l'accord pour les e-mails de nouvelles, posée une seule fois.
 * « Oui » et « Non » ont le même poids : un accord arraché ne vaut rien.
 */
const EmailConsentSheet: React.FC<{ userId: string; onToast: (message: string) => void }> = ({ userId, onToast }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    // Laisse l'app s'installer : personne ne veut une question dès l'ouverture.
    const timer = setTimeout(async () => {
      const consent = await getMarketingConsent(userId);
      if (alive && consent === null) setOpen(true);
    }, 6_000);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [userId]);

  if (!open) return null;

  const answer = async (value: boolean) => {
    setBusy(true);
    const saved = await setMarketingConsent(userId, value);
    setBusy(false);
    setOpen(false);
    if (!saved) onToast(t('emailConsent.failed'));
  };

  const reasons = ['emailConsent.releases', 'emailConsent.screenings', 'emailConsent.news'] as const;
  return (
    <div className="fixed inset-0 z-[280] flex items-end justify-center bg-black/50 sm:items-center">
      <section role="dialog" aria-modal="true" aria-labelledby="email-consent-title" className={`${sheetFrame} ${sheetPad} flex w-full max-w-md flex-col gap-[18px] bg-cream pb-6 pt-7 dark:bg-[#0c0c0c]`}>
        <div className="flex flex-col gap-2">
          <div className={sectionLabel}>{t('emailConsent.label')}</div>
          <h2 id="email-consent-title" className="m-0 text-[30px] font-black leading-[1.08] tracking-[-0.035em] text-charcoal dark:text-white">{t('emailConsent.title')}</h2>
          <p className="m-0 text-[15px] font-medium leading-snug text-stone-600 dark:text-stone-300">{t('emailConsent.body')}</p>
        </div>
        <ul className="m-0 flex list-none flex-col border-t border-stone-200 p-0 dark:border-white/10">
          {reasons.map((key) => (
            <li key={key} className="flex items-center gap-3 border-b border-stone-200 py-3 text-sm font-bold text-charcoal dark:border-white/10 dark:text-white">
              <Check size={17} className="shrink-0 text-forest dark:text-white" aria-hidden="true" />
              {t(key)}
            </li>
          ))}
        </ul>
        <div className="flex flex-col gap-2">
          <button type="button" disabled={busy} onClick={() => answer(true)} className={btnPrimary}>{t('emailConsent.yes')}</button>
          <button type="button" disabled={busy} onClick={() => answer(false)} className={btnSecondary}>{t('emailConsent.no')}</button>
        </div>
        <p className="m-0 text-center text-xs leading-snug text-stone-500 dark:text-stone-400">{t('emailConsent.later')}</p>
      </section>
    </div>
  );
};

export default EmailConsentSheet;
