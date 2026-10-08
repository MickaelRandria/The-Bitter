import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Lock, X } from 'lucide-react';
import { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { resizeTmdbImage } from '../utils/tmdbImage';
import {
  CONSTAT_ORDER,
  CRITERIA,
  ClassiquesConstat,
  ConstatId,
  Constats,
  DureeConstat,
  EmotionsConstat,
  FilmRef,
  MaillonConstat,
  PhoneConstat,
  PublicConstat,
  PublicPoint,
  RevirementsConstat,
  computeConstats,
  filmPointsFrom,
} from '../utils/constats';

/**
 * « Tes constats » — l'onglet Profil des stats, sous l'archétype.
 *
 * Deux niveaux de lecture. La carte pose une question, y répond, donne un
 * chiffre avec son unité, et l'affiche d'un des films de la personne se fond
 * dans son fond (noir et blanc, teinté de la couleur du constat) : on la devine
 * avant de la reconnaître, ce qui donne envie de toucher. Le détail se
 * construit autour des affiches : l'affiche du film clé en tête, puis des
 * étagères de films qui prouvent le constat.
 *
 * Vert : ce qui fait monter la note. Orange : ce qui la fait baisser. Les
 * chiffres portent leur signe, pour que la couleur ne soit jamais seule à dire
 * le sens. Les cartes restent sombres dans les deux thèmes, comme l'archétype.
 */

const LIME = '#D9FF00';
const BURNT = '#F08A24';
const NEUTRAL = '#8A8A85';
const PALE = '#BDBAB2';
const GRID = '#2A2A28';
const INK = '#F5F4F0';
const INK2 = '#A9A69E';
const INK3 = '#6F6C66';

type Fmt = (x: number) => string;
type T = (key: string, params?: Record<string, string | number>) => string;

const useFmt = (): Fmt => {
  const { language } = useLanguage();
  return (x: number) => (language === 'en' ? x.toFixed(1) : x.toFixed(1).replace('.', ','));
};

/** −0,7 / +1,6 : le signe dit le sens, la couleur ne fait que le souligner. */
const signed = (x: number, fmt: Fmt) => `${x > 0.04 ? '+' : x < -0.04 ? '−' : ''}${fmt(Math.abs(x))}`;
const short = (title: string) => title.split(' :')[0];
const poster = (url: string | undefined, size: 'w154' | 'w342' = 'w154') => resizeTmdbImage(url, size);
const runtimeLabel = (min: number) => `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;

/* ───────────────────────── Pièces communes ───────────────────────── */

/** Barre horizontale sur une échelle de 0 à 10 : un libellé, une jauge, la valeur. */
const ScaleBar: React.FC<{ label: string; value: number; color: string; max?: number; text?: string }> = ({ label, value, color, max = 10, text }) => (
  <div className="grid grid-cols-[66px_1fr_30px] items-center gap-2 text-[11.5px] font-extrabold text-white/70">
    <span className="truncate">{label}</span>
    <span className="relative h-2.5 rounded-full bg-white/10 overflow-hidden">
      <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${Math.max(3, (value / max) * 100)}%`, background: color }} />
    </span>
    <span className="text-right font-black text-white tabular-nums">{text ?? value}</span>
  </div>
);

/**
 * Le fond de carte, façon jaquette : l'affiche occupe toute la carte, en noir
 * et blanc teinté de la couleur du constat, et s'efface vers le bas pour
 * laisser lire la phrase. Coupée en deux pour les émotions.
 */
const PosterBackdrop: React.FC<{ url?: string; tint: string } | { split: [string | undefined, string | undefined] }> = (props) => {
  const grain =
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='140' height='140'><filter id='n'><feTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' stitchTiles='stitch'/></filter><rect width='100%' height='100%' filter='url(%23n)'/></svg>\")";
  const layer = (url: string | undefined, tint: string, box: React.CSSProperties, mask: string) =>
    url ? (
      <>
        <div
          className="absolute bg-cover"
          style={{ ...box, backgroundImage: `url(${url})`, backgroundPosition: 'center 20%', filter: 'grayscale(1) contrast(1.25) brightness(1.05)', WebkitMaskImage: mask, maskImage: mask }}
        />
        <div className="absolute" style={{ ...box, background: tint, mixBlendMode: 'multiply', WebkitMaskImage: mask, maskImage: mask }} />
      </>
    ) : null;
  return (
    <div className="absolute inset-0 z-0 pointer-events-none" aria-hidden="true">
      {'split' in props ? (
        <>
          {layer(poster(props.split[0], 'w342'), LIME, { top: 0, left: 0, right: '50%', bottom: 0 }, 'linear-gradient(180deg, #000 50%, transparent 100%)')}
          {layer(poster(props.split[1], 'w342'), BURNT, { top: 0, left: '50%', right: 0, bottom: 0 }, 'linear-gradient(180deg, #000 50%, transparent 100%)')}
        </>
      ) : (
        layer(poster(props.url, 'w342'), props.tint, { inset: 0 }, 'linear-gradient(180deg, #000 60%, transparent 100%)')
      )}
      <div
        className="absolute inset-0"
        style={{ background: 'linear-gradient(180deg, rgba(11,11,11,.35) 0%, rgba(11,11,11,0) 25%, rgba(11,11,11,0) 45%, rgba(11,11,11,.95) 92%)' }}
      />
      <div className="absolute inset-0 opacity-[0.12] mix-blend-overlay" style={{ backgroundImage: grain }} />
    </div>
  );
};

