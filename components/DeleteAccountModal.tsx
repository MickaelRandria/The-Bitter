import React, { useState } from 'react';
import { AlertTriangle, Loader2, Trash2, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { deleteAccount } from '../services/account';

interface DeleteAccountModalProps {
  onClose: () => void;
  /** Appelé une fois la suppression confirmée par le serveur. */
  onDeleted: () => void;
}

/**
 * Confirmation de suppression définitive du compte.
 *
 * La saisie du mot n'est pas une formalité décorative : l'écran est atteint depuis
 * une liste de réglages, et un bouton seul s'y déclenche trop facilement au pouce.
 * Le bouton reste donc inerte tant que le mot exact n'est pas écrit.
 */
const DeleteAccountModal: React.FC<DeleteAccountModalProps> = ({ onClose, onDeleted }) => {
  const { t } = useLanguage();
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialog = useDialog(busy ? undefined : onClose, t('deleteAccount.title'));

  const word = t('deleteAccount.word');
  const armed = typed.trim().toUpperCase() === word.toUpperCase();

  const confirm = async () => {
    if (!armed || busy) return;
    haptics.medium();
    setBusy(true);
    setError(null);

    const result = await deleteAccount();
    if (!result.ok) {
      setBusy(false);
      setError(result.message || t('deleteAccount.failed'));
      return;
    }

    onDeleted();
  };

  return (
    <div {...dialog.props} className="fixed inset-0 z-[220] flex items-end sm:items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/90 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]" />

      <div className="relative z-10 bg-white dark:bg-[#141414] w-full max-w-md rounded-[2.5rem] p-8 shadow-2xl animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border border-stone-100 dark:border-white/10">
        {!busy && (
          <button
            onClick={onClose}
            aria-label={t('deleteAccount.cancel')}
            className="absolute top-5 right-5 w-8 h-8 rounded-full flex items-center justify-center text-stone-400 hover:bg-stone-100 dark:hover:bg-white/10 transition-colors"
          >
            <X size={16} />
          </button>
        )}

        <div className="flex flex-col items-center text-center">
          <div className="w-16 h-16 bg-red-50 dark:bg-red-900/20 rounded-2xl flex items-center justify-center text-red-500 mb-6">
            <AlertTriangle size={30} strokeWidth={1.75} />
          </div>

          <h2 className="text-2xl font-black text-charcoal dark:text-white tracking-tight mb-3">
            {t('deleteAccount.title')}
          </h2>

          <p className="text-stone-500 dark:text-stone-400 font-medium leading-relaxed text-sm">
            {t('deleteAccount.warning')}
          </p>

          <p className="mt-4 text-[11px] font-bold text-stone-400 dark:text-stone-500 leading-relaxed bg-stone-50 dark:bg-[#1c1c1c] rounded-2xl p-4 border border-stone-100 dark:border-white/5">
            {t('deleteAccount.spacesNotice')}
          </p>

          <label className="w-full mt-6 text-left">
            <span className="block text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 mb-2">
              {t('deleteAccount.prompt', { word })}
            </span>
            <input
              type="text"
              value={typed}
              onChange={(event) => setTyped(event.target.value)}
              disabled={busy}
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="characters"
              spellCheck={false}
              className="w-full px-4 py-4 rounded-2xl bg-stone-50 dark:bg-[#1c1c1c] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white font-black tracking-[0.15em] uppercase text-sm outline-none focus:border-red-400 dark:focus:border-red-500 transition-colors disabled:opacity-50"
            />
          </label>

          {error && (
            <p className="mt-4 text-xs font-bold text-red-500" role="alert">
              {error}
            </p>
          )}

          <div className="grid grid-cols-2 gap-3 w-full mt-6">
            <button
              onClick={onClose}
              disabled={busy}
              className="py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.15em] border border-stone-200 dark:border-white/15 text-charcoal dark:text-white hover:bg-stone-50 dark:hover:bg-white/5 active:scale-95 transition-all disabled:opacity-40"
            >
              {t('deleteAccount.cancel')}
            </button>
            <button
              onClick={confirm}
              disabled={!armed || busy}
              className="py-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.15em] bg-red-500 text-white hover:bg-red-600 active:scale-95 transition-all disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {busy ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  {t('deleteAccount.working')}
                </>
              ) : (
                <>
                  <Trash2 size={14} />
                  {t('deleteAccount.confirm')}
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DeleteAccountModal;
