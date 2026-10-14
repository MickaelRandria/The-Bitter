import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowDown, ArrowLeft, ArrowUpRight, Bookmark, Check, ChevronRight, Clapperboard, ExternalLink, Heart, Loader2, MessageCircle, Play, RefreshCw, Share2, SlidersHorizontal, Sparkles, Users, Volume2, VolumeX } from 'lucide-react';
import { Movie, MovieStatus } from '../types';
import { FilItem, FilMedia, filWorkKey, filterFil } from '../utils/cinemaFil';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { getCinemaFil, getFilCounts, getFilFollows, FilCount, markFilOpened, readFilLocal, setFilLike } from '../services/cinemaFil';
import { youtubeEmbed } from '../services/trailers';
import { watchedWorkKeys } from '../utils/collectionRules';
import { useBlockedUsers } from '../services/moderation';
import MovieDetailModal from './MovieDetailModal';
import FilFollowButton from './FilFollowButton';
import { FilComments, FilSheet } from './CinemaFilSheet';

interface Props {
  profileId: string;
  movies: Movie[];
  onClose: () => void;
  onAdd: (id: number, media: FilMedia) => Promise<boolean>;
  onAction: (id: number, media: FilMedia, status: MovieStatus | 'watching') => void;
  platformIds?: string[];
}

