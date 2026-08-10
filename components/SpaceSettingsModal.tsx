import React, { useState } from 'react';
import { X, Loader2, RefreshCw, Crown, UserMinus, Trash2, Check, AlertTriangle, LogOut } from 'lucide-react';
import {
  SharedSpace,
  SpaceMember,
  updateSpace,
  deleteSpace,
  removeMember,
  transferOwnership,
  regenerateInviteCode,
} from '../services/supabase';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import SharingNotice from './SharingNotice';

interface SpaceSettingsModalProps {
  space: SharedSpace;
  /** Membres actifs, déjà filtrés par la vue. */
  members: SpaceMember[];
  currentUserId: string;
  /** Les actions de gestion n'existent que pour le propriétaire. */
  isOwner: boolean;
  isLeaving: boolean;
  /** Relance les lectures de l'espace, sans quitter l'écran. */
  onRefresh: () => void;
  onLeave: () => void;
  /** Rejouer le chargement de l'espace après une modification. */
  onChanged: (space: SharedSpace) => void;
  /** L'espace n'existe plus : il faut quitter la vue. */
  onDeleted: () => void;
  onClose: () => void;
}

/**
 * Outils du propriétaire.
 *
 * Les droits correspondants existaient en base sans qu'aucun écran ne les utilise :
 * un espace ne pouvait être ni renommé ni supprimé, un membre ni exclu ni promu, et
 * la propriété ne se transmettait pas. Un fondateur qui quittait son propre espace
 * le condamnait donc définitivement, sans avertissement.
 */
