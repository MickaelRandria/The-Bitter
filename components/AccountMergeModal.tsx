import React, { useState } from 'react';
import { Check, Loader2, AlertTriangle, Merge } from 'lucide-react';
import { BackfillReport } from '../services/movieSync';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface AccountMergeModalProps {
  /** Films déjà sauvegardés sur le compte. */
  remoteCount: number;
  /** Films présents sur cet appareil et pas encore sur le compte. */
  localCount: number;
  onMerge: () => Promise<BackfillReport>;
  onKeepSeparate: () => void;
  /** Fermeture après lecture du rapport. */
  onDone: () => void;
}

/**
 * Choix de réunion à la reconnexion.
 *
 * S'affiche uniquement quand les deux côtés ont de la matière : un compte qui a
 * déjà des films, et un appareil qui en a d'autres. Sans films locaux, il n'y a
 * aucun choix à poser et on charge simplement le compte.
 *
 * Aucune des deux options ne détruit quoi que ce soit. « Tout réunir » s'appuie sur
 * l'upsert onConflict(profile_id, tmdb_id) déjà en place : cliquer plusieurs fois
 * ne crée pas de doublon. « Garder séparé » ne touche pas au local et laisse le
 * choix rejouable plus tard.
 */
const AccountMergeModal: React.FC<AccountMergeModalProps> = ({
  remoteCount,
  localCount,
  onMerge,
  onKeepSeparate,
  onDone,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(undefined, t('accountMerge.title'));
  const [busy, setBusy] = useState(false);
  const [report, setReport] = useState<BackfillReport | null>(null);

  const merge = async () => {
    if (busy) return;
    haptics.medium();
    setBusy(true);
    try {
      setReport(await onMerge());
    } finally {
      setBusy(false);
    }
  };

  const keepSeparate = () => {
    haptics.soft();
    onKeepSeparate();
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="flex-1 overflow-y-auto no-scrollbar p-7">
          {report ? (
            <div className="text-center py-4 space-y-6">
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
                  {t('accountMerge.pushed')}
                </p>
              </div>

              {report.skippedDeleted > 0 && (
                <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed max-w-xs mx-auto">
                  {t('accountMerge.skippedDeleted', { count: String(report.skippedDeleted) })}
                </p>
              )}

              {report.failed.length > 0 && (
                <div className="text-left bg-orange-400/5 border border-orange-400/20 rounded-2xl p-4 space-y-2">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                    {t('accountMerge.failed', { count: String(report.failed.length) })}
                  </p>
                  <ul className="space-y-1">
                    {report.failed.map((line) => (
                      <li
                        key={line}
                        className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-snug"
                      >
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {report.fatalError && (
                <p className="text-[11px] font-medium text-orange-400 leading-relaxed">
                  {report.fatalError}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <h2 className="text-3xl font-black text-charcoal dark:text-white tracking-tighter leading-tight">
                  {t('accountMerge.title')}
                </h2>
                <p className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed mt-3">
                  {t('accountMerge.intro', { count: String(remoteCount) })}
                </p>
              </div>

              {/* Choix recommandé, volontairement mis en avant. */}
              <div className="bg-white dark:bg-[#202020] border-2 border-forest/30 dark:border-bitter-lime/30 rounded-[2rem] p-5 shadow-sm">
                <div className="flex items-center gap-2.5 mb-2 text-forest dark:text-bitter-lime">
                  <Merge size={16} strokeWidth={2.5} />
                  <h3 className="text-sm font-black uppercase tracking-wide">
                    {t('accountMerge.mergeTitle')}
                  </h3>
                </div>
                <p className="text-[13px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed mb-4">
                  {t('accountMerge.mergeDesc', {
                    remote: String(remoteCount),
                    local: String(localCount),
                  })}
                </p>
                <button
                  onClick={merge}
                  disabled={busy}
                  className="w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-60 flex items-center justify-center gap-2"
                >
                  {busy && <Loader2 size={14} className="animate-spin" />}
                  {t('accountMerge.mergeCta')}
                </button>
              </div>

              <div className="bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-[2rem] p-5">
                <h3 className="text-xs font-black uppercase tracking-wide text-stone-500 dark:text-stone-400 mb-2">
                  {t('accountMerge.keepTitle')}
                </h3>
                <p className="text-[12px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed mb-4">
                  {t('accountMerge.keepDesc', { count: String(remoteCount) })}
                </p>
                <button
                  onClick={keepSeparate}
                  disabled={busy}
                  className="w-full py-3 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-stone-500 dark:text-stone-400 font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-60"
                >
                  {t('accountMerge.keepCta')}
                </button>
              </div>
            </div>
          )}
        </div>

        {report && (
          <div className="p-6 pt-4 border-t border-sand dark:border-white/5 bg-white dark:bg-[#1a1a1a] shrink-0">
            <button
              onClick={() => {
                haptics.soft();
                onDone();
              }}
              className="w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all"
            >
              {t('accountMerge.continue')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountMergeModal;
