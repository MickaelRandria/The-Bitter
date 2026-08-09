import React, { useState } from 'react';
import { X, Check, Loader2, Mail, CloudUpload, AlertTriangle } from 'lucide-react';
import { BackfillReport } from '../services/movieSync';
import { sendMagicLink } from '../services/auth';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface AccountSyncModalProps {
  /** Email du compte connecté, absent si personne ne l'est. */
  accountEmail?: string | null;
  /** Films du profil actif pas encore présents sur le compte. */
  pendingCount: number;
  onBackfill: () => Promise<BackfillReport>;
  onClose: () => void;
}

/**
 * Point d'entrée unique de la sauvegarde en ligne, depuis les paramètres.
 *
 * Trois états dans une seule modale : pas connecté (lien magique), connecté avec
 * des films en attente (envoi + rapport), tout à jour (simple confirmation). Le
 * mot de passe n'existe nulle part : les comptes historiques se retrouvent par
 * leur email, ce qui évite de leur demander un secret qu'ils n'ont jamais choisi.
 */
const AccountSyncModal: React.FC<AccountSyncModalProps> = ({
  accountEmail,
  pendingCount,
  onBackfill,
  onClose,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('accountSync.title'));

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BackfillReport | null>(null);

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());

  const requestLink = async () => {
    if (!emailValid || busy) return;
    haptics.medium();
    setBusy(true);
    setError(null);

    const result = await sendMagicLink(email);
    setBusy(false);

    if (!result.ok) {
      setError(
        result.reason === 'not-configured'
          ? t('accountSync.notConfigured')
          : (result.message ?? null)
      );
      return;
    }

    setLinkSent(true);
    haptics.success();
  };

  const backfill = async () => {
    if (busy) return;
    haptics.medium();
    setBusy(true);
    try {
      setReport(await onBackfill());
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full bg-white dark:bg-[#161616] border border-stone-200 dark:border-white/10 focus:border-charcoal dark:focus:border-white/30 rounded-2xl px-4 py-3.5 text-base font-black outline-none transition-all text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700';
  const primaryClass =
    'w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2';

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="px-6 pt-5 pb-4 border-b border-sand dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#1a1a1a] shrink-0">
          <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white truncate">
            {t('accountSync.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 ml-3 w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-5">
          {report ? (
            <div className="text-center py-4 space-y-5">
              <div
                className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto border ${
                  report.failed.length > 0
                    ? 'bg-orange-400/10 border-orange-400/30 text-orange-400'
                    : 'bg-bitter-lime/10 border-bitter-lime/30 text-bitter-lime'
                }`}
              >
                {report.failed.length > 0 ? (
                  <AlertTriangle size={24} />
                ) : (
                  <Check size={26} strokeWidth={3} />
                )}
              </div>
              <div>
                <p className="text-5xl font-black text-charcoal dark:text-white tracking-tighter">
                  {report.pushed}
                </p>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 mt-2">
                  {t('accountSync.savedLabel')}
                </p>
              </div>
              {report.skippedDeleted > 0 && (
                <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                  {t('accountMerge.skippedDeleted', { count: String(report.skippedDeleted) })}
                </p>
              )}
              {report.failed.length > 0 && (
                <div className="text-left bg-orange-400/5 border border-orange-400/20 rounded-2xl p-4 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-1">
                    {t('accountMerge.failed', { count: String(report.failed.length) })}
                  </p>
                  {report.failed.map((line) => (
                    <p
                      key={line}
                      className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-snug"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : linkSent ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-14 h-14 rounded-3xl bg-bitter-lime/10 border border-bitter-lime/30 flex items-center justify-center text-bitter-lime mx-auto">
                <Mail size={24} />
              </div>
              <h3 className="text-2xl font-black text-charcoal dark:text-white tracking-tight">
                {t('accountSync.linkSentTitle')}
              </h3>
              <p className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed max-w-xs mx-auto">
                {t('accountSync.linkSentBody', { email: email.trim() })}
              </p>
            </div>
          ) : accountEmail ? (
            <div className="space-y-5">
              <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                  {t('accountSync.connectedAs')}
                </p>
                <p className="text-sm font-black text-charcoal dark:text-white truncate">
                  {accountEmail}
                </p>
              </div>

              {pendingCount > 0 ? (
                <>
                  <p className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                    {t('accountSync.pendingBody', { count: String(pendingCount) })}
                  </p>
                  <button onClick={backfill} disabled={busy} className={primaryClass}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                    {t('accountSync.saveCta', { count: String(pendingCount) })}
                  </button>
                </>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-bitter-lime/10 border border-bitter-lime/30 flex items-center justify-center text-bitter-lime mx-auto">
                    <Check size={22} strokeWidth={3} />
                  </div>
                  <p className="text-sm font-medium text-stone-400 dark:text-stone-500">
                    {t('accountSync.upToDate')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                {t('accountSync.intro')}
              </p>

              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 mb-2 block ml-1">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@exemple.com"
                />
              </div>

              {error && (
                <p className="text-[11px] font-medium text-orange-400 leading-relaxed">{error}</p>
              )}

              <button onClick={requestLink} disabled={!emailValid || busy} className={primaryClass}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {t('accountSync.sendLink')}
              </button>

              <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed text-center">
                {t('accountSync.noPassword')}
              </p>
            </div>
          )}
        </div>

        {(report || linkSent) && (
          <div className="p-6 pt-4 border-t border-sand dark:border-white/5 bg-white dark:bg-[#1a1a1a] shrink-0">
            <button onClick={onClose} className={primaryClass}>
              {t('common.done')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountSyncModal;
