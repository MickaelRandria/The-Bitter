import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  ShieldCheck,
  AlertTriangle,
  Trash2,
  Download,
  Smartphone,
  Check,
  ArrowRight,
  ArrowLeft,
  Play,
  Clapperboard,
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

const TOTAL_SLIDES = 3;
const SWIPE_THRESHOLD = 60;

const HowItWorksModal: React.FC<HowItWorksModalProps> = ({ onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('howItWorks.title'));

  const [slide, setSlide] = useState(0);
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
    if (next < 0 || next > TOTAL_SLIDES - 1) return;
    haptics.soft();
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

  const handleFinish = () => {
    haptics.success();
    onClose();
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[300] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-black/80 backdrop-blur-xl animate-[fadeIn_0.25s_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative w-full h-[100dvh] sm:h-auto sm:max-h-[85vh] sm:max-w-md bg-[#0c0c0c] sm:rounded-[3rem] border border-white/10 shadow-2xl flex flex-col overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Halos */}
        <div className="absolute top-[-25%] left-[-20%] w-[320px] h-[320px] bg-lime-400/10 rounded-full blur-[130px] pointer-events-none" />
        <div className="absolute bottom-[-15%] right-[-15%] w-[260px] h-[260px] bg-white/5 rounded-full blur-[110px] pointer-events-none" />

        {/* ── Header : progression + fermer ───────────────────────────── */}
        <div
          className="relative z-10 flex items-center justify-between px-8 pt-8 pb-6 shrink-0"
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 2rem)' }}
        >
          <div className="flex items-center gap-2" role="tablist" aria-label={t('howItWorks.title')}>
            {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
              <button
                key={i}
                role="tab"
                aria-selected={slide === i}
                aria-label={`${i + 1} / ${TOTAL_SLIDES}`}
                onClick={() => goTo(i)}
                className={`h-2 rounded-full transition-all duration-300 ${
                  slide === i ? 'w-7 bg-lime-400' : 'w-2 bg-white/20 hover:bg-white/40'
                }`}
              />
            ))}
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="w-9 h-9 rounded-full bg-white/10 border border-white/10 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/20"
          >
            <X size={16} strokeWidth={2.5} />
          </button>
        </div>

        {/* ── Slides ──────────────────────────────────────────────────── */}
        <div
          className="relative z-10 flex-1 min-h-0 overflow-hidden"
          onTouchStart={(e) => {
            touchStartX.current = e.touches[0].clientX;
          }}
          onTouchEnd={handleTouchEnd}
        >
          <div
            className="flex h-full transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]"
            style={{ transform: `translateX(-${slide * 100}%)` }}
          >
            {/* ── SLIDE 1 : les données ─────────────────────────────── */}
            <section
              className="w-full shrink-0 h-full overflow-y-auto no-scrollbar px-8"
              aria-hidden={slide !== 0}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-lime-400/30 bg-lime-400/10 text-lime-400 text-[9px] font-black uppercase tracking-widest mb-5">
                <ShieldCheck size={12} />
                {t('howItWorks.s1.badge')}
              </div>
              <h2 className="text-[2.6rem] leading-[0.92] font-black text-white tracking-tighter mb-4">
                {t('howItWorks.s1.title1')}
                <br />
                <span className="text-lime-400">{t('howItWorks.s1.title2')}</span>
              </h2>
              <p className="text-sm font-medium text-stone-400 leading-relaxed mb-6">
                {t('howItWorks.s1.desc')}
              </p>

              {/* Alerte majeure */}
              <div className="rounded-[1.75rem] border-2 border-red-500/60 bg-red-500/10 p-5 mb-4">
                <div className="flex items-center gap-2.5 mb-2.5">
                  <span className="w-8 h-8 rounded-full bg-red-500 text-white flex items-center justify-center shrink-0">
                    <AlertTriangle size={16} strokeWidth={2.5} />
                  </span>
                  <h3 className="text-[13px] font-black uppercase tracking-wide text-red-400 leading-tight">
                    {t('howItWorks.s1.alertTitle')}
                  </h3>
                </div>
                <p className="text-[13px] font-bold text-white leading-relaxed">
                  {t('howItWorks.s1.alertDesc')}
                </p>
              </div>

              <div className="flex gap-3 items-start rounded-2xl border border-white/10 bg-white/5 p-4 mb-4">
                <Trash2 size={15} className="text-stone-400 shrink-0 mt-0.5" />
                <p className="text-[11px] font-medium text-stone-400 leading-relaxed">
                  <strong className="font-black text-white">{t('howItWorks.s1.cacheTitle')}</strong>{' '}
                  {t('howItWorks.s1.cacheDesc')}
                </p>
              </div>
              <div className="flex gap-3 items-start rounded-2xl border border-white/10 bg-white/5 p-4 mb-8">
                <Download size={15} className="text-lime-400 shrink-0 mt-0.5" />
                <p className="text-[11px] font-medium text-stone-400 leading-relaxed">
                  <strong className="font-black text-white">{t('howItWorks.s1.exportTitle')}</strong>{' '}
                  {t('howItWorks.s1.exportDesc')}
                </p>
              </div>
            </section>

            {/* ── SLIDE 2 : installation ────────────────────────────── */}
            <section
              className="w-full shrink-0 h-full overflow-y-auto no-scrollbar px-8"
              aria-hidden={slide !== 1}
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/15 bg-white/5 text-white text-[9px] font-black uppercase tracking-widest mb-5">
                <Smartphone size={12} />
                {t('howItWorks.s2.badge')}
              </div>
              <h2 className="text-[2.6rem] leading-[0.92] font-black text-white tracking-tighter mb-4">
                {t('howItWorks.s2.title1')}
                <br />
                <span className="text-lime-400">{t('howItWorks.s2.title2')}</span>
              </h2>
              <p className="text-sm font-medium text-stone-400 leading-relaxed mb-6">
                {t('howItWorks.s2.desc')}
              </p>

              {installed ? (
                <div className="flex items-center gap-3 rounded-2xl border border-lime-400/30 bg-lime-400/10 p-5 mb-8">
                  <Check size={18} className="text-lime-400 shrink-0" strokeWidth={3} />
                  <p className="text-xs font-black uppercase tracking-wide text-lime-400">
                    {t('howItWorks.s2.alreadyInstalled')}
                  </p>
                </div>
              ) : (
                <>
                  {/* Toggle segmenté */}
                  <div className="flex gap-2 p-1 rounded-2xl bg-white/5 border border-white/10 mb-4">
                    {(['ios', 'android'] as Platform[]).map((p) => (
                      <button
                        key={p}
                        onClick={() => {
                          haptics.soft();
                          setTab(p);
                        }}
                        aria-pressed={tab === p}
                        className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${
                          tab === p
                            ? 'bg-white text-black shadow-lg'
                            : 'text-stone-500 hover:text-stone-300'
                        }`}
                      >
                        {p === 'ios' ? t('howItWorks.ios') : t('howItWorks.android')}
                        {platform === p && ` · ${t('howItWorks.yourDevice')}`}
                      </button>
                    ))}
                  </div>

                  {/*
                    EMPLACEMENT MÉDIA — remplacer ce bloc par le GIF ou l'animation Lottie
                    montrant le geste (Partager → Sur l'écran d'accueil).
                    Format conseillé : ratio 4/3, fond transparent ou #0c0c0c.
                    ex. <video src="/install-ios.mp4" autoPlay loop muted playsInline
                             className="w-full h-full object-cover rounded-[1.5rem]" />
                  */}
                  <div
                    data-media-slot={tab}
                    className="relative aspect-[4/3] w-full rounded-[1.75rem] border-2 border-dashed border-white/15 bg-gradient-to-b from-white/[0.07] to-transparent flex flex-col items-center justify-center gap-3 mb-4 overflow-hidden"
                  >
                    <div className="absolute inset-0 shimmer pointer-events-none" />
                    <span className="w-14 h-14 rounded-2xl bg-white/10 border border-white/10 flex items-center justify-center text-lime-400">
                      <Play size={22} fill="currentColor" />
                    </span>
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 text-center px-6 leading-relaxed">
                      {tab === 'ios' ? t('howItWorks.s2.hintIos') : t('howItWorks.s2.hintAndroid')}
                    </p>
                  </div>

                  {tab === 'ios' && platform === 'ios' && !isIOSSafari() && (
                    <p className="text-[11px] font-bold text-red-400 leading-relaxed mb-4">
                      {t('howItWorks.iosSafariOnly')}
                    </p>
                  )}

                  {canPrompt && (
                    <button
                      onClick={handleInstall}
                      className="w-full bg-lime-400 text-black py-4 rounded-2xl font-black text-[11px] uppercase tracking-widest active:scale-95 transition-all shadow-lg shadow-lime-400/20 flex items-center justify-center gap-2 mb-4"
                    >
                      <Download size={15} strokeWidth={2.5} /> {t('howItWorks.installNow')}
                    </button>
                  )}

                  <p className="text-[11px] font-medium text-stone-500 leading-relaxed mb-8">
                    {t('howItWorks.installFirst')}
                  </p>
                </>
              )}
            </section>

            {/* ── SLIDE 3 : c'est parti ─────────────────────────────── */}
            <section
              className="w-full shrink-0 h-full overflow-y-auto no-scrollbar px-8 flex flex-col justify-center"
              aria-hidden={slide !== 2}
            >
              <div className="w-20 h-20 rounded-[1.75rem] bg-lime-400 text-black flex items-center justify-center mb-7 shadow-2xl shadow-lime-400/20 rotate-[-3deg]">
                <Clapperboard size={36} strokeWidth={2} />
              </div>
              <h2 className="text-[2.8rem] leading-[0.9] font-black text-white tracking-tighter mb-5">
                {t('howItWorks.s3.title1')}
                <br />
                <span className="text-lime-400">{t('howItWorks.s3.title2')}</span>
              </h2>
              <p className="text-sm font-medium text-stone-400 leading-relaxed mb-3">
                {t('howItWorks.s3.desc')}
              </p>
              <p className="text-sm font-bold text-white leading-relaxed border-l-2 border-lime-400 pl-4 mb-8">
                {t('howItWorks.s3.quote')}
              </p>
            </section>
          </div>
        </div>

        {/* ── Navigation ──────────────────────────────────────────────── */}
        <div
          className="relative z-10 shrink-0 px-8 pb-8 pt-4 flex items-center gap-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
        >
          {slide > 0 && (
            <button
              onClick={() => goTo(slide - 1)}
              aria-label={t('common.back')}
              className="w-14 h-14 shrink-0 rounded-2xl border border-white/15 bg-white/5 text-white flex items-center justify-center active:scale-90 transition-all hover:bg-white/10"
            >
              <ArrowLeft size={18} strokeWidth={2.5} />
            </button>
          )}
          {slide < TOTAL_SLIDES - 1 ? (
            <button
              onClick={() => goTo(slide + 1)}
              className="flex-1 h-14 bg-white text-black rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-stone-200"
            >
              {t('howItWorks.next')} <ArrowRight size={16} strokeWidth={3} />
            </button>
          ) : (
            <button
              onClick={handleFinish}
              className="flex-1 h-14 bg-lime-400 text-black rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] flex items-center justify-center gap-3 active:scale-95 transition-all hover:bg-lime-300 shadow-xl shadow-lime-400/25"
            >
              {t('howItWorks.s3.cta')} <ArrowRight size={16} strokeWidth={3} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default HowItWorksModal;
