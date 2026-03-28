import React, { useState } from 'react';
import { X, Loader2 } from 'lucide-react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FORMSPREE_ENDPOINT = 'https://formspree.io/f/mpqoqjnn';

const FeedbackModal: React.FC<FeedbackModalProps> = ({ isOpen, onClose }) => {
  const [type, setType] = useState<'bug' | 'suggestion' | 'other'>('bug');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!message.trim()) return;
    setSending(true);
    try {
      const response = await fetch(FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          type,
          email: email || 'Non fourni',
          message,
          userAgent: navigator.userAgent,
          url: window.location.href,
          timestamp: new Date().toISOString(),
        }),
      });
      if (response.ok) {
        setSuccess(true);
        setTimeout(() => {
          onClose();
          setSuccess(false);
          setMessage('');
          setEmail('');
          setType('bug');
        }, 2000);
      } else {
        throw new Error('Erreur Formspree');
      }
    } catch (error) {
      console.error('Feedback error:', error);
      alert("Erreur lors de l'envoi. Réessaye plus tard.");
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]"
        onClick={onClose}
      />
      <div className="relative z-10 bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl p-8 animate-[scaleIn_0.3s_ease-out]">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-2xl font-black text-charcoal tracking-tight">💬 Ton avis compte</h2>
          <button onClick={onClose} className="p-2 hover:bg-stone-100 rounded-xl transition-colors">
            <X size={20} />
          </button>
        </div>

        {success ? (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">🎉</div>
            <p className="text-xl font-black text-forest">Merci pour ton retour !</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-3 block">
                Type de feedback
              </label>
              <div className="flex gap-2">
                {(
                  [
                    { value: 'bug', emoji: '🐛', label: 'Bug', active: 'bg-red-500 text-white border-red-500' },
                    { value: 'suggestion', emoji: '💡', label: 'Idée', active: 'bg-blue-500 text-white border-blue-500' },
                    { value: 'other', emoji: '❤️', label: 'Autre', active: 'bg-forest text-white border-forest' },
                  ] as const
                ).map((opt) => (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => setType(opt.value)}
                    className={`flex-1 px-4 py-3 rounded-2xl font-black text-xs transition-all border-2 ${
                      type === opt.value
                        ? opt.active
                        : 'bg-stone-100 text-stone-600 border-sand hover:border-stone-300'
                    }`}
                  >
                    {opt.emoji} {opt.label}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-2 block">
                Email (optionnel)
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="Pour te recontacter si besoin"
                className="w-full px-4 py-3 rounded-2xl border-2 border-sand bg-white text-charcoal text-sm font-medium focus:outline-none focus:border-forest transition-colors"
              />
            </div>

            <div>
              <label className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-2 block">
                Message
              </label>
              <textarea
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder={
                  type === 'bug'
                    ? 'Décris le bug : Sur quelle page ? Que se passe-t-il ?'
                    : type === 'suggestion'
                    ? "Décris ton idée d'amélioration..."
                    : 'Ton message...'
                }
                rows={5}
                required
                className="w-full px-4 py-3 rounded-2xl border-2 border-sand bg-white text-charcoal text-sm font-medium resize-none focus:outline-none focus:border-forest transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={sending || !message.trim()}
              className="w-full px-6 py-4 bg-forest hover:bg-lime-400 disabled:bg-stone-300 disabled:cursor-not-allowed text-white rounded-2xl font-black text-sm transition-all flex items-center justify-center gap-2 shadow-lg shadow-forest/20 active:scale-95"
            >
              {sending ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Envoi en cours...
                </>
              ) : (
                'Envoyer →'
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};

export default FeedbackModal;
