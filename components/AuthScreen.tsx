
import React, { useState } from 'react';
import { Film, Heart, ArrowRight, Loader2, Mail, Lock, AlertTriangle, Sparkles, Ghost } from 'lucide-react';
import { supabase } from '../services/supabase';
import { haptics } from '../utils/haptics';

interface AuthScreenProps {
  onContinueAsGuest: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onContinueAsGuest }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
        setError("Supabase n'est pas configuré.");
        return;
    }

    setLoading(true);
    setError(null);
    haptics.medium();

    try {
      if (isSignUp) {
        const { error } = await supabase.auth.signUp({
          email,
          password,
        });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password,
        });
        if (error) throw error;
      }
    } catch (err: any) {
      haptics.error();
      setError(err.message || "Une erreur est survenue");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col relative overflow-hidden font-sans selection:bg-forest selection:text-white">
      {/* Background Blobs (Identiques à WelcomePage) */}
      <div className="absolute top-[-5%] right-[-15%] w-[80vh] h-[80vh] bg-sand rounded-full blur-[140px] opacity-30 animate-blob" />
      <div className="absolute bottom-[-5%] left-[-5%] w-[60vh] h-[60vh] bg-stone-100 rounded-full blur-[120px] opacity-50 animate-blob" style={{ animationDelay: '-5s' }} />

      <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 relative z-10 w-full max-w-md mx-auto">
        
        {/* Logo Section */}
        <div className="text-center animate-[slideUp_0.6s_ease-out] w-full flex flex-col items-center mb-12">
            <div className="mb-10 relative inline-block group">
               <div className="w-24 h-24 bg-charcoal text-white rounded-[2rem] rotate-3 flex items-center justify-center shadow-2xl relative z-10 group-hover:rotate-0 transition-all duration-700 ease-[cubic-bezier(0.16,1,0.3,1)]">
                  <Film size={40} strokeWidth={1.2} />
               </div>
               <div className="absolute -top-3 -right-3 w-10 h-10 bg-forest rounded-full flex items-center justify-center text-white shadow-xl animate-bounce z-20">
                  <Heart size={18} fill="currentColor" />
               </div>
            </div>
            
            <h1 className="text-5xl font-black text-charcoal tracking-tighter mb-2 leading-none select-none">
              The<br/><span className="text-forest">Bitter</span>
            </h1>
            <p className="text-stone-400 font-bold text-[10px] uppercase tracking-[0.3em] opacity-80">
              Authentification
            </p>
        </div>

        {/* Auth Form */}
        <div className="w-full space-y-5 animate-[fadeIn_0.5s_ease-out]">
            <form onSubmit={handleAuth} className="space-y-5">
                {/* Toggle Mode */}
                <div className="flex bg-white p-1.5 rounded-2xl border border-sand mb-6 shadow-sm">
                    <button 
                        type="button" 
                        onClick={() => { setIsSignUp(false); setError(null); haptics.soft(); }} 
                        className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${!isSignUp ? 'bg-charcoal text-white shadow-lg' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                        Connexion
                    </button>
                    <button 
                        type="button" 
                        onClick={() => { setIsSignUp(true); setError(null); haptics.soft(); }} 
                        className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${isSignUp ? 'bg-charcoal text-white shadow-lg' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                        Inscription
                    </button>
                </div>

                {/* Inputs */}
                <div className="space-y-4">
                    <div className="group/field relative">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-charcoal transition-colors">
                            <Mail size={20} strokeWidth={2.5} />
                        </div>
                        <input 
                            required 
                            type="email" 
                            placeholder="Email" 
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            className="w-full bg-white border-2 border-sand rounded-[1.5rem] py-5 pl-14 pr-5 font-black text-base outline-none focus:border-forest/40 transition-all shadow-sm text-charcoal placeholder:text-stone-300" 
                        />
                    </div>
                    <div className="group/field relative">
                        <div className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-charcoal transition-colors">
                            <Lock size={20} strokeWidth={2.5} />
                        </div>
                        <input 
                            required 
                            type="password" 
                            placeholder="Mot de passe" 
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            className="w-full bg-white border-2 border-sand rounded-[1.5rem] py-5 pl-14 pr-5 font-black text-base outline-none focus:border-forest/40 transition-all shadow-sm text-charcoal placeholder:text-stone-300" 
                        />
                    </div>
                </div>

                {/* Error Message */}
                {error && (
                    <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-[shake_0.4s_ease-in-out]">
                        <AlertTriangle size={18} className="text-red-500 shrink-0" />
                        <p className="text-xs font-bold text-red-500 leading-tight">{error}</p>
                    </div>
                )}

                {/* Submit Button */}
                <button 
                    type="submit" 
                    disabled={loading}
                    className="w-full bg-charcoal text-white py-6 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl mt-6 active:scale-95 transition-all hover:bg-forest disabled:opacity-70 disabled:scale-100 flex items-center justify-center gap-3"
                >
                    {loading ? (
                        <Loader2 size={18} className="animate-spin" />
                    ) : (
                        <>
                            {isSignUp ? "Créer le compte" : "Entrer"}
                            <ArrowRight size={18} strokeWidth={3} />
                        </>
                    )}
                </button>
            </form>

            {/* Separator */}
            <div className="flex items-center gap-4 py-2 opacity-50">
                <div className="h-px bg-stone-300 flex-1" />
                <span className="text-[9px] font-black uppercase text-stone-400 tracking-widest">Ou</span>
                <div className="h-px bg-stone-300 flex-1" />
            </div>

            {/* Guest Mode Button */}
            <button 
                type="button"
                onClick={() => { haptics.medium(); onContinueAsGuest(); }}
                className="w-full bg-white text-stone-500 border-2 border-sand hover:border-stone-300 hover:text-charcoal py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3"
            >
                <Ghost size={16} />
                Accéder sans compte
            </button>
        </div>

        {isSignUp && (
            <p className="mt-8 text-[10px] font-bold text-stone-400 text-center max-w-xs leading-relaxed">
                <Sparkles size={12} className="inline mr-1 text-forest" />
                En créant un compte, vous pourrez partager vos listes et synchroniser vos verdicts.
            </p>
        )}
      </div>

      <div className="p-8 text-center relative z-10 mt-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-200 opacity-60">Heritage Edition</p>
      </div>
    </div>
  );
};

export default AuthScreen;
