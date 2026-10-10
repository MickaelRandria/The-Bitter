import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Check,
  ChevronLeft,
  Clapperboard,
  Film,
  Heart,
  Loader2,
  Mail,
  MapPin,
  Smartphone,
  Ticket,
  Tv,
} from 'lucide-react';
import { FavoriteCinema } from '../types';
import {
  isPasswordAccount,
  sendMagicLink,
  signInWithGoogle,
  signInWithPassword,
  verifyEmailCode,
} from '../services/auth';
import {
  CinemaCity,
  CinemaOption,
  searchCinemaCities,
  searchCinemasNearCity,
} from '../services/cinemaDirectory';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import ThemeToggle from './ThemeToggle';
import HowItWorksModal from './HowItWorksModal';

/** Le guide n'est mis en avant qu'à la première visite (même clé que l'ancien accueil). */
const GUIDE_SEEN_KEY = 'the_bitter_guide_seen';

/** Supabase limite l'envoi à un code par minute et par adresse. */
const RESEND_COOLDOWN_S = 60;
/**
 * Longueur du code envoyé par e-mail. C'est un réglage du projet Supabase
 * (« Email OTP Length », de 6 à 10), pas une constante de l'API : il est à 8 en
 * prod. Les cases et la validation automatique suivent cette valeur, mais toute
 * longueur de la plage reste acceptée, avec le bouton Valider, pour qu'un
 * changement du réglage ne bloque plus jamais la connexion.
 */
const CODE_LENGTH = 8;
const CODE_MIN = 6;
const CODE_MAX = 10;

export type CinemaChain = 'ugc' | 'pathe' | 'other';

export interface NewProfileData {
  firstName: string;
  lastName: string;
  gender: 'h' | 'f';
  age: number;
  viewingPreference: 'cinema' | 'streaming' | 'both';
  streamingPlatforms: string[];
  cinemaChain?: CinemaChain;
  favoriteCinema?: FavoriteCinema;
}

/**
 * Où en est le compte, vu de l'App :
 * - `none` : personne n'est connecté ;
 * - `loading` : la session vient d'arriver, le profil se charge ;
 * - `needsProfile` : compte neuf, il reste à dire qui l'on est ;
 * - `ready` : un profil est actif.
 */
export interface EntryAccount {
  status: 'none' | 'loading' | 'needsProfile' | 'ready';
  firstName?: string;
  filmCount?: number;
  posters?: string[];
  prefill?: { firstName?: string; lastName?: string; fromGoogle?: boolean };
}

interface EntryFlowProps {
  /** `save` : des films vivent sur cet appareil sans compte, il faut les mettre à l'abri. */
  mode: 'welcome' | 'save';
  localFilmCount: number;
  localPosters: string[];
  localName?: string;
  account: EntryAccount;
  invite?: { inviter: string; title: string; posterUrl?: string | null; kind: 'watch' | 'verdict' } | null;
  /** Appelé juste avant d'ouvrir une session, pour que l'App garde ce parcours à l'écran. */
  onAuthStarted: () => void;
  onCreateProfile: (data: NewProfileData) => void;
  /** Rend la main à l'app. */
  onFinish: () => void;
}

type Screen = 'language' | 'start' | 'email' | 'code' | 'profile' | 'back' | 'loading';

const PLATFORMS = [
  { id: 'netflix', name: 'Netflix' },
  { id: 'prime', name: 'Prime Video' },
  { id: 'disney', name: 'Disney+' },
  { id: 'canal', name: 'Canal+' },
];

/** Lien vers la boîte de réception pour les fournisseurs courants, rien sinon. */
const inboxUrl = (email: string): string | null => {
  const domain = email.split('@')[1]?.toLowerCase() ?? '';
  if (/^(gmail|googlemail)\./.test(domain)) return 'https://mail.google.com/mail/u/0/#inbox';
  if (/^(outlook|hotmail|live|msn)\./.test(domain)) return 'https://outlook.live.com/mail/';
  if (/^yahoo\./.test(domain)) return 'https://mail.yahoo.com/';
  if (/^(icloud|me|mac)\./.test(domain)) return 'https://www.icloud.com/mail';
  if (/^(orange|wanadoo)\./.test(domain)) return 'https://messagerie.orange.fr/';
  if (/^(free)\./.test(domain)) return 'https://webmail.free.fr/';
  if (/^(laposte)\./.test(domain)) return 'https://www.laposte.net/accueil';
  return null;
};

const GoogleMark = () => (
  <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" className="shrink-0">
    <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
    <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
    <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
    <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
  </svg>
);

