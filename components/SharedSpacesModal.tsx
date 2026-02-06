
import React, { useState, useEffect } from 'react';
import { X, Plus, Users, Copy, Check, Loader2, Share2, Globe, Lock } from 'lucide-react';
import { 
  SharedSpace, 
  createSharedSpace, 
  getUserSpaces, 
  joinSpaceByCode 
} from '../services/supabase';
import { haptics } from '../utils/haptics';

interface SharedSpacesModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  onSelectSpace: (space: SharedSpace) => void;
}

const SharedSpacesModal: React.FC<SharedSpacesModalProps> = ({ 
  isOpen, 
  onClose, 
  userId,
  onSelectSpace
}) => {
  const [spaces, setSpaces] = useState<SharedSpace[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [showJoinForm, setShowJoinForm] = useState(false);
  
  const [newSpaceName, setNewSpaceName] = useState('');
  const [newSpaceDesc, setNewSpaceDesc] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  
  const [copiedCode, setCopiedCode] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && userId) {
      loadSpaces();
    }
  }, [isOpen, userId]);

  const loadSpaces = async () => {
    setLoading(true);
    const data = await getUserSpaces(userId);
    setSpaces(data);
    setLoading(false);
  };

  const handleCreateSpace = async () => {
    if (!newSpaceName.trim()) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const space = await createSharedSpace(newSpaceName, newSpaceDesc, userId);
      
      if (space) {
        haptics.success();
        await loadSpaces();
        setShowCreateForm(false);
        setNewSpaceName('');
        setNewSpaceDesc('');
      }
    } catch (e: any) {
      setError(e.message || 'Erreur lors de la création.');
    }
    
    setLoading(false);
  };

  const handleJoinSpace = async () => {
    if (!inviteCode.trim()) return;
    
    setLoading(true);
    setError(null);
    
    const result = await joinSpaceByCode(inviteCode, userId);
    
    if (result.success) {
      haptics.success();
      await loadSpaces();
      setShowJoinForm(false);
      setInviteCode('');
    } else {
      setError(result.error || 'Erreur inconnue');
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
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      
      <div className="relative z-10 bg-cream w-full sm:max-w-xl rounded-t-[3rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col h-[85vh] sm:h-auto sm:max-h-[85vh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        
        {/* Header */}
        <div className="p-6 border-b border-sand flex items-center justify-between bg-white/80 backdrop-blur-xl">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-forest rounded-2xl flex items-center justify-center shadow-lg shadow-forest/20">
              <Globe size={20} className="text-white" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight text-charcoal">Espaces Partagés</h2>
              <p className="text-[9px] font-black uppercase text-stone-400 tracking-widest">Collaboratif</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center active:scale-90 transition-transform text-stone-500"
          >
            <X size={20} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          
          {/* Mes espaces */}
          {loading && spaces.length === 0 ? (
             <div className="flex flex-col items-center justify-center py-10 gap-3">
                 <Loader2 size={32} className="animate-spin text-stone-300" />
                 <p className="text-[10px] font-black uppercase text-stone-300 tracking-widest">Synchronisation...</p>
             </div>
          ) : spaces.length > 0 ? (
            <div className="space-y-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 ml-1">
                Vos Collections ({spaces.length})
              </h3>
              <div className="grid gap-3">
                {spaces.map((space) => (
                  <div 
                    key={space.id}
                    onClick={() => onSelectSpace(space)}
                    className="bg-white border border-sand rounded-[1.5rem] p-5 cursor-pointer hover:border-forest active:scale-[0.98] transition-all shadow-sm group"
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-stone-100 flex items-center justify-center text-charcoal font-black text-xs">
                              {space.name.substring(0, 2).toUpperCase()}
                          </div>
                          <h4 className="font-black text-base text-charcoal group-hover:text-forest transition-colors">{space.name}</h4>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          copyInviteCode(space.invite_code);
                        }}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider transition-colors ${copiedCode === space.invite_code ? 'bg-green-100 text-green-700' : 'bg-stone-50 text-stone-400 hover:bg-stone-100'}`}
                      >
                        {copiedCode === space.invite_code ? (
                          <>Copié <Check size={12} /></>
                        ) : (
                          <>Code: {space.invite_code} <Copy size={12} /></>
                        )}
                      </button>
                    </div>
                    {space.description ? (
                      <p className="text-xs text-stone-500 font-medium pl-11 line-clamp-1">{space.description}</p>
                    ) : (
                        <p className="text-[10px] text-stone-300 pl-11 italic">Aucune description</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : !showCreateForm && !showJoinForm ? (
            <div className="py-10 text-center space-y-4">
                <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mx-auto text-stone-300">
                    <Share2 size={32} />
                </div>
                <p className="text-sm font-medium text-stone-500 max-w-[200px] mx-auto">Vous ne participez à aucun espace partagé pour le moment.</p>
            </div>
          ) : null}

          {/* Actions */}
          <div className="space-y-4 pt-4 border-t border-sand/50">
            
            {/* Créer un espace */}
            {!showCreateForm && !showJoinForm ? (
              <div className="grid grid-cols-1 gap-3">
                <button
                    onClick={() => {
                    setShowCreateForm(true);
                    setShowJoinForm(false);
                    haptics.soft();
                    }}
                    className="w-full bg-charcoal text-white p-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-transform shadow-lg shadow-charcoal/20"
                >
                    <Plus size={18} strokeWidth={3} />
                    Créer un espace
                </button>
                <button
                    onClick={() => {
                    setShowJoinForm(true);
                    setShowCreateForm(false);
                    haptics.soft();
                    }}
                    className="w-full bg-white border border-sand text-charcoal p-5 rounded-[1.5rem] font-black text-xs uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-transform hover:bg-stone-50"
                >
                    <Lock size={16} />
                    Rejoindre avec un code
                </button>
              </div>
            ) : showCreateForm ? (
              <div className="bg-white border border-sand rounded-[2rem] p-6 animate-[fadeIn_0.3s_ease-out] shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-stone-100 rounded-lg text-charcoal"><Plus size={16} /></div>
                    <h4 className="font-black text-charcoal">Nouvel Espace</h4>
                </div>
                
                <div className="space-y-4 mb-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-stone-400 tracking-widest ml-1">Nom</label>
                        <input
                        type="text"
                        placeholder="Ex: Ciné-club entre potes"
                        value={newSpaceName}
                        onChange={(e) => setNewSpaceName(e.target.value)}
                        className="w-full p-4 rounded-xl border-2 border-stone-100 bg-stone-50 text-sm font-bold focus:outline-none focus:border-forest focus:bg-white transition-all"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black uppercase text-stone-400 tracking-widest ml-1">Description</label>
                        <textarea
                        placeholder="Quel est le but de ce groupe ?"
                        value={newSpaceDesc}
                        onChange={(e) => setNewSpaceDesc(e.target.value)}
                        className="w-full p-4 rounded-xl border-2 border-stone-100 bg-stone-50 text-sm font-medium focus:outline-none focus:border-forest focus:bg-white resize-none h-24 transition-all"
                        />
                    </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowCreateForm(false);
                      setNewSpaceName('');
                      setNewSpaceDesc('');
                    }}
                    className="flex-1 px-6 py-4 rounded-xl bg-stone-100 text-stone-500 font-black text-xs uppercase tracking-wider hover:bg-stone-200"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleCreateSpace}
                    disabled={loading || !newSpaceName.trim()}
                    className="flex-[2] bg-forest text-white py-4 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-40 shadow-lg shadow-forest/20 flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    {loading ? 'Création...' : 'Valider'}
                  </button>
                </div>
                {error && <p className="text-center text-xs text-red-500 font-bold mt-4">{error}</p>}
              </div>
            ) : (
              <div className="bg-white border border-sand rounded-[2rem] p-6 animate-[fadeIn_0.3s_ease-out] shadow-xl">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-stone-100 rounded-lg text-charcoal"><Lock size={16} /></div>
                    <h4 className="font-black text-charcoal">Rejoindre un Espace</h4>
                </div>

                <div className="space-y-2 mb-6">
                    <label className="text-[10px] font-black uppercase text-stone-400 tracking-widest ml-1">Code d'invitation</label>
                    <input
                        type="text"
                        placeholder="EX: ABC123"
                        value={inviteCode}
                        onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                        className="w-full p-4 rounded-xl border-2 border-stone-100 bg-stone-50 text-lg font-black font-mono uppercase text-center focus:outline-none focus:border-forest focus:bg-white tracking-[0.2em] placeholder:tracking-normal transition-all"
                        maxLength={6}
                    />
                </div>
                
                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowJoinForm(false);
                      setInviteCode('');
                      setError(null);
                    }}
                    className="flex-1 px-6 py-4 rounded-xl bg-stone-100 text-stone-500 font-black text-xs uppercase tracking-wider hover:bg-stone-200"
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleJoinSpace}
                    disabled={loading || inviteCode.length !== 6}
                    className="flex-[2] bg-forest text-white py-4 rounded-xl font-black text-xs uppercase tracking-wider disabled:opacity-40 shadow-lg shadow-forest/20 flex items-center justify-center gap-2"
                  >
                    {loading && <Loader2 size={14} className="animate-spin" />}
                    {loading ? 'Vérification...' : 'Rejoindre'}
                  </button>
                </div>
                {error && <p className="text-center text-xs text-red-500 font-bold mt-4">{error}</p>}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SharedSpacesModal;
