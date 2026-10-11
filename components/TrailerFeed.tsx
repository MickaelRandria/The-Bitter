import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Check, Eye, Info, Plus, Users, Volume2, VolumeX, Play } from 'lucide-react';
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

  const act = (label: string, icon: React.ReactNode, onClick: () => void, on = false) => (
    <button type="button" onClick={onClick} className="flex flex-col items-center gap-1 text-white text-[10px] font-extrabold active:scale-95 transition-transform">
      <span className={`w-[46px] h-[46px] rounded-full flex items-center justify-center backdrop-blur ${on ? 'bg-bitter-lime text-charcoal' : 'bg-white/15'}`}>{icon}</span>
      {label}
    </button>
  );

  return (
    <div className="relative h-[calc(100dvh-15rem)] min-h-[480px] rounded-[1.6rem] overflow-hidden bg-black text-white">
      <div
        ref={feedRef}
        onScroll={onScroll}
        className="absolute inset-0 overflow-y-auto snap-y snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
          return (
            <section key={`${item.mediaType}-${item.tmdbId}`} className="relative h-full snap-start snap-always overflow-hidden" aria-label={item.title}>
              {item.posterPath && (
                <img src={tmdbImage(item.posterPath, 'w342')} alt="" className="absolute inset-[-40px] w-[calc(100%+80px)] h-[calc(100%+80px)] object-cover blur-2xl opacity-50 scale-110" />
              )}
              <span className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/15 to-black/95" />

              {/* La vidéo, en 16:9, en haut sous les filtres : le bas reste au titre et aux actions. */}
              <div className="absolute left-0 right-0 top-14 aspect-video bg-black overflow-hidden">
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
                {play && (
                  <button
                    type="button"
                    onClick={() => setSound((s) => !s)}
                    aria-pressed={sound}
                    className="absolute right-2 bottom-2 h-8 px-2.5 rounded-full bg-black/60 text-[11px] font-extrabold flex items-center gap-1.5"
                  >
                    {sound ? <Volume2 size={14} /> : <VolumeX size={14} />}
                    {sound ? t('trailers.soundOn') : t('trailers.soundOff')}
                  </button>
                )}
              </div>

              <div className="absolute left-3.5 right-[74px] bottom-5 space-y-1.5">
                <span className="inline-flex rounded-full bg-bitter-lime/15 px-2.5 py-1 text-[11px] font-extrabold text-bitter-lime">{reasonOf(item)}</span>
                <h3 className="text-[25px] font-black tracking-[-0.045em] leading-none">{item.title}</h3>
                <p className="text-[12px] font-bold text-white/75">
                  {[item.reason.kind === 'soon' ? t('trailers.releaseOn', { date: dateOf(item.releaseDate) }) : item.year].filter(Boolean).join(' · ')}
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {item.reason.kind === 'showing' && (
                    <em className="not-italic rounded-lg bg-white px-2 py-1 text-[11px] font-extrabold text-charcoal">{t('trailers.inCinemas')}</em>
                  )}
                  {offers.map((name) => (
                    <em key={name} className="not-italic rounded-lg bg-white/15 px-2 py-1 text-[11px] font-extrabold">
                      {t('trailers.on', { platform: name })}
                    </em>
                  ))}
                </div>
              </div>

              <div className="absolute right-2.5 bottom-7 flex flex-col items-center gap-3.5">
                {onAdd &&
                  act(
                    isListed ? t('trailers.listed') : t('trailers.add'),
                    isListed ? <Check size={20} strokeWidth={2.8} /> : <Plus size={21} strokeWidth={2.6} />,
                    () => {
                      if (isListed) return;
                      haptics.success();
                      setAdded((prev) => new Set(prev).add(item.tmdbId));
                      void onAdd(item.tmdbId, item.mediaType);
                    },
                    isListed
                  )}
                {onWatchWith && act(t('trailers.with'), <Users size={20} strokeWidth={2.4} />, () => onWatchWith(item.tmdbId, item.mediaType))}
                {onSeen && act(t('trailers.seen'), <Eye size={20} strokeWidth={2.4} />, () => onSeen(item.tmdbId, item.mediaType))}
                {act(t('trailers.details'), <Info size={20} strokeWidth={2.4} />, () => onOpen(item.tmdbId, item.mediaType))}
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
    </div>
  );
};

export default TrailerFeed;
