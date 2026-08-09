import React, { useMemo, useRef, useState } from 'react';
import {
  X,
  LogOut,
  SlidersHorizontal,
  Repeat,
  Calendar,
  Scale,
  Timer,
  Fingerprint,
  Mail,
  Film,
  PieChart,
  Download,
  Upload,
  Bell,
  BellOff,
  Send,
  Globe,
  Users,
  ChevronDown,
  Smartphone,
  Compass,
  Settings,
  MessageSquareText,
  Ticket,
  CloudUpload,
} from 'lucide-react';
import { CinemaSubscription, UserProfile } from '../types';
import { formatCurrency } from '../utils/cinemaSubscription';
import { getCinemaProviderBrand } from '../utils/cinemaBrand';
import CinemaSubscriptionArtwork from './CinemaSubscriptionArtwork';
import { createBackup, parseBackup, TheBitterBackup } from '../utils/dataBackup';
import { haptics } from '../utils/haptics';
import { dominantGenre } from '../utils/movieStats';
import HowItWorksModal from './HowItWorksModal';
import { RELEASE_HISTORY } from '../constants/changelog';
import {
  NotificationPrefs,
  getNotificationPrefs,
  saveNotificationPrefs,
  sendTestNotification,
} from '../utils/notifications';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface ProfileModalProps {
  profile: UserProfile;
  session: any | null;
  onClose: () => void;
  onSwitchProfile: () => void;
  onRecalibrate: () => void;
  onImportBackup: (backup: TheBitterBackup) => void;
  onSignOut: () => void;
  onOpenSpaces: () => void;
  onLetterboxdImport?: () => void;
  /** Lance la visite guidée. Absent, le bouton correspondant n'est pas rendu. */
  onReplayTour?: () => void;
  /**
   * Ouvre le formulaire de retour. Déplacé du header vers les paramètres pour
   * dégager de la place en haut de l'écran.
   */
  onSendFeedback?: () => void;
  /** Email du compte connecté, absent si personne ne l'est. */
  accountEmail?: string | null;
  /** Vrai dès qu'une session existe, y compris sans email. */
  isSignedIn?: boolean;
  /** Films pas encore sauvegardés en ligne, affichés en pastille. */
  pendingSyncCount?: number;
  onOpenAccountSync?: () => void;
  /** Abonnement cinéma actif, pour afficher le résumé dans les paramètres. */
  cinemaSubscription?: CinemaSubscription;
  onManageCinemaSubscription?: () => void;
}

const ARCHETYPE_ICONS: Record<string, string> = {
  'Le Déchiffreur': '🔍',
  "L'Éponge Émotionnelle": '🥀',
  "L'Hédoniste": '🍿',
  "L'Esthète": '👁️',
  "L'Adrénaline Junkie": '🎢',
  'Le Stratège Noir': '🕵️',
  'Le Romantique Visionnaire': '🌅',
  'Le Philosophe Sensible': '🎭',
  "L'Omnivore": '🌍',
};

const NOTIF_KEYS: Array<{ key: keyof NotificationPrefs; translationKey: string; emoji: string }> = [
  { key: 'streak', translationKey: 'notif.streak', emoji: '🔥' },
  { key: 'weekly', translationKey: 'notif.weekly', emoji: '📅' },
  { key: 'unrated', translationKey: 'notif.unrated', emoji: '🎬' },
  { key: 'monthly', translationKey: 'notif.monthly', emoji: '📊' },
];

