import React, { useState } from 'react';
import { X, Flag, Ban, Check, Loader2 } from 'lucide-react';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import {
  blockUser,
  REPORT_REASONS,
  ReportReason,
  ReportTarget,
  reportContent,
  useBlockedUsers,
} from '../services/moderation';

interface Props {
  target: ReportTarget;
  onClose: () => void;
  /** Appelé après un blocage, pour que l'écran d'origine masque ce qu'il affiche déjà. */
  onBlocked?: (userId: string) => void;
}

/**
 * Signaler un contenu, et bloquer son auteur si on le souhaite.
 *
 * Les deux gestes vivent dans la même feuille parce qu'ils répondent au même
 * moment : on vient de lire quelque chose qui gêne. Aucun n'exige l'autre.
 */
const ReportSheet: React.FC<Props> = ({ target, onClose, onBlocked }) => {
  const dialog = useDialog(onClose);
  const { t } = useLanguage();
  const blocked = useBlockedUsers();
  const [reason, setReason] = useState<ReportReason | null>(null);
  const [details, setDetails] = useState('');
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [blocking, setBlocking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isBlocked = blocked.has(target.reportedUserId);
  const name = target.reportedName;

  const send = async () => {
    if (!reason || sending) return;
    setSending(true);
    setError(null);
    const result = await reportContent(target, reason, details);
    setSending(false);
    if (!result.ok) {
      setError(result.error ?? t('moderation.error'));
      return;
    }
    haptics.success();
    setSent(true);
  };

  const block = async () => {
    if (blocking || isBlocked) return;
    setBlocking(true);
    setError(null);
    const result = await blockUser(target.reportedUserId);
    setBlocking(false);
    if (!result.ok) {
      setError(result.error ?? t('moderation.error'));
      return;
    }
    haptics.medium();
    onBlocked?.(target.reportedUserId);
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md bg-white dark:bg-[#1a1a1a] rounded-t-[2.5rem] sm:rounded-[2.5rem] border border-sand dark:border-white/10 shadow-2xl p-7 pb-[calc(1.75rem+env(safe-area-inset-bottom))] space-y-5 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h3 className="text-lg font-black tracking-tight text-charcoal dark:text-white flex items-center gap-2">
              <Flag size={16} />
              {t('moderation.reportTitle')}
            </h3>
            <p className="text-xs text-stone-500 dark:text-stone-400 mt-1">
              {t('moderation.reportSubtitle', { name })}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-2.5 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 hover:text-charcoal dark:hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        {sent ? (
          <div className="flex items-start gap-3 rounded-2xl bg-forest/5 dark:bg-lime-500/10 border border-forest/15 dark:border-lime-500/20 p-4">
            <Check size={18} className="text-forest dark:text-lime-400 shrink-0 mt-0.5" />
            <p className="text-sm text-charcoal dark:text-white leading-relaxed">{t('moderation.sent')}</p>
          </div>
        ) : (
          <>
            <fieldset className="space-y-2">
              <legend className="sr-only">{t('moderation.reasonLabel')}</legend>
              {REPORT_REASONS.map((value) => (
                <label
                  key={value}
                  className={`flex items-center gap-3 rounded-2xl border px-4 py-3 cursor-pointer transition-colors ${
                    reason === value
                      ? 'border-charcoal dark:border-white bg-stone-50 dark:bg-white/5'
                      : 'border-stone-200 dark:border-white/10'
                  }`}
                >
                  <input
                    type="radio"
                    name="report-reason"
                    value={value}
                    checked={reason === value}
                    onChange={() => setReason(value)}
                    className="accent-charcoal dark:accent-white"
                  />
                  <span className="text-sm font-bold text-charcoal dark:text-white">
                    {t(`moderation.reason.${value}`)}
                  </span>
                </label>
              ))}
            </fieldset>

            <textarea
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 1000))}
              placeholder={t('moderation.detailsPlaceholder')}
              rows={3}
              className="w-full rounded-2xl border border-stone-200 dark:border-white/10 bg-transparent px-4 py-3 text-sm text-charcoal dark:text-white placeholder:text-stone-400 focus:outline-none focus:border-charcoal dark:focus:border-white resize-none"
            />

            <button
              onClick={send}
              disabled={!reason || sending}
              className="w-full py-4 rounded-2xl bg-charcoal dark:bg-white text-white dark:text-charcoal font-black text-[11px] uppercase tracking-widest disabled:opacity-40 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
            >
              {sending && <Loader2 size={14} className="animate-spin" />}
              {t('moderation.send')}
            </button>
          </>
        )}

        <div className="border-t border-sand dark:border-white/10 pt-5 space-y-2">
          <button
            onClick={block}
            disabled={blocking || isBlocked}
            className="w-full py-3.5 rounded-2xl border border-red-200 dark:border-red-500/30 text-red-600 dark:text-red-400 font-black text-[11px] uppercase tracking-widest disabled:opacity-60 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
          >
            {blocking ? <Loader2 size={14} className="animate-spin" /> : <Ban size={14} />}
            {isBlocked ? t('moderation.blocked', { name }) : t('moderation.block', { name })}
          </button>
          <p className="text-[11px] text-stone-400 dark:text-stone-500 leading-relaxed text-center">
            {t('moderation.blockExplain')}
          </p>
        </div>

        {error && <p className="text-xs font-bold text-red-500 text-center">{error}</p>}
      </div>
    </div>
  );
};

export default ReportSheet;
