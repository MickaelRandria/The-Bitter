import React, { useEffect, useMemo, useState } from 'react';
import { Play, Film } from 'lucide-react';
import { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { tmdbImage } from '../utils/tmdbImage';
import { getDisplayWeightedRating, hasVerdict } from '../utils/rating';
import JustWatchCredit from './JustWatchCredit';
import {
  FreeKind,
  FreeTitle,
  WATCH_HERE,
  archiveEmbed,
  archiveThumb,
  getFreeToWatch,
} from '../services/freeToWatch';

/**
 * « Gratuit et légal », dans Découvrir.
 *
 * Ce qui se regarde gratuitement en France en ce moment, par genre et par
 * plateforme ; toucher un titre ouvre sa fiche (ou « Ma note » s'il est déjà
 * noté), qui dit où le regarder. Et « À regarder ici » : quelques documentaires
 * du domaine public, lisibles sans quitter l'app.
 */
interface Props {
  movies?: Movie[];
  onOpen: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
  /** Le type affiché à l'ouverture : les séries depuis la partie Séries. */
  initialKind?: FreeKind;
}

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');

const FreeToWatchSection: React.FC<Props> = ({ movies = [], onOpen, initialKind = 'doc' }) => {
  const { t } = useLanguage();
  const [kind, setKind] = useState<FreeKind>(initialKind);
  const [provider, setProvider] = useState<number | null>(null);
  const [items, setItems] = useState<FreeTitle[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [film, setFilm] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    let alive = true;
    setItems(null);
    setFailed(false);
    setProvider(null);
    getFreeToWatch(kind)
      .then((list) => alive && setItems(list))
      .catch(() => {
        if (!alive) return;
        setItems([]);
        setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [kind]);

  /** Mes films, pour signaler ce que j'ai déjà vu ou noté. */
  const mine = useMemo(() => {
    const map = new Map<string, Movie>();
    for (const m of movies) {
      if (m.tmdbId == null || m.seasonNumber != null) continue;
      map.set(`${m.mediaType === 'tv' ? 'tv' : 'movie'}:${m.tmdbId}`, m);
    }
    return map;
  }, [movies]);

  /** Les plateformes présentes, de la plus fournie à la moins fournie. */
  const platforms = useMemo(() => {
    const counts = new Map<number, { id: number; name: string; logoPath: string; n: number }>();
    for (const item of items ?? []) {
      for (const p of item.providers) {
        const known = counts.get(p.id) ?? { id: p.id, name: p.name, logoPath: p.logoPath, n: 0 };
        known.n += 1;
        counts.set(p.id, known);
      }
    }
    return [...counts.values()].sort((a, b) => b.n - a.n).slice(0, 6);
  }, [items]);

  const shown = (items ?? []).filter((item) => provider == null || item.providers.some((p) => p.id === provider));
  const lead = shown[0];
  const rest = shown.slice(1);
  const current = WATCH_HERE[film];

  const open = (item: FreeTitle) => {
    haptics.soft();
    onOpen(item.tmdbId, item.mediaType);
  };

  const card = (item: FreeTitle) => {
    const p = item.providers[0];
    const known = mine.get(`${item.mediaType}:${item.tmdbId}`);
    const rated = known && known.status === 'watched' && hasVerdict(known) ? getDisplayWeightedRating(known) : null;
    return (
      <button
        key={`${item.mediaType}-${item.tmdbId}`}
        type="button"
        onClick={() => open(item)}
        className="shrink-0 w-[112px] text-left active:scale-[0.98] transition-transform"
      >
        <span className="relative block aspect-[2/3] rounded-xl overflow-hidden bg-stone-200 dark:bg-[#1a1a1a] shadow-[0_12px_20px_-14px_rgba(0,0,0,0.6)]">
          <img src={tmdbImage(item.posterPath, 'w185')} alt="" loading="lazy" decoding="async" className="w-full h-full object-cover" />
          {p && (
            <span className="absolute left-1.5 top-1.5 flex items-center gap-1 rounded-md bg-black/70 pl-0.5 pr-1.5 py-0.5 text-[8.5px] font-black text-white">
              <img src={tmdbImage(p.logoPath, 'w92')} alt="" className="w-3.5 h-3.5 rounded-[3px]" />
              {p.access === 'free' ? t('free.badgeFree') : t('free.badgeAds')}
            </span>
          )}
          {rated != null ? (
            <span className="absolute right-1.5 top-1.5 rounded-md bg-bitter-lime px-1.5 py-0.5 text-[9px] font-black tabular-nums text-charcoal">{fmt(rated)}</span>
          ) : known?.status === 'watchlist' ? (
            <span className="absolute right-1.5 top-1.5 rounded-md bg-white/90 px-1.5 py-0.5 text-[8.5px] font-black text-charcoal">{t('free.inList')}</span>
          ) : null}
        </span>
        <span className="mt-1.5 block text-[12px] font-black leading-tight text-charcoal dark:text-white line-clamp-2">{item.title}</span>
        <span className="block text-[10.5px] font-bold text-stone-500 dark:text-stone-400 truncate">
          {[item.year, p?.name].filter(Boolean).join(' · ')}
        </span>
      </button>
    );
  };

  const chip = (active: boolean) =>
    `shrink-0 h-9 px-3.5 rounded-full text-[12px] font-extrabold transition-colors ${
      active ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal' : 'bg-stone-100 text-charcoal dark:bg-[#1f1f1f] dark:text-white'
    }`;

  return (
    <section className="space-y-4" aria-labelledby="free-title">
      <div className="flex items-baseline justify-between px-1">
        <h2 id="free-title" className="text-[24px] font-black tracking-tighter text-charcoal dark:text-white">
          {t('free.title')}
        </h2>
        <span className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">{t('free.inFrance')}</span>
      </div>

      {lead && (
        <button
          type="button"
          onClick={() => open(lead)}
          className="relative w-full overflow-hidden rounded-[1.6rem] bg-charcoal text-left text-white min-h-[170px] flex items-end active:scale-[0.99] transition-transform"
        >
          <img src={tmdbImage(lead.posterPath, 'w500')} alt="" className="absolute inset-0 w-full h-full object-cover object-[center_30%] opacity-60" />
          <span className="absolute inset-0 bg-gradient-to-b from-black/0 via-black/40 to-black/90" />
          <span className="relative p-4 space-y-1">
            <span className="block text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">
              {t('free.leadKicker', { platform: lead.providers[0]?.name ?? '' })}
            </span>
            <span className="block text-[22px] font-black tracking-[-0.04em] leading-tight">{lead.title}</span>
            {lead.overview && <span className="block text-[11.5px] font-semibold text-white/80 line-clamp-2">{lead.overview}</span>}
          </span>
        </button>
      )}

      <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('free.kind')}>
        {(['doc', 'film', 'serie'] as FreeKind[]).map((k) => (
          <button key={k} type="button" aria-pressed={kind === k} onClick={() => setKind(k)} className={chip(kind === k)}>
            {t(`free.kind.${k}`)}
          </button>
        ))}
      </div>
      {platforms.length > 1 && (
        <div className="-mx-4 px-4 flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" role="group" aria-label={t('free.platform')}>
          {platforms.map((p) => (
            <button
              key={p.id}
              type="button"
              aria-pressed={provider === p.id}
              onClick={() => setProvider(provider === p.id ? null : p.id)}
              className={`${chip(provider === p.id)} flex items-center gap-1.5 pl-1.5`}
            >
              <img src={tmdbImage(p.logoPath, 'w92')} alt="" className="w-6 h-6 rounded-md" />
              {p.name}
            </button>
          ))}
        </div>
      )}

      {/* À regarder ici : le lecteur ne se charge qu'au toucher, pour ne rien télécharger d'avance. */}
      <div className="rounded-[1.4rem] bg-white dark:bg-[#161616] border border-stone-200/70 dark:border-white/10 p-3 space-y-3">
        <div className="flex items-baseline justify-between px-0.5">
          <h3 className="text-[16px] font-black tracking-tight text-charcoal dark:text-white">{t('free.hereTitle')}</h3>
          <span className="text-[10.5px] font-extrabold text-stone-500 dark:text-stone-400">{t('free.hereSub')}</span>
        </div>
        <div className="relative aspect-video rounded-xl overflow-hidden bg-black">
          {playing ? (
            <iframe
              key={current.id}
              src={archiveEmbed(current.id)}
              title={current.title}
              className="absolute inset-0 w-full h-full"
              allow="autoplay; fullscreen; picture-in-picture"
              allowFullScreen
              referrerPolicy="strict-origin-when-cross-origin"
            />
          ) : (
            <button
              type="button"
              onClick={() => {
                haptics.medium();
                setPlaying(true);
              }}
              aria-label={t('free.play', { title: current.title })}
              className="absolute inset-0 flex items-center justify-center"
            >
              <img src={archiveThumb(current.id)} alt="" className="absolute inset-0 w-full h-full object-cover opacity-70" />
              <span className="absolute inset-0 bg-gradient-to-t from-black/70 to-black/10" />
              <span className="relative w-14 h-14 rounded-full bg-bitter-lime text-charcoal flex items-center justify-center shadow-lg">
                <Play size={22} fill="currentColor" className="ml-0.5" />
              </span>
              <span className="absolute left-3 bottom-2 text-[10px] font-extrabold text-white/90">{t('free.source')}</span>
            </button>
          )}
        </div>
        <div className="px-0.5">
          <p className="text-[14px] font-black text-charcoal dark:text-white leading-tight">{current.title}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-stone-500 dark:text-stone-400 leading-snug">
            {current.by} · {current.year} · {current.minutes} min. {current.pitch}
          </p>
        </div>
        <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {WATCH_HERE.map((f, i) => (
            <button
              key={f.id}
              type="button"
              aria-pressed={i === film}
              onClick={() => {
                haptics.soft();
                setFilm(i);
                setPlaying(false);
              }}
              className="shrink-0 w-[128px] text-left"
            >
              <span className={`block aspect-video rounded-lg overflow-hidden bg-stone-200 dark:bg-[#222] ${i === film ? 'ring-2 ring-bitter-lime ring-offset-2 ring-offset-white dark:ring-offset-[#161616]' : ''}`}>
                <img src={archiveThumb(f.id)} alt="" loading="lazy" className="w-full h-full object-cover" />
              </span>
              <span className="mt-1.5 block text-[11px] font-black leading-tight text-charcoal dark:text-white line-clamp-2">{f.title}</span>
              <span className="block text-[10px] font-bold text-stone-500 dark:text-stone-400">
                {f.year} · {f.minutes} min
              </span>
            </button>
          ))}
        </div>
      </div>

      <div className="space-y-2.5">
        <h3 className="px-1 text-[16px] font-black tracking-tight text-charcoal dark:text-white flex items-baseline justify-between">
          {t(`free.list.${kind}`)}
          {items && <span className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">{shown.length}</span>}
        </h3>
        <div className="-mx-4 px-4 flex gap-2.5 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items == null &&
            Array.from({ length: 4 }).map((_, i) => (
              <span key={i} className="shrink-0 w-[112px] aspect-[2/3] rounded-xl bg-stone-100 dark:bg-[#1a1a1a] animate-pulse" />
            ))}
          {rest.map(card)}
        </div>
        {items != null && shown.length === 0 && (
          <p className="px-1 flex items-center gap-2 text-[12px] font-semibold text-stone-500 dark:text-stone-400">
            <Film size={14} />
            {failed ? t('free.failed') : t('free.empty')}
          </p>
        )}
      </div>

      <JustWatchCredit className="px-1" />
    </section>
  );
};

export default FreeToWatchSection;