const ProfileModal: React.FC<ProfileModalProps> = ({
  profile,
  session,
  onClose,
  onSwitchProfile,
  onRecalibrate,
  onImportBackup,
  onSignOut,
  onOpenSpaces,
  onLetterboxdImport,
  onReplayTour,
  onSendFeedback,
  accountEmail,
  isSignedIn = false,
  pendingSyncCount = 0,
  onOpenAccountSync,
  cinemaSubscription,
  onManageCinemaSubscription,
}) => {
  const { t, language, setLanguage } = useLanguage();
  const dialog = useDialog(onClose, t('profileModal.title'));
  const initial = profile.firstName?.[0]?.toUpperCase() || '?';
  const cinemaBrand = cinemaSubscription?.active
    ? getCinemaProviderBrand(cinemaSubscription.provider)
    : null;
  const [notifPrefs, setNotifPrefs] = useState<NotificationPrefs>(getNotificationPrefs);
  const [testSent, setTestSent] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Session ouverte mais sans email : le compte ne survit pas à ce navigateur. */
  const isAnonymousAccount = isSignedIn && !accountEmail;
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const importInputRef = useRef<HTMLInputElement>(null);

  const locale = language === 'en' ? 'en-US' : 'fr-FR';
  const joinDate = new Date(profile.createdAt).toLocaleDateString(locale, {
    month: 'long',
    year: 'numeric',
  });
  const email = session?.user?.email;

  const handleToggleNotif = (key: keyof NotificationPrefs) => {
    haptics.soft();
    const updated = { ...notifPrefs, [key]: !notifPrefs[key] };
    setNotifPrefs(updated);
    saveNotificationPrefs(updated);
  };

  const handleTestNotif = () => {
    haptics.medium();
    sendTestNotification(profile.movies);
    setTestSent(true);
    setTimeout(() => setTestSent(false), 3000);
  };

  const handleExport = () => {
    haptics.success();
    const data = createBackup(profile);
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `the-bitter-${profile.firstName?.toLowerCase() || 'export'}-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleImportFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Permet de sélectionner à nouveau le même fichier après une annulation ou une erreur.
    event.target.value = '';
    if (!file) return;

    try {
      const backup = parseBackup(JSON.parse(await file.text()));
      if (!backup) throw new Error('invalid-backup');

      const confirmed = window.confirm(t('profileModal.importConfirm', { name: backup.profile.firstName }));
      if (!confirmed) return;

      haptics.success();
      window.alert(t('profileModal.importSuccess'));
      onImportBackup(backup);
    } catch {
      haptics.error();
      window.alert(t('profileModal.importError'));
    }
  };

  const stats = useMemo(() => {
    const watched = profile.movies.filter((m) => m.status === 'watched');
    return { watchedCount: watched.length, dominantGenre: dominantGenre(watched) ?? '-' };
  }, [profile.movies]);

  const archetypeIcon = profile.role ? ARCHETYPE_ICONS[profile.role] : null;
  const archetypeDesc = profile.role ? t(`archetype.${profile.role}`) : null;
  const isArchetypeConfirmed = stats.watchedCount >= 10;

  return (
    <div {...dialog.props} className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center p-0 sm:p-6">
      <div
        className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
        onClick={onClose}
      />

      <div className="relative z-10 bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20">
        {/* Drag Handle */}
        <div
          className="w-full flex justify-center pt-3 pb-1 bg-white dark:bg-[#1a1a1a] cursor-grab active:cursor-grabbing"
          onClick={onClose}
        >
          <div className="w-12 h-1.5 bg-stone-200 dark:bg-stone-700 rounded-full" />
        </div>

        {/* Header */}
        <div className="px-6 pb-4 border-b border-sand dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#1a1a1a]">
          <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white">
            {t('profileModal.title')}
          </h2>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-8 no-scrollbar bg-cream dark:bg-[#0c0c0c]">
          {/* SECTION 1: IDENTITY */}
          <div className="flex items-center gap-5">
            <div className="w-20 h-20 bg-forest text-white rounded-[2rem] flex items-center justify-center text-3xl font-black shadow-xl shadow-forest/20 shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-black text-charcoal dark:text-white tracking-tight leading-none mb-2 truncate">
                {profile.firstName} {profile.lastName}
              </h1>
              <div className="flex flex-col gap-1.5">
                {email ? (
                  <div className="flex items-center gap-1.5 text-stone-400 dark:text-stone-500">
                    <Mail size={12} />
                    <span className="text-[10px] font-bold truncate">{email}</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-orange-400">
                    <Fingerprint size={12} />
                    <span className="text-[10px] font-bold uppercase tracking-wide">
                      {t('profileModal.guest')}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1.5 text-stone-400 dark:text-stone-500">
                  <Calendar size={12} />
                  <span className="text-[10px] font-medium">
                    {t('profileModal.memberSince', { date: joinDate })}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* SECTION 2: ARCHETYPE */}
          {profile.role && archetypeIcon && archetypeDesc && (
            <div className="bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 shadow-sm border border-sand dark:border-white/5 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-forest/5 rounded-full -translate-y-1/2 translate-x-1/2 pointer-events-none" />
              <div className="flex items-start gap-4 relative z-10">
                <div className="text-4xl bg-stone-50 dark:bg-[#252525] w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner">
                  {archetypeIcon}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h3 className="text-lg font-black text-charcoal dark:text-white leading-none">
                      {profile.role}
                    </h3>
                    <span
                      className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${isArchetypeConfirmed ? 'bg-forest/10 text-forest dark:text-lime-500' : 'bg-stone-100 text-stone-400 dark:bg-stone-800'}`}
                    >
                      {isArchetypeConfirmed ? t('profileModal.confirmed') : t('profileModal.provisional')}
                    </span>
                  </div>
                  <p className="text-xs font-medium text-stone-500 dark:text-stone-400 italic leading-relaxed">
                    "{archetypeDesc}"
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* SECTION 3: STATS GRID */}
          <div className="grid grid-cols-2 gap-3">
            <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-[1.8rem] border border-sand dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-stone-400 dark:text-stone-500">
                <Film size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">{t('profileModal.watched')}</span>
              </div>
              <span className="text-3xl font-black text-charcoal dark:text-white">
                {stats.watchedCount}
              </span>
            </div>
            <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-[1.8rem] border border-sand dark:border-white/5 shadow-sm">
              <div className="flex items-center gap-2 mb-2 text-stone-400 dark:text-stone-500">
                <PieChart size={14} />
                <span className="text-[9px] font-black uppercase tracking-widest">{t('profileModal.genre')}</span>
              </div>
              <span className="text-xl font-black text-charcoal dark:text-white truncate block">
                {stats.dominantGenre}
              </span>
            </div>
          </div>

          {/* SECTION 4: CALIBRATION */}
          <div data-tour="profile-calibration">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 ml-1">
                {t('profileModal.calibration')}
              </h3>
              <button
                onClick={() => { haptics.soft(); onRecalibrate(); }}
                className="text-[9px] font-black uppercase tracking-widest text-forest dark:text-lime-500 hover:opacity-80 transition-opacity flex items-center gap-1"
              >
                <SlidersHorizontal size={12} /> {t('profileModal.recalibrate')}
              </button>
            </div>

            <div className="space-y-3">
              <div className="bg-stone-50 dark:bg-[#1a1a1a] p-4 rounded-[1.5rem] border border-stone-100 dark:border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 text-stone-400 dark:text-stone-500">
                    <Scale size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">
                      {t('profileModal.exigence')}
                    </span>
                  </div>
                  <span className="text-[9px] font-bold text-charcoal dark:text-white">
                    {profile.severityIndex}/10
                  </span>
                </div>
                <div className="h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-charcoal dark:bg-white"
                    style={{ width: `${(profile.severityIndex || 5) * 10}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[8px] font-bold text-stone-300 dark:text-stone-600 uppercase tracking-wider">
                  <span>{t('profileModal.lenient')}</span>
                  <span>{t('profileModal.harsh')}</span>
                </div>
              </div>

              <div className="bg-stone-50 dark:bg-[#1a1a1a] p-4 rounded-[1.5rem] border border-stone-100 dark:border-white/5">
                <div className="flex justify-between items-center mb-2">
                  <div className="flex items-center gap-2 text-stone-400 dark:text-stone-500">
                    <Timer size={14} />
                    <span className="text-[9px] font-black uppercase tracking-widest">{t('profileModal.rhythm')}</span>
                  </div>
                  <span className="text-[9px] font-bold text-charcoal dark:text-white">
                    {profile.patienceLevel}/10
                  </span>
                </div>
                <div className="h-1.5 bg-stone-200 dark:bg-stone-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-charcoal dark:bg-white"
                    style={{ width: `${(profile.patienceLevel || 5) * 10}%` }}
                  />
                </div>
                <div className="flex justify-between mt-1 text-[8px] font-bold text-stone-300 dark:text-stone-600 uppercase tracking-wider">
                  <span>{t('profileModal.contemplative')}</span>
                  <span>{t('profileModal.intense')}</span>
                </div>
              </div>
            </div>

            {profile.favoriteGenres && profile.favoriteGenres.length > 0 && (
              <div className="mt-4 flex flex-wrap gap-2">
                {profile.favoriteGenres.map((g) => (
                  <span
                    key={g}
                    className="px-3 py-1.5 bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/5 rounded-lg text-[9px] font-black uppercase tracking-wide text-stone-500 dark:text-stone-400"
                  >
                    {g}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* SECTION 5: LANGUAGE */}
          <div>
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 ml-1 mb-4">
              {t('profileModal.language')}
            </h3>
            <div className="flex bg-stone-100 dark:bg-[#1a1a1a] p-1.5 rounded-2xl border border-stone-200/50 dark:border-white/5">
              <button
                onClick={() => { haptics.soft(); setLanguage('fr'); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${language === 'fr' ? 'bg-white dark:bg-[#252525] text-charcoal dark:text-white shadow-sm' : 'text-stone-400 dark:text-stone-600'}`}
              >
                <span className="text-base leading-none">🇫🇷</span> Français
              </button>
              <button
                onClick={() => { haptics.soft(); setLanguage('en'); }}
                className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${language === 'en' ? 'bg-white dark:bg-[#252525] text-charcoal dark:text-white shadow-sm' : 'text-stone-400 dark:text-stone-600'}`}
              >
                <span className="text-base leading-none">🇬🇧</span> English
              </button>
            </div>
          </div>

          {/* SECTION 6: NOTIFICATIONS (accordéon) */}
          <div
            data-tour="profile-notifications"
            className="bg-stone-50 dark:bg-[#1a1a1a] rounded-[1.5rem] border border-stone-100 dark:border-white/5 overflow-hidden"
          >
            {/* Le bouton « notif test » est un frère du bouton d'accordéon :
                un <button> dans un <button> est du HTML invalide et casse le clavier */}
            <div className="w-full flex items-center justify-between px-4 py-3.5 transition-colors hover:bg-stone-100 dark:hover:bg-white/5">
              <button
                onClick={() => setNotifOpen(o => !o)}
                aria-expanded={notifOpen}
                className="flex items-center gap-3 flex-1 text-left"
              >
                <Bell size={15} className="text-stone-400 dark:text-stone-500" />
                <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
                  {t('profileModal.notifications')}
                </span>
              </button>
              <div className="flex items-center gap-2">
                {/* Outil de debug : pas dans la build de production */}
                {import.meta.env.DEV && (
                  <button
                    onClick={handleTestNotif}
                    className="text-[9px] font-black uppercase tracking-widest text-forest dark:text-lime-500 hover:opacity-80 transition-opacity flex items-center gap-1"
                  >
                    <Send size={11} />
                    {testSent ? t('profileModal.sent') : t('profileModal.testNotif')}
                  </button>
                )}
                <button
                  onClick={() => setNotifOpen(o => !o)}
                  aria-expanded={notifOpen}
                  aria-label={t('profileModal.notifications')}
                  className="p-0.5"
                >
                  <ChevronDown size={14} className={`text-stone-400 transition-transform duration-200 ${notifOpen ? 'rotate-180' : ''}`} />
                </button>
              </div>
            </div>

            {notifOpen && (
              <div className="px-3 pb-3 space-y-1.5 border-t border-stone-100 dark:border-white/5 pt-2">
                {NOTIF_KEYS.map(({ key, translationKey, emoji }) => (
                  <div
                    key={key}
                    className="px-3 py-2.5 rounded-xl flex items-center justify-between"
                  >
                    <div className="flex items-center gap-2.5">
                      <span className="text-sm leading-none">{emoji}</span>
                      <span className="text-xs font-semibold text-charcoal dark:text-stone-300">
                        {t(translationKey)}
                      </span>
                    </div>
                    <button
                      onClick={() => handleToggleNotif(key)}
                      className={`w-10 h-6 rounded-full transition-colors shrink-0 relative ${
                        notifPrefs[key] ? 'bg-forest dark:bg-lime-500' : 'bg-stone-200 dark:bg-stone-700'
                      }`}
                    >
                      <span
                        className={`absolute top-0.5 w-5 h-5 bg-white rounded-full shadow transition-all ${
                          notifPrefs[key] ? 'left-[18px]' : 'left-0.5'
                        }`}
                      />
                    </button>
                  </div>
                ))}
                {'Notification' in window && Notification.permission === 'denied' && (
                  <p className="pt-1 text-[10px] text-orange-400 font-medium ml-1 flex items-center gap-1.5">
                    <BellOff size={11} /> {t('profileModal.notifBlocked')}
                  </p>
                )}
                {'Notification' in window && Notification.permission === 'default' && (
                  <button
                    onClick={() => Notification.requestPermission()}
                    className="pt-1 text-[10px] font-black uppercase tracking-widest text-forest dark:text-lime-500 hover:opacity-80 transition-opacity flex items-center gap-1.5 ml-1"
                  >
                    <Bell size={11} /> {t('profileModal.allowNotif')}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* SECTION 7 : PARAMÈTRES (repliable) */}
          <div className="pt-4 border-t border-sand dark:border-white/5">
            <button
              onClick={() => { haptics.soft(); setSettingsOpen((o) => !o); }}
              aria-expanded={settingsOpen}
              className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform">
                  <Settings size={14} />
                </div>
                <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
                  {t('profileModal.settings')}
                </span>
              </div>
              <ChevronDown
                size={16}
                className={`text-stone-400 dark:text-stone-500 transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
              />
            </button>

            <div className={`space-y-1 ${settingsOpen ? 'pt-1 animate-[fadeIn_0.25s_ease-out]' : 'hidden'}`}>

            {onSendFeedback && (
              <button
                onClick={() => { haptics.soft(); onSendFeedback(); }}
                className={`w-full flex items-center justify-between p-4 rounded-2xl border transition-colors group ${cinemaBrand ? cinemaBrand.choiceClass : 'border-transparent hover:bg-stone-50 dark:hover:bg-[#161616]'}`}
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform">
                    <MessageSquareText size={14} />
                  </div>
                  <div className="text-left">
                    <span className="block text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
                      {t('nav.feedback')}
                    </span>
                    <span className="block text-[9px] font-bold text-stone-400 dark:text-stone-500 mt-0.5">
                      {t('profileModal.feedbackDesc')}
                    </span>
                  </div>
                </div>
              </button>
            )}

            {session && (
              <button
                onClick={() => { haptics.medium(); onOpenSpaces(); }}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-forest/5 dark:bg-lime-400/5 hover:bg-forest/10 dark:hover:bg-lime-400/10 border border-forest/20 dark:border-lime-400/20 transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-forest/10 dark:bg-lime-400/10 flex items-center justify-center text-forest dark:text-lime-400 group-hover:scale-110 transition-transform">
                    <Users size={14} />
                  </div>
                  <div className="text-left">
                    <span className="text-xs font-black uppercase tracking-wide text-forest dark:text-lime-400 block">
                      {t('profileModal.spaces')}
                    </span>
                    <span className="text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                      {t('profileModal.spacesDesc')}
                    </span>
                  </div>
                </div>
                <ChevronDown size={14} className="text-forest dark:text-lime-400 -rotate-90" />
              </button>
            )}

            <button
              onClick={() => { haptics.soft(); onSwitchProfile(); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform">
                  <Repeat size={14} />
                </div>
                <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
                  {t('profileModal.switchProfile')}
                </span>
              </div>
            </button>

            {onOpenAccountSync && (
              <button
                onClick={() => { haptics.soft(); onOpenAccountSync(); }}
                className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform shrink-0">
                    <CloudUpload size={14} />
                  </div>
                  <div className="text-left min-w-0">
                    <span className="block text-xs font-black uppercase tracking-wide text-charcoal dark:text-white truncate">
                      {t('accountSync.entry')}
                    </span>
                    {/* L'état du compte doit se lire ici, sans ouvrir la fenêtre :
                        ne pas savoir si on est connecté fait créer des comptes en
                        double et croit-on sauvegarder alors qu'il n'en est rien. */}
                    <span
                      className={`block text-[9px] font-bold mt-0.5 truncate ${
                        isAnonymousAccount
                          ? 'text-orange-400'
                          : 'text-stone-400 dark:text-stone-500'
                      }`}
                    >
                      {isAnonymousAccount
                        ? t('accountSync.entryAnonymous')
                        : accountEmail
                          ? accountEmail
                          : t('accountSync.entryOffline')}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-2">
                  {pendingSyncCount > 0 && isSignedIn && (
                    <span className="min-w-[1.5rem] h-6 px-2 rounded-full bg-forest dark:bg-bitter-lime text-white dark:text-charcoal text-[10px] font-black flex items-center justify-center">
                      {pendingSyncCount}
                    </span>
                  )}
                  <span
                    className={`w-2 h-2 rounded-full ${
                      isAnonymousAccount
                        ? 'bg-orange-400'
                        : isSignedIn
                          ? 'bg-forest dark:bg-bitter-lime'
                          : 'bg-stone-300 dark:bg-stone-600'
                    }`}
                  />
                </div>
              </button>
            )}

            {onManageCinemaSubscription && (
              <button
                onClick={() => { haptics.soft(); onManageCinemaSubscription(); }}
                className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
              >
                <div className="flex items-center gap-4 min-w-0">
                  {cinemaSubscription?.active ? (
                    <CinemaSubscriptionArtwork provider={cinemaSubscription.provider} size="compact" />
                  ) : (
                    <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform shrink-0">
                      <Ticket size={14} />
                    </div>
                  )}
                  <div className="text-left min-w-0">
                    <span className={`block text-xs font-black uppercase tracking-wide truncate ${cinemaBrand ? cinemaBrand.titleClass : 'text-charcoal dark:text-white'}`}>
                      {cinemaSubscription?.active
                        ? cinemaSubscription.name
                        : t('cinemaSub.profile.title')}
                    </span>
                    <span className={`block text-[9px] font-bold mt-0.5 truncate ${cinemaBrand ? cinemaBrand.mutedTextClass : 'text-stone-400 dark:text-stone-500'}`}>
                      {cinemaSubscription?.active
                        ? `${formatCurrency(cinemaSubscription.monthlyPrice, language)} ${t('cinemaSub.perMonth')}`
                        : t('cinemaSub.profile.sub')}
                    </span>
                  </div>
                </div>
                <span className={`text-[9px] font-black uppercase tracking-widest shrink-0 ml-2 ${cinemaBrand ? cinemaBrand.actionTextClass : 'text-forest dark:text-lime-500'}`}>
                  {cinemaSubscription?.active
                    ? t('cinemaSub.profile.edit')
                    : t('cinemaSub.profile.configure')}
                </span>
              </button>
            )}

            <button
              onClick={() => {
                haptics.soft();
                setShowHowItWorks(true);
              }}
              className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform">
                  <Smartphone size={14} />
                </div>
                <div className="text-left">
                  <span className="block text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
                    {t('howItWorks.title')}
                  </span>
                  <span className="block text-[9px] font-bold text-stone-400 dark:text-stone-500 mt-0.5">
                    {t('howItWorks.subtitle')}
                  </span>
                </div>
              </div>
            </button>

            <input
              ref={importInputRef}
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />
            <button
              onClick={() => { haptics.soft(); importInputRef.current?.click(); }}
              className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform">
                  <Upload size={14} />
                </div>
                <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
                  {t('profileModal.import')}
                </span>
              </div>
            </button>

            <button
              data-tour="profile-export"
              onClick={handleExport}
              className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
            >
              <div className="flex items-center gap-4">
                <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform">
                  <Download size={14} />
                </div>
                <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
                  {t('profileModal.export')}
                </span>
              </div>
            </button>

            {onReplayTour && (
              <button
                onClick={() => { haptics.soft(); onReplayTour(); }}
                className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform">
                    <Compass size={14} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
                    {t('profileModal.replayTour')}
                  </span>
                </div>
              </button>
            )}

            {onLetterboxdImport && (
              <button
                onClick={() => { haptics.soft(); onLetterboxdImport(); }}
                className="w-full flex items-center gap-4 p-4 rounded-2xl bg-[#00d735]/10 hover:bg-[#00d735]/20 border border-[#00d735]/30 transition-colors group"
              >
                <img
                  src="/icons/letterboxd.jpeg"
                  alt="Letterboxd"
                  className="w-8 h-8 rounded-lg shrink-0 group-hover:scale-105 transition-transform shadow-sm"
                />
                <div className="text-left">
                  <span className="text-xs font-black uppercase tracking-wide text-charcoal dark:text-white block">
                    Importer depuis Letterboxd
                  </span>
                  <span className="text-[10px] text-stone-400 dark:text-stone-500 font-medium">
                    Importe ton watched.csv
                  </span>
                </div>
              </button>
            )}

            {session && (
              <button
                onClick={() => { haptics.medium(); onSignOut(); }}
                className="w-full flex items-center justify-between p-4 rounded-2xl hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors group mt-2"
              >
                <div className="flex items-center gap-4">
                  <div className="w-8 h-8 rounded-full bg-red-50 dark:bg-red-900/20 flex items-center justify-center text-red-500 group-hover:scale-110 transition-transform">
                    <LogOut size={14} />
                  </div>
                  <span className="text-xs font-black uppercase tracking-wide text-red-500">
                    {t('profileModal.signOut')}
                  </span>
                </div>
              </button>
            )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-stone-50 dark:bg-[#0a0a0a] text-center border-t border-sand dark:border-white/5">
          <p className="text-[8px] font-black text-stone-300 dark:text-stone-700 uppercase tracking-[0.3em]">
            The Bitter {RELEASE_HISTORY[0].version}
          </p>
        </div>
      </div>

      {showHowItWorks && <HowItWorksModal onClose={() => setShowHowItWorks(false)} />}
    </div>
  );
};

export default ProfileModal;
