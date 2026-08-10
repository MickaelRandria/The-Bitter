import React, { useState, useEffect } from 'react';
import { X, Plus, Users, Copy, Check, Loader2, Share2, Globe, Lock, Eye } from 'lucide-react';
import {
  SharedSpace,
  createSharedSpace,
  getUserSpaces,
  joinSpaceByCode,
} from '../services/supabase';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';

interface SharedSpacesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSelectSpace: (space: SharedSpace) => void;
}


const SharingNotice: React.FC<{ t: (k: string) => string }> = ({ t }) => (
  <div className="bg-orange-400/5 border border-orange-400/30 rounded-2xl p-4 space-y-2">
    <div className="flex items-center gap-2 text-orange-400">
      <Eye size={13} />
      <p className="text-[10px] font-black uppercase tracking-widest">
        {t('spaces.noticeTitle')}
      </p>
    </div>
    <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
      {t('spaces.noticeBody')}
    </p>
    <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
      {t('spaces.noticeControl')}
    </p>
  </div>
);

const SharedSpacesModal: React.FC<SharedSpacesModalProps> = ({
  isOpen,
  onClose,
  userId,
  onSelectSpace,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('spaces.title'));
  const [spaces, setSpaces] = useState<SharedSpace[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);

  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceDesc, setNewSpaceDesc] = useState('');
  const [inviteCode, setInviteCode] = useState('');

  const [createdSpace, setCreatedSpace] = useState<SharedSpace | null>(null);

  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [joinSuccess, setJoinSuccess] = useState(false);
  /** Vrai quand le chargement dépasse dix secondes, pour proposer une sortie. */
  const [slow, setSlow] = useState(false);

  // Force reload when modal opens
  useEffect(() => {
    if (isOpen && userId) {
      loadSpaces();
    }
  }, [isOpen, userId]);

  const loadSpaces = async () => {
    setLoading(true);
    setSlow(false);
    setError(null);
    const slowTimer = setTimeout(() => setSlow(true), 10000);
    // Un refus du serveur affichait « vous ne participez à aucun espace »,
    // c'est-à-dire le message qui décourage le plus de réessayer.
    try {
      const result = await getUserSpaces(userId);
      if (result.error) setError(result.error);
      setSpaces(result.data);
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setLoading(false);
    }
  };

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const space = await createSharedSpace(newSpaceName, newSpaceDesc, userId);

      if (space) {
        // L'auto-join qui se trouvait ici était voué à échouer : create_space_v2
        // inscrit déjà le créateur comme propriétaire. L'appel repartait donc en
        // « déjà membre » à chaque création, et son échec était jeté en silence,
        // ce qui laissait croire que c'était lui qui garantissait l'appartenance.

        haptics.success();

        // Mettre à jour la liste locale immédiatement
        setSpaces((prev) => [space, ...prev]);

        // Redirection immédiate
        onSelectSpace(space);

        setNewSpaceName('');
        setNewSpaceDesc('');
      }
    } catch (e: any) {
      if (import.meta.env.DEV) console.error(e);
      setError(e.message || 'Erreur lors de la création.');
    }

    setLoading(false);
  };

  const handleJoinSpace = async () => {
    if (!inviteCode.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const result = await joinSpaceByCode(inviteCode, userId);

      // `result.space` est désormais garanti quand `success` est vrai : le service
      // refuse une réponse vide. L'animation « Rejoint ! » ne peut donc plus se
      // jouer pour refermer la modale sur rien.
      if (result.success && result.space) {
        const joined = result.space;
        haptics.success();
        setJoinSuccess(true);

        // Refresh list for persistence
        await loadSpaces();

        setTimeout(() => {
          setJoinSuccess(false);
          setShowJoinForm(false);
          setInviteCode('');
          onSelectSpace(joined);
        }, 800);
      } else {
        haptics.error();
        setError(result.error || 'Code invalide ou erreur inconnue');
      }
    } catch (err) {
      setError('Erreur de connexion');
    }

    setLoading(false);
  };

  const copyInviteCode = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(code);
    haptics.soft();
    setTimeout(() => setCopiedCode(null), 2000);
  };

  if (!isOpen) return null;

  return (
    <div {...dialog.props} className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
        onClick={onClose}
      />

      <div className="relative z-10 bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-xl rounded-t-[3rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col h-[85vh] sm:h-auto sm:max-h-[85vh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        {/* Header */}
        <div className="p-6 border-b border-sand dark:border-white/5 flex items-center justify-between bg-white/80 dark:bg-[#1a1a1a]/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-forest rounded-2xl flex items-center justify-center shadow-lg shadow-forest/20">
              <Globe size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-charcoal dark:text-white">{t('spaces.title')}</h2>
              <p className="text-[9px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest">
                {t('spaces.subtitle')}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          {/* Mes espaces */}
          {loading && spaces.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-10 gap-3">
              <Loader2 size={32} className="animate-spin text-stone-300 dark:text-stone-700" />
              <p className="text-[10px] font-black uppercase text-stone-300 dark:text-stone-700 tracking-widest">
                {t('spaces.syncing')}
              </p>
              {/* Au-dela de dix secondes on cesse de faire patienter en silence :
                  l attente devient un fait annonce, avec un moyen d en sortir. */}
              {slow && (
                <div className="text-center space-y-3 pt-2">
                  <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 max-w-[240px] leading-relaxed">
                    {t('spaces.slow')}
                  </p>
                  <button
                    onClick={() => {
                      haptics.soft();
                      loadSpaces();
                    }}
                    className="px-5 py-2.5 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all"
                  >
                    {t('shared.retry')}
                  </button>
                </div>
              )}
            </div>
          ) : spaces.length > 0 && !showCreateForm && !showJoinForm ? (
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 ml-1">
                {t('spaces.yours', { count: String(spaces.length) })}
              </h3>
              <div className="grid gap-3">
                {spaces.map((space) => (
                  <div
                    key={space.id}
                    onClick={() => onSelectSpace(space)}
                    className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-[1.5rem] p-5 cursor-pointer hover:border-forest active:scale-[0.98] transition-all shadow-sm group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white font-black text-xs">
                          {space.name.substring(0, 2).toUpperCase()}
                        </div>
                        <h4 className="font-black text-base text-charcoal dark:text-white group-hover:text-forest dark:group-hover:text-lime-400 transition-colors">
                          {space.name}
                        </h4>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyInviteCode(space.invite_code);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${copiedCode === space.invite_code ? 'bg-green-100 text-green-700' : 'bg-stone-50 text-stone-400 hover:bg-stone-100'}`}
                      >
                        {copiedCode === space.invite_code ? (
                          <>
                            {t('spaces.copied')} <Check size={12} />
                          </>
                        ) : (
                          <>
                            {t('spaces.codeShort', { code: space.invite_code })} <Copy size={12} />
                          </>
                        )}
                      </button>
                    </div>
                    {space.description ? (
                      <p className="text-xs text-stone-500 dark:text-stone-400 font-medium pl-11 line-clamp-1">
                        {space.description}
                      </p>
                    ) : (
                      <p className="text-[10px] text-stone-300 dark:text-stone-700 pl-11 italic">{t('spaces.noDescription')}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : !showCreateForm && !showJoinForm ? (
            <div className="py-10 text-center space-y-4">
              <div className="w-20 h-20 bg-stone-50 dark:bg-[#161616] rounded-full flex items-center justify-center mx-auto text-stone-300 dark:text-stone-700">
                <Share2 size={32} />
              </div>
              <p className="text-sm font-medium text-stone-500 dark:text-stone-400 max-w-[200px] mx-auto">
                {t('spaces.empty')}
              </p>
            </div>
          ) : null}

          {/* Actions */}
          <div className="space-y-4 pt-4 border-t border-sand/50 dark:border-white/5">
            {/* Créer un espace */}
            {!showCreateForm && !showJoinForm ? (
              <div className="grid grid-cols-1 gap-3">
                <button
                  onClick={() => {
                    setShowCreateForm(true);
                    setShowJoinForm(false);
                    haptics.soft();
                  }}
                  className="w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal p-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-lg shadow-charcoal/20"
                >
                  <Plus size={18} strokeWidth={3} />
                  {t('spaces.create')}
                </button>
                <button
                  onClick={() => {
                    setShowJoinForm(true);
                    setShowCreateForm(false);
                    haptics.soft();
                  }}
                  className="w-full bg-white dark:bg-[#202020] border border-sand dark:border-white/10 text-charcoal dark:text-white p-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-transform hover:bg-stone-50 dark:hover:bg-[#2a2a2a]"
                >
                  <Lock size={16} />
                  {t('spaces.joinWithCode')}
                </button>
              </div>
            ) : showCreateForm ? (
              <div className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-[2rem] p-6 animate-[fadeIn_0.3s_ease-out] shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-stone-100 dark:bg-[#252525] rounded-lg text-charcoal dark:text-white">
                    <Plus size={16} />
                  </div>
                  <h4 className="font-black text-charcoal dark:text-white">{t('spaces.newSpace')}</h4>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest ml-1">
                      {t('spaces.nameLabel')}
                    </label>
                    <input
                      type="text"
                      placeholder={t('spaces.namePlaceholder')}
                      value={newSpaceName}
                      onChange={(e) => setNewSpaceName(e.target.value)}
                      className="w-full p-4 rounded-xl border-2 border-stone-100 dark:border-white/10 bg-stone-50 dark:bg-[#161616] dark:text-white text-sm font-bold focus:outline-none focus:border-forest focus:bg-white dark:focus:bg-[#1a1a1a] transition-all"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest ml-1">
                      {t('spaces.descLabel')}
                    </label>
                    <textarea
                      placeholder={t('spaces.descPlaceholder')}
                      value={newSpaceDesc}
                      onChange={(e) => setNewSpaceDesc(e.target.value)}
                      className="w-full p-4 rounded-xl border-2 border-stone-100 dark:border-white/10 bg-stone-50 dark:bg-[#161616] dark:text-white text-sm font-medium focus:outline-none focus:border-forest focus:bg-white dark:focus:bg-[#1a1a1a] resize-none h-24 transition-all"
                    />
                  </div>
                </div>

                <div className="mb-6">
                  <SharingNotice t={t} />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewSpaceName('');
                      setNewSpaceDesc('');
                    }}
                    className="flex-1 px-6 py-4 rounded-xl bg-stone-100 dark:bg-[#252525] text-stone-500 dark:text-stone-400 font-black text-xs uppercase tracking-wider hover:bg-stone-200 dark:hover:bg-[#2e2e2e]"
                  >
                    {t('spaces.cancel')}
                  </button>
                  <button
                    onClick={handleCreateSpace}
                    disabled={loading || !newSpaceName.trim()}
                    className="flex-[2] bg-forest text-white py-4 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-40 shadow-lg shadow-forest/20 flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    {loading ? t('spaces.creating') : t('spaces.validate')}
                  </button>
                </div>
                {error && (
                  <p className="text-center text-xs text-red-500 font-bold mt-4">{error}</p>
                )}
              </div>
            ) : (
              <div className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-[2rem] p-6 animate-[fadeIn_0.3s_ease-out] shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                  <div className="p-2 bg-stone-100 dark:bg-[#252525] rounded-lg text-charcoal dark:text-white">
                    <Lock size={16} />
                  </div>
                  <h4 className="font-black text-charcoal dark:text-white">{t('spaces.joinTitle')}</h4>
                </div>

                <div className="space-y-2 mb-6">
                  <label className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest ml-1">
                    {t('spaces.inviteCodeLabel')}
                  </label>
                  <input
                    type="text"
                    placeholder={t('spaces.codePlaceholder')}
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                    className="w-full p-4 rounded-xl border-2 border-stone-100 dark:border-white/10 bg-stone-50 dark:bg-[#161616] dark:text-white text-lg font-black font-mono uppercase text-center focus:outline-none focus:border-forest focus:bg-white dark:focus:bg-[#1a1a1a] tracking-[0.2em] placeholder:tracking-normal transition-all"
                    maxLength={6}
                  />
                </div>

                <div className="mb-6">
                  <SharingNotice t={t} />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowJoinForm(false);
                      setInviteCode('');
                      setError(null);
                    }}
                    className="flex-1 px-6 py-4 rounded-xl bg-stone-100 dark:bg-[#252525] text-stone-500 dark:text-stone-400 font-black text-xs uppercase tracking-wider hover:bg-stone-200 dark:hover:bg-[#2e2e2e]"
                  >
                    {t('spaces.cancel')}
                  </button>
                  <button
                    onClick={handleJoinSpace}
                    disabled={loading || inviteCode.length !== 6 || joinSuccess}
                    className={`flex-[2] py-4 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-40 shadow-lg flex items-center justify-center gap-2 transition-all ${
                      joinSuccess
                        ? 'bg-bitter-lime text-charcoal scale-105'
                        : 'bg-forest text-white shadow-forest/20'
                    }`}
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    {joinSuccess ? (
                      <>
                        {t('spaces.joined')} <Check size={16} strokeWidth={3} />
                      </>
                    ) : loading ? (
                      t('spaces.checking')
                    ) : (
                      t('spaces.joinCta')
                    )}
                  </button>
                </div>
                {error && (
                  <p className="text-center text-xs text-red-500 font-bold mt-4 animate-[shake_0.4s_ease-in-out]">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedSpacesModal;