/** Étagère d'affiches avec une pastille : l'écart, la note, le temps sur le téléphone… */
const Shelf: React.FC<{ title: string; films: (FilmRef & { badge: string; color: string })[] }> = ({ title, films }) =>
  films.length === 0 ? null : (
    <div className="space-y-2">
      <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{title}</p>
      <div className="-mx-6 flex gap-2.5 overflow-x-auto px-6 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {films.map((f) => (
          <figure key={f.id} className="m-0 w-[74px] shrink-0 space-y-1.5">
            <div
              className="relative h-[111px] w-[74px] rounded-[10px] bg-[#222] bg-cover bg-center shadow-[0_8px_18px_rgba(0,0,0,.45)]"
              style={{ backgroundImage: f.poster ? `url(${poster(f.poster)})` : undefined }}
            >
              {!f.poster && <span className="absolute inset-0 p-1.5 text-[10px] font-bold leading-tight text-stone-400">{short(f.title)}</span>}
              <i className="absolute bottom-1.5 left-1.5 rounded-full px-1.5 py-0.5 text-[11px] font-black not-italic text-[#111]" style={{ background: f.color }}>
                {f.badge}
              </i>
            </div>
            <figcaption className="line-clamp-2 text-[10.5px] font-bold leading-tight text-stone-400">{short(f.title)}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  );

/** Le film touché dans un graphique, avec son affiche. */
const Callout: React.FC<{ film: FilmRef | null; line: string; hint: string }> = ({ film, line, hint }) => (
  <div className="flex min-h-[76px] items-center gap-3 rounded-2xl bg-white/[0.06] p-2.5">
    {film ? (
      <>
        <div className="h-[57px] w-[38px] shrink-0 rounded-[7px] bg-[#222] bg-cover bg-center" style={{ backgroundImage: film.poster ? `url(${poster(film.poster)})` : undefined }} />
        <div className="min-w-0 text-xs leading-snug text-stone-400">
          <b className="block truncate text-[13.5px] font-black text-white">{film.title}</b>
          {line}
        </div>
      </>
    ) : (
      <p className="px-1 text-xs font-bold text-stone-500">{hint}</p>
    )}
  </div>
);

/** Deux blocs face à face : ce qui fait monter, ce qui fait baisser. */
const VersusBlocks: React.FC<{ left: [string, string, string]; right: [string, string, string] }> = ({ left, right }) => (
  <div className="grid grid-cols-2 gap-2.5">
    {[
      { v: left, color: LIME, bg: 'rgba(217,255,0,.12)' },
      { v: right, color: BURNT, bg: 'rgba(240,138,36,.14)' },
    ].map(({ v: [label, value, sub], color, bg }) => (
      <div key={label} className="grid gap-1 rounded-[18px] p-3" style={{ background: bg }}>
        <small className="text-[10px] font-black uppercase tracking-[0.12em]" style={{ color }}>{label}</small>
        <strong className="text-[30px] font-black tracking-tight text-white leading-none">{value}</strong>
        <em className="not-italic text-[11px] leading-snug text-stone-400">{sub}</em>
      </div>
    ))}
  </div>
);

/* ───────────────────────── Ce que chaque carte affiche ───────────────────────── */

interface CardModel {
  /** La phrase de la carte. */
  line: string;
  /** Ce que dit la pastille : le chiffre, ou le mot (« Scénario »). */
  sticker: string;
  hero: string;
  heroColor: string;
  /** Ce qu'il y a en fond et pourquoi. */
  source: string;
  backdrop: { url?: string; tint: string } | { split: [string | undefined, string | undefined] };
}

const phoneColor = (i: number, last: number) => (i === 0 ? LIME : i === last ? BURNT : PALE);

