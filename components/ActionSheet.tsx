import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';

/** A sheet shares the app's scroll lock, focus trap and Escape handling. */
export default function ActionSheet({
  title,
  subtitle,
  onClose,
  children,
  dark = false,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
  dark?: boolean;
}) {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, title);
  return createPortal(
    <div
      {...dialog.props}
      className={`fixed inset-0 z-[250] flex items-end justify-center sm:items-center ${dark ? 'dark' : ''}`}
    >
      <div
        className="absolute inset-0 bg-black/45 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-md max-h-[88dvh] overflow-y-auto overscroll-contain rounded-t-[2rem] bg-cream px-6 pt-3 text-charcoal shadow-2xl dark:bg-[#11150f] dark:text-white sm:rounded-[2rem]"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
      >
        <div
          className="mx-auto mb-5 h-1 w-8 rounded-full bg-stone-300 dark:bg-white/20"
          aria-hidden="true"
        />
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 className="text-2xl font-black leading-tight tracking-tight">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-stone-100 dark:bg-white/10"
          >
            <X size={18} />
          </button>
        </div>
        {subtitle && (
          <p className="mb-5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">
            {subtitle}
          </p>
        )}
        {children}
      </div>
    </div>,
    document.body
  );
}
