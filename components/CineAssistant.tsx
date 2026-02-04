
import React, { useState, useEffect, useRef } from 'react';
import { Sparkles, Send, Loader2, X, BrainCircuit } from 'lucide-react';
import { UserProfile } from '../types';
import { haptics } from '../utils/haptics';
import { callCineAssistant } from '../services/ai';

interface CineAssistantProps {
  isOpen: boolean;
  onClose: () => void;
  userProfile: UserProfile;
  onAddToWatchlist?: (tmdbId: number) => void;
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

const CineAssistant: React.FC<CineAssistantProps> = ({ isOpen, onClose, userProfile }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const quickQuestions = [
    "Quoi regarder ce soir ?",
    "Analyse mes goûts",
    "Un film comme mon dernier vu ?",
    "Plateformes streaming FR ?"
  ];

  // Auto-scroll constant
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, isLoading]);

  // Initialisation stable du message de bienvenue
  useEffect(() => {
    if (isOpen && messages.length === 0) {
      setMessages([{
        id: 'welcome',
        role: 'assistant',
        content: `Salut <b>${userProfile.firstName}</b> ! 🎬 Je connais ton profil <b>${userProfile.role || 'Analyste'}</b>. De quoi veux-tu discuter ?`
      }]);
    }
  }, [isOpen]);

  const handleSend = async (text: string) => {
    const query = text.trim();
    if (!query || isLoading) return;

    haptics.soft();
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: query };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({ role: m.role, content: m.content }));
      const responseText = await callCineAssistant(query, userProfile, history);
      
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: responseText };
      setMessages(prev => [...prev, assistantMsg]);
    } catch (err) {
      console.error("Chat Send Error:", err);
    } finally {
      setIsLoading(false);
      haptics.medium();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[160] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/60 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      
      <div className="relative bg-cream w-full sm:max-w-xl sm:rounded-[2.5rem] rounded-t-[3rem] shadow-2xl flex flex-col h-[85vh] sm:h-[650px] animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden border border-white/20">
        
        {/* Header */}
        <div className="p-6 border-b border-sand bg-white/80 backdrop-blur-md flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-forest text-white rounded-2xl flex items-center justify-center shadow-lg">
              <Sparkles size={20} fill="currentColor" />
            </div>
            <div>
              <h2 className="text-base font-black tracking-tight text-charcoal">Ciné-Assistant</h2>
              <p className="text-[9px] font-black text-stone-400 uppercase tracking-widest flex items-center gap-1">
                <BrainCircuit size={10} /> Gemini 3 • Live Search
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 bg-stone-100 rounded-full text-stone-500 active:scale-90 transition-all">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Chat Area */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-6 no-scrollbar">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} animate-[fadeIn_0.3s_ease-out]`}>
              <div 
                className={`max-w-[85%] p-5 rounded-[1.8rem] text-sm font-medium leading-relaxed ${
                  msg.role === 'user' 
                    ? 'bg-charcoal text-white rounded-tr-none shadow-xl' 
                    : 'bg-white border border-sand text-charcoal rounded-tl-none shadow-sm'
                }`}
                dangerouslySetInnerHTML={{ __html: msg.content }}
              />
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-white border border-sand p-4 rounded-[1.8rem] rounded-tl-none flex items-center gap-3 shadow-sm">
                <Loader2 size={16} className="animate-spin text-forest" />
                <span className="text-xs font-black text-stone-400 uppercase tracking-widest">Réflexion...</span>
              </div>
            </div>
          )}
        </div>

        {/* Footer / Input */}
        <div className="p-6 bg-white border-t border-sand shrink-0">
          {messages.length < 3 && !isLoading && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar mb-4 -mx-2 px-2">
              {quickQuestions.map((q, i) => (
                <button key={i} onClick={() => handleSend(q)} className="whitespace-nowrap px-4 py-2 bg-stone-100 rounded-full text-[10px] font-black uppercase tracking-widest text-stone-500 hover:bg-forest hover:text-white transition-all active:scale-95">
                  {q}
                </button>
              ))}
            </div>
          )}
          
          <div className="relative flex items-center">
            <input 
              type="text" 
              placeholder="Pose-moi une question..." 
              className="w-full bg-stone-100 border-2 border-transparent focus:border-forest/20 p-5 pr-16 rounded-[2rem] font-black text-sm outline-none transition-all placeholder:text-stone-300"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSend(input)}
              disabled={isLoading}
            />
            <button 
              onClick={() => handleSend(input)}
              disabled={!input.trim() || isLoading}
              className="absolute right-2 w-12 h-12 bg-forest text-white rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-all disabled:opacity-30"
            >
              <Send size={18} strokeWidth={3} />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CineAssistant;
