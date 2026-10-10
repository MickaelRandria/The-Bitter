import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  BarChart3,
  Bell,
  CalendarDays,
  Check,
  Cloud,
  Compass,
  Download,
  Send,
  Ticket,
  Tv,
  Users,
  X,
} from 'lucide-react';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import {
  detectPlatform,
  isInstallPromptAvailable,
  isIOSSafari,
  isStandalone,
  onInstallPromptChange,
  Platform,
  promptInstall,
} from '../utils/pwaInstall';

interface HowItWorksModalProps {
  onClose: () => void;
}

const TOTAL_SLIDES = 4;
const SWIPE_THRESHOLD = 60;

/** Exemple de note, pour montrer la grille sans inventer les films de l'utilisateur. */
const SAMPLE_CRITERIA: { key: string; value: number }[] = [
  { key: 'criteria.story', value: 8.5 },
  { key: 'criteria.visuals', value: 9 },
  { key: 'criteria.acting', value: 7.5 },
  { key: 'criteria.sound', value: 8 },
];

/**
 * « Comment ça marche », depuis l'accueil et le profil.
 *
 * Quatre pages, dans l'ordre où l'on découvre l'app : ce qu'on y fait (noter),
 * avec qui (les proches), où tout se trouve, puis l'installation et les
 * notifications. Le compte étant désormais obligatoire, il n'y a plus de mise en
 * garde sur le stockage local : les films suivent le compte.
 */