const PhoneGauges: React.FC<{ k: PhoneConstat; t: T; fmt: Fmt; big?: boolean }> = ({ k, t, fmt, big }) => {
  const shown = k.buckets.filter((b) => b.count > 0);
  const h = big ? 112 : 60, w = big ? 52 : 34;
  return (
    <div className="grid items-end gap-2" style={{ gridTemplateColumns: `repeat(${shown.length}, 1fr)` }}>
      {shown.map((b, i) => (
        <div key={b.key} className="grid justify-items-center gap-1 text-center text-[10px] font-extrabold leading-tight text-stone-400">
          <span className={`${big ? 'text-base' : 'text-[13px]'} font-black text-white tabular-nums`}>{fmt(b.avg ?? 0)}</span>
          <div className="relative rounded-lg border-2 border-[#2A2A28] bg-black/55" style={{ width: w, height: h }}>
            <div className="absolute inset-x-[3px] bottom-[3px] rounded" style={{ height: ((h - 8) * (b.avg ?? 0)) / 10, background: phoneColor(i, shown.length - 1) }} />
          </div>
          {t(`constats.phone.bucket.${b.key}`)}
          {big && <span className="font-bold text-stone-500">{t('constats.films', { n: b.count })}</span>}
        </div>
      ))}
    </div>
  );
};

const cardModel = (id: ConstatId, c: Constats, t: T, fmt: Fmt): CardModel | null => {
  switch (id) {
    case 'public': {
      const k = c.public;
      if (!k.unlocked) return null;
      const tint = k.tone === 'below' ? BURNT : LIME;
      return {
        line: t(`constats.public.line.${k.tone}`),
        sticker: signed(k.gap, fmt),
        hero: signed(k.gap, fmt),
        heroColor: k.tone === 'below' ? BURNT : k.tone === 'above' ? LIME : INK,
        source: t('constats.public.src', { title: short(k.feature.title), you: fmt(k.feature.rating), crowd: fmt(k.feature.crowd) }),
        backdrop: { url: k.feature.poster, tint },
      };
    }
    case 'phone': {
      const k = c.phone;
      if (!k.unlocked) return null;
      const filled = k.buckets.filter((b) => b.count > 0);
      return {
        line: t(`constats.phone.line.${k.tone}`),
        sticker: signed((filled[filled.length - 1].avg ?? 0) - (filled[0].avg ?? 0), fmt),
        hero: signed((filled[filled.length - 1].avg ?? 0) - (filled[0].avg ?? 0), fmt),
        heroColor: k.tone === 'strong' ? BURNT : INK,
        source: t('constats.phone.src', { title: short(k.feature.title), phone: k.feature.phone }),
        backdrop: { url: k.feature.poster, tint: BURNT },
      };
    }
    case 'maillon': {
      const k = c.maillon;
      if (!k.unlocked) return null;
      const order = [...CRITERIA].sort((a, b) => k.weakest[b] - k.weakest[a]);
      const max = k.weakest[order[0]] || 1;
      return {
        line: t('constats.maillon.head', { crit: t(`constats.crit.${k.lead}`) }),
        sticker: t(`constats.critShort.${k.lead}`),
        hero: String(Math.round(k.weakest[k.lead])),
        heroColor: INK,
        source: t('constats.maillon.src', { title: short(k.feature.title), crit: t(`constats.critShort.${k.lead}`).toLowerCase(), value: fmt(k.feature.value) }),
        backdrop: { url: k.feature.poster, tint: BURNT },
      };
    }
    case 'emotions': {
      const k = c.emotions;
      if (!k.unlocked) return null;
      const top = t(`addMovie.${k.top.key}`), low = t(`addMovie.${k.low.key}`);
      return {
        line: t('constats.emotions.answer', { top, low }),
        sticker: t('constats.emotions.pts', { n: fmt(k.top.avg - k.low.avg) }),
        hero: fmt(k.top.avg - k.low.avg),
        heroColor: INK,
        source: t('constats.emotions.src', { top: short(k.topFilm.title), low: short(k.lowFilm.title) }),
        backdrop: { split: [k.topFilm.poster, k.lowFilm.poster] },
      };
    }
    case 'duree': {
      const k = c.duree;
      if (!k.unlocked) return null;
      const s = k.bands[0].avg ?? 0, l = k.bands[3].avg ?? 0;
      const good = l >= s;
      return {
        line: t(`constats.duree.head.${k.tone}`),
        sticker: signed(l - s, fmt),
        hero: signed(l - s, fmt),
        heroColor: k.tone === 'flat' ? INK : good ? LIME : BURNT,
        source: t('constats.duree.src', { title: short(k.feature.title), runtime: runtimeLabel(k.feature.runtime), rating: fmt(k.feature.rating) }),
        backdrop: { url: k.feature.poster, tint: LIME },
      };
    }
    case 'classiques': {
      const k = c.classiques;
      if (!k.unlocked) return null;
      const oldWins = k.old >= k.fresh;
      return {
        line: t(`constats.classiques.head.${k.tone}`),
        sticker: signed(k.old - k.fresh, fmt),
        hero: signed(k.old - k.fresh, fmt),
        heroColor: k.tone === 'flat' ? INK : oldWins ? LIME : BURNT,
        source: t('constats.classiques.src', { title: short(k.feature.title), year: k.feature.year ?? '', rating: fmt(k.feature.rating) }),
        backdrop: { url: k.feature.poster, tint: LIME },
      };
    }
    case 'revirements': {
      const k = c.revirements;
      if (!k.unlocked) return null;
      const top = k.changes[0];
      const up = top.to > top.from;
      return {
        line: t('constats.revirements.answer'),
        sticker: signed(top.to - top.from, fmt),
        hero: String(k.changes.length),
        heroColor: INK,
        source: t('constats.revirements.src', { title: short(top.title), from: fmt(top.from), to: fmt(top.to) }),
        backdrop: { url: top.poster, tint: up ? LIME : BURNT },
      };
    }
  }
};