const SpaceSettingsModal: React.FC<SpaceSettingsModalProps> = ({
  space,
  members,
  currentUserId,
  isOwner,
  isLeaving,
  onRefresh,
  onLeave,
  onChanged,
  onDeleted,
  onClose,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t(isOwner ? 'spaceSettings.title' : 'spaceSettings.openShort'));

  const [name, setName] = useState(space.name ?? '');
  const [description, setDescription] = useState(space.description ?? '');
  const [code, setCode] = useState(space.invite_code ?? '');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  /** Deuxième clic exigé pour tout ce qui est irréversible, plutôt qu'une modale de plus. */
  const [confirming, setConfirming] = useState<string | null>(null);

  const otherMembers = members.filter((m) => m.profile_id !== currentUserId);
  const trimmedName = name.trim();
  const dirty =
    trimmedName !== (space.name ?? '').trim() ||
    description.trim() !== (space.description ?? '').trim();

  const run = async (key: string, action: () => Promise<string | null>) => {
    setBusy(key);
    setError(null);
    const failure = await action();
    setBusy(null);
    if (failure) {
      haptics.error();
      setError(failure);
      return false;
    }
    haptics.success();
    return true;
  };

  const handleSave = async () => {
    if (!trimmedName || !dirty || busy) return;
    const ok = await run('save', async () => {
      const result = await updateSpace(space.id, {
        name: trimmedName,
        description: description.trim(),
      });
      return result.ok ? null : (result.error ?? t('spaceSettings.saveFailed'));
    });
    if (!ok) return;
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
    onChanged({ ...space, name: trimmedName, description: description.trim() });
  };

  const handleRegenerate = async () => {
    if (busy) return;
    await run('code', async () => {
      const result = await regenerateInviteCode(space.id);
      if (!result.code) return result.error ?? t('spaceSettings.codeFailed');
      setCode(result.code);
      onChanged({ ...space, invite_code: result.code });
      return null;
    });
    setConfirming(null);
  };

  const handleRemove = async (member: SpaceMember) => {
    if (busy) return;
    const ok = await run(`remove-${member.id}`, async () => {
      const result = await removeMember(space.id, member.profile_id);
      return result.ok ? null : (result.error ?? t('spaceSettings.removeFailed'));
    });
    setConfirming(null);
    if (ok) onChanged(space);
  };

  const handleTransfer = async (member: SpaceMember) => {
    if (busy) return;
    const ok = await run(`transfer-${member.id}`, async () => {
      const result = await transferOwnership(space.id, member.profile_id);
      return result.ok ? null : (result.error ?? t('spaceSettings.transferFailed'));
    });
    setConfirming(null);
    if (ok) {
      onChanged(space);
      onClose();
    }
  };

  const handleDelete = async () => {
    if (busy) return;
    const ok = await run('delete', async () => {
      const result = await deleteSpace(space.id);
      return result.ok ? null : (result.error ?? t('spaceSettings.deleteFailed'));
    });
    if (ok) onDeleted();
  };

  const inputClass =
    'w-full bg-white dark:bg-[#161616] border border-stone-200 dark:border-white/10 focus:border-charcoal dark:focus:border-white/30 rounded-2xl px-4 py-3.5 text-base font-black outline-none transition-all text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700';
  const sectionTitle =
    'text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500';

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="px-6 pt-5 pb-4 border-b border-sand dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#1a1a1a] shrink-0">
          <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white truncate">
            {t(isOwner ? 'spaceSettings.title' : 'spaceSettings.openShort')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 ml-3 w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-7">
          {error && (
            <div className="flex items-start gap-3 bg-orange-400/5 border border-orange-400/30 rounded-2xl p-4">
              <AlertTriangle size={15} className="text-orange-400 shrink-0 mt-0.5" />
              <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
                {error}
              </p>
            </div>
          )}

          {/* Consultable a tout moment, et non seulement au moment de rejoindre :
              quelqu un qui s interroge trois semaines plus tard doit pouvoir relire. */}
          <SharingNotice />

          <div className="grid grid-cols-2 gap-3">
            <button
              onClick={() => {
                haptics.soft();
                onRefresh();
                onClose();
              }}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white active:scale-95 transition-all"
            >
              <RefreshCw size={16} />
              <span className="font-black text-[10px] uppercase tracking-widest">
                {t('spaceSettings.refresh')}
              </span>
            </button>
            <button
              onClick={onLeave}
              disabled={isLeaving}
              className="flex flex-col items-center justify-center gap-2 p-4 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-stone-500 dark:text-stone-400 active:scale-95 transition-all disabled:opacity-40 hover:text-orange-400"
            >
              {isLeaving ? <Loader2 size={16} className="animate-spin" /> : <LogOut size={16} />}
              <span className="font-black text-[10px] uppercase tracking-widest">
                {t('spaceSettings.leave')}
              </span>
            </button>
          </div>

          {isOwner && (
            <>
          <div className="space-y-3">
            <p className={sectionTitle}>{t('spaceSettings.identity')}</p>
            <input
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={t('spaceSettings.nameLabel')}
              maxLength={60}
            />
            <input
              className={inputClass}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder={t('spaceSettings.descLabel')}
              maxLength={140}
            />
            <button
              onClick={handleSave}
              disabled={!trimmedName || !dirty || !!busy}
              className="w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2"
            >
              {busy === 'save' && <Loader2 size={14} className="animate-spin" />}
              {saved && <Check size={14} strokeWidth={3} />}
              {saved ? t('spaceSettings.saved') : t('spaceSettings.save')}
            </button>
          </div>

          <div className="space-y-3">
            <p className={sectionTitle}>{t('spaceSettings.codeTitle')}</p>
            <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-2xl px-4 py-3.5 text-center">
              <span className="text-2xl font-black tracking-[0.3em] text-charcoal dark:text-white">
                {code}
              </span>
            </div>
            <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
              {t('spaceSettings.codeHint')}
            </p>
            <button
              onClick={() => (confirming === 'code' ? handleRegenerate() : setConfirming('code'))}
              disabled={!!busy}
              className="w-full py-3 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy === 'code' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <RefreshCw size={13} />
              )}
              {confirming === 'code' ? t('spaceSettings.confirmOnce') : t('spaceSettings.regenerate')}
            </button>
          </div>

          {otherMembers.length > 0 && (
            <div className="space-y-3">
              <p className={sectionTitle}>{t('spaceSettings.membersTitle')}</p>
              <div className="space-y-2">
                {otherMembers.map((member) => {
                  const label = member.profile?.first_name || t('spaceSettings.unnamed');
                  const removing = confirming === `remove-${member.id}`;
                  const transferring = confirming === `transfer-${member.id}`;

                  return (
                    <div
                      key={member.id}
                      className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-2xl p-3.5 space-y-2.5"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-black text-sm text-charcoal dark:text-white truncate">
                          {label}
                        </span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            onClick={() =>
                              transferring
                                ? handleTransfer(member)
                                : setConfirming(`transfer-${member.id}`)
                            }
                            disabled={!!busy}
                            aria-label={t('spaceSettings.makeOwner')}
                            className="w-8 h-8 rounded-xl bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-stone-500 dark:text-stone-400 active:scale-90 transition-transform disabled:opacity-40"
                          >
                            {busy === `transfer-${member.id}` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <Crown size={13} />
                            )}
                          </button>
                          <button
                            onClick={() =>
                              removing ? handleRemove(member) : setConfirming(`remove-${member.id}`)
                            }
                            disabled={!!busy}
                            aria-label={t('spaceSettings.remove')}
                            className="w-8 h-8 rounded-xl bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-orange-400 active:scale-90 transition-transform disabled:opacity-40"
                          >
                            {busy === `remove-${member.id}` ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <UserMinus size={13} />
                            )}
                          </button>
                        </div>
                      </div>

                      {transferring && (
                        <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
                          {t('spaceSettings.transferConfirm', { name: label })}
                        </p>
                      )}
                      {removing && (
                        <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
                          {t('spaceSettings.removeConfirm', { name: label })}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

            </>
          )}

          {isOwner && (
          <div className="space-y-3 pt-2 border-t border-sand dark:border-white/5">
            <p className={sectionTitle}>{t('spaceSettings.dangerTitle')}</p>
            <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
              {t('spaceSettings.deleteHint')}
            </p>
            <button
              onClick={() => (confirming === 'delete' ? handleDelete() : setConfirming('delete'))}
              disabled={!!busy}
              className="w-full py-3.5 rounded-2xl bg-orange-400/10 border border-orange-400/30 text-orange-400 font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            >
              {busy === 'delete' ? (
                <Loader2 size={13} className="animate-spin" />
              ) : (
                <Trash2 size={13} />
              )}
              {confirming === 'delete'
                ? t('spaceSettings.deleteConfirm', { name: space.name })
                : t('spaceSettings.deleteSpace')}
            </button>
          </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SpaceSettingsModal;