const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('howItWorks.title'));

  const [slide, setSlide] = useState(0);
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd');
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [tab, setTab] = useState<Platform>('ios');
  const [canPrompt, setCanPrompt] = useState(false);
  const [installed, setInstalled] = useState(false);
  const touchStartX = useRef<number | null>(null);

  useEffect(() => {
    const detected = detectPlatform();
    setPlatform(detected);
    setTab(detected === 'desktop' ? 'ios' : detected);
    setInstalled(isStandalone());
    setCanPrompt(isInstallPromptAvailable());
    return onInstallPromptChange(setCanPrompt);
  }, []);

  const goTo = (next: number) => {
    if (next < 0 || next > TOTAL_SLIDES - 1 || next === slide) return;
    haptics.soft();
    setDir(next > slide ? 'fwd' : 'back');
    setSlide(next);
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const delta = e.changedTouches[0].clientX - touchStartX.current;
    if (delta < -SWIPE_THRESHOLD) goTo(slide + 1);
    else if (delta > SWIPE_THRESHOLD) goTo(slide - 1);
    touchStartX.current = null;
  };

  const handleInstall = async () => {
    haptics.medium();
    const accepted = await promptInstall();
    if (accepted) setInstalled(true);
  };

  const eyebrow =
    'self-start inline-flex items-center gap-2 px-3 py-1 rounded-full bg-forest/10 dark:bg-lime-400/10 text-forest dark:text-lime-300 text-[9px] font-black uppercase tracking-[0.2em]';
  const title = 'text-[2.4rem] leading-[0.95] font-black tracking-tighter text-charcoal dark:text-white';
  const accent = 'text-forest dark:text-lime-300';
  const lead = 'text-sm font-medium text-stone-500 dark:text-stone-400 leading-relaxed';
  const card = 'rounded-[1.5rem] bg-white dark:bg-[#161616] border border-sand dark:border-white/10';

  const feature = (Icon: typeof Users, titleKey: string, bodyKey: string) => (
    <div key={titleKey} className={`${card} flex gap-3.5 items-start p-4`}>
      <span className="w-10 h-10 rounded-2xl bg-forest text-white dark:bg-lime-400 dark:text-charcoal flex items-center justify-center shrink-0">
        <Icon size={18} strokeWidth={2.2} />
      </span>
      <span className="min-w-0">
        <span className="block text-[13px] font-black text-charcoal dark:text-white leading-tight">{t(titleKey)}</span>
        <span className="block text-[12px] font-medium text-stone-500 dark:text-stone-400 leading-snug mt-1">
          {t(bodyKey)}
        </span>
      </span>
    </div>
  );

  const renderSlide = () => {
    if (slide === 0) {
      const average = SAMPLE_CRITERIA.reduce((sum, c) => sum + c.value, 0) / SAMPLE_CRITERIA.length;
      return (
        <div className="entry-stagger flex flex-col gap-5">
          <span className={eyebrow}>{t('howItWorks.s1.badge')}</span>
          <h2 className={title}>
            {t('howItWorks.s1.title1')}
            <br />
            <span className={accent}>{t('howItWorks.s1.title2')}</span>
          </h2>
          <p className={lead}>{t('howItWorks.s1.desc')}</p>
          {/* Une vraie grille Bitter+, sur un exemple : c'est ce qu'on remplit à chaque film. */}
          <div className={`${card} p-5`} aria-hidden="true">
            <div className="flex items-center justify-between mb-4">
              <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
                {t('howItWorks.s1.sample')}
              </span>
              <span className="text-3xl font-black tracking-tighter text-charcoal dark:text-white tabular-nums">
                {average.toFixed(1)}
              </span>
            </div>
            <div className="space-y-3">
              {SAMPLE_CRITERIA.map((c, i) => (
                <div key={c.key} className="flex items-center gap-3">
                  <span className="w-16 text-[11px] font-black text-stone-500 dark:text-stone-400">{t(c.key)}</span>
                  <span className="relative flex-1 h-2 rounded-full bg-sand dark:bg-white/10 overflow-hidden">
                    <span
                      className="entry-fill absolute inset-y-0 left-0 rounded-full bg-forest dark:bg-lime-400"
                      style={{ width: `${c.value * 10}%`, animationDelay: `${250 + i * 90}ms` }}
                    />
                  </span>
                  <span className="w-7 text-right text-[11px] font-black text-charcoal dark:text-white tabular-nums">
                    {c.value}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <p className="text-sm font-bold text-charcoal dark:text-white leading-relaxed border-l-2 border-forest dark:border-lime-400 pl-4">
            {t('howItWorks.s1.quote')}
          </p>
        </div>
      );
    }

    if (slide === 1) {
      return (
        <div className="entry-stagger flex flex-col gap-4">
          <span className={eyebrow}>{t('howItWorks.s2.badge')}</span>
          <h2 className={title}>
            {t('howItWorks.s2.title1')}
            <br />
            <span className={accent}>{t('howItWorks.s2.title2')}</span>
          </h2>
          <p className={lead}>{t('howItWorks.s2.desc')}</p>
          {feature(Users, 'howItWorks.s2.spacesTitle', 'howItWorks.s2.spacesBody')}
          {feature(Send, 'howItWorks.s2.watchWithTitle', 'howItWorks.s2.watchWithBody')}
          {feature(Ticket, 'howItWorks.s2.screeningTitle', 'howItWorks.s2.screeningBody')}
        </div>
      );
    }

    if (slide === 2) {
      const tiles: { icon: typeof Users; key: string }[] = [
        { icon: Compass, key: 'discover' },
        { icon: CalendarDays, key: 'calendar' },
        { icon: Tv, key: 'series' },
        { icon: BarChart3, key: 'stats' },
      ];
      return (
        <div className="entry-stagger flex flex-col gap-5">
          <span className={eyebrow}>{t('howItWorks.s3.badge')}</span>
          <h2 className={title}>
            {t('howItWorks.s3.title1')}
            <br />
            <span className={accent}>{t('howItWorks.s3.title2')}</span>
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {tiles.map(({ icon: Icon, key }) => (
              <div key={key} className={`${card} p-4 flex flex-col gap-3`}>
                <span className="w-9 h-9 rounded-xl bg-sand dark:bg-white/10 text-charcoal dark:text-white flex items-center justify-center">
                  <Icon size={17} strokeWidth={2.2} />
                </span>
                <span>
                  <span className="block text-[13px] font-black text-charcoal dark:text-white leading-tight">
                    {t(`howItWorks.s3.${key}Title`)}
                  </span>
                  <span className="block text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-snug mt-1">
                    {t(`howItWorks.s3.${key}Body`)}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <div className="flex items-start gap-3 rounded-[1.5rem] bg-forest/10 dark:bg-lime-400/10 p-4">
            <Cloud size={17} className="text-forest dark:text-lime-300 shrink-0 mt-0.5" />
            <p className="text-[12px] font-bold text-charcoal dark:text-white leading-snug">{t('howItWorks.s3.account')}</p>
          </div>
        </div>
      );
    }

    // Installation et notifications.
    const steps = tab === 'ios' ? ['howItWorks.s4.ios1', 'howItWorks.s4.ios2', 'howItWorks.s4.ios3'] : ['howItWorks.s4.android1', 'howItWorks.s4.android2', 'howItWorks.s4.android3'];
    return (
      <div className="entry-stagger flex flex-col gap-5">
        <span className={eyebrow}>{t('howItWorks.s4.badge')}</span>
        <h2 className={title}>
          {t('howItWorks.s4.title1')}
          <br />
          <span className={accent}>{t('howItWorks.s4.title2')}</span>
        </h2>
        <p className={lead}>{t('howItWorks.s4.desc')}</p>

        {installed ? (
          <div className="flex items-center gap-3 rounded-[1.5rem] bg-forest/10 dark:bg-lime-400/10 p-5">
            <Check size={18} className="text-forest dark:text-lime-300 shrink-0" strokeWidth={3} />
            <p className="text-xs font-black uppercase tracking-wide text-forest dark:text-lime-300">
              {t('howItWorks.s4.alreadyInstalled')}
            </p>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex gap-1 p-1 rounded-2xl bg-sand dark:bg-white/10">
              {(['ios', 'android'] as Platform[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => {
                    haptics.soft();
                    setTab(p);
                  }}
                  aria-pressed={tab === p}
                  className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-colors active:scale-95 ${
                    tab === p ? 'entry-sel bg-charcoal dark:bg-white text-white dark:text-charcoal shadow-lg' : 'text-stone-500 dark:text-stone-400'
                  }`}
                >
                  {p === 'ios' ? t('howItWorks.ios') : t('howItWorks.android')}
                  {platform === p && ` · ${t('howItWorks.yourDevice')}`}
                </button>
              ))}
            </div>
            <ol key={tab} className={`${card} p-4 space-y-3`}>
              {steps.map((key, i) => (
                <li
                  key={key}
                  className="entry-pop flex items-start gap-3 text-[13px] font-medium text-charcoal dark:text-stone-200 leading-snug"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <span className="w-6 h-6 rounded-full bg-charcoal dark:bg-white text-white dark:text-charcoal text-[11px] font-black flex items-center justify-center shrink-0">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{t(key)}</span>
                </li>
              ))}
            </ol>
            {tab === 'ios' && platform === 'ios' && !isIOSSafari() && (
              <p className="entry-pop text-[11px] font-bold text-red-500 leading-relaxed">{t('howItWorks.iosSafariOnly')}</p>
            )}
            {canPrompt && (
              <button
                type="button"
                onClick={handleInstall}
                className="w-full bg-forest text-white py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-forest/20 flex items-center justify-center gap-2"
              >
                <Download size={15} strokeWidth={2.5} /> {t('howItWorks.installNow')}
              </button>
            )}
          </div>
        )}

        <div className="flex items-start gap-3 rounded-[1.5rem] bg-lime-400/20 dark:bg-lime-400/10 p-4">
          <Bell size={17} className="text-charcoal dark:text-lime-300 shrink-0 mt-0.5" />
          <p className="text-[12px] font-bold text-charcoal dark:text-white leading-snug">{t('howItWorks.s4.notifs')}</p>
        </div>
      </div>
    );
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/80 backdrop-blur-xl animate-[fadeIn_0.25s_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative w-full h-[100dvh] sm:h-auto sm:max-h-[88vh] sm:max-w-md bg-cream dark:bg-[#0c0c0c] sm:rounded-[2.5rem] sm:border border-sand dark:border-white/10 shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* En-tête : progression + fermer */}
        <div
          className="relative z-10 flex items-center justify-between px-7 pb-5 shrink-0"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 1.5rem)' }}
        >
          <div className="flex items-center gap-1.5" role="tablist" aria-label={t('howItWorks.title')}>
            {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
              <button
                key={i}
                type="button"
                role="tab"
                aria-selected={slide === i}
                aria-label={`${i + 1} / ${TOTAL_SLIDES}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  slide === i ? 'w-8 bg-forest dark:bg-lime-400' : 'w-3 bg-sand dark:bg-white/15'
                }`}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-9 h-9 rounded-full bg-white dark:bg-white/10 border border-sand dark:border-white/10 text-charcoal dark:text-white flex items-center justify-center active:scale-90 transition-all"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* Page courante : une clé par page, pour rejouer son entrée */}
        <div
          className="relative z-10 flex-1 min-h-0 overflow-y-auto no-scrollbar px-7 pb-4"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={handleTouchEnd}
        >
          <div key={slide} className={dir === 'back' ? 'entry-in-back' : 'entry-in-fwd'}>
            {renderSlide()}
          </div>
        </div>

        {/* Navigation */}
        <div
          className="relative z-10 shrink-0 px-7 pt-3 flex items-center gap-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 1.5rem)' }}
        >
          {slide > 0 && (
            <button
              type="button"
              onClick={() => goTo(slide - 1)}
              aria-label={t('common.back')}
              className="w-14 h-14 shrink-0 rounded-2xl border-2 border-sand dark:border-white/10 bg-white dark:bg-white/5 text-charcoal dark:text-white flex items-center justify-center active:scale-90 transition-all"
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
          )}
          {slide < TOTAL_SLIDES - 1 ? (
            <button
              type="button"
              onClick={() => goTo(slide + 1)}
              className="flex-1 h-14 bg-charcoal dark:bg-white text-white dark:text-charcoal rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all"
            >
              {t('howItWorks.next')} <ArrowRight size={16} strokeWidth={3} />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                haptics.success();
                onClose();
              }}
              className="flex-1 h-14 bg-forest text-white rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl shadow-forest/25"
            >
              {t('howItWorks.cta')} <ArrowRight size={16} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default HowItWorksModal;