/* ───────────────────────── Détails ───────────────────────── */

const Label: React.FC<React.SVGProps<SVGTextElement>> = (props) => (
  <text fontFamily="inherit" fontWeight={700} fontSize={11} fill={INK2} {...props} />
);

const hit = (onPick: () => void) => ({
  onClick: onPick,
  onMouseEnter: onPick,
  onKeyDown: (e: React.KeyboardEvent) => (e.key === 'Enter' || e.key === ' ') && onPick(),
  tabIndex: 0,
  role: 'button' as const,
  style: { cursor: 'pointer', outline: 'none' },
});

const DetailPublic: React.FC<{ k: PublicConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const [pick, setPick] = useState<PublicPoint>(k.feature);
  const W = 340, H = 300, m = { l: 30, r: 10, t: 10, b: 30 };
  const x = (v: number) => m.l + ((v - 2) / 8) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - 2) / 8) * (H - m.t - m.b);
  const badge = (p: PublicPoint) => ({ ...p, badge: signed(p.rating - p.crowd, fmt), color: p.rating >= p.crowd ? LIME : BURNT });
  return (
    <div className="space-y-5">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('constats.public.eyebrow')}>
        {[2, 4, 6, 8, 10].map((v) => (
          <g key={v}>
            <line x1={x(v)} x2={x(v)} y1={m.t} y2={H - m.b} stroke={GRID} />
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={GRID} />
            <Label x={x(v)} y={H - m.b + 16} textAnchor="middle" fill={INK3} fontSize={10}>{v}</Label>
            <Label x={m.l - 8} y={y(v) + 3} textAnchor="end" fill={INK3} fontSize={10}>{v}</Label>
          </g>
        ))}
        <path d={`M${x(2)},${y(2)} L${x(10)},${y(10)} L${x(2)},${y(10)} Z`} fill={LIME} opacity={0.05} />
        <path d={`M${x(2)},${y(2)} L${x(10)},${y(10)} L${x(10)},${y(2)} Z`} fill={BURNT} opacity={0.06} />
        <line x1={x(2)} y1={y(2)} x2={x(10)} y2={y(10)} stroke={INK3} strokeDasharray="3 4" strokeWidth={1.5} />
        <Label x={x(2.3)} y={y(9.5)} fill={LIME} fontSize={10} fontWeight={900}>{t('constats.public.more')}</Label>
        <Label x={x(9.7)} y={y(2.6)} fill={BURNT} fontSize={10} fontWeight={900} textAnchor="end">{t('constats.public.less')}</Label>
        <Label x={W - m.r} y={H - 2} textAnchor="end" fill={INK3} fontSize={9.5}>{t('constats.public.axisX')}</Label>
        <Label x={8} y={m.t + 2} fill={INK3} fontSize={9.5} textAnchor="end" transform={`rotate(-90 8 ${m.t + 2})`}>{t('constats.public.axisY')}</Label>
        {k.points.map((p) => {
          const gap = p.rating - p.crowd;
          const color = gap > 0.5 ? LIME : gap < -1.5 ? BURNT : NEUTRAL;
          return (
            <g key={p.id} {...hit(() => setPick(p))}>
              <circle cx={x(p.crowd)} cy={y(p.rating)} r={11} fill="transparent" />
              <circle cx={x(p.crowd)} cy={y(p.rating)} r={4.5} fill={color} stroke="#0E0E0E" strokeWidth={1.5} />
            </g>
          );
        })}
        <circle cx={x(pick.crowd)} cy={y(pick.rating)} r={9} fill="none" stroke="#fff" strokeWidth={2} pointerEvents="none" />
      </svg>
      <Callout
        film={pick}
        hint={t('constats.tapHint')}
        line={`${t('constats.public.point', { you: fmt(pick.rating), crowd: fmt(pick.crowd) })} · ${signed(pick.rating - pick.crowd, fmt)}`}
      />
      <Shelf title={t('constats.public.harsher')} films={k.harsher.map(badge)} />
      <Shelf title={t('constats.public.kinder')} films={k.kinder.map(badge)} />
    </div>
  );
};

