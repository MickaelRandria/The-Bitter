import React, { useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { unlockCockpit } from '../services/cockpit';
import { btnPrimary, btnSecondary, field, sectionLabel, sheetFrame, sheetPad } from '../utils/ui';

/** Le mot de passe du mode admin. Il n'est vérifié que par le serveur. */
const AdminAccessSheet: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const { t } = useLanguage();
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!password || busy) return;
    setBusy(true);
    setError('');
    const result = await unlockCockpit(password);
    if (result.ok) {
      window.location.assign('/cockpit');
      return;
    }
    setPassword('');
    setError(result.message ?? t('profileModal.adminError'));
    setBusy(false);
  };

  return (
    <div className="fixed inset-0 z-[300] flex items-end justify-center bg-black/60 sm:items-center">
      <form
        onSubmit={submit}
        role="dialog"
        aria-modal="true"
        aria-labelledby="admin-access-title"
        className={`${sheetFrame} ${sheetPad} flex w-full max-w-md flex-col gap-4 bg-cream pb-6 pt-7 dark:bg-[#0c0c0c]`}
      >
        <div className="flex flex-col gap-2">
          <div className={sectionLabel}>{t('profileModal.adminRestricted')}</div>
          <h2 id="admin-access-title" className="m-0 text-[30px] font-black leading-[1.08] tracking-[-0.035em] text-charcoal dark:text-white">
            {t('profileModal.admin')}
          </h2>
          <p className="m-0 text-[15px] font-medium leading-snug text-stone-600 dark:text-stone-300">{t('profileModal.adminPrompt')}</p>
        </div>
        <label className="flex flex-col gap-2">
          <span className={sectionLabel}>{t('profileModal.adminPassword')}</span>
          <input type="password" autoFocus autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} className={field} />
        </label>
        {error && <p role="alert" className="m-0 text-sm font-bold text-red-600 dark:text-red-400">{error}</p>}
        <div className="flex flex-col gap-2">
          <button type="submit" disabled={busy || !password} className={btnPrimary}>{t('profileModal.adminOpen')}</button>
          <button type="button" onClick={onClose} className={btnSecondary}>{t('profileModal.adminCancel')}</button>
        </div>
      </form>
    </div>
  );
};

export default AdminAccessSheet;
