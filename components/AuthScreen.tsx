import React, { useState } from 'react';
import {
  Film,
  Heart,
  ArrowRight,
  Loader2,
  Mail,
  Lock,
  Eye,
  EyeOff,
  AlertTriangle,
  Sparkles,
  Ghost,
  User,
  Smartphone,
  Globe,
  CheckCircle2,
  ChevronLeft,
} from 'lucide-react';
import { supabase } from '../services/supabase';
import type { AuthError } from '@supabase/supabase-js';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

interface AuthScreenProps {
  onContinueAsGuest: () => void;
}

type AuthMode = 'login' | 'signup' | 'forgot';

const AuthScreen: React.FC<AuthScreenProps> = ({ onContinueAsGuest }) => {
  const { t } = useLanguage();
  const [authMode, setAuthMode] = useState<AuthMode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [registeredEmail, setRegisteredEmail] = useState('');
  const [resetEmailSent, setResetEmailSent] = useState(false);

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError(t('auth.supabaseNotConfigured'));
      return;
    }
    if (!email.trim()) {
      setError(t('auth.emailRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    haptics.medium();
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/?reset=true`,
      });
      if (error) throw error;
      setResetEmailSent(true);
      haptics.success();
    } catch (err) {
      haptics.error();
      setError((err as AuthError).message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    if (authMode === 'forgot') return handleForgotPassword(e);

    if (!supabase) {
      setError(t('auth.supabaseNotConfigured'));
      return;
    }
    if (authMode === 'signup' && !firstName.trim()) {
      setError(t('auth.firstNameRequired'));
      return;
    }
    setLoading(true);
    setError(null);
    haptics.medium();
    try {
      if (authMode === 'signup') {
        const { data: authData, error: authError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { first_name: firstName } },
        });
        if (authError) throw authError;
        if (authData.user) {
          setRegisteredEmail(email);
          setShowEmailVerification(true);
          haptics.success();
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      }
    } catch (err) {
      haptics.error();
      setError((err as AuthError).message || t('common.error'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-cream flex flex-col relative overflow-hidden font-sans selection:bg-forest selection:text-white">
      <div className="absolute top-[-5%] right-[-15%] w-[80vh] h-[80vh] bg-sand rounded-full blur-[140px] opacity-30 animate-blob" />
      <div
        className="absolute bottom-[-5%] left-[-5%] w-[60vh] h-[60vh] bg-stone-100 rounded-full blur-[120px] opacity-50 animate-blob"
        style={{ animationDelay: '-5s' }}
      />

      {resetEmailSent ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 relative z-10 w-full max-w-md mx-auto text-center">
          <div className="w-24 h-24 bg-forest rounded-[2rem] flex items-center justify-center shadow-2xl mb-8 animate-[scaleIn_0.5s_ease-out]">
            <Mail size={40} className="text-white" strokeWidth={1.5} />
          </div>
          <h2 className="text-3xl font-black text-charcoal tracking-tight mb-3">{t('auth.emailSent')}</h2>
          <div className="bg-white border-2 border-sand rounded-[2rem] p-6 mb-6 w-full shadow-sm">
            <p className="text-sm font-semibold text-charcoal mb-4 leading-relaxed">
              {t('auth.resetLinkSent')}
            </p>
            <div className="bg-cream px-4 py-3 rounded-xl mb-4 border border-sand">
              <p className="text-sm font-black text-forest break-all">{email}</p>
            </div>
            <p className="text-[10px] text-stone-400 font-medium leading-relaxed">
              {t('auth.checkSpam')}
            </p>
          </div>
          <button
            onClick={() => {
              setResetEmailSent(false);
              setAuthMode('login');
              setError(null);
              haptics.soft();
            }}
            className="w-full bg-charcoal text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all hover:bg-forest"
          >
            {t('auth.backToLogin')}
          </button>
        </div>
      ) : showEmailVerification ? (
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 relative z-10 w-full max-w-md mx-auto">
          <div className="mb-8 relative inline-block">
            <div className="w-24 h-24 bg-forest rounded-[2rem] flex items-center justify-center shadow-2xl animate-[scaleIn_0.5s_ease-out]">
              <CheckCircle2 size={40} className="text-white" strokeWidth={2} />
            </div>
            <div className="absolute -top-2 -right-2 w-8 h-8 bg-white border-4 border-cream rounded-full flex items-center justify-center animate-bounce">
              <Sparkles size={14} className="text-forest" fill="currentColor" />
            </div>
          </div>

          <h2 className="text-3xl font-black text-charcoal tracking-tight mb-3 text-center">
            {t('auth.accountCreated')}
          </h2>

          <div className="bg-white border-2 border-sand rounded-[2rem] p-6 mb-6 text-center w-full shadow-sm">
            <p className="text-sm font-semibold text-charcoal mb-4 leading-relaxed">
              {t('auth.canLoginWith')}
            </p>
            <div className="bg-cream px-4 py-3 rounded-xl mb-6 border border-sand">
              <p className="text-sm font-black text-forest break-all">{registeredEmail}</p>
            </div>
            <div className="space-y-3 text-left bg-stone-50 p-4 rounded-xl border border-stone-100">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 border border-sand text-charcoal shadow-sm">
                  <Smartphone size={16} />
                </div>
                <p className="text-[10px] text-stone-500 font-medium leading-relaxed pt-1">
                  <strong className="text-charcoal">{t('auth.hybridStorage')}</strong>{' '}
                  {t('auth.hybridStorageDesc')}
                </p>
              </div>
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 bg-white rounded-lg flex items-center justify-center shrink-0 border border-sand text-charcoal shadow-sm">
                  <Globe size={16} />
                </div>
                <p className="text-[10px] text-stone-500 font-medium leading-relaxed pt-1">
                  <strong className="text-charcoal">{t('auth.sharedSpaces')}</strong>{' '}
                  {t('auth.sharedSpacesDesc')}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full space-y-3">
            <button
              onClick={() => {
                setShowEmailVerification(false);
                setAuthMode('login');
                setEmail(registeredEmail);
                setPassword('');
                setFirstName('');
                haptics.soft();
              }}
              className="w-full bg-charcoal text-white py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] shadow-xl active:scale-95 transition-all hover:bg-forest"
            >
              {t('auth.loginNow')}
            </button>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center px-6 sm:px-10 relative z-10 w-full max-w-md mx-auto">
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
              The
              <br />
              <span className="text-forest">Bitter</span>
            </h1>
            <p className="text-stone-400 font-bold text-[10px] uppercase tracking-[0.3em] opacity-80">
              {authMode === 'forgot' ? t('auth.recovery') : t('auth.authentication')}
            </p>
          </div>

          <div className="w-full space-y-5 animate-[fadeIn_0.5s_ease-out]">
            {authMode === 'forgot' && (
              <button
                type="button"
                onClick={() => { setAuthMode('login'); setError(null); haptics.soft(); }}
                className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-charcoal transition-colors mb-6"
              >
                <ChevronLeft size={14} strokeWidth={3} /> {t('auth.backToLogin')}
              </button>
            )}

            <form onSubmit={handleAuth} className="space-y-5">
              {authMode !== 'forgot' && (
                <div className="flex bg-white p-1.5 rounded-2xl border border-sand mb-6 shadow-sm">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('login'); setError(null); haptics.soft(); }}
                    className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${authMode === 'login' ? 'bg-charcoal text-white shadow-lg' : 'text-stone-400 hover:text-stone-600'}`}
                  >
                    {t('auth.login')}
                  </button>
                  <button
                    type="button"
                    onClick={() => { setAuthMode('signup'); setError(null); haptics.soft(); }}
                    className={`flex-1 py-3.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${authMode === 'signup' ? 'bg-charcoal text-white shadow-lg' : 'text-stone-400 hover:text-stone-600'}`}
                  >
                    {t('auth.signup')}
                  </button>
                </div>
              )}

              <div className="space-y-4">
                {authMode === 'signup' && (
                  <div className="group/field relative animate-[fadeIn_0.3s_ease-out]">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-charcoal transition-colors">
                      <User size={20} strokeWidth={2.5} />
                    </div>
                    <input
                      required={authMode === 'signup'}
                      type="text"
                      placeholder={t('auth.firstName')}
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
                    placeholder={t('auth.email')}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full bg-white border-2 border-sand rounded-[1.5rem] py-5 pl-14 pr-5 font-black text-base outline-none focus:border-forest/40 transition-all shadow-sm text-charcoal placeholder:text-stone-300"
                  />
                </div>

                {authMode !== 'forgot' && (
                  <div className="group/field relative">
                    <div className="absolute left-5 top-1/2 -translate-y-1/2 text-stone-300 group-focus-within:text-charcoal transition-colors">
                      <Lock size={20} strokeWidth={2.5} />
                    </div>
                    <input
                      required
                      type={showPassword ? 'text' : 'password'}
                      placeholder={t('auth.password')}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full bg-white border-2 border-sand rounded-[1.5rem] py-5 pl-14 pr-14 font-black text-base outline-none focus:border-forest/40 transition-all shadow-sm text-charcoal placeholder:text-stone-300"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((p) => !p)}
                      className="absolute right-5 top-1/2 -translate-y-1/2 text-stone-300 hover:text-charcoal transition-colors"
                    >
                      {showPassword ? <EyeOff size={18} strokeWidth={2} /> : <Eye size={18} strokeWidth={2} />}
                    </button>
                  </div>
                )}
              </div>

              {authMode === 'login' && (
                <div className="flex justify-end -mt-2">
                  <button
                    type="button"
                    onClick={() => { setAuthMode('forgot'); setError(null); haptics.soft(); }}
                    className="text-[10px] font-black uppercase tracking-widest text-stone-400 hover:text-forest transition-colors"
                  >
                    {t('auth.forgotPassword')}
                  </button>
                </div>
              )}

              {error && (
                <div className="bg-red-50 border border-red-100 p-4 rounded-2xl flex items-center gap-3 animate-[shake_0.4s_ease-in-out]">
                  <AlertTriangle size={18} className="text-red-500 shrink-0" />
                  <p className="text-xs font-bold text-red-500 leading-tight">{error}</p>
                </div>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full bg-charcoal text-white py-6 rounded-[2rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl mt-6 active:scale-95 transition-all hover:bg-forest disabled:opacity-70 disabled:scale-100 flex items-center justify-center gap-3"
              >
                {loading ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    {authMode === 'signup'
                      ? t('auth.createAccount')
                      : authMode === 'forgot'
                        ? t('auth.sendLink')
                        : t('auth.enter')}
                    <ArrowRight size={18} strokeWidth={3} />
                  </>
                )}
              </button>
            </form>

            {authMode !== 'forgot' && (
              <div className="flex items-center gap-4 py-2 opacity-50">
                <div className="h-px bg-stone-300 flex-1" />
                <span className="text-[9px] font-black uppercase text-stone-400 tracking-widest">
                  {t('common.or')}
                </span>
                <div className="h-px bg-stone-300 flex-1" />
              </div>
            )}

            {authMode !== 'forgot' && (
              <button
                type="button"
                onClick={() => { haptics.medium(); onContinueAsGuest(); }}
                className="w-full bg-white text-stone-500 border-2 border-sand hover:border-stone-300 hover:text-charcoal py-5 rounded-[2rem] font-black text-[10px] uppercase tracking-[0.2em] transition-all active:scale-95 flex items-center justify-center gap-3"
              >
                <Ghost size={16} />
                {t('auth.guestMode')}
              </button>
            )}
          </div>

          {authMode === 'signup' && (
            <p className="mt-8 text-[10px] font-bold text-stone-400 text-center max-w-xs leading-relaxed">
              <Sparkles size={12} className="inline mr-1 text-forest" />
              {t('auth.signupBenefit')}
            </p>
          )}
        </div>
      )}

      <div className="p-8 text-center relative z-10 mt-auto">
        <p className="text-[10px] font-black uppercase tracking-[0.4em] text-stone-200 opacity-60">
          The Bitter
        </p>
      </div>
    </div>
  );
};

export default AuthScreen;