/** Le nombre monte de 0 à sa valeur à l'apparition, puis suit les mises à jour. */
const CountUp: React.FC<{ value: number }> = ({ value }) => {
  const [shown, setShown] = useState(0);
  const fromRef = useRef(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setShown(value);
      fromRef.current = value;
      return;
    }
    const from = fromRef.current;
    let raf = 0;
    let start: number | null = null;
    const step = (now: number) => {
      if (start === null) start = now + 200;
      const p = Math.min(1, Math.max(0, (now - start) / 800));
      const v = Math.round(from + (value - from) * (1 - Math.pow(1 - p, 3)));
      setShown(v);
      fromRef.current = v;
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{shown}</>;
};

const Posters: React.FC<{ urls: string[] }> = ({ urls }) => {
  const shown = urls.slice(0, 4);
  if (shown.length === 0) return null;
  return (
    <div className="flex justify-center py-2" aria-hidden="true">
      {shown.map((url, i) => (
        <img
          key={url + i}
          src={url}
          alt=""
          className="w-16 h-24 -mx-2.5 rounded-xl object-cover border-2 border-cream dark:border-[#0c0c0c] shadow-xl bg-sand dark:bg-white/10"
          style={{ transform: `rotate(${(i - (shown.length - 1) / 2) * 5}deg)` }}
        />
      ))}
    </div>
  );
};

const EntryFlow: React.FC<EntryFlowProps> = ({
  mode: initialMode,
  localFilmCount,
  localPosters,
  localName,
  account,
  invite,
  onAuthStarted,
  onCreateProfile,
  onFinish,
}) => {
  const { t, language, setLanguage, hasChosenLanguage, deviceLanguage } = useLanguage();
  // Figé à l'ouverture : une fois connecté, les profils locaux se rattachent au
  // compte et le mode calculé par l'App basculerait en cours de route.
  const [mode] = useState(initialMode);
  const [screen, setScreen] = useState<Screen>(() =>
    !hasChosenLanguage && mode === 'welcome' ? 'language' : 'start'
  );
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  const [showGuide, setShowGuide] = useState(false);
  const [guideSeen, setGuideSeen] = useState(() => {
    try {
      return localStorage.getItem(GUIDE_SEEN_KEY) === '1';
    } catch {
      return true;
    }
  });

  // Profil
  const [step, setStep] = useState(1);
  const [form, setForm] = useState<NewProfileData>({
    firstName: '',
    lastName: '',
    gender: 'h',
    age: 25,
    viewingPreference: 'streaming',
    streamingPlatforms: [],
  });
  const [cityQuery, setCityQuery] = useState('');
  const [cityResults, setCityResults] = useState<CinemaCity[]>([]);
  const [city, setCity] = useState<CinemaCity | null>(null);
  const [cinemas, setCinemas] = useState<CinemaOption[]>([]);
  const [cinemasLoading, setCinemasLoading] = useState(false);
  const [directoryError, setDirectoryError] = useState('');
  const [loadingSince, setLoadingSince] = useState<number | null>(null);
  const [loadingStuck, setLoadingStuck] = useState(false);

  const codeRef = useRef<HTMLInputElement>(null);
  const prefilledRef = useRef(false);

  const go = (next: Screen, direction: 'fwd' | 'back' = 'fwd') => {
    setDir(direction);
    setError(null);
    setScreen(next);
  };

  const totalSteps = form.viewingPreference === 'streaming' ? 2 : 3;
  const emailClean = email.trim().toLowerCase();
  const emailValid = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(emailClean);
  const passwordAccount = emailValid && isPasswordAccount(emailClean);

  // Le compte arrive : le parcours se règle sur ce que l'App sait de lui.
  useEffect(() => {
    if (account.status === 'needsProfile') {
      if (!prefilledRef.current) {
        prefilledRef.current = true;
        setForm((f) => ({
          ...f,
          firstName: f.firstName || account.prefill?.firstName || '',
          lastName: f.lastName || account.prefill?.lastName || '',
        }));
      }
      if (screen !== 'profile') {
        setStep(1);
        go('profile');
      }
    } else if (account.status === 'ready') {
      if (mode === 'save') onFinish();
      else if (screen !== 'back' && screen !== 'profile') go('back');
    } else if (account.status === 'loading') {
      if (screen !== 'loading' && screen !== 'profile' && screen !== 'back') go('loading');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.status]);

  // Chargement trop long (réseau capricieux) : on laisse passer plutôt que de bloquer.
  useEffect(() => {
    if (screen !== 'loading') {
      setLoadingSince(null);
      setLoadingStuck(false);
      return;
    }
    setLoadingSince(Date.now());
    const timer = window.setTimeout(() => setLoadingStuck(true), 10000);
    return () => window.clearTimeout(timer);
  }, [screen]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  useEffect(() => {
    if (screen === 'code') window.setTimeout(() => codeRef.current?.focus(), 350);
  }, [screen]);

  // Recherche de ville, comme dans « Ton cinéma favori ».
  useEffect(() => {
    const query = cityQuery.trim();
    if (query.length < 2 || city?.label === cityQuery) {
      setCityResults([]);
      return;
    }
    const timer = window.setTimeout(() => {
      void searchCinemaCities(query).then((result) => {
        setCityResults(result.data);
        setDirectoryError(result.error || '');
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [cityQuery, city?.label]);

  const authError = (message?: string): string => {
    if (!message) return t('entry.errorGeneric');
    if (/rate|seconds|too many|security purposes/i.test(message)) return t('entry.errorRate');
    if (/expired|invalid|token/i.test(message)) return t('entry.errorCode');
    if (/network|fetch|failed to fetch/i.test(message)) return t('entry.errorNetwork');
    return message;
  };

  const startGoogle = async () => {
    if (busy) return;
    haptics.medium();
    setBusy(true);
    setError(null);
    onAuthStarted();
    const result = await signInWithGoogle();
    // En cas de succès la page part chez Google : on ne revient ici qu'en échec.
    if (!result.ok) {
      setBusy(false);
      setError(t('entry.googleFailed'));
      haptics.error();
    }
  };

  const sendCode = async () => {
    if (!emailValid || busy) return;
    haptics.medium();
    setBusy(true);
    setError(null);
    const result = await sendMagicLink(emailClean);
    setBusy(false);
    if (!result.ok) {
      setError(result.reason === 'not-configured' ? t('accountSync.notConfigured') : authError(result.message));
      haptics.error();
      return;
    }
    setCode('');
    setCooldown(RESEND_COOLDOWN_S);
    haptics.success();
    if (screen !== 'code') go('code');
  };

  const signInPassword = async () => {
    if (!emailValid || password.length < 6 || busy) return;
    haptics.medium();
    setBusy(true);
    setError(null);
    onAuthStarted();
    const outcome = await signInWithPassword(emailClean, password);
    setBusy(false);
    if (!outcome.ok) {
      setError(t('auth.passwordFailed'));
      haptics.error();
    }
  };

  const submitCode = async (value: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    onAuthStarted();
    const result = await verifyEmailCode(emailClean, value);
    setBusy(false);
    if (!result.ok) {
      setError(authError(result.message));
      setCode('');
      haptics.error();
      window.setTimeout(() => codeRef.current?.focus(), 50);
      return;
    }
    haptics.success();
  };

  const onCodeChange = (raw: string) => {
    // Le lien complet reste accepté collé tel quel (voir verifyEmailCode).
    if (raw.includes('://')) {
      setCode(raw.trim());
      void submitCode(raw.trim());
      return;
    }
    const digits = raw.replace(/\D/g, '').slice(0, CODE_MAX);
    setCode(digits);
    if (error) setError(null);
    if (digits.length === CODE_LENGTH) void submitCode(digits);
  };

  const chooseCity = async (picked: CinemaCity) => {
    haptics.soft();
    setCity(picked);
    setCityQuery(picked.label);
    setCityResults([]);
    setCinemas([]);
    setForm((f) => ({ ...f, favoriteCinema: undefined }));
    setDirectoryError('');
    setCinemasLoading(true);
    try {
      const result = await searchCinemasNearCity(picked);
      setCinemas(result.data);
      setDirectoryError(result.error || '');
    } finally {
      setCinemasLoading(false);
    }
  };

  const finishProfile = (skipCinema = false) => {
    haptics.success();
    const withCinema = !skipCinema && form.viewingPreference !== 'streaming';
    onCreateProfile({
      ...form,
      firstName: form.firstName.trim(),
      lastName: form.lastName.trim(),
      cinemaChain: withCinema ? form.cinemaChain : undefined,
      favoriteCinema: withCinema && form.cinemaChain === 'ugc' ? form.favoriteCinema : undefined,
    });
  };

  const back = (target: Screen) => (
    <button
      type="button"
      onClick={() => {
        haptics.soft();
        go(target, 'back');
      }}
      className="self-start mb-6 flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-white/10 backdrop-blur-md rounded-full border border-sand dark:border-white/10 shadow-sm active:scale-95 transition-all"
    >
      <ChevronLeft size={16} className="text-charcoal dark:text-white" />
      <span className="text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white">
        {t('common.back')}
      </span>
    </button>
  );

  const errorBox = error && (
    <div
      role="alert"
      className="entry-pop flex items-start gap-3 rounded-2xl bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 p-4"
    >
      <AlertTriangle size={18} className="text-red-500 shrink-0 mt-0.5" />
      <p className="text-xs font-bold text-red-500 leading-snug">{error}</p>
    </div>
  );

  const primary =
    'w-full bg-charcoal dark:bg-white text-white dark:text-charcoal py-5 rounded-[1.75rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl active:scale-[0.97] transition-all disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-3';
  const forest =
    'w-full bg-forest text-white py-5 rounded-[1.75rem] font-black text-[11px] uppercase tracking-[0.2em] shadow-xl shadow-forest/20 active:scale-[0.97] transition-all disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-3';
  const googleBtn =
    'w-full bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white border-2 border-sand dark:border-white/10 py-[18px] rounded-[1.75rem] font-black text-[11px] uppercase tracking-[0.16em] active:scale-[0.97] transition-all disabled:opacity-50 flex items-center justify-center gap-3';
  const field =
    'w-full bg-white dark:bg-[#1a1a1a] border-2 border-sand dark:border-white/10 rounded-[1.25rem] px-5 py-4 font-black text-base outline-none focus:border-forest/50 transition-all text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-600 placeholder:font-semibold';
  const label = 'text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 mb-2 block ml-1';
  const h2 = 'text-[34px] leading-none font-black tracking-tighter text-charcoal dark:text-white';
  const sub = 'text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed mt-3';

  const authButtons = (
    <div className="w-full space-y-3">
      <button type="button" onClick={startGoogle} disabled={busy} className={googleBtn}>
        {busy && screen === 'start' ? <Loader2 size={18} className="animate-spin" /> : <GoogleMark />}
        {t('entry.google')}
      </button>
      <div className="flex items-center gap-3 text-[9px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-600">
        <span className="h-px flex-1 bg-sand dark:bg-white/10" />
        {t('common.or')}
        <span className="h-px flex-1 bg-sand dark:bg-white/10" />
      </div>
      <button
        type="button"
        onClick={() => {
          haptics.medium();
          go('email');
        }}
        disabled={busy}
        className={primary}
      >
        <Mail size={17} strokeWidth={2.4} /> {t('entry.email')}
      </button>
    </div>
  );

  const legal = (
    <p className="text-[10px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed text-center">
      {t('entry.legalPrefix')}{' '}
      <a href="/conditions" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {t('entry.legalTerms')}
      </a>{' '}
      {t('entry.legalAnd')}{' '}
      <a href="/confidentialite" target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">
        {t('entry.legalPrivacy')}
      </a>
      .
    </p>
  );

  const steps = (
    <div className="flex gap-1.5 mb-6" aria-label={t('entry.stepOf', { step: String(step), total: String(totalSteps) })}>
      {Array.from({ length: totalSteps }, (_, i) => (
        <span key={i} className="relative h-1 flex-1 rounded-full bg-sand dark:bg-white/10 overflow-hidden">
          {i < step && (
            <span
              className={`absolute inset-0 bg-forest rounded-full ${i === step - 1 ? 'entry-fill' : ''}`}
            />
          )}
        </span>
      ))}
    </div>
  );

  const renderScreen = () => {
    if (screen === 'language') {
      const languages = (deviceLanguage === 'en' ? ['en', 'fr'] : ['fr', 'en']) as ('fr' | 'en')[];
      const names = { fr: 'Français', en: 'English' };
      return (
        <div className="entry-stagger w-full max-w-sm mx-auto text-center flex flex-col justify-center flex-1">
          <div className="mx-auto mb-10 w-20 h-20 bg-charcoal text-white rounded-[1.75rem] rotate-3 flex items-center justify-center shadow-2xl">
            <Film size={34} strokeWidth={1.4} />
          </div>
          <h1 className="text-[32px] leading-[1.05] font-black tracking-tighter text-charcoal dark:text-white">
            Choisis ta langue
            <span className="block text-stone-400 dark:text-stone-500">Choose your language</span>
          </h1>
          <div className="mt-10 space-y-3">
            {languages.map((lang) => (
              <button
                key={lang}
                type="button"
                lang={lang}
                onClick={() => {
                  haptics.medium();
                  setLanguage(lang);
                  go('start');
                }}
                className={`w-full h-16 px-6 rounded-[1.5rem] flex items-center justify-between font-black text-lg active:scale-[0.98] transition-transform ${
                  lang === deviceLanguage
                    ? 'bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal shadow-xl'
                    : 'bg-white dark:bg-[#1a1a1a] border-2 border-sand dark:border-white/10 text-charcoal dark:text-white'
                }`}
              >
                <span>{names[lang]}</span>
                <span className={`text-xs font-black tracking-[0.2em] ${lang === deviceLanguage ? 'opacity-70' : 'text-stone-400'}`}>
                  {lang.toUpperCase()}
                </span>
              </button>
            ))}
          </div>
          <p className="mt-6 text-[11px] font-semibold text-stone-400 dark:text-stone-500">
            Modifiable plus tard dans ton profil · You can change it later in your profile
          </p>
        </div>
      );
    }

    if (screen === 'start' && mode === 'save') {
      const benefits = ['entry.benefitSafe', 'entry.benefitEverywhere', 'entry.benefitFriends', 'entry.benefitAlerts'];
      return (
        <div className="entry-stagger w-full flex flex-col gap-5 justify-center flex-1">
          <Posters urls={localPosters} />
          <div className="text-center">
            <p className="text-6xl font-black tracking-tighter text-charcoal dark:text-white tabular-nums leading-none">
              <CountUp value={localFilmCount} />
            </p>
            <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400 mt-2">
              {t('entry.saveCountLabel')}
            </p>
          </div>
          <div className="text-center">
            <h2 className={h2}>{t('entry.saveTitle')}</h2>
            <p className={sub}>{t('entry.saveBody')}</p>
          </div>
          <ul className="bg-white dark:bg-[#141414] border border-sand dark:border-white/10 rounded-[1.5rem] p-5 space-y-3">
            {benefits.map((key) => (
              <li key={key} className="flex gap-3 items-start text-[13px] leading-snug text-charcoal dark:text-stone-200">
                <span className="w-5 h-5 rounded-full bg-forest/10 dark:bg-forest/30 text-forest dark:text-lime-300 flex items-center justify-center shrink-0 mt-px">
                  <Check size={12} strokeWidth={3.5} />
                </span>
                <span>
                  <b className="font-black">{t(`${key}Title`)}</b> {t(`${key}Body`)}
                </span>
              </li>
            ))}
          </ul>
          <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 text-center -mt-1">
            {t('entry.saveReassure', { name: localName || '', count: String(localFilmCount) })}
          </p>
          {errorBox}
          {authButtons}
          {legal}
        </div>
      );
    }

    if (screen === 'start') {
      return (
        <div className="entry-stagger w-full flex flex-col items-center text-center justify-center flex-1">
          {invite && (
            <div className="w-full mb-8 flex items-center gap-4 rounded-[1.75rem] bg-lime-400 text-black p-4 text-left shadow-xl shadow-lime-400/20">
              {invite.posterUrl && (
                <img src={invite.posterUrl} alt="" className="w-11 h-16 rounded-xl object-cover shrink-0" />
              )}
              <div className="min-w-0">
                <p className="text-sm font-black leading-tight">
                  {invite.kind === 'verdict'
                    ? t('social.inviteBannerVerdict', { name: invite.inviter })
                    : t('social.inviteBannerWatch', { name: invite.inviter })}
                </p>
                <p className="text-xs font-bold opacity-70 truncate">{invite.title}</p>
              </div>
            </div>
          )}
          <div className="relative inline-block mb-8">
            <div className="w-24 h-24 bg-charcoal text-white rounded-[2.25rem] rotate-3 flex items-center justify-center shadow-2xl">
              <Film size={42} strokeWidth={1.2} />
            </div>
            <div className="absolute -top-3 -right-3 w-10 h-10 bg-forest rounded-full flex items-center justify-center text-white shadow-xl">
              <Heart size={18} fill="currentColor" />
            </div>
          </div>
          <h1 className="text-7xl font-black text-charcoal dark:text-white tracking-tighter leading-[0.9] select-none">
            The
            <br />
            <span className="text-forest">Bitter</span>
          </h1>
          <p className="text-stone-400 font-bold mt-4 mb-12 text-[10px] uppercase tracking-[0.3em]">
            {t('welcome.tagline')}
          </p>
          <div className="w-full space-y-5">
            {errorBox}
            {authButtons}
            {legal}
          </div>
          <button
            type="button"
            onClick={() => {
              haptics.soft();
              setShowGuide(true);
            }}
            className={`mt-6 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest transition-colors ${
              guideSeen ? 'text-stone-400 dark:text-stone-500' : 'text-forest dark:text-lime-300'
            }`}
          >
            <Smartphone size={13} /> {guideSeen ? t('howItWorks.triggerSeen') : t('howItWorks.triggerTitle')}
          </button>
        </div>
      );
    }

    if (screen === 'email') {
      return (
        <form
          className="entry-stagger w-full flex flex-col flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (passwordAccount) void signInPassword();
            else void sendCode();
          }}
        >
          {back('start')}
          <h2 className={h2}>{t('entry.emailTitle')}</h2>
          <p className={sub}>{passwordAccount ? t('entry.passwordHint') : t('entry.emailBody', { n: String(CODE_LENGTH) })}</p>
          <div className="mt-8">
            <label htmlFor="entry-email" className={label}>
              {t('auth.email')}
            </label>
            <input
              id="entry-email"
              type="email"
              inputMode="email"
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              autoFocus
              className={field}
              placeholder={t('entry.emailPlaceholder')}
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (error) setError(null);
              }}
            />
            {!passwordAccount && (
              <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 mt-2 ml-1">
                {t('entry.noPassword')}
              </p>
            )}
          </div>
          {passwordAccount && (
            <div className="entry-pop mt-5">
              <label htmlFor="entry-password" className={label}>
                {t('auth.password')}
              </label>
              <input
                id="entry-password"
                type="password"
                autoComplete="current-password"
                className={field}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
              />
            </div>
          )}
          <div className="mt-5">{errorBox}</div>
          <div className="flex-1 min-h-8" />
          <button
            type="submit"
            disabled={!emailValid || busy || (passwordAccount && password.length < 6)}
            className={primary}
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" />
            ) : (
              <>
                {passwordAccount ? t('auth.passwordCta') : t('entry.sendCode')} <ArrowRight size={18} strokeWidth={3} />
              </>
            )}
          </button>
        </form>
      );
    }

    if (screen === 'code') {
      const inbox = inboxUrl(emailClean);
      const boxCount = Math.max(CODE_LENGTH, code.includes('://') ? 0 : code.length);
      return (
        <div className="entry-stagger w-full flex flex-col flex-1">
          {back('email')}
          <h2 className={h2}>{t('entry.codeTitle')}</h2>
          <p className={sub}>
            {t('entry.codeSentTo')} <b className="text-charcoal dark:text-white break-all">{emailClean}</b>.{' '}
            {t('entry.codeDelay')}
          </p>
          <div className="relative mt-8" onClick={() => codeRef.current?.focus()}>
            {/* Un seul vrai champ, sous des cases dessinées : le clavier propose le
                code reçu, le collage et l'effacement marchent sans rien réinventer. */}
            <input
              ref={codeRef}
              id="entry-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-label={t('entry.codeLabel', { n: String(CODE_LENGTH) })}
              value={code}
              disabled={busy}
              onChange={(e) => onCodeChange(e.target.value)}
              className="absolute inset-0 w-full h-full opacity-0 text-base"
            />
            <div
              className={`grid gap-1.5 pointer-events-none ${error ? 'animate-[shake_0.4s_ease-in-out]' : ''}`}
              style={{ gridTemplateColumns: `repeat(${boxCount}, minmax(0, 1fr))` }}
            >
              {Array.from({ length: boxCount }, (_, i) => {
                const filled = code.includes('://') ? '' : code[i] ?? '';
                const active = !busy && i === Math.min(code.length, boxCount - 1);
                return (
                  <div
                    key={i}
                    className={`aspect-[3/4] rounded-xl border-2 flex items-center justify-center text-xl font-black tabular-nums transition-colors bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white ${
                      error
                        ? 'border-red-400'
                        : active
                          ? 'border-forest dark:border-lime-400'
                          : 'border-sand dark:border-white/10'
                    }`}
                  >
                    {busy && i === boxCount - 1 && code.length >= CODE_MIN ? (
                      <Loader2 size={18} className="animate-spin text-stone-400" />
                    ) : (
                      filled
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-4">{errorBox}</div>
          {/* Filet si la longueur réglée côté Supabase change : on valide à la main. */}
          {code.length >= CODE_MIN && code.length !== CODE_LENGTH && !code.includes('://') && (
            <button
              type="button"
              onClick={() => void submitCode(code)}
              disabled={busy}
              className={`${primary} entry-pop mt-4`}
            >
              {busy ? <Loader2 size={18} className="animate-spin" /> : t('entry.verifyCode')}
            </button>
          )}
          <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 mt-4 ml-1">{t('entry.useCodeHint')}</p>
          <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 mt-1.5 ml-1">{t('entry.spamHint')}</p>
          <div className="grid grid-cols-2 gap-2 mt-4">
            <button
              type="button"
              onClick={() => void sendCode()}
              disabled={cooldown > 0 || busy}
              className="py-3.5 px-3 rounded-2xl border border-sand dark:border-white/10 bg-white dark:bg-[#161616] text-[11px] font-black text-charcoal dark:text-white disabled:text-stone-400 active:scale-[0.97] transition-transform"
            >
              {cooldown > 0 ? t('entry.resendIn', { s: String(cooldown) }) : t('entry.resend')}
            </button>
            <button
              type="button"
              onClick={() => go('email', 'back')}
              className="py-3.5 px-3 rounded-2xl border border-sand dark:border-white/10 bg-white dark:bg-[#161616] text-[11px] font-black text-charcoal dark:text-white active:scale-[0.97] transition-transform"
            >
              {t('entry.changeEmail')}
            </button>
          </div>
          {inbox && (
            <a
              href={inbox}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 py-3.5 rounded-2xl border border-sand dark:border-white/10 bg-white dark:bg-[#161616] text-[11px] font-black text-charcoal dark:text-white text-center active:scale-[0.97] transition-transform"
            >
              {t('entry.openInbox')}
            </a>
          )}
        </div>
      );
    }

    if (screen === 'loading') {
      return (
        <div className="entry-stagger w-full flex flex-col items-center justify-center text-center flex-1 gap-5">
          <div className="w-16 h-16 rounded-3xl bg-forest/10 flex items-center justify-center text-forest">
            <Loader2 size={26} className="animate-spin" />
          </div>
          <p className="text-sm font-bold text-stone-400">{t('entry.loading')}</p>
          {loadingStuck && loadingSince && (
            <button type="button" onClick={onFinish} className={`${primary} entry-pop max-w-xs`}>
              {t('entry.continue')} <ArrowRight size={18} strokeWidth={3} />
            </button>
          )}
        </div>
      );
    }

    if (screen === 'back') {
      const count = account.filmCount ?? 0;
      return (
        <div className="entry-stagger w-full flex flex-col items-center justify-center text-center flex-1 gap-4">
          <div className="w-20 h-20 rounded-[1.75rem] bg-forest text-white flex items-center justify-center text-3xl font-black shadow-xl shadow-forest/20">
            {(account.firstName || '?')[0]?.toUpperCase()}
          </div>
          <h2 className={`${h2} mt-2`}>
            {account.firstName ? t('entry.backTitle', { name: account.firstName }) : t('entry.backTitleNoName')}
          </h2>
          <p className="text-sm font-medium text-stone-400 dark:text-stone-500">{t('entry.backBody')}</p>
          <Posters urls={account.posters ?? []} />
          {count > 0 && (
            <div>
              <p className="text-6xl font-black tracking-tighter text-charcoal dark:text-white tabular-nums leading-none">
                <CountUp value={count} />
              </p>
              <p className="text-[10px] font-black uppercase tracking-[0.25em] text-stone-400 mt-2">
                {t('entry.backCountLabel')}
              </p>
            </div>
          )}
          <div className="w-full mt-6">
            <button
              type="button"
              onClick={() => {
                haptics.medium();
                onFinish();
              }}
              className={forest}
            >
              {t('entry.enter')} <ArrowRight size={18} strokeWidth={3} />
            </button>
          </div>
        </div>
      );
    }

    // Profil, en deux ou trois étapes.
    if (step === 1) {
      const canNext = form.firstName.trim().length > 0 && form.age > 0;
      return (
        <form
          key="p1"
          className="entry-stagger w-full flex flex-col flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            if (!canNext) return;
            haptics.medium();
            setDir('fwd');
            setStep(2);
          }}
        >
          {steps}
          <h2 className={h2}>{t('entry.profileTitle')}</h2>
          <p className={sub}>{t('entry.profileBody')}</p>
          {account.prefill?.fromGoogle && (
            <div className="mt-6 flex items-center gap-3 rounded-2xl bg-forest/10 dark:bg-forest/20 p-3.5">
              <GoogleMark />
              <p className="text-xs font-bold text-charcoal dark:text-white leading-snug">{t('entry.fromGoogle')}</p>
            </div>
          )}
          <div className="mt-6 space-y-5">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="entry-first" className={label}>
                  {t('createProfile.firstName')}
                </label>
                <input
                  id="entry-first"
                  required
                  autoComplete="given-name"
                  className={field}
                  placeholder="Jean"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                />
              </div>
              <div>
                <label htmlFor="entry-last" className={label}>
                  {t('createProfile.lastName')}
                </label>
                <input
                  id="entry-last"
                  autoComplete="family-name"
                  className={field}
                  placeholder="Bitter"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 items-end">
              <div>
                <span className={label}>{t('createProfile.gender')}</span>
                <div className="flex bg-sand dark:bg-white/10 p-1 rounded-2xl">
                  {(['h', 'f'] as const).map((g) => (
                    <button
                      key={g}
                      type="button"
                      aria-pressed={form.gender === g}
                      onClick={() => {
                        haptics.soft();
                        setForm({ ...form, gender: g });
                      }}
                      className={`flex-1 py-3 rounded-xl text-[10px] font-black transition-colors active:scale-95 ${
                        form.gender === g
                          ? 'entry-sel bg-charcoal dark:bg-white text-white dark:text-charcoal shadow-lg'
                          : 'text-stone-500 dark:text-stone-400'
                      }`}
                    >
                      {g === 'h' ? t('createProfile.male') : t('createProfile.female')}
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <label htmlFor="entry-age" className={label}>
                  {t('createProfile.age')}
                </label>
                <input
                  id="entry-age"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={120}
                  className={field}
                  value={form.age || ''}
                  onChange={(e) => setForm({ ...form, age: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>
          <div className="flex-1 min-h-8" />
          <button type="submit" disabled={!canNext} className={primary}>
            {t('entry.continue')} <ArrowRight size={18} strokeWidth={3} />
          </button>
        </form>
      );
    }

    if (step === 2) {
      const last = form.viewingPreference === 'streaming';
      const options = [
        { val: 'streaming' as const, icon: <Tv size={22} />, label: t('createProfile.stream') },
        { val: 'cinema' as const, icon: <Ticket size={22} />, label: t('createProfile.cinema') },
        { val: 'both' as const, icon: <Clapperboard size={22} />, label: t('createProfile.both') },
      ];
      return (
        <div key="p2" className="entry-stagger w-full flex flex-col flex-1">
          <button
            type="button"
            onClick={() => {
              haptics.soft();
              setDir('back');
              setStep(1);
            }}
            className="self-start mb-6 flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-white/10 rounded-full border border-sand dark:border-white/10 shadow-sm active:scale-95 transition-all"
          >
            <ChevronLeft size={16} className="text-charcoal dark:text-white" />
            <span className="text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white">
              {t('common.back')}
            </span>
          </button>
          {steps}
          <h2 className={h2}>{t('entry.watchTitle')}</h2>
          <p className={sub}>{t('entry.watchBody')}</p>
          <div className="mt-6 space-y-6">
            <div className="grid grid-cols-3 gap-2.5">
              {options.map(({ val, icon, label: text }) => (
                <button
                  key={val}
                  type="button"
                  aria-pressed={form.viewingPreference === val}
                  onClick={() => {
                    haptics.medium();
                    setForm({ ...form, viewingPreference: val });
                  }}
                  className={`py-4 px-2 rounded-[1.5rem] border-2 flex flex-col items-center gap-2 transition-colors active:scale-95 ${
                    form.viewingPreference === val
                      ? 'entry-sel bg-forest border-forest text-white shadow-xl shadow-forest/20'
                      : 'bg-white dark:bg-white/5 border-sand dark:border-white/10 text-stone-400 dark:text-stone-500'
                  }`}
                >
                  {icon}
                  <span className="text-[9px] font-black uppercase tracking-widest">{text}</span>
                </button>
              ))}
            </div>
            {form.viewingPreference !== 'cinema' && (
              <div className="entry-pop">
                <span className={label}>{t('createProfile.favPlatforms')}</span>
                <div className="flex flex-wrap gap-2">
                  {PLATFORMS.map((p) => {
                    const on = form.streamingPlatforms.includes(p.id);
                    return (
                      <button
                        key={p.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          haptics.soft();
                          setForm({
                            ...form,
                            streamingPlatforms: on
                              ? form.streamingPlatforms.filter((x) => x !== p.id)
                              : [...form.streamingPlatforms, p.id],
                          });
                        }}
                        className={`px-4 py-2.5 rounded-full border-2 text-xs font-black transition-colors active:scale-95 ${
                          on
                            ? 'entry-sel border-forest bg-forest/10 dark:bg-forest/25 text-charcoal dark:text-white'
                            : 'border-sand dark:border-white/10 bg-white dark:bg-[#161616] text-charcoal dark:text-white'
                        }`}
                      >
                        {p.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
            {!last && (
              <p className="entry-pop text-[11px] font-medium text-stone-400 dark:text-stone-500 ml-1">
                {t('entry.nextCinema')}
              </p>
            )}
          </div>
          <div className="flex-1 min-h-8" />
          {last ? (
            <button type="button" onClick={() => finishProfile()} className={`${forest} entry-pop`}>
              {t('entry.enterApp')} <ArrowRight size={18} strokeWidth={3} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                haptics.medium();
                setDir('fwd');
                setStep(3);
              }}
              className={`${primary} entry-pop`}
            >
              {t('entry.continue')} <ArrowRight size={18} strokeWidth={3} />
            </button>
          )}
        </div>
      );
    }

    // Étape 3 : le cinéma, pour Cinéma ou Les deux.
    const chain = form.cinemaChain;
    const ready = !!chain && (chain !== 'ugc' || !!form.favoriteCinema);
    return (
      <div key="p3" className="entry-stagger w-full flex flex-col flex-1">
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            setDir('back');
            setStep(2);
          }}
          className="self-start mb-6 flex items-center gap-2 px-4 py-2 bg-white/80 dark:bg-white/10 rounded-full border border-sand dark:border-white/10 shadow-sm active:scale-95 transition-all"
        >
          <ChevronLeft size={16} className="text-charcoal dark:text-white" />
          <span className="text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white">
            {t('common.back')}
          </span>
        </button>
        {steps}
        <h2 className={h2}>{t('entry.cinemaTitle')}</h2>
        <p className={sub}>{t('entry.cinemaBody')}</p>
        <div className="mt-6 space-y-5">
          <div>
            <span className={label}>{t('entry.chainLabel')}</span>
            <div className="flex bg-sand dark:bg-white/10 p-1 rounded-2xl">
              {(['ugc', 'pathe', 'other'] as const).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-pressed={chain === c}
                  onClick={() => {
                    haptics.soft();
                    setForm({ ...form, cinemaChain: c });
                  }}
                  className={`flex-1 py-3 rounded-xl text-[11px] font-black transition-colors active:scale-95 ${
                    chain === c
                      ? 'entry-sel bg-charcoal dark:bg-white text-white dark:text-charcoal shadow-lg'
                      : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  {c === 'ugc' ? 'UGC' : c === 'pathe' ? 'Pathé' : t('entry.chainOther')}
                </button>
              ))}
            </div>
          </div>

          {chain === 'ugc' && (
            <div className="entry-pop">
              <label htmlFor="entry-city" className={label}>
                {t('entry.cityLabel')}
              </label>
              <div className="relative">
                <MapPin size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-stone-300 dark:text-stone-600" />
                <input
                  id="entry-city"
                  autoComplete="address-level2"
                  className={`${field} pl-11`}
                  placeholder={t('entry.cityPlaceholder')}
                  value={cityQuery}
                  onChange={(e) => {
                    setCityQuery(e.target.value);
                    setCity(null);
                    setCinemas([]);
                    setForm((f) => ({ ...f, favoriteCinema: undefined }));
                  }}
                />
              </div>
              {cityResults.length === 0 && directoryError && !city && cityQuery.trim().length >= 2 && (
                <p className="entry-pop text-xs font-medium text-stone-400 mt-2 ml-1">{directoryError}</p>
              )}
              {cityResults.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-3">
                  {cityResults.slice(0, 6).map((c, i) => (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => void chooseCity(c)}
                      style={{ animationDelay: `${i * 45}ms` }}
                      className="entry-pop px-4 py-2.5 rounded-full border-2 border-sand dark:border-white/10 bg-white dark:bg-[#161616] text-xs font-black text-charcoal dark:text-white active:scale-95"
                    >
                      {c.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {chain === 'ugc' && city && (
            <div className="entry-pop">
              <span className={label}>{t('entry.favoriteUgc')}</span>
              {cinemasLoading ? (
                <div className="flex justify-center py-6">
                  <Loader2 size={20} className="animate-spin text-stone-400" />
                </div>
              ) : cinemas.length === 0 ? (
                <p className="text-xs font-medium text-stone-400 ml-1">{directoryError || t('entry.noUgc')}</p>
              ) : (
                <div className="space-y-2">
                  {cinemas.slice(0, 8).map((c, i) => {
                    const on = form.favoriteCinema?.id === c.id;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-pressed={on}
                        onClick={() => {
                          haptics.soft();
                          setForm({ ...form, favoriteCinema: { id: c.id, name: c.name, city: city.city } });
                        }}
                        style={{ animationDelay: `${i * 45}ms` }}
                        className={`entry-pop w-full flex items-center gap-3 text-left rounded-2xl border-2 px-4 py-3 transition-colors active:scale-[0.98] ${
                          on
                            ? 'border-forest bg-forest/10 dark:bg-forest/25'
                            : 'border-sand dark:border-white/10 bg-white dark:bg-[#161616]'
                        }`}
                      >
                        <span className="flex-1 min-w-0">
                          <span className="block text-[13px] font-black text-charcoal dark:text-white truncate">{c.name}</span>
                          <span className="block text-[11px] font-medium text-stone-400 truncate">{c.address}</span>
                        </span>
                        {on && <Check size={18} strokeWidth={3} className="entry-sel text-forest dark:text-lime-300 shrink-0" />}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {chain === 'pathe' && (
            <p className="entry-pop text-[11px] font-medium text-stone-400 dark:text-stone-500 ml-1">{t('entry.patheHint')}</p>
          )}
          {chain === 'other' && (
            <p className="entry-pop text-[11px] font-medium text-stone-400 dark:text-stone-500 ml-1">{t('entry.otherHint')}</p>
          )}
        </div>
        <div className="flex-1 min-h-8" />
        <button type="button" onClick={() => finishProfile()} disabled={!ready} className={forest}>
          {t('entry.enterApp')} <ArrowRight size={18} strokeWidth={3} />
        </button>
        {!ready && (
          <button
            type="button"
            onClick={() => finishProfile(true)}
            className="entry-pop mt-3 py-2 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500"
          >
            {t('entry.skipStep')}
          </button>
        )}
      </div>
    );
  };

  // Une page = une clé : la changer rejoue l'entrée de la page, et seulement elle.
  const pageKey = screen === 'profile' ? `profile-${step}` : screen;

  return (
    <div className="min-h-[100dvh] bg-cream dark:bg-[#0c0c0c] flex flex-col relative font-sans selection:bg-forest selection:text-white">
      {/* Le halo déborde : enfermé à part, il ne crée pas de défilement latéral
          que le focus d'un champ viendrait décaler. */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none" aria-hidden="true">
        <div className="absolute top-[-5%] right-[-15%] w-[80vh] h-[80vh] bg-sand dark:bg-white/5 rounded-full blur-[140px] opacity-30" />
      </div>
      {screen !== 'language' && (
        <div
          className="absolute right-6 z-50 flex items-center gap-2"
          style={{ top: 'calc(env(safe-area-inset-top, 0px) + 1.25rem)' }}
        >
          {screen === 'start' && (
            <button
              type="button"
              onClick={() => {
                haptics.soft();
                setLanguage(language === 'fr' ? 'en' : 'fr');
              }}
              aria-label={language === 'fr' ? 'Switch to English' : 'Passer en français'}
              className="w-10 h-10 rounded-2xl border border-sand dark:border-white/10 bg-white dark:bg-[#1a1a1a] text-charcoal dark:text-white text-[10px] font-black tracking-widest flex items-center justify-center shadow-soft dark:shadow-none active:scale-90 transition-all"
            >
              {language === 'fr' ? 'EN' : 'FR'}
            </button>
          )}
          <ThemeToggle />
        </div>
      )}
      <div
        className="flex-1 flex flex-col w-full max-w-md mx-auto px-6 relative z-10"
        style={{
          paddingTop: 'calc(env(safe-area-inset-top, 0px) + 5rem)',
          paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)',
        }}
      >
        <div key={pageKey} className={`flex-1 flex flex-col ${dir === 'back' ? 'entry-in-back' : 'entry-in-fwd'}`}>
          {renderScreen()}
        </div>
      </div>
      {showGuide && (
        <HowItWorksModal
          onClose={() => {
            setShowGuide(false);
            setGuideSeen(true);
            try {
              localStorage.setItem(GUIDE_SEEN_KEY, '1');
            } catch {
              // Stockage indisponible : le guide restera simplement mis en avant.
            }
          }}
        />
      )}
    </div>
  );
};

export default EntryFlow;
