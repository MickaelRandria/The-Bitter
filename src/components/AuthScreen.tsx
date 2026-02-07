import React, { useState } from 'react';
import { Film, Heart, ArrowRight, Loader2, Mail, Lock, AlertTriangle, Sparkles, Ghost, User } from 'lucide-react';
import { supabase } from '../services/supabase';
import { haptics } from '../utils/haptics';

interface AuthScreenProps {
  onContinueAsGuest: () => void;
}

const AuthScreen: React.FC<AuthScreenProps> = ({ onContinueAsGuest }) => {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState(''); // Nouveau champ Prénom
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Nouveau state pour la vérification d'email
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
        setError("Supabase n'est pas configuré.");
        return;
    }

    // Validation basique
    if (isSignUp && !firstName.trim()) {
        setError("Le prénom est requis pour l'inscription.");
        return;
    }

    setLoading(true);
    setError(null);
    haptics.medium();

    try {
      if (isSignUp) {
        // 1. Création du compte Auth
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { first_name: firstName } // Stocké dans les métadonnées auth
          }
        });
        
        if (authError) throw authError;

        // 2. Création manuelle du profil public
        if (authData.user) {
            const { error: profileError } = await supabase
                .from('profiles')
                .insert([
                    { 
                        id: authData.user.id,
                        first_name: firstName,
                        email: authData.user.email || email,
                        created_at: new Date().toISOString(),
                        updated_at: new Date().toISOString()
                    }
                ]);
            
            if (profileError && !profileError.message.includes('duplicate key')) {
                console.error("Erreur création profil:", profileError);
            }
            
            // ✅ SUCCÈS : Afficher l'écran de vérification
            setRegisteredEmail(email);
            setShowEmailVerification(true);
            haptics.success();
        }

      } else {
        // Login classique
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
      {/* Background Blobs */}
      <div className="absolute top-[-5%] right-[-15%] w-[80vh] h-[80vh] bg-sand rounded-full blur-[140px] opacity-30 animate-blob" />
      <div className="absolute bottom-[-5%] left-[-5%] w-[60vh] h-[60vh] bg-stone-100 rounded-full blur-[120px] opacity-50 animate-blob" style={{ animationDelay: '-5s' }} />

      {/* ✅ NOUVEAU : Écran de Vérification Email */}
      {showEmailVerification ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 relative z-10 w-full max-w-md mx-auto">
            
            {/* Icône Success */}
            <div className="mb-8 relative inline-block">
            <div className="w-24 h-24 bg-forest rounded-[2rem] flex items-center justify-center shadow-2xl animate-[scaleIn_0.5s_ease-out]">
                <Mail size={40} className="text-white" strokeWidth={2} />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-white border-4 border-cream rounded-full flex items-center justify-center animate-bounce">
                <div className="w-2 h-2 bg-forest rounded-full"></div>
            </div>
            </div>

            {/* Titre */}
            <h2 className="text-3xl font-black text-charcoal tracking-tight mb-3 text-center">
            Vérifiez votre email
            </h2>

            {/* Instructions */}
            <div className="bg-white border-2 border-sand rounded-[2rem] p-6 mb-6 text-center">
            <p className="text-sm font-semibold text-charcoal mb-4 leading-relaxed">
                Un email de confirmation a été envoyé à :
            </p>
            <div className="bg-cream px-4 py-3 rounded-xl mb-4">
                <p className="text-sm font-black text-forest break-all">
                {registeredEmail}
                </p>
            </div>
            
            <div className="space-y-3 text-left">
                <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-forest/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-black text-forest">1</span>
                </div>
                <p className="text-xs text-stone-600 font-medium leading-relaxed">
                    Ouvrez votre boîte mail et trouvez l'email de <span className="font-bold">Supabase</span>
                </p>
                </div>
                
                <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-forest/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-black text-forest">2</span>
                </div>
                <p className="text-xs text-stone-600 font-medium leading-relaxed">
                    Cliquez sur le lien de confirmation dans l'email
                </p>
                </div>
                
                <div className="flex items-start gap-3">
                <div className="w-6 h-6 bg-forest/10 rounded-full flex items-center justify-center shrink-0 mt-0.5">
                    <span className="text-xs font-black text-forest">3</span>
                </div>
                <p className="text-xs text-stone-600 font-medium leading-relaxed">
                    Revenez sur cette page et connectez-vous avec votre email
                </p>
                </div>
            </div>

            <div className="mt-4 p-3 bg-yellow-50 border border-yellow-100 rounded-xl flex gap-3 text-left">
                <AlertTriangle size={16} className="text-yellow-600 shrink-0 mt-0.5" />
                <p className="text-[10px] text-yellow-700 font-medium leading-tight">
                    <strong>Note importante :</strong> Le lien dans l'email peut mener vers une page d'erreur. C'est normal. Ignorez-la, revenez ici et connectez-vous.
                </p>
            </div>
            </div>

            {/* Boutons */}
            <div className="w-full space-y-3">
            <button
                onClick={() => {
                setShowEmailVerification(false);
                setIsSignUp(false);
                setEmail(registeredEmail);
                setPassword('');
                setFirstName('');
                haptics.soft();
                }}
                className="w-full bg-charcoal text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all"
            >
                J'ai vérifié mon email, me connecter
            </button>
            
            <button
                onClick={() => {
                setShowEmailVerification(false);
                haptics.soft();
                }}
                className="w-full bg-white text-stone-500 border-2 border-sand py-4 rounded-[2rem] font-bold text-[10px] uppercase tracking-wider active:scale-95 transition-all"
            >
                Retour
            </button>
            </div>

            {/* Aide */}
            <p className="mt-6 text-[10px] text-stone-400 text-center max-w-xs leading-relaxed">
            <strong>Vous ne trouvez pas l'email ?</strong><br/>
            Vérifiez vos spams ou contactez le support.
            </p>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 relative z-10 w-full max-w-md mx-auto">
            
            {/* Logo Section */}
            <div className="text-center animate-[slideUp_0.6s_ease-out] w-full flex flex-col items-center mb-10">
                <div className="mb-8 relative inline-block group">
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
                        {/* Champ Prénom (Uniquement en inscription) */}
                        {isSignUp && (
                            <div className="group/field relative animate-[fadeIn_0.3s_ease-out]">
                                <div className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-charcoal transition-colors">
                                    <User size={20} strokeWidth={2.5} />
                                </div>
                                <input 
                                    required={isSignUp}
                                    type="text" 
                                    placeholder="Prénom" 
                                    value={firstName}
                                    onChange={(e) => setFirstName(e.target.value)}
                                    className="w-full bg-white border-2 border-sand rounded-[1.5rem] py-5 pl-14 pr-5 font-black text-base outline-none focus:border-forest/40 transition-all shadow-sm text-charcoal placeholder:text-stone-300" 
                                />
                            </div>
                        )}

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
      )}

      <div className="p-8 text-center relative z-10 mt-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-200 opacity-60">Heritage Edition</p>
      </div>
    </div>
  );
};

export default AuthScreen;