const CinemaFil: React.FC<Props> = ({ profileId, movies, onClose, onAdd, onAction, platformIds }) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('cineFil.title'));
  const blocked = useBlockedUsers();
  const [items, setItems] = useState<FilItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [category, setCategory] = useState<'foryou' | 'news' | 'trailers'>('foryou');
  const [media, setMedia] = useState<'all' | FilMedia>('all');
  const [active, setActive] = useState(0);
  const [refresh, setRefresh] = useState(0);
  const [counts, setCounts] = useState<Record<string, FilCount>>({});
  const [liked, setLiked] = useState(() => new Set(readFilLocal(profileId).liked));
  const [busy, setBusy] = useState<string | null>(null);
  const [added, setAdded] = useState(new Set<string>());
  const [videoId, setVideoId] = useState<string | null>(null);
  const [muted, setMuted] = useState(true);
  const [sheet, setSheet] = useState<'filters' | 'comments' | 'source' | 'share' | null>(null);
  const [sheetItem, setSheetItem] = useState<FilItem | null>(null);
  const [detail, setDetail] = useState<FilItem | null>(null);
  const [toast, setToast] = useState<string>();
  const feed = useRef<HTMLDivElement>(null);
  const frame = useRef<HTMLIFrameElement>(null);
  const activeRef = useRef(active); activeRef.current = active;
  const lengthRef = useRef(0);
  const moviesRef = useRef(movies); moviesRef.current = movies;
  const toastTimer = useRef<ReturnType<typeof setTimeout>>();
  const available = useMemo(() => {
    const seen = watchedWorkKeys(movies);
    return items.filter(item => (!item.friendId || !blocked.has(item.friendId))
      && !(item.kind === 'discovery' && item.work && seen.has(filWorkKey(item.work.mediaType, item.work.tmdbId))));
  }, [items, blocked, movies]);
  const visible = useMemo(() => filterFil(available, category, media), [available, category, media]);
  const previousFilter = useRef(`${category}:${media}`);
  lengthRef.current = visible.length;
  const current = visible[Math.min(active, visible.length - 1)];
  const collection = useMemo(() => new Set(movies.filter(m => m.tmdbId && m.seasonNumber == null).map(m => filWorkKey(m.mediaType ?? 'movie', m.tmdbId!))), [movies]);
  const say = (message: string) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(message); toastTimer.current = setTimeout(() => setToast(undefined), 3500);
  };
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);
  useEffect(() => {
    let alive = true;
    setLoading(true); setError(undefined); setActive(0); setVideoId(null);
    (async () => {
      const follows = await getFilFollows(profileId);
      const result = await getCinemaFil(moviesRef.current, follows.data, language);
      if (!alive) return;
      setItems(result.data); setError(result.error || follows.error);
      setLoading(false);
      if (result.data.length) markFilOpened(profileId);
      const engagement = await getFilCounts(result.data.map(i => i.id));
      if (alive) setCounts(engagement);
    })().catch(() => { if (alive) { setError('cineFil.loadError'); setLoading(false); } });
    return () => { alive = false; };
    // La collection peut changer pendant un ajout : garder la carte à l'écran.
  }, [profileId, language, refresh]);
  useEffect(() => {
    const key = `${category}:${media}`;
    if (previousFilter.current !== key) {
      previousFilter.current = key;
      setActive(0); setVideoId(null); feed.current?.scrollTo({ top: 0 });
    } else if (visible.length && active >= visible.length) {
      setActive(visible.length - 1);
      if (feed.current) feed.current.scrollTop = (visible.length - 1) * feed.current.clientHeight;
    }
  }, [category, media, active, visible.length]);
  useEffect(() => { setVideoId(null); }, [current?.id]);
  useEffect(() => {
    const el = feed.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    let height = el.clientHeight;
    const observer = new ResizeObserver(() => {
      if (height !== el.clientHeight) { height = el.clientHeight; el.scrollTop = Math.max(0, Math.min(activeRef.current, lengthRef.current - 1)) * height; }
    });
    observer.observe(el); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    frame.current?.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: muted ? 'mute' : 'unMute', args: [] }), 'https://www.youtube-nocookie.com');
  }, [muted]);
  const updateCounts = async () => {
    try { setCounts(await getFilCounts(items.map(i => i.id))); } catch { /* Les chiffres reviendront à la prochaine ouverture. */ }
  };
  const react = async (item: FilItem) => {
    if (busy) return;
    const before = counts[item.id]?.liked ?? liked.has(item.id);
    setBusy(item.id);
    try {
      const result = await setFilLike(profileId, item.id, !before);
      if (result.error) say(t(result.error));
      else {
        haptics.soft();
        setLiked(previous => { const next = new Set(previous); result.data ? next.add(item.id) : next.delete(item.id); return next; });
        setCounts(previous => {
          if (result.localOnly) { const next = { ...previous }; delete next[item.id]; return next; }
          return previous[item.id] ? { ...previous, [item.id]: { ...previous[item.id], liked: result.data, likes: Math.max(0, previous[item.id].likes + (result.data ? 1 : -1)) } } : previous;
        });
      }
    } finally { setBusy(null); }
  };
  const add = async (item: FilItem) => {
    if (!item.work || busy) return;
    const key = filWorkKey(item.work.mediaType, item.work.tmdbId);
    if (collection.has(key) || added.has(key)) return;
    setBusy(item.id);
    try {
      if (await onAdd(item.work.tmdbId, item.work.mediaType)) {
        setAdded(previous => new Set(previous).add(key)); say(t('cineFil.addedToast')); haptics.success();
      } else say(t('cineFil.addError'));
    } catch { say(t('cineFil.addError')); }
    finally { setBusy(null); }
  };
  const openSheet = (name: typeof sheet, item: FilItem) => { setVideoId(null); setSheetItem(item); setSheet(name); };
  const date = (iso?: string) => iso && Number.isFinite(Date.parse(iso)) ? new Date(iso).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'long' }) : '';
  const reason = (item: FilItem) => item.reason === 'because' ? t('cineFil.because', { title: item.reasonTitle || '' }) : t(`cineFil.reason.${item.reason}`);
  const share = async (item: FilItem) => {
    const url = item.sourceUrl || (item.work ? `https://www.themoviedb.org/${item.work.mediaType}/${item.work.tmdbId}` : 'https://thebitter.watch');
    const text = `${item.title}\n${url}`;
    try {
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text); say(t('cineFil.copied'));
    } catch (e) {
      if ((e as { name?: string }).name !== 'AbortError') openSheet('share', item);
    }
  };
  const move = (delta: number) => {
    const index = Math.max(0, Math.min(visible.length - 1, active + delta));
    setActive(index); if (feed.current) feed.current.scrollTop = index * feed.current.clientHeight;
  };
  const showCard = (item: FilItem) => {
    setDetail(null); setCategory('foryou'); setMedia('all');
    // Les filtres ont leur propre effet de remise à zéro : attendre le prochain rendu.
    setTimeout(() => { const index = available.findIndex(i => i.id === item.id); setActive(Math.max(0, index)); if (feed.current) feed.current.scrollTop = Math.max(0, index) * feed.current.clientHeight; }, 0);
  };
  return <>
    {createPortal(<div {...dialog.props} className="fixed inset-0 z-[70] bg-[#080808] text-white" data-testid="cinema-fil">
      <header className="absolute inset-x-0 top-0 z-10 mx-auto max-w-[480px] bg-gradient-to-b from-black/90 to-transparent px-4 pb-6 pt-[calc(env(safe-area-inset-top,0px)+14px)]">
        <div className="flex items-center justify-between"><button type="button" onClick={onClose} aria-label={t('cineFil.back')} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/25"><ArrowLeft size={19} /></button><h1 className="text-[25px] font-black tracking-tighter">{t('cineFil.title')}<span className="text-bitter-lime">.</span></h1><button type="button" aria-label={t('cineFil.filters')} onClick={() => { setVideoId(null); setSheet('filters'); }} className="flex h-9 w-9 items-center justify-center rounded-full border border-white/15 bg-black/25"><SlidersHorizontal size={19} /></button></div>
        <div className="mt-4 flex items-center gap-5 border-b border-white/15" role="tablist" aria-label={t('cineFil.categories')}>
          {(['foryou', 'news', 'trailers'] as const).map(id => <button key={id} type="button" role="tab" aria-selected={category === id} onClick={() => setCategory(id)} className={`relative pb-3 text-xs font-extrabold ${category === id ? 'text-white' : 'text-white/50'}`}>{t(`cineFil.category.${id}`)}{category === id && <i className="absolute inset-x-0 bottom-[-1px] h-[3px] rounded-full bg-bitter-lime" />}</button>)}
        </div>
      </header>
      <div ref={feed} className="mx-auto h-full max-w-[480px] snap-y snap-mandatory overflow-y-auto overscroll-contain no-scrollbar" tabIndex={0} aria-label={t('cineFil.scroll')}
        onScroll={() => { if (feed.current) setActive(Math.round(feed.current.scrollTop / feed.current.clientHeight)); }}
        onKeyDown={e => { if (e.target instanceof HTMLElement && e.target.matches('input,textarea,select')) return; if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); move(e.key === 'ArrowDown' ? 1 : -1); } }}>
        {loading ? <div className="flex h-full flex-col items-center justify-center gap-4"><Loader2 size={28} className="animate-spin text-bitter-lime" /><p className="text-xs text-white/60">{t('cineFil.loading')}</p></div> : !visible.length ? <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center"><Clapperboard size={32} className="text-bitter-lime" /><p className="text-sm text-white/70">{t(error || 'cineFil.empty')}</p><button type="button" onClick={() => { setCategory('foryou'); setMedia('all'); setRefresh(n => n + 1); }} className="flex items-center gap-2 rounded-2xl bg-bitter-lime px-5 py-3 text-xs font-black text-charcoal"><RefreshCw size={15} />{t('cineFil.retry')}</button></div> : visible.map((item, index) => {
          const count = counts[item.id]; const isLiked = count?.liked ?? liked.has(item.id);
          const inCollection = item.work && (collection.has(filWorkKey(item.work.mediaType, item.work.tmdbId)) || added.has(filWorkKey(item.work.mediaType, item.work.tmdbId)));
          const playing = index === active && videoId === item.id && !!item.videoKey && !sheet && !detail;
          const headline = item.kind === 'friend' ? `« ${item.description.slice(0, 105)}${item.description.length > 105 ? '…' : ''} »` : item.kind === 'release' ? t('cineFil.releaseHeadline') : item.title;
          return <article key={item.id} className="relative isolate h-full snap-start snap-always overflow-hidden" aria-label={item.title} data-fil-kind={item.kind}>
            {item.image && <img src={item.image} alt="" loading={index < 2 ? 'eager' : 'lazy'} className="absolute inset-0 -z-20 h-full w-full object-cover" onError={e => { e.currentTarget.style.opacity = '0'; }} />}
            <div className="absolute inset-0 -z-10 bg-[linear-gradient(180deg,rgba(0,0,0,.9)_0%,rgba(0,0,0,.25)_32%,rgba(0,0,0,.15)_45%,rgba(0,0,0,.8)_70%,#000_100%)]" />
            <div className="absolute left-5 right-5 top-[calc(env(safe-area-inset-top,0px)+142px)] flex items-center justify-between gap-3"><span className="inline-flex items-center gap-1.5 rounded-full bg-bitter-lime px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-charcoal">{item.kind === 'friend' ? <Users size={11} /> : item.kind === 'trailer' ? <Play size={11} /> : <Sparkles size={11} />}{t(`cineFil.kind.${item.kind}`)}</span><span className="rounded-full border border-white/20 bg-black/30 px-3 py-1.5 text-[9px] font-bold backdrop-blur-md">{date(item.publishedAt) || t(item.mediaType === 'tv' ? 'cineFil.series' : 'cineFil.film')}</span></div>
            <p className="absolute left-5 right-5 top-[calc(env(safe-area-inset-top,0px)+182px)] flex items-center gap-1.5 text-[11px] font-semibold text-white/80"><Sparkles size={12} className="shrink-0 text-bitter-lime" />{reason(item)}</p>
            {item.kind !== 'trailer' && <h2 className="cinema-fil-headline absolute left-5 right-[70px] top-[31%] line-clamp-5 font-black leading-[1] tracking-[-.06em] [text-wrap:balance]" style={{ fontSize: 'clamp(28px,8vw,42px)' }}>{headline}{item.kind === 'friend' && <span className="mt-3 block text-bitter-lime">{item.friendRating?.toFixed(1).replace('.', language === 'en' ? '.' : ',')} / 10</span>}</h2>}
            {item.kind === 'trailer' && !playing && <button type="button" onClick={() => { setMuted(true); setVideoId(item.id); }} aria-label={t('cineFil.play', { title: item.title })} className="absolute left-1/2 top-[43%] z-[4] flex h-16 w-16 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border border-white/40 bg-black/35 backdrop-blur-md"><Play size={27} fill="currentColor" className="ml-1" /></button>}
            {playing && <div className="absolute inset-x-0 top-[30%] z-[4] aspect-video bg-black"><iframe ref={frame} src={youtubeEmbed(item.videoKey!, { controls: true, muted: true })} title={t('cineFil.play', { title: item.title })} allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen referrerPolicy="strict-origin-when-cross-origin" className="h-full w-full border-0" /><button type="button" onClick={() => setMuted(m => !m)} aria-label={t(muted ? 'cineFil.soundOn' : 'cineFil.soundOff')} className="absolute right-2 top-2 rounded-full bg-black/70 p-2">{muted ? <VolumeX size={16} /> : <Volume2 size={16} />}</button></div>}
            <div className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+37px)] left-5 right-[76px] z-[5]">
              <div className="mb-3 flex items-center gap-2 text-[11px] font-bold"><span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-black ${item.kind === 'friend' ? 'bg-forest text-white' : 'bg-white text-charcoal'}`}>{item.kind === 'friend' ? item.source[0] : 'B.'}</span>{item.source}</div>
              <h3 className="mb-2 text-[27px] font-black leading-tight tracking-tighter [text-wrap:balance]">{item.kind === 'news' ? <><span className="cinema-fil-footer-title">{item.work?.title || t('cineFil.newsTitle')}</span><span className="cinema-fil-compact-title">{item.title}</span></> : item.work?.title || item.title}</h3>
              <p className="mb-3 line-clamp-3 text-xs leading-relaxed text-white/70">{item.description}</p>
              {item.kind === 'news' && <button type="button" onClick={() => openSheet('source', item)} className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-extrabold">{t('cineFil.readSource')}<ArrowUpRight size={13} /></button>}
              {item.kind === 'friend' && <button type="button" onClick={() => openSheet('comments', item)} className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-extrabold">{t('cineFil.readReview')}<ArrowUpRight size={13} /></button>}
              {item.videoKey && <a href={`https://www.youtube.com/watch?v=${item.videoKey}`} target="_blank" rel="noopener noreferrer" className="mb-3 inline-flex items-center gap-1.5 text-[10px] font-bold text-white/70">{t('cineFil.youtube')}<ExternalLink size={12} /></a>}
              {item.work && <><button type="button" onClick={() => { setVideoId(null); setDetail(item); }} className="mb-3 flex w-full items-center gap-2 rounded-2xl border border-white/20 bg-white/5 p-2 text-left backdrop-blur-md">{item.work.poster && <img src={item.work.poster} alt="" className="h-11 w-8 shrink-0 rounded-md object-cover" />}<span className="min-w-0 flex-1"><b className="block truncate text-[11px] font-black">{item.work.title}</b><small className="mt-1 block text-[9px] text-white/50">{t(item.work.mediaType === 'tv' ? 'cineFil.series' : 'cineFil.film')}{item.work.year ? ` · ${item.work.year}` : ''}</small></span><ChevronRight size={14} /></button><FilFollowButton compact profileId={profileId} work={item.work} onToast={say} /></>}
            </div>
            <aside className="absolute bottom-[calc(env(safe-area-inset-bottom,0px)+52px)] right-3 z-[6] flex flex-col gap-5" aria-label={t('cineFil.actions')}>
              <button type="button" onClick={() => void react(item)} disabled={busy === item.id} aria-pressed={isLiked} aria-label={t(isLiked ? 'cineFil.unlike' : 'cineFil.like')} className="flex w-10 flex-col items-center gap-1.5"><span className={`flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md ${isLiked ? 'border-bitter-lime bg-bitter-lime text-charcoal' : 'border-white/20 bg-white/10'}`}><Heart size={20} fill={isLiked ? 'currentColor' : 'none'} /></span><span className="text-[9px] font-bold">{count ? count.likes : t('cineFil.likeShort')}</span></button>
              <button type="button" onClick={() => openSheet('comments', item)} aria-label={t('cineFil.commentsTitle')} className="flex w-10 flex-col items-center gap-1.5"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md"><MessageCircle size={20} /></span><span className="text-[9px] font-bold">{count ? count.comments : t('cineFil.commentsShort')}</span></button>
              {item.work && <button type="button" onClick={() => void add(item)} disabled={!!inCollection || busy === item.id} aria-label={t(inCollection ? 'cineFil.inList' : 'cineFil.add')} className="flex w-10 flex-col items-center gap-1.5 disabled:opacity-100"><span className={`flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md ${inCollection ? 'border-bitter-lime bg-bitter-lime text-charcoal' : 'border-white/20 bg-white/10'}`}>{busy === item.id ? <Loader2 size={20} className="animate-spin" /> : inCollection ? <Check size={20} /> : <Bookmark size={20} />}</span><span className="text-[9px] font-bold">{t(inCollection ? 'cineFil.inListShort' : 'cineFil.listShort')}</span></button>}
              <button type="button" onClick={() => void share(item)} aria-label={t('cineFil.share')} className="flex w-10 flex-col items-center gap-1.5"><span className="flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-white/10 backdrop-blur-md"><Share2 size={20} /></span><span className="text-[9px] font-bold">{t('cineFil.share')}</span></button>
            </aside>
            <span className="pointer-events-none absolute inset-x-0 bottom-[calc(env(safe-area-inset-bottom,0px)+11px)] flex items-center justify-center gap-1 text-[9px] text-white/35"><ArrowDown size={11} />{t('cineFil.scroll')}</span>
          </article>;
        })}
      </div>
      {error && items.length > 0 && <button type="button" onClick={() => { say(t(error)); }} className="absolute right-3 top-[calc(env(safe-area-inset-top,0px)+112px)] z-10 rounded-full bg-black/70 px-3 py-1.5 text-[9px] font-bold text-orange-300">{t('cineFil.partial')}</button>}
    </div>, document.body)}
    {toast && createPortal(<div role="status" className="fixed bottom-[calc(env(safe-area-inset-bottom,0px)+24px)] left-4 right-4 z-[190] mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-bitter-lime px-4 py-3 text-xs font-bold text-charcoal"><Check size={16} />{toast}</div>, document.body)}
    {sheet === 'filters' && <FilSheet title={t('cineFil.filterTitle')} onClose={() => setSheet(null)}><p className="mb-4 text-xs text-stone-400">{t('cineFil.filterHint')}</p><div className="mb-6 flex gap-2">{(['all', 'movie', 'tv'] as const).map(id => <button key={id} type="button" onClick={() => setMedia(id)} aria-pressed={media === id} className={`rounded-full border px-5 py-3 text-xs font-bold ${media === id ? 'border-charcoal bg-charcoal text-white dark:border-white dark:bg-white dark:text-charcoal' : 'border-stone-200 dark:border-white/10'}`}>{t(`cineFil.media.${id}`)}</button>)}</div><button type="button" onClick={() => setSheet(null)} className="w-full rounded-2xl bg-bitter-lime py-4 text-xs font-black text-charcoal">{t('cineFil.applyFilters')}</button><button type="button" onClick={() => { setSheet(null); setRefresh(n => n + 1); }} className="mt-3 flex w-full items-center justify-center gap-2 py-3 text-xs font-bold text-stone-400"><RefreshCw size={14} />{t('cineFil.refresh')}</button></FilSheet>}
    {sheet === 'comments' && sheetItem && <FilComments key={sheetItem.id} item={sheetItem} profileId={profileId} onClose={() => setSheet(null)} onChanged={() => void updateCounts()} />}
    {sheet === 'source' && sheetItem && <FilSheet title={t('cineFil.sourceTitle')} onClose={() => setSheet(null)}><p className="mb-3 text-[10px] font-black uppercase tracking-widest text-stone-400">{sheetItem.source} · {date(sheetItem.publishedAt)}</p><h3 className="mb-4 text-2xl font-black tracking-tighter">{sheetItem.title}</h3><p className="mb-5 text-sm leading-relaxed text-stone-500 dark:text-stone-400">{sheetItem.description}</p><p className="mb-4 text-[11px] text-stone-400">{t('cineFil.sourceHint')}</p><a href={sheetItem.sourceUrl} target="_blank" rel="noopener noreferrer" className="flex w-full items-center justify-center gap-2 rounded-2xl bg-bitter-lime px-5 py-4 text-xs font-black text-charcoal">{t('cineFil.openSource')}<ExternalLink size={15} /></a></FilSheet>}
    {sheet === 'share' && sheetItem && <FilSheet title={t('cineFil.share')} onClose={() => setSheet(null)}><p className="mb-4 text-sm font-bold">{sheetItem.title}</p><input readOnly aria-label={t('cineFil.shareLink')} value={sheetItem.sourceUrl || `https://www.themoviedb.org/${sheetItem.work?.mediaType}/${sheetItem.work?.tmdbId}`} onFocus={e => e.target.select()} className="w-full rounded-2xl border border-stone-200 bg-white p-4 text-xs dark:border-white/10 dark:bg-[#1a1a1a]" /><p className="mt-3 text-xs text-stone-400">{t('cineFil.copyHint')}</p></FilSheet>}
    {detail?.work && <MovieDetailModal tmdbId={detail.work.tmdbId} mediaType={detail.work.mediaType} isOpen onClose={() => setDetail(null)} onAction={(id, status) => { onAction(id, detail.work!.mediaType, status); }} profileId={profileId} myPlatformIds={platformIds} onToast={say} filItems={available.filter(item => item.work && filWorkKey(item.work.mediaType, item.work.tmdbId) === filWorkKey(detail.work!.mediaType, detail.work!.tmdbId))} onFilItem={showCard} />}
  </>;
};
export default CinemaFil;