const DetailPhone: React.FC<{ k: PhoneConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => (
  <div className="space-y-5">
    <PhoneGauges k={k} t={t} fmt={fmt} big />
    <Shelf
      title={t('constats.phone.shelf')}
      films={k.distracted.map((f) => ({ ...f, badge: `${f.phone} %`, color: f.phone > 40 ? BURNT : PALE }))}
    />
  </div>
);

const DetailMaillon: React.FC<{ k: MaillonConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const order = [...CRITERIA].sort((a, b) => k.weakest[b] - k.weakest[a]);
  const max = k.weakest[order[0]] || 1;
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        {order.map((key) => (
          <ScaleBar key={key} label={t(`constats.critShort.${key}`)} value={k.weakest[key]} max={max} color={key === k.lead ? BURNT : PALE} text={String(Math.round(k.weakest[key]))} />
        ))}
      </div>
      <Shelf
        title={t('constats.maillon.shelf', { crit: t(`constats.crit.${k.lead}`) })}
        films={k.sunk.map((f) => ({ ...f, badge: fmt(f.value), color: BURNT }))}
      />
    </div>
  );
};

const EmotionRow: React.FC<{ label: string; avg: number; count: number; films: FilmRef[]; good: boolean; t: T; fmt: Fmt }> = ({ label, avg, count, films, good, t, fmt }) => (
  <div className="grid grid-cols-[96px_1fr] items-center gap-2.5 border-b border-white/[0.06] py-2">
    <div className="grid gap-0.5 min-w-0">
      <b className="truncate text-[13px] font-black text-white">{label}</b>
      <span className="text-[10.5px] font-bold text-stone-500">{t('constats.films', { n: count })}</span>
    </div>
    <div className="flex min-w-0 items-center gap-2.5">
      <span className="w-[34px] text-lg font-black tabular-nums" style={{ color: good ? LIME : BURNT }}>{fmt(avg)}</span>
      <div className="flex">
        {films.slice(0, 4).map((f, i) => (
          <span
            key={f.id}
            title={f.title}
            className="h-[45px] w-[30px] rounded-md border-2 border-[#0E0E0E] bg-[#222] bg-cover bg-center shadow-[0_4px_10px_rgba(0,0,0,.4)]"
            style={{ marginLeft: i ? -10 : 0, backgroundImage: f.poster ? `url(${poster(f.poster)})` : undefined }}
          />
        ))}
      </div>
    </div>
  </div>
);

const DetailEmotions: React.FC<{ k: EmotionsConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const label = (key: string) => t(`addMovie.${key}`);
  const above = k.items.filter((i) => i.avg >= k.split);
  const below = k.items.filter((i) => i.avg < k.split);
  return (
    <div className="space-y-4">
      <VersusBlocks
        left={[t('constats.emotions.lift'), fmt(k.top.avg), t('constats.emotions.when', { state: label(k.top.key).toLowerCase() })]}
        right={[t('constats.emotions.drag'), fmt(k.low.avg), t('constats.emotions.when', { state: label(k.low.key).toLowerCase() })]}
      />
      <div>
        <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{t('constats.emotions.above', { avg: fmt(k.split) })}</p>
        {above.map((i) => <EmotionRow key={i.key} label={label(i.key)} avg={i.avg} count={i.count} films={i.films} good t={t} fmt={fmt} />)}
      </div>
      {below.length > 0 && (
        <div>
          <p className="mb-1 text-[10px] font-black uppercase tracking-[0.18em] text-stone-500">{t('constats.emotions.below')}</p>
          {below.map((i) => <EmotionRow key={i.key} label={label(i.key)} avg={i.avg} count={i.count} films={[...i.films].reverse()} good={false} t={t} fmt={fmt} />)}
        </div>
      )}
    </div>
  );
};

const DetailDuree: React.FC<{ k: DureeConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const labels = { short: '< 1h35', mid1: '1h35–1h55', mid2: '1h55–2h15', long: '2h15 +' };
  const avgs = k.bands.filter((b) => b.avg != null).map((b) => b.avg as number);
  const best = Math.max(...avgs), worst = Math.min(...avgs);
  const color = (v: number) => (k.tone === 'flat' ? PALE : v === best ? LIME : v === worst ? BURNT : PALE);
  const longFirst = k.tone !== 'short';
  return (
    <div className="space-y-5">
      <div className="space-y-2.5">
        {k.bands.map((b) => (b.avg == null ? null : <ScaleBar key={b.key} label={labels[b.key]} value={b.avg} color={color(b.avg)} text={fmt(b.avg)} />))}
      </div>
      <Shelf
        title={t(longFirst ? 'constats.duree.longLiked' : 'constats.duree.longTired')}
        films={k.longFilms.map((f) => ({ ...f, badge: fmt(f.rating), color: longFirst ? LIME : BURNT }))}
      />
      <Shelf
        title={t(longFirst ? 'constats.duree.shortCold' : 'constats.duree.shortLiked')}
        films={k.shortFilms.map((f) => ({ ...f, badge: fmt(f.rating), color: longFirst ? BURNT : LIME }))}
      />
    </div>
  );
};

