import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { MessageCircleWarning, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { dismissProblem, Problem, useProblem, watchAlerts } from '../utils/problemReport';

/**
 * La pop-in « Un souci ? » : elle monte quand un message d'erreur s'affiche et
 * propose de le signaler. Elle s'efface seule au bout de dix secondes.
 */

const VISIBLE_MS = 10_000;

const ProblemReportPrompt: React.FC<{ onReport: (problem: Problem) => void }> = ({ onReport }) => {
  const { t } = useLanguage();
  const problem = useProblem();

  useEffect(() => watchAlerts(), []);

  useEffect(() => {
    if (!problem) return;
    const timer = window.setTimeout(dismissProblem, VISIBLE_MS);
    return () => window.clearTimeout(timer);
  }, [problem]);

  if (!problem) return null;

  return createPortal(
    <div
      data-no-report
      role="status"
      className="fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+96px)] z-[300] flex justify-center px-4 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
    >
      <div className="flex w-full max-w-md items-center gap-3 rounded-[22px] border border-white/10 bg-charcoal p-3 pl-4 text-white shadow-2xl">
        <MessageCircleWarning size={20} className="shrink-0 text-bitter-lime" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-black tracking-tight">{t('problem.title')}</p>
          <p className="truncate text-[11px] font-semibold text-stone-400">{problem.message}</p>
        </div>
        <button
          type="button"
          onClick={() => {
            dismissProblem();
            onReport(problem);
          }}
          className="h-10 shrink-0 rounded-full bg-bitter-lime px-4 text-[11px] font-black uppercase tracking-[0.12em] text-[#111] transition active:scale-95"
        >
          {t('problem.report')}
        </button>
        <button
          type="button"
          onClick={dismissProblem}
          aria-label={t('problem.dismiss')}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-stone-400 transition active:scale-95"
        >
          <X size={16} />
        </button>
      </div>
    </div>,
    document.body
  );
};

export default ProblemReportPrompt;
