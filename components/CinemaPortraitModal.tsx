import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, ChevronRight, Globe, Loader2, Plus, Share2, Sparkles, Check } from 'lucide-react';
import type { Movie, UserProfile } from '../types';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { buildCinemaPortrait, PORTRAIT_MIN_FILMS, PORTRAIT_TYPES, portraitGenres } from '../utils/cinemaPortrait';
import { ratingOf } from '../utils/ratingHistory';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { getRecommendations } from '../services/tmdb';
import { computeArchetypeEvolution } from '../utils/insights';
import { shareCinemaPortrait } from '../utils/portraitShare';
import { TMDB_API_KEY, TMDB_BASE_URL } from '../constants';

type Discovery = Awaited<ReturnType<typeof getRecommendations>>[number] & { because: string };
export default function CinemaPortraitModal({ movies, profile, onClose, onFilm, onDiscovery, onWatchlist }: {
  movies: Movie[]; profile: UserProfile; onClose: () => void;
  onFilm: (movie: Movie) => void; onDiscovery: (id: number) => void; onWatchlist: (id: number) => Promise<boolean>;
}) {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('portraitDetail.title'));
  const portrait = useMemo(() => buildCinemaPortrait(movies, profile), [movies, profile]);
  const { archetype } = portrait;
  const [method, setMethod] = useState(false);
  const [trait, setTrait] = useState<string | null>(null);
  const [period, setPeriod] = useState<'recent' | 'history'>('recent');
  const [discovery, setDiscovery] = useState<Discovery | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [shareError, setShareError] = useState(false);
  const [backdrop, setBackdrop] = useState<string | null>(null);
  const top = portrait.favorites[0];
  const idsKey = movies.filter(m => (m.mediaType ?? 'movie') === 'movie' && m.tmdbId != null).map(m => m.tmdbId).sort().join(',');
  const favoritesKey = portrait.favorites.map(m => `${m.tmdbId}:${m.title}`).join('|');
  useEffect(() => {
    let alive = true; setBackdrop(null);
    if (top?.tmdbId && TMDB_API_KEY) void fetch(`${TMDB_BASE_URL}/movie/${top.tmdbId}?api_key=${TMDB_API_KEY}`)
      .then(response => response.ok ? response.json() : null)
      .then(data => { if (alive && data?.backdrop_path) setBackdrop(`https://image.tmdb.org/t/p/w780${data.backdrop_path}`); })
      .catch(() => {});
    return () => { alive = false; };
  }, [top?.tmdbId]);
  useEffect(() => {
    let alive = true; setDiscovery(null); setSaveError(false); setLoading(true);
    const excluded = new Set(idsKey.split(',').filter(Boolean).map(Number));
    const seeds = portrait.favorites;
    void Promise.all(seeds.map(movie => getRecommendations(movie.tmdbId!))).then(rows => {
      if (!alive) return;
      for (let index = 0; index < rows.length; index++) {
        const item = rows[index].find(movie => movie.poster_path && !excluded.has(movie.id));
        if (item) { setDiscovery({ ...item, because: seeds[index].title }); break; }
      }
    }).catch(() => {}).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
    // Identités stables : modifier un réglage ou ouvrir un trait ne relance pas les requêtes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey, favoritesKey]);
  const history = useMemo(() => computeArchetypeEvolution(archetype.films, profile), [archetype.films, profile]);
  const title = t(`portraitDetail.${archetype.type.id}.title`);
  const description = t(`portraitDetail.${archetype.type.id}.description`);
  const number = (value: number) => value.toLocaleString(language === 'fr' ? 'fr-FR' : 'en-GB', { maximumFractionDigits: 1 });
  const evidence = portrait.evidence;
  const filmButtons = (films: Movie[]) => <div className="mt-4 grid grid-cols-3 gap-2.5">{films.map(movie => <button type="button" key={movie.id} className="min-w-0 text-left" onClick={() => onFilm(movie)}>
    <div className="relative aspect-[2/3] overflow-hidden rounded-xl bg-white/5">{movie.posterUrl ? <img src={resizeTmdbImage(movie.posterUrl, 'w185') ?? undefined} alt={movie.title} className="h-full w-full object-cover" loading="lazy" /> : <span className="p-2 text-xs">{movie.title}</span>}<span className="absolute bottom-1.5 left-1.5 rounded-full bg-bitter-lime px-1.5 py-0.5 text-[10px] font-black text-charcoal">{number(ratingOf(movie)!)}</span></div>
    <b className="mt-2 block truncate text-[10px]">{movie.title}</b><small className="mt-0.5 block truncate text-[9px] text-white/40">{portraitGenres(movie.genre)[0]}</small>
  </button>)}</div>;
  const heading = (text: string) => <h3 className="mb-3 text-lg font-black tracking-tight">{text}</h3>;
  return createPortal(<div {...dialog.props} className="fixed inset-0 z-[160] flex h-[100dvh] flex-col overflow-hidden bg-[#0c0c0c] text-white">
    <header className="mx-auto flex w-full max-w-lg shrink-0 items-center gap-3 bg-[#0c0c0c] px-6 pb-3" style={{ paddingTop: 'calc(var(--sat, 0px) + 0.75rem)' }}><button type="button" onClick={onClose} aria-label={t('common.back')} className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/10"><ArrowLeft size={17} /></button><h1 className="min-w-0 flex-1 text-sm font-black">{t('portraitDetail.title')}</h1><span className="shrink-0 text-[9px] font-bold text-white/40">THE BITTER</span></header>
    <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain" style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y pinch-zoom' }}>
    <div className="mx-auto max-w-lg pb-[calc(var(--sab,0px)+32px)]">
      <section className="relative isolate flex min-h-[385px] flex-col justify-end overflow-hidden px-6 pb-6 pt-28">
        {(backdrop || top?.posterUrl) && <img src={backdrop || resizeTmdbImage(top?.posterUrl, 'w780') || ''} alt="" className={`absolute inset-0 -z-20 h-full w-full object-cover ${backdrop ? '' : 'blur-sm'}`} />}
        <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/20 via-[#0c0c0c]/50 to-[#0c0c0c]" />
        <p className="text-[9px] font-bold uppercase tracking-[0.16em] text-white/70">{t('portraitDetail.owner', { name: profile.firstName })}</p>
        <h2 className="mt-3 text-[clamp(36px,10vw,52px)] font-black leading-[.95] tracking-[-.065em]">{title}</h2>
        <span className="mt-3 self-start rounded-full bg-bitter-lime px-2.5 py-1 text-[9px] font-black uppercase text-charcoal">{t(`portraitDetail.${archetype.type.id}.tag`)}</span>
        <p className="mt-3 max-w-[32ch] text-sm font-semibold leading-relaxed text-white/80">{description}</p>
        <div className="mt-5 grid grid-cols-2 divide-x divide-white/10 rounded-2xl border border-white/10 bg-white/5">{[[archetype.films.length, 'portraitDetail.films'], [archetype.genres.length, 'portraitDetail.genres']].map(([value, key]) => <div key={key} className="px-4 py-3"><b className="block text-2xl font-black">{value}</b><small className="mt-1 block text-[9px] font-bold uppercase text-white/40">{t(String(key))}</small></div>)}</div>
      </section>
      <div className="space-y-7 px-6">
        {!archetype.confirmed && <p className="rounded-2xl border border-white/10 p-4 text-xs leading-relaxed text-white/60">{t('portraitDetail.provisional', { n: archetype.observedCount, min: PORTRAIT_MIN_FILMS })}</p>}
        <section>{heading(t('portraitDetail.why'))}<div className="rounded-[22px] border border-white/10 bg-[#1c1b19] p-4">
          <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-bitter-lime"><Globe size={12} />{t('portraitDetail.evidence')}</div>
          <h4 className="mt-3 text-xl font-black tracking-tight">{t(`portraitDetail.${archetype.type.id}.reason`)}</h4>
          <p className="mt-2 text-xs leading-relaxed text-white/55">{t(archetype.type.id === 'omnivore' ? 'portraitDetail.diversityProof' : 'portraitDetail.feelingProof', { n: archetype.type.id === 'omnivore' ? archetype.genres.length : archetype.observedCount })}</p>
          {evidence.length >= 2 ? filmButtons(evidence) : <p className="mt-4 text-xs text-white/50">{t('portraitDetail.noEvidence')}</p>}
          <button type="button" className="mt-4 flex w-full items-center justify-center gap-2 border-t border-white/10 pt-3 text-xs font-bold text-white/70" aria-expanded={method} aria-controls="portrait-method" onClick={() => setMethod(value => !value)}>{t('portraitDetail.method')}<ChevronRight size={13} /></button>
          {method && <p id="portrait-method" className="mt-3 text-xs leading-relaxed text-white/55">{t('portraitDetail.methodBody', { n: archetype.observedCount })}</p>}
        </div></section>
        <section>{heading(t('portraitDetail.nuances'))}<div className="space-y-2">{portrait.traits.length ? portrait.traits.map(item => <div key={item.key} className="rounded-2xl border border-white/10 bg-white/[.03]">
          <button type="button" className="flex w-full items-center gap-3 p-4 text-left" onClick={() => setTrait(value => value === item.key ? null : item.key)} aria-expanded={trait === item.key} aria-controls={`portrait-trait-${item.key}`}><Sparkles size={17} className="text-bitter-lime" /><span className="flex-1"><b className="block text-xs">{t(`portraitDetail.trait.${item.key}`)}</b><small className="mt-1 block text-[10px] text-white/45">{t(item.source === 'feeling' ? 'portraitDetail.feelingScore' : 'portraitDetail.criterionScore', { score: number(item.value), n: item.count })}</small></span><ChevronRight size={14} /></button>
          {trait === item.key && <div id={`portrait-trait-${item.key}`} className="px-4 pb-4">{filmButtons(item.evidence)}</div>}
        </div>) : <p className="text-xs leading-relaxed text-white/50">{t('portraitDetail.noNuances')}</p>}</div></section>
        <section><div className="mb-3 flex flex-wrap items-center justify-between gap-3">{heading(t('portraitDetail.evolution'))}<div className="flex rounded-full border border-white/10 p-1">{(['recent', 'history'] as const).map(value => <button type="button" key={value} onClick={() => setPeriod(value)} aria-pressed={period === value} className={`rounded-full px-2 py-1 text-[9px] font-bold ${period === value ? 'bg-white/10' : 'text-white/40'}`}>{t(`portraitDetail.${value}`)}</button>)}</div></div>
          <div className="rounded-[22px] border border-bitter-lime/15 bg-gradient-to-br from-[#22241a] to-[#191918] p-5">
            {period === 'recent' ? <>{portrait.evolution ? <><h4 className="text-lg font-black">{t(`portraitDetail.change.${portrait.evolution.kind}`)}</h4><p className="mt-2 text-xs leading-relaxed text-white/60">{portrait.evolution.kind === 'genre' ? t('portraitDetail.genreChange', { genre: portrait.evolution.genre, current: portrait.evolution.current, previous: portrait.evolution.previous }) : portrait.evolution.kind === 'rating' ? t('portraitDetail.ratingChange', { gap: number(portrait.evolution.gap) }) : t('portraitDetail.stableChange')}</p>{filmButtons(portrait.evolution.evidence)}</> : <p className="text-xs leading-relaxed text-white/50">{t('portraitDetail.noEvolution')}</p>}</> : <>{history ? <><ol className="space-y-4">{history.snapshots.filter((snapshot, index, rows) => index === 0 || index === rows.length - 1 || snapshot.title !== rows[index - 1].title).map(snapshot => <li key={snapshot.movieCount} className="flex gap-3"><span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-bitter-lime" /><div><b className="block text-xs">{t(`portraitDetail.${PORTRAIT_TYPES.find(type => type.title === snapshot.title)?.id}.title`)}</b><small className="text-[10px] text-white/40">{t('portraitDetail.milestone', { n: snapshot.movieCount })}</small></div></li>)}</ol><p className="mt-4 text-[10px] leading-relaxed text-white/40">{t('portraitDetail.historyDisclaimer')}</p></> : <p className="text-xs text-white/50">{t('portraitDetail.noHistory')}</p>}</>}
          </div>
        </section>
        <section>{heading(t('portraitDetail.discovery'))}{loading ? <p className="flex items-center gap-2 text-xs text-white/50"><Loader2 className="animate-spin" size={14} />{t('portraitDetail.loading')}</p> : discovery ? <div className="flex gap-4 rounded-[22px] border border-white/10 bg-[#1c1b19] p-4">
          <button type="button" className="w-24 shrink-0" onClick={() => onDiscovery(discovery.id)} aria-label={discovery.title}><img src={`https://image.tmdb.org/t/p/w185${discovery.poster_path}`} alt="" className="aspect-[2/3] w-full rounded-xl object-cover" /></button><div className="min-w-0"><button type="button" className="text-left text-base font-black" onClick={() => onDiscovery(discovery.id)}>{discovery.title}</button><p className="mt-2 text-[11px] leading-relaxed text-white/55">{t('portraitDetail.because', { title: discovery.because })}</p><button type="button" disabled={saving} className="mt-3 flex items-center gap-1.5 rounded-xl bg-bitter-lime px-3 py-2 text-[10px] font-black text-charcoal disabled:opacity-50" onClick={async () => { if (saving) return; setSaving(true); setSaveError(false); try { const ok = await onWatchlist(discovery.id); if (ok) setDiscovery(null); else setSaveError(true); } catch { setSaveError(true); } finally { setSaving(false); } }}>{saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}{t('portraitDetail.watchlist')}</button>{saveError && <p role="alert" className="mt-2 text-xs text-orange-300">{t('portraitDetail.saveError')}</p>}</div>
        </div> : <p className="text-xs leading-relaxed text-white/50">{t('portraitDetail.noDiscovery')}</p>}</section>
        <section><button type="button" disabled={sharing} className="flex w-full items-center justify-center gap-2 rounded-2xl bg-bitter-lime py-4 text-xs font-black text-charcoal disabled:opacity-50" onClick={async () => { setSharing(true); setShareError(false); try { await shareCinemaPortrait(title, description, evidence.length >= 2 ? evidence : portrait.favorites, { name: profile.firstName, summary: t('portraitDetail.shareSummary', { films: archetype.films.length, genres: archetype.genres.length }) }); } catch { setShareError(true); } finally { setSharing(false); } }}>{sharing ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />}{t('portraitDetail.share')}</button>{shareError && <p role="alert" className="mt-2 text-xs text-orange-300">{t('portraitDetail.shareError')}</p>}<p className="mt-4 flex items-center justify-center gap-1.5 text-center text-[10px] text-white/35"><Check size={11} />{t('portraitDetail.refined')}</p></section>
      </div>
    </div>
    </div>
  </div>, document.body);
}