const DetailClassiques: React.FC<{ k: ClassiquesConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const oldWins = k.old >= k.fresh;
  const rate = (color: string) => (f: FilmRef) => ({ ...f, badge: fmt(f.rating), color });
  const blocks: [[string, string, string], [string, string, string]] = [
    [t('constats.classiques.oldLabel'), fmt(k.old), t('constats.classiques.oldCount', { n: k.oldCount })],
    [t('constats.classiques.freshLabel'), fmt(k.fresh), t('constats.classiques.freshCount', { n: k.freshCount })],
  ];
  return (
    <div className="space-y-5">
      <VersusBlocks left={oldWins ? blocks[0] : blocks[1]} right={oldWins ? blocks[1] : blocks[0]} />
      <Shelf title={t('constats.classiques.bestOld')} films={k.bestOld.map(rate(oldWins ? LIME : PALE))} />
      <Shelf title={t('constats.classiques.bestFresh')} films={k.bestFresh.map(rate(oldWins ? PALE : LIME))} />
      <Shelf title={t('constats.classiques.worstFresh')} films={k.worstFresh.map(rate(BURNT))} />
    </div>
  );
};

const DetailRevirements: React.FC<{ k: RevirementsConstat; fmt: Fmt }> = ({ k, fmt }) => (
  <ul className="space-y-2">
    {k.changes.slice(0, 12).map((c) => {
      const up = c.to > c.from;
      return (
        <li key={c.id} className="flex items-center gap-3 rounded-2xl bg-white/[0.05] p-2.5">
          <div className="h-[48px] w-[32px] shrink-0 rounded-md bg-[#222] bg-cover bg-center" style={{ backgroundImage: c.poster ? `url(${poster(c.poster)})` : undefined }} />
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-white">{c.title}</span>
          <span className="shrink-0 text-sm font-black tabular-nums">
            <span className="text-stone-500">{fmt(c.from)}</span>
            <span className="mx-1.5" style={{ color: up ? LIME : BURNT }}>→</span>
            <span style={{ color: up ? LIME : BURNT }}>{fmt(c.to)}</span>
          </span>
        </li>
      );
    })}
  </ul>
);

/** Le titre du détail : la phrase la plus parlante. */
const detailTitle = (id: ConstatId, c: Constats, t: T): string => {
  switch (id) {
    case 'public': return c.public.unlocked ? t(`constats.public.title.${c.public.tone}`) : '';
    case 'emotions': return t('constats.emotions.title');
    case 'maillon': return c.maillon.unlocked ? t('constats.maillon.head', { crit: t(`constats.crit.${c.maillon.lead}`) }) : '';
    case 'revirements': return t('constats.revirements.answer');
    default: {
      const k = c[id];
      return k.unlocked && 'tone' in k ? t(`constats.${id}.head.${k.tone}`) : '';
    }
  }
};

/** La phrase qui accompagne le chiffre en tête du détail. */
const detailLede = (id: ConstatId, c: Constats, t: T, fmt: Fmt): string => {
  switch (id) {
    case 'public': {
      const k = c.public;
      if (!k.unlocked) return '';
      const base = t(`constats.public.lede.${k.tone}`, { gap: fmt(Math.abs(k.gap)) });
      return k.genre ? `${base} ${t('constats.public.genre', { gap: fmt(Math.abs(k.genre.gap)), genre: k.genre.name })}` : base;
    }
    case 'phone': {
      const k = c.phone;
      if (!k.unlocked) return '';
      const filled = k.buckets.filter((b) => b.count > 0);
      return t('constats.phone.lede', { never: fmt(filled[0].avg ?? 0), worst: fmt(filled[filled.length - 1].avg ?? 0) });
    }
    case 'maillon': {
      const k = c.maillon;
      if (!k.unlocked) return '';
      const base = t('constats.maillon.lede', { n: Math.round(k.weakest[k.lead]), total: k.total });
      return k.crash ? `${base} ${t('constats.maillon.crash', { avg: fmt(k.crash.avg) })}` : base;
    }
    case 'emotions': {
      const k = c.emotions;
      return k.unlocked ? t('constats.emotions.lede', { top: t(`addMovie.${k.top.key}`), topAvg: fmt(k.top.avg), low: t(`addMovie.${k.low.key}`), lowAvg: fmt(k.low.avg) }) : '';
    }
    case 'duree': {
      const k = c.duree;
      return k.unlocked ? t('constats.duree.lede', { long: fmt(k.bands[3].avg ?? 0), short: fmt(k.bands[0].avg ?? 0) }) : '';
    }
    case 'classiques': {
      const k = c.classiques;
      return k.unlocked ? t('constats.classiques.lede', { old: fmt(k.old), fresh: fmt(k.fresh) }) : '';
    }
    case 'revirements': {
      const k = c.revirements;
      if (!k.unlocked) return '';
      const top = k.changes[0];
      return t('constats.revirements.lede', { title: top.title, from: fmt(top.from), to: fmt(top.to) });
    }
  }
};

