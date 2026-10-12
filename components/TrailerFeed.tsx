import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, Info, Plus, Users, Volume2, VolumeX, Play, X, Smartphone } from 'lucide-react';
import { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { tmdbImage } from '../utils/tmdbImage';
import { getDisplayWeightedRating, hasVerdict } from '../utils/rating';
import { groupWatchOffers } from '../utils/watchOffers';
import { getWatchOffers } from '../services/tv';
import { TrailerCategory, TrailerItem, getTrailerFeed, youtubeEmbed, youtubeThumb } from '../services/trailers';

/**
 * Le fil des bandes-annonces, en plein écran.
 *
 * Il passe au-dessus de toute l'app : en-tête, onglets et barre de navigation
 * disparaissent, la croix ramène à Découvrir. En fond, le décor du film (son
 * image large) ; au centre, la vidéo sans l'interface YouTube : un calque capte
 * les touchers (pause, reprise ; deux touchers pour remplir l'écran), et une
 * image couvre le lecteur en pause, là où YouTube afficherait ses suggestions.
 *
 * Niveau d'affichage 70 : au-dessus de la barre de navigation (50), sous la
 * fiche d'un film (80), le formulaire de notation (150) et « Voir avec » (300),
 * qui s'ouvrent donc par-dessus.
 */
interface Props {
  mediaType: 'movie' | 'tv';
  movies?: Movie[];
  onAdd?: (tmdbId: number, mediaType: 'movie' | 'tv') => Promise<void> | void;
  onWatchWith?: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
  onSeen?: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
  onOpen: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
  onClose: () => void;
  /** Mes plateformes : la catégorie « Sur mes plateformes ». */
  platformIds?: string[];
  /** Je regarde surtout en streaming : cette catégorie s'ouvre d'abord. */
  preferPlatforms?: boolean;
}

const YT_ORIGIN = 'https://www.youtube-nocookie.com';
const FILL_KEY = 'bitter_trailers_fill';

/** Économiseur de données activé : pas de lecture automatique. */
const saveData = () => !!(navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;

const TrailerFeed: React.FC<Props> = ({ mediaType, movies = [], onAdd, onWatchWith, onSeen, onOpen, onClose, platformIds = [], preferPlatforms = false }) => {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const hasPlatforms = platformIds.length > 0;
  const base: TrailerCategory[] = mediaType === 'tv' ? ['foryou', 'series'] : ['foryou', 'cinema', 'soon'];
  const categories: TrailerCategory[] = !hasPlatforms
    ? base
    : preferPlatforms
      ? ['platforms', ...base]
      : [base[0], 'platforms', ...base.slice(1)];
  const [category, setCategory] = useState<TrailerCategory>(hasPlatforms && preferPlatforms ? 'platforms' : 'foryou');
  const [items, setItems] = useState<TrailerItem[] | null>(null);
  const [active, setActive] = useState(0);
  const [sound, setSound] = useState(false);
  const [autoplay] = useState(() => !saveData());
  const [started, setStarted] = useState<Set<string>>(new Set());
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const [fill, setFill] = useState(() => {
    try {
      return localStorage.getItem(FILL_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [hint, setHint] = useState<string | null>(null);
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [where, setWhere] = useState<Record<string, string[]>>({});
  /**
   * Téléphone tourné en paysage : la vidéo seule, sur tout l'écran. Limité aux
   * petites hauteurs, pour ne pas basculer une tablette ou un ordinateur.
   */
  /** Chaque rotation : un fondu au noir masque le saut de mise en page. */
  const [turns, setTurns] = useState(0);
  const [landscape, setLandscape] = useState(() => window.matchMedia?.('(orientation: landscape) and (max-height: 540px)').matches ?? false);
  useEffect(() => {
    const query = window.matchMedia?.('(orientation: landscape) and (max-height: 540px)');
    if (!query) return;
    const onChange = () => {
      setLandscape(query.matches);
      setTurns((n) => n + 1);
    };
    query.addEventListener?.('change', onChange);
    return () => query.removeEventListener?.('change', onChange);
  }, []);
  const feedRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  // La page dessous ne défile plus tant que le fil est ouvert.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const seeds = useMemo(
    () =>
      movies
        .filter((m) => m.tmdbId != null && m.seasonNumber == null)
        .map((m) => ({
          tmdbId: m.tmdbId as number,
          title: m.title,
          status: m.status,
          rating: m.status === 'watched' && hasVerdict(m) ? getDisplayWeightedRating(m) : undefined,
        })),
    [movies]
  );
  const inList = useMemo(() => new Set(seeds.filter((s) => s.status === 'watchlist').map((s) => s.tmdbId)), [seeds]);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setActive(0);
    feedRef.current?.scrollTo({ top: 0 });
    getTrailerFeed(category, mediaType, seeds, platformIds)
      .then((list) => alive && setItems(list))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
    // `seeds` change à chaque note : relire le fil pour autant serait trop coûteux.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, mediaType]);

  const current = items?.[active];

  useEffect(() => {
    setPaused(false);
    setProgress(0);
  }, [current?.videoKey]);

  useEffect(() => {
    if (!current) return;
    const key = `${current.mediaType}:${current.tmdbId}`;
    if (where[key]) return;
    getWatchOffers(current.mediaType, current.tmdbId)
      .then((offers) => setWhere((prev) => ({ ...prev, [key]: groupWatchOffers(offers).streaming.slice(0, 2).map((o) => o.name) })))
      .catch(() => setWhere((prev) => ({ ...prev, [key]: [] })));
  }, [current?.tmdbId, current?.mediaType]);

  /**
   * Quand l'écran change de taille (rotation), la position du fil, elle, ne
   * bouge pas : on la recale sur la vidéo en cours, sans en changer.
   */
  const activeRef = useRef(0);
  activeRef.current = active;
  const resizing = useRef(0);
  useEffect(() => {
    const el = feedRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let last = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (el.clientHeight === last) return;
      last = el.clientHeight;
      resizing.current = Date.now();
      el.scrollTop = activeRef.current * el.clientHeight;
      if (window.scrollX) window.scrollTo(0, window.scrollY);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    if (Date.now() - resizing.current < 600) {
      el.scrollTop = activeRef.current * el.clientHeight;
      return;
    }
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== active) setActive(i);
  };

  const command = useCallback((func: string, args: unknown[] = []) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN);
  }, []);

  useEffect(() => {
    command(sound ? 'unMute' : 'mute');
  }, [sound, command]);

  // Tourner le téléphone, c'est vouloir regarder : on remet le son.
  useEffect(() => {
    if (landscape) setSound(true);
  }, [landscape]);

  // Messages du lecteur : progression, et vidéo bloquée (retirée du fil).
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || typeof e.data !== 'string') return;
      try {
        const data = JSON.parse(e.data);
        if (data?.event === 'onError' && current) {
          setItems((prev) => (prev ? prev.filter((i) => i.videoKey !== current.videoKey) : prev));
        }
        const info = data?.info;
        if (data?.event === 'infoDelivery' && info && typeof info.currentTime === 'number') {
          const duration = Number(info.duration) || 0;
          if (duration > 0) setProgress(Math.min(1, info.currentTime / duration));
        }
      } catch {
        // Autre format : ignoré.
      }
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [current]);

  const onFrameLoad = () => {
    const win = frameRef.current?.contentWindow;
    if (!win || !current) return;
    win.postMessage(JSON.stringify({ event: 'listening', id: current.videoKey, channel: 'widget' }), YT_ORIGIN);
    window.setTimeout(() => command(sound ? 'unMute' : 'mute'), 600);
  };

  /** Un toucher : pause ou reprise. Deux touchers : remplir l'écran ou revenir à la vidéo entière. */
  const lastTap = useRef(0);
  const tapTimer = useRef<number | null>(null);
  const onTap = (item: TrailerItem) => {
    const now = Date.now();
    if (now - lastTap.current < 300) {
      if (tapTimer.current) window.clearTimeout(tapTimer.current);
      lastTap.current = 0;
      haptics.soft();
      const next = !fill;
      setFill(next);
      try {
        localStorage.setItem(FILL_KEY, next ? '1' : '0');
      } catch {
        // Préférence non retenue : sans gravité.
      }
      setHint(next ? t('trailers.fillOn') : t('trailers.fillOff'));
      window.setTimeout(() => setHint(null), 900);
      return;
    }
    lastTap.current = now;
    tapTimer.current = window.setTimeout(() => {
      if (!(autoplay || started.has(item.videoKey))) {
        setStarted((prev) => new Set(prev).add(item.videoKey));
        return;
      }
      command(paused ? 'playVideo' : 'pauseVideo');
      setPaused(!paused);
    }, 280);
  };

  const reasonOf = (item: TrailerItem) => {
    const r = item.reason;
    if (r.kind === 'because') return t('trailers.because', { title: r.from });
    if (r.kind === 'list') return t('trailers.inList');
    if (r.kind === 'showing') return t('trailers.showing');
    if (r.kind === 'soon') return t('trailers.soon');
    if (r.kind === 'airing') return t('trailers.airing');
    if (r.kind === 'platforms') return t('trailers.onMine');
    return t('trailers.following');
  };
  const dateOf = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    const text = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    return language === 'en' ? text : text.replace(/^1 /, '1er ');
  };

  const action = (label: string, icon: React.ReactNode, onClick: () => void, style: 'main' | 'on' | 'plain' = 'plain') => (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col items-center gap-1.5 text-white text-[10px] font-extrabold [text-shadow:0_1px_6px_rgba(0,0,0,0.6)] active:scale-95 transition-transform"
    >
      <span
        className={`w-12 h-12 rounded-full flex items-center justify-center backdrop-blur-md ${
          style === 'main' ? 'bg-white text-charcoal' : style === 'on' ? 'bg-bitter-lime text-charcoal' : 'bg-white/15'
        }`}
      >
        {icon}
      </span>
      {label}
    </button>
  );

  return createPortal(
    <div className="fixed inset-0 z-[70] bg-black text-white" role="dialog" aria-modal="true" aria-label={t('trailers.tab')}>
      {turns > 0 && <div key={turns} className="pointer-events-none absolute inset-0 z-[30] bg-black animate-[trailer-turn_0.55s_ease-out_0.12s_both]" />}
      <div
        ref={feedRef}
        onScroll={onScroll}
        className="absolute inset-0 overflow-y-auto snap-y snap-mandatory overscroll-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {items == null && <div className="h-full flex items-center justify-center text-[12px] font-bold text-white/60">{t('trailers.loading')}</div>}
        {items?.length === 0 && (
          <div className="h-full flex items-center justify-center px-8 text-center text-[13px] font-semibold text-white/70">{t('trailers.empty')}</div>
        )}
        {items?.map((item, i) => {
          const isActive = i === active;
          const play = isActive && (autoplay || started.has(item.videoKey));
          const offers = where[`${item.mediaType}:${item.tmdbId}`] ?? [];
          const isListed = inList.has(item.tmdbId) || added.has(item.tmdbId);
          const decor = item.backdropPath ?? item.posterPath;
          const whereText =
            item.reason.kind === 'soon'
              ? t('trailers.releaseOn', { date: dateOf(item.releaseDate) })
              : item.reason.kind === 'showing'
                ? t('trailers.inCinemas')
                : offers.length
                  ? t('trailers.on', { platform: offers.join(', ') })
                  : '';
          // En paysage : la vidéo entière, au centre exact de l'écran (bandes noires égales).
          const frameClass = landscape
            ? 'absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 aspect-video max-w-none w-[min(100%,calc(100dvh*16/9))]'
            : fill
              ? 'absolute top-0 left-1/2 -translate-x-1/2 h-full aspect-video max-w-none'
              : 'absolute inset-0 w-full h-full';
          return (
            <section key={`${item.mediaType}-${item.tmdbId}`} className="relative h-full snap-start snap-always overflow-hidden" aria-label={item.title}>
              {/* Le décor du film, sur tout l'écran. */}
              {decor && (
                <img
                  src={tmdbImage(decor, item.backdropPath ? 'w780' : 'w342')}
                  alt=""
                  className="absolute inset-[-30px] w-[calc(100%+60px)] h-[calc(100%+60px)] max-w-none object-cover blur-md saturate-150 opacity-80"
                />
              )}
              <span className="absolute inset-0 bg-[radial-gradient(120%_70%_at_50%_42%,transparent_20%,rgba(0,0,0,0.55)_75%)]" />
              <span className="absolute inset-0 bg-gradient-to-b from-black/55 via-transparent to-black" />

              {/* La vidéo : entière au centre, ou zoomée sur toute la hauteur. */}
              <div
                className={`absolute left-0 right-0 overflow-hidden ${
                  landscape
                    ? 'inset-0 z-[8] bg-black'
                    : fill
                      ? 'inset-y-0'
                      : 'top-[42%] -translate-y-1/2 aspect-video [mask-image:linear-gradient(180deg,transparent_0,#000_9%,#000_91%,transparent_100%)]'
                }`}
              >
                {play && (
                  <iframe
                    ref={isActive ? frameRef : undefined}
                    src={youtubeEmbed(item.videoKey)}
                    title={item.title}
                    onLoad={onFrameLoad}
                    allow="autoplay; encrypted-media; picture-in-picture"
                    referrerPolicy="strict-origin-when-cross-origin"
                    className={frameClass}
                  />
                )}
                {/* En pause ou pas encore lancée : notre image, à la place des suggestions YouTube. */}
                {(!play || paused) && (
                  <img src={youtubeThumb(item.videoKey)} alt="" loading="lazy" className={`${frameClass} object-cover`} />
                )}
                {play && !fill && !landscape && (
                  <span className="absolute left-4 right-4 bottom-[12%] h-0.5 rounded-full bg-white/25 overflow-hidden">
                    <i className="block h-full bg-white rounded-full transition-[width] duration-500" style={{ width: `${progress * 100}%` }} />
                  </span>
                )}
              </div>

              {/* Au-dessus de la vidéo : de quoi lire le haut et le bas, même sur une image claire. */}
              <span className="pointer-events-none absolute inset-x-0 top-0 h-28 bg-gradient-to-b from-black/60 to-transparent" />
              <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[45%] bg-gradient-to-t from-black/90 via-black/50 to-transparent" />

              {/* Sous la vidéo : tourner le téléphone pour la voir en plein écran. */}
              {isActive && play && !fill && !landscape && (
                <span className="pointer-events-none absolute left-0 right-0 z-[6] top-[calc(42%+28.125vw+14px)] flex items-center justify-center gap-2 text-[11.5px] font-bold text-white/65 animate-[fadeIn_0.6s_ease-out_1s_both]">
                  <Smartphone size={15} className="animate-[trailer-rotate_3.2s_ease-in-out_infinite]" />
                  {t('trailers.rotateHint')}
                </span>
              )}

              {/* Le calque des touchers : l'interface YouTube ne s'affiche jamais. */}
              <button
                type="button"
                onClick={() => onTap(item)}
                aria-label={paused || !play ? t('trailers.play', { title: item.title }) : t('trailers.pause')}
                className={`absolute inset-0 ${landscape ? 'z-[9]' : 'z-[5]'}`}
              />
              {isActive && (paused || !play) && (
                <span className="pointer-events-none absolute left-1/2 top-[42%] z-[6] -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-black/45 backdrop-blur flex items-center justify-center">
                  <Play size={26} fill="currentColor" className="ml-1" />
                </span>
              )}
              {isActive && hint && (
                <span className="pointer-events-none absolute left-1/2 top-[42%] z-[7] -translate-x-1/2 -translate-y-1/2 rounded-full bg-black/65 px-3 py-2 text-[12px] font-extrabold">
                  {hint}
                </span>
              )}

              {/* Le titre, une ligne d'infos, où le voir, la raison. */}
              <div className={`${landscape ? 'hidden' : ''} pointer-events-none absolute left-4 right-[84px] z-[6] bottom-[calc(env(safe-area-inset-bottom,0px)+28px)] space-y-1.5`}>
                {item.videoKind !== 'Trailer' && (
                  <span className="block text-[10px] font-black uppercase tracking-[0.14em] text-bitter-lime">{t(`trailers.kind.${item.videoKind}`)}</span>
                )}
                <h3 className="text-[32px] font-black tracking-[-0.055em] leading-[0.95] line-clamp-3 [text-wrap:balance]">{item.title}</h3>
                {item.year && item.reason.kind !== 'soon' && <p className="text-[12.5px] font-bold text-white/80">{item.year}</p>}
                {whereText && <p className="text-[12px] font-extrabold">{whereText}</p>}
                <p className="flex items-center gap-1.5 text-[12px] font-bold text-white/65">
                  <i className="w-1.5 h-1.5 rounded-full bg-bitter-lime shrink-0" />
                  {reasonOf(item)}
                </p>
              </div>

              {/* Les actions, à droite : plus de barre de navigation dessous. */}
              <div className={`${landscape ? 'hidden' : ''} absolute right-3 z-[6] bottom-[calc(env(safe-area-inset-bottom,0px)+28px)] flex flex-col items-center gap-4`}>
                {onAdd &&
                  action(
                    isListed ? t('trailers.listed') : t('trailers.add'),
                    isListed ? <Check size={21} strokeWidth={2.8} /> : <Plus size={22} strokeWidth={2.6} />,
                    () => {
                      if (isListed) return;
                      haptics.success();
                      setAdded((prev) => new Set(prev).add(item.tmdbId));
                      void onAdd(item.tmdbId, item.mediaType);
                    },
                    isListed ? 'on' : 'main'
                  )}
                {onWatchWith && action(t('trailers.with'), <Users size={21} strokeWidth={2.4} />, () => onWatchWith(item.tmdbId, item.mediaType))}
                {onSeen && action(t('trailers.seen'), <Eye size={21} strokeWidth={2.4} />, () => onSeen(item.tmdbId, item.mediaType))}
                {action(t('trailers.details'), <Info size={21} strokeWidth={2.4} />, () => onOpen(item.tmdbId, item.mediaType))}
              </div>
            </section>
          );
        })}
      </div>

      {/* Le haut : sortir, la catégorie, le son. Caché en paysage. */}
      <div className={`${landscape ? 'hidden' : ''} absolute left-0 right-0 top-0 z-10 flex items-center gap-2 px-3 pt-[calc(env(safe-area-inset-top,0px)+10px)]`}>
        <button
          type="button"
          onClick={() => {
            haptics.soft();
            onClose();
          }}
          aria-label={t('trailers.close')}
          className="w-10 h-10 shrink-0 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center"
        >
          <X size={19} strokeWidth={2.6} />
        </button>
        <div className="flex-1 min-w-0 flex justify-center gap-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('trailers.tab')}>
          {categories.map((c) => (
            <button
              key={c}
              type="button"
              aria-pressed={category === c}
              onClick={() => {
                haptics.soft();
                setCategory(c);
              }}
              className={`relative shrink-0 px-2 py-2 text-[13px] font-extrabold [text-shadow:0_1px_6px_rgba(0,0,0,0.5)] ${category === c ? 'text-white' : 'text-white/60'}`}
            >
              {t(`trailers.cat.${c}`)}
              {category === c && <i className="absolute left-1/2 bottom-0.5 h-0.5 w-4 -translate-x-1/2 rounded-full bg-white" />}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setSound((s) => !s)}
          aria-pressed={sound}
          aria-label={sound ? t('trailers.soundOn') : t('trailers.soundOff')}
          className="w-10 h-10 shrink-0 rounded-full bg-black/35 backdrop-blur-md flex items-center justify-center"
        >
          {sound ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
      </div>
    </div>,
    document.body
  );
};

export default TrailerFeed;
