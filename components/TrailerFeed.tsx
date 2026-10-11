import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Eye, Info, Plus, Users, Volume2, VolumeX, Play, Maximize2, X } from 'lucide-react';
import { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { tmdbImage } from '../utils/tmdbImage';
import { getDisplayWeightedRating, hasVerdict } from '../utils/rating';
import { groupWatchOffers } from '../utils/watchOffers';
import { getWatchOffers } from '../services/tv';
import { TrailerCategory, TrailerItem, getTrailerFeed, youtubeEmbed, youtubeThumb } from '../services/trailers';

/**
 * Le fil des bandes-annonces, onglet de Découvrir.
 *
 * Une vidéo officielle par écran, qu'on fait défiler vers le haut. Seule la
 * vidéo visible se charge et se lit, sans le son au départ ; les autres
 * n'affichent que leur image. Une vidéo retirée ou bloquée en France est sautée
 * sans écran d'erreur (le lecteur YouTube le signale par message).
 */
interface Props {
  mediaType: 'movie' | 'tv';
  movies?: Movie[];
  onAdd?: (tmdbId: number, mediaType: 'movie' | 'tv') => Promise<void> | void;
  onWatchWith?: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
  onSeen?: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
  onOpen: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
}

const YT_ORIGIN = 'https://www.youtube-nocookie.com';

/** Économiseur de données activé : pas de lecture automatique. */
const saveData = () => !!(navigator as unknown as { connection?: { saveData?: boolean } }).connection?.saveData;

const TrailerFeed: React.FC<Props> = ({ mediaType, movies = [], onAdd, onWatchWith, onSeen, onOpen }) => {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const categories: TrailerCategory[] = mediaType === 'tv' ? ['foryou', 'series'] : ['foryou', 'cinema', 'soon'];
  const [category, setCategory] = useState<TrailerCategory>('foryou');
  const [items, setItems] = useState<TrailerItem[] | null>(null);
  const [active, setActive] = useState(0);
  const [sound, setSound] = useState(false);
  const [autoplay] = useState(() => !saveData());
  const [started, setStarted] = useState<Set<string>>(new Set());
  const [added, setAdded] = useState<Set<number>>(new Set());
  const [where, setWhere] = useState<Record<string, string[]>>({});
  const feedRef = useRef<HTMLDivElement>(null);
  const frameRef = useRef<HTMLIFrameElement | null>(null);

  /** Ma collection : les films notés quittent le fil, les mieux notés l'inspirent. */
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
    getTrailerFeed(category, mediaType, seeds)
      .then((list) => alive && setItems(list))
      .catch(() => alive && setItems([]));
    return () => {
      alive = false;
    };
    // `seeds` change à chaque note : relire le fil pour autant serait trop coûteux.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [category, mediaType]);

  const current = items?.[active];

  // Où voir le film visible : lu seulement pour lui.
  useEffect(() => {
    if (!current) return;
    const key = `${current.mediaType}:${current.tmdbId}`;
    if (where[key]) return;
    getWatchOffers(current.mediaType, current.tmdbId)
      .then((offers) => {
        const names = groupWatchOffers(offers).streaming.slice(0, 2).map((o) => o.name);
        setWhere((prev) => ({ ...prev, [key]: names }));
      })
      .catch(() => setWhere((prev) => ({ ...prev, [key]: [] })));
  }, [current?.tmdbId, current?.mediaType]);

  const onScroll = () => {
    const el = feedRef.current;
    if (!el) return;
    const i = Math.round(el.scrollTop / el.clientHeight);
    if (i !== active) setActive(i);
  };

  /** Commande envoyée au lecteur YouTube visible (son, écoute des évènements). */
  const command = useCallback((func: string, args: unknown[] = []) => {
    frameRef.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func, args }), YT_ORIGIN);
  }, []);

  useEffect(() => {
    command(sound ? 'unMute' : 'mute');
  }, [sound, command]);

  // Vidéo retirée, privée ou bloquée en France : on la retire du fil.
  useEffect(() => {
    const onMessage = (e: MessageEvent) => {
      if (e.origin !== YT_ORIGIN || typeof e.data !== 'string') return;
      try {
        const data = JSON.parse(e.data);
        if (data?.event === 'onError' && current) {
          setItems((prev) => (prev ? prev.filter((i) => i.videoKey !== current.videoKey) : prev));
        }
      } catch {
        // Message d'un autre format : ignoré.
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

  const reasonOf = (item: TrailerItem) => {
    const r = item.reason;
    if (r.kind === 'because') return t('trailers.because', { title: r.from });
    if (r.kind === 'list') return t('trailers.inList');
    if (r.kind === 'showing') return t('trailers.showing');
    if (r.kind === 'soon') return t('trailers.soon');
    if (r.kind === 'airing') return t('trailers.airing');
    return t('trailers.following');
  };
  const dateOf = (iso?: string) => {
    if (!iso) return '';
    const d = new Date(`${iso}T12:00:00`);
    if (Number.isNaN(d.getTime())) return '';
    const text = d.toLocaleDateString(locale, { day: 'numeric', month: 'long' });
    return language === 'en' ? text : text.replace(/^1 /, '1er ');
  };

  /**
   * Hauteur du fil : de son bord haut jusqu'au-dessus de la barre de navigation
   * flottante (2 rem du bas + sa hauteur), pour que rien ne passe dessous.
   */
  const boxRef = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(200);
  useEffect(() => {
    const measure = () => {
      const el = boxRef.current;
      if (el) setTop(Math.max(0, el.getBoundingClientRect().top + window.scrollY));
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, []);

  /** Plein écran dans l'app : le lecteur avec ses commandes, le son, et YouTube en dernier recours. */
  const [fullscreen, setFullscreen] = useState<TrailerItem | null>(null);
  const fullRef = useRef<HTMLDivElement>(null);
  const openFullscreen = (item: TrailerItem) => {
    haptics.medium();
    setFullscreen(item);
    window.requestAnimationFrame(() => {
      const el = fullRef.current as (HTMLDivElement & { webkitRequestFullscreen?: () => void }) | null;
      try {
        if (el?.requestFullscreen) void el.requestFullscreen().catch(() => {});
        else el?.webkitRequestFullscreen?.();
      } catch {
        // Pas d'API plein écran (iPhone) : la vue occupe déjà tout l'écran de l'app.
      }
      try {
        void (screen.orientation as unknown as { lock?: (o: string) => Promise<void> })?.lock?.('landscape')?.catch(() => {});
      } catch {
        // Rotation non verrouillable : tant pis, on tourne le téléphone soi-même.
      }
    });
  };
  const closeFullscreen = () => {
    try {
      if (document.fullscreenElement) void document.exitFullscreen().catch(() => {});
      (screen.orientation as unknown as { unlock?: () => void })?.unlock?.();
    } catch {
      // Rien à défaire.
    }
    setFullscreen(null);
  };

  const action = (label: string, icon: React.ReactNode, onClick: () => void, on = false) => (
    <button
      type="button"
      onClick={onClick}
      className="flex-1 min-w-0 flex flex-col items-center gap-1 py-1 text-white text-[10.5px] font-extrabold active:scale-95 transition-transform"
    >
      <span className={`w-11 h-11 rounded-full flex items-center justify-center ${on ? 'bg-bitter-lime text-charcoal' : 'bg-white/15'}`}>{icon}</span>
      <span className="truncate max-w-full">{label}</span>
    </button>
  );

  return (
    <div
      ref={boxRef}
      className="relative min-h-[460px] rounded-[1.6rem] overflow-hidden bg-black text-white"
      style={{ height: `calc(100dvh - ${top}px - env(safe-area-inset-bottom, 0px) - 8rem)` }}
    >
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
          // En plein écran, la vidéo du fil s'efface : une seule lecture à la fois.
          const play = isActive && !fullscreen && (autoplay || started.has(item.videoKey));
          const offers = where[`${item.mediaType}:${item.tmdbId}`] ?? [];
          const isListed = inList.has(item.tmdbId) || added.has(item.tmdbId);
          return (
            <section
              key={`${item.mediaType}-${item.tmdbId}`}
              className="relative h-full snap-start snap-always overflow-hidden flex flex-col"
              aria-label={item.title}
            >
              {item.posterPath && (
                <img
                  src={tmdbImage(item.posterPath, 'w342')}
                  alt=""
                  className="absolute inset-[-40px] w-[calc(100%+80px)] h-[calc(100%+80px)] object-cover blur-2xl opacity-45 scale-110"
                />
              )}
              <span className="absolute inset-0 bg-gradient-to-b from-black/50 via-black/30 to-black/90" />

              {/* La vidéo, centrée dans l'espace laissé par les filtres et la fiche. */}
              <div className="relative flex-1 min-h-0 flex items-center pt-12">
                <div className="relative w-full aspect-video bg-black overflow-hidden">
                  {play ? (
                    <iframe
                      ref={isActive ? frameRef : undefined}
                      src={youtubeEmbed(item.videoKey)}
                      title={item.title}
                      onLoad={onFrameLoad}
                      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                      referrerPolicy="strict-origin-when-cross-origin"
                      className="absolute inset-0 w-full h-full"
                    />
                  ) : (
                    <button
                      type="button"
                      onClick={() => setStarted((prev) => new Set(prev).add(item.videoKey))}
                      aria-label={t('trailers.play', { title: item.title })}
                      className="absolute inset-0 flex items-center justify-center"
                    >
                      <img src={youtubeThumb(item.videoKey)} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover" />
                      {isActive && (
                        <span className="relative w-14 h-14 rounded-full bg-bitter-lime text-charcoal flex items-center justify-center">
                          <Play size={22} fill="currentColor" className="ml-0.5" />
                        </span>
                      )}
                    </button>
                  )}
                  <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-bitter-lime px-1.5 py-0.5 text-[9.5px] font-black uppercase tracking-[0.08em] text-charcoal">
                    {t(`trailers.kind.${item.videoKind}`)}
                  </span>
                  {isActive && (
                    <span className="absolute right-2 bottom-2 flex gap-1.5">
                      {play && (
                        <button
                          type="button"
                          onClick={() => setSound((s) => !s)}
                          aria-pressed={sound}
                          aria-label={sound ? t('trailers.soundOn') : t('trailers.soundOff')}
                          className="h-8 px-2.5 rounded-full bg-black/65 text-[11px] font-extrabold flex items-center gap-1.5"
                        >
                          {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
                          {sound ? t('trailers.soundOn') : t('trailers.soundOff')}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openFullscreen(item)}
                        aria-label={t('trailers.fullscreen')}
                        className="w-8 h-8 rounded-full bg-black/65 flex items-center justify-center"
                      >
                        <Maximize2 size={14} />
                      </button>
                    </span>
                  )}
                </div>
              </div>

              {/* La fiche et les actions, en une rangée : tout se touche sans faire défiler. */}
              <div className="relative shrink-0 px-3.5 pb-3.5 pt-2 space-y-2.5">
                <div className="space-y-1">
                  <span className="inline-flex max-w-full rounded-full bg-bitter-lime/15 px-2.5 py-1 text-[11px] font-extrabold text-bitter-lime truncate">
                    {reasonOf(item)}
                  </span>
                  <h3 className="text-[22px] font-black tracking-[-0.045em] leading-[1.05] line-clamp-2">{item.title}</h3>
                  <div className="flex flex-wrap items-center gap-1.5 text-[11.5px] font-bold text-white/75">
                    {(item.reason.kind === 'soon' ? t('trailers.releaseOn', { date: dateOf(item.releaseDate) }) : item.year) && (
                      <span>{item.reason.kind === 'soon' ? t('trailers.releaseOn', { date: dateOf(item.releaseDate) }) : item.year}</span>
                    )}
                    {item.reason.kind === 'showing' && (
                      <em className="not-italic rounded-md bg-white px-1.5 py-0.5 text-[10.5px] font-extrabold text-charcoal">{t('trailers.inCinemas')}</em>
                    )}
                    {offers.map((name) => (
                      <em key={name} className="not-italic rounded-md bg-white/15 px-1.5 py-0.5 text-[10.5px] font-extrabold">
                        {t('trailers.on', { platform: name })}
                      </em>
                    ))}
                  </div>
                </div>
                <div className="flex gap-1">
                  {onAdd &&
                    action(
                      isListed ? t('trailers.listed') : t('trailers.add'),
                      isListed ? <Check size={19} strokeWidth={2.8} /> : <Plus size={20} strokeWidth={2.6} />,
                      () => {
                        if (isListed) return;
                        haptics.success();
                        setAdded((prev) => new Set(prev).add(item.tmdbId));
                        void onAdd(item.tmdbId, item.mediaType);
                      },
                      isListed
                    )}
                  {onWatchWith && action(t('trailers.with'), <Users size={19} strokeWidth={2.4} />, () => onWatchWith(item.tmdbId, item.mediaType))}
                  {onSeen && action(t('trailers.seen'), <Eye size={19} strokeWidth={2.4} />, () => onSeen(item.tmdbId, item.mediaType))}
                  {action(t('trailers.details'), <Info size={19} strokeWidth={2.4} />, () => onOpen(item.tmdbId, item.mediaType))}
                </div>
              </div>
            </section>
          );
        })}
      </div>

      <div className="absolute left-0 right-0 top-0 px-3 pt-3 flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {categories.map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={category === c}
            onClick={() => {
              haptics.soft();
              setCategory(c);
            }}
            className={`shrink-0 h-8 px-3 rounded-full text-[11.5px] font-extrabold backdrop-blur transition-colors ${
              category === c ? 'bg-white text-charcoal' : 'bg-white/15 text-white'
            }`}
          >
            {t(`trailers.cat.${c}`)}
          </button>
        ))}
      </div>

      {fullscreen && createPortal(
        <div
          ref={fullRef}
          className="fixed inset-0 z-[300] bg-black flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label={fullscreen.title}
        >
          <div className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2 text-white">
            <button
              type="button"
              onClick={closeFullscreen}
              aria-label={t('common.close')}
              className="w-10 h-10 rounded-full bg-white/15 flex items-center justify-center shrink-0"
            >
              <X size={18} />
            </button>
            <b className="flex-1 min-w-0 truncate text-[14px] font-black">{fullscreen.title}</b>
            <a
              href={`https://www.youtube.com/watch?v=${fullscreen.videoKey}`}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 h-9 px-3 rounded-full bg-white/15 text-[11.5px] font-extrabold flex items-center"
            >
              {t('trailers.onYoutube')}
            </a>
          </div>
          {/* Avec ses commandes et le son : en plein écran, on regarde vraiment. */}
          <div className="flex-1 min-h-0 flex items-center">
            <div className="relative w-full max-h-full aspect-video">
              <iframe
                src={youtubeEmbed(fullscreen.videoKey, { controls: true, muted: false })}
                title={fullscreen.title}
                allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
                allowFullScreen
                referrerPolicy="strict-origin-when-cross-origin"
                className="absolute inset-0 w-full h-full"
              />
            </div>
          </div>
          <div className="h-[calc(env(safe-area-inset-bottom,0px)+12px)]" />
        </div>,
        document.body
      )}
    </div>
  );
};

export default TrailerFeed;