const ConstatSheet: React.FC<{ id: ConstatId; constats: Constats; onClose: () => void }> = ({ id, constats: c, onClose }) => {
  const { t } = useLanguage();
  const fmt = useFmt();
  const title = detailTitle(id, c, t);
  const dialog = useDialog(onClose, title);
  const model = cardModel(id, c, t, fmt);
  if (!model) return null;

  const chart = (() => {
    switch (id) {
      case 'public': return c.public.unlocked ? <DetailPublic k={c.public} t={t} fmt={fmt} /> : null;
      case 'phone': return c.phone.unlocked ? <DetailPhone k={c.phone} t={t} fmt={fmt} /> : null;
      case 'maillon': return c.maillon.unlocked ? <DetailMaillon k={c.maillon} t={t} fmt={fmt} /> : null;
      case 'emotions': return c.emotions.unlocked ? <DetailEmotions k={c.emotions} t={t} fmt={fmt} /> : null;
      case 'duree': return c.duree.unlocked ? <DetailDuree k={c.duree} t={t} fmt={fmt} /> : null;
      case 'classiques': return c.classiques.unlocked ? <DetailClassiques k={c.classiques} t={t} fmt={fmt} /> : null;
      case 'revirements': return c.revirements.unlocked ? <DetailRevirements k={c.revirements} fmt={fmt} /> : null;
    }
  })();

  // En tête du détail, le film du fond de carte, en grand : flouté derrière, net et incliné devant.
  const heroPosters = 'split' in model.backdrop ? model.backdrop.split : [model.backdrop.url];

  return createPortal(
    <div {...dialog.props} className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg bg-[#0E0E0E] text-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/10">
        <button
          onClick={onClose}
          aria-label={t('constats.close')}
          className="absolute right-5 top-4 z-30 w-8 h-8 rounded-full bg-black/50 backdrop-blur flex items-center justify-center text-white active:scale-90 transition-transform"
        >
          <X size={17} strokeWidth={2.5} />
        </button>
        <div className="flex-1 overflow-y-auto no-scrollbar">
          <div className="relative flex h-[230px] flex-col justify-end overflow-hidden px-6 pb-4">
            {heroPosters.map((url, i) => (
              <div
                key={i}
                className="absolute bg-cover"
                style={{
                  top: -20, bottom: -20,
                  left: heroPosters.length === 2 && i === 1 ? '50%' : -20,
                  right: heroPosters.length === 2 && i === 0 ? '50%' : -20,
                  backgroundImage: url ? `url(${poster(url, 'w342')})` : undefined,
                  backgroundPosition: 'center 25%',
                  filter: heroPosters.length === 2 ? 'blur(6px) brightness(.7)' : 'blur(14px) saturate(1.2) brightness(.7)',
                }}
              />
            ))}
            {heroPosters.length === 1 && heroPosters[0] && (
              <div
                className="absolute right-6 top-10 h-[126px] w-[84px] rotate-[4deg] rounded-[10px] bg-cover shadow-[0_12px_30px_rgba(0,0,0,.6)]"
                style={{ backgroundImage: `url(${poster(heroPosters[0], 'w342')})` }}
              />
            )}
            <div className="absolute inset-0" style={{ background: 'linear-gradient(180deg, rgba(14,14,14,0) 0%, rgba(14,14,14,.6) 55%, #0E0E0E 100%)' }} />
            <div className="absolute left-1/2 top-3 h-1.5 w-12 -translate-x-1/2 rounded-full bg-white/30" onClick={onClose} />
            <p className="relative text-[10px] font-black uppercase tracking-[0.2em] text-white/60">{t(`constats.${id}.eyebrow`)}</p>
            <h2 className="relative mt-1.5 max-w-[70%] text-[26px] font-black leading-[1.03] tracking-tight text-balance">{title}</h2>
          </div>
          <div className="space-y-5 px-6 pb-8 pt-2">
            <div className="flex items-baseline gap-3">
              <strong className="text-[46px] font-black leading-[0.9] tracking-tighter tabular-nums" style={{ color: model.heroColor }}>{model.hero}</strong>
              <span className="text-[12.5px] font-semibold leading-snug text-stone-400">{detailLede(id, c, t, fmt)}</span>
            </div>
            <p className="-mt-2 text-[11px] font-bold text-stone-500">
              {t('constats.bg', { what: '' })}
              <span className="text-stone-300">{model.source}</span>
            </p>
            {chart}
            <p className="border-t border-white/10 pt-3 text-[11.5px] leading-relaxed text-stone-500">{t(`constats.${id}.foot`)}</p>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ───────────────────────── La rangée ───────────────────────── */

/** La couleur de la pastille ; le blanc des chiffres neutres devient un papier clair. */
const stickerBg = (color: string) => (color === INK ? '#F5F4F0' : color);

const ConstatCard: React.FC<{ id: ConstatId; model: CardModel; t: T; onOpen: () => void }> = ({ id, model, t, onOpen }) => (
  <button
    type="button"
    onClick={onOpen}
    aria-label={`${t(`constats.${id}.eyebrow`)} : ${model.line}. ${t('constats.seeDetail')}`}
    className="relative isolate snap-start shrink-0 w-[236px] h-[320px] overflow-hidden rounded-[1.6rem] bg-[#0B0B0B] p-4 flex flex-col justify-between text-left text-[#F5F4F0] shadow-[0_18px_40px_-22px_rgba(0,0,0,.7)] active:scale-[0.98] transition-transform"
  >
    <PosterBackdrop {...model.backdrop} />
    <span
      className="relative z-10 self-start -rotate-3 rounded-[14px] px-[11px] py-1.5 text-[22px] font-black leading-none tracking-tight tabular-nums text-[#111] shadow-[0_8px_18px_rgba(0,0,0,.35)]"
      style={{ background: stickerBg(model.heroColor) }}
    >
      {model.sticker}
    </span>
    <span className="absolute right-4 top-5 z-10 max-w-[38%] text-right text-[9px] font-black uppercase leading-[1.3] tracking-[0.16em] text-white/60">
      {t(`constats.${id}.eyebrow`)}
    </span>
    <span className="relative z-10 mr-11 text-[22px] font-black leading-[1.05] tracking-tight text-balance [text-shadow:0_2px_16px_rgba(0,0,0,.7)]">
      {model.line}
    </span>
    <span className="absolute bottom-3.5 right-3.5 z-10 grid h-[30px] w-[30px] place-items-center rounded-full bg-white/[0.12] text-sm font-black text-white backdrop-blur-md" aria-hidden="true">
      →
    </span>
  </button>
);

const StatsConstats: React.FC<{ movies: Movie[] }> = ({ movies }) => {
  const { t } = useLanguage();
  const fmt = useFmt();
  const constats = useMemo(() => computeConstats(filmPointsFrom(movies)), [movies]);
  const [open, setOpen] = useState<ConstatId | null>(null);

  const unlocked = CONSTAT_ORDER.filter((id) => constats[id].unlocked);
  const locked = CONSTAT_ORDER.filter((id) => !constats[id].unlocked);
  // Rien à montrer tant qu'aucun constat n'est débloqué : une rangée de cadenas
  // décourage plus qu'elle ne motive.
  if (unlocked.length === 0) return null;

  return (
    <section aria-label={t('constats.title')}>
      <div className="flex items-baseline justify-between px-1 mb-3">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white">{t('constats.title')}</h3>
        <span className="text-[11px] font-bold text-forest dark:text-bitter-lime">
          {t('constats.count', { n: unlocked.length, total: CONSTAT_ORDER.length })}
        </span>
      </div>
      <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {unlocked.map((id) => {
          const model = cardModel(id, constats, t, fmt);
          return model ? (
            <ConstatCard
              key={id}
              id={id}
              model={model}
              t={t}
              onOpen={() => {
                haptics.soft();
                setOpen(id);
              }}
            />
          ) : null;
        })}
        {locked.map((id) => {
          const k = constats[id];
          return (
            <div
              key={id}
              className="snap-start shrink-0 w-[236px] h-[320px] rounded-[1.6rem] border-[1.5px] border-dashed border-stone-300 dark:border-white/15 p-[18px] grid grid-rows-[auto_auto_1fr_auto] gap-2"
            >
              <span className="text-[11.5px] font-bold text-stone-400 dark:text-stone-500">{t('constats.locked')}</span>
              <span className="text-[21px] font-black tracking-tight leading-[1.04] text-stone-500 dark:text-stone-400">{t(`constats.${id}.q`)}</span>
              <span className="self-center text-[12.5px] leading-relaxed text-stone-500">
                {t(`constats.${id}.lock`, { n: k.unlocked ? 0 : k.missing })}
              </span>
              <Lock size={14} className="text-stone-400 dark:text-stone-600" />
            </div>
          );
        })}
      </div>
      {open && <ConstatSheet id={open} constats={constats} onClose={() => setOpen(null)} />}
    </section>
  );
};

export default StatsConstats;
