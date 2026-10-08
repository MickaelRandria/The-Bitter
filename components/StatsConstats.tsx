import React, { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Lock, X } from 'lucide-react';
import { Movie } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import {
  CONSTAT_ORDER,
  CRITERIA,
  ClassiquesConstat,
  ConstatId,
  Constats,
  DureeConstat,
  EmotionsConstat,
  MaillonConstat,
  PhoneConstat,
  PublicConstat,
  RevirementsConstat,
  computeConstats,
  filmPointsFrom,
} from '../utils/constats';

/**
 * « Tes constats » — l'onglet Profil des stats, sous l'archétype.
 *
 * Deux niveaux de lecture au même endroit : la carte dit le constat en une
 * phrase avec un visuel sans axes, pour tout le monde ; la toucher ouvre le
 * graphique complet, pour qui veut comprendre. Les cartes restent sombres dans
 * les deux thèmes, comme celle de l'archétype juste au-dessus.
 */

const LIME = '#D9FF00';
const BURNT = '#F08A24';
const NEUTRAL = '#8A8A85';
const GRID = '#2A2A28';
const INK = '#F5F4F0';
const INK2 = '#A9A69E';
const INK3 = '#6F6C66';
const CARD = '#161615';

type Fmt = (x: number) => string;
type T = (key: string, params?: Record<string, string | number>) => string;

const useFmt = (): Fmt => {
  const { language } = useLanguage();
  return (x: number) => (language === 'en' ? x.toFixed(1) : x.toFixed(1).replace('.', ','));
};

/* ───────────────────────── Phrases ───────────────────────── */

const headline = (id: ConstatId, c: Constats, t: T, fmt: Fmt): string | null => {
  switch (id) {
    case 'public': {
      const k = c.public;
      return k.unlocked ? t(`constats.public.head.${k.tone}`, { gap: fmt(Math.abs(k.gap)) }) : null;
    }
    case 'phone':
      return c.phone.unlocked ? t(`constats.phone.head.${c.phone.tone}`) : null;
    case 'maillon':
      return c.maillon.unlocked ? t('constats.maillon.head', { crit: t(`constats.crit.${c.maillon.lead}`) }) : null;
    case 'emotions': {
      const k = c.emotions;
      return k.unlocked
        ? t('constats.emotions.head', { top: t(`addMovie.${k.top.key}`), low: t(`addMovie.${k.low.key}`), gap: fmt(k.top.avg - k.low.avg) })
        : null;
    }
    case 'duree':
      return c.duree.unlocked ? t(`constats.duree.head.${c.duree.tone}`) : null;
    case 'classiques':
      return c.classiques.unlocked ? t(`constats.classiques.head.${c.classiques.tone}`) : null;
    case 'revirements': {
      const k = c.revirements;
      if (!k.unlocked) return null;
      return k.changes.length === 1 ? t('constats.revirements.head.one') : t('constats.revirements.head.many', { n: k.changes.length });
    }
  }
};

/* ───────────────────────── Mini-visuels (niveau 1) ───────────────────────── */

const MiniText: React.FC<React.SVGProps<SVGTextElement>> = (props) => (
  <text fontFamily="inherit" fontWeight={900} {...props} />
);

const MiniPublic: React.FC<{ k: PublicConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const lo = Math.min(5, Math.floor(Math.min(k.you, k.crowd)));
  const hi = Math.max(9, Math.ceil(Math.max(k.you, k.crowd)));
  const x = (v: number) => 14 + ((v - lo) / (hi - lo)) * 176;
  const youColor = k.tone === 'above' ? LIME : k.tone === 'below' ? BURNT : INK;
  return (
    <svg viewBox="0 0 204 120" className="w-full h-auto" aria-hidden="true">
      <line x1={x(lo)} x2={x(hi)} y1={70} y2={70} stroke={GRID} strokeWidth={6} strokeLinecap="round" />
      <line x1={x(k.you)} x2={x(k.crowd)} y1={70} y2={70} stroke={youColor} strokeWidth={6} strokeLinecap="round" opacity={0.5} />
      <circle cx={x(k.crowd)} cy={70} r={9} fill={NEUTRAL} stroke={CARD} strokeWidth={3} />
      <circle cx={x(k.you)} cy={70} r={9} fill={youColor} stroke={CARD} strokeWidth={3} />
      <MiniText x={x(k.crowd)} y={30} textAnchor="middle" fill="#DAD7CF" fontSize={15}>{fmt(k.crowd)}</MiniText>
      <MiniText x={x(k.crowd)} y={44} textAnchor="middle" fill="#8E8B84" fontSize={11} fontWeight={700}>{t('constats.public.crowd')}</MiniText>
      <MiniText x={x(k.you)} y={100} textAnchor="middle" fill={youColor} fontSize={15}>{fmt(k.you)}</MiniText>
      <MiniText x={x(k.you)} y={114} textAnchor="middle" fill="#8E8B84" fontSize={11} fontWeight={700}>{t('constats.public.you')}</MiniText>
    </svg>
  );
};

const phoneFill = (i: number, last: number) => (i === 0 ? LIME : i === last ? BURNT : NEUTRAL);

const MiniPhone: React.FC<{ k: PhoneConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const shown = k.buckets.filter((b) => b.count > 0);
  return (
    <svg viewBox="0 0 204 120" className="w-full h-auto" aria-hidden="true">
      {shown.map((b, i) => {
        const xx = 10 + i * 50, h = 66, fh = ((h - 8) * (b.avg ?? 0)) / 10;
        return (
          <g key={b.key}>
            <rect x={xx} y={20} width={36} height={h} rx={8} fill="#0A0A0A" stroke={GRID} strokeWidth={2} />
            <rect x={xx + 4} y={20 + h - 4 - fh} width={28} height={fh} rx={4} fill={phoneFill(i, shown.length - 1)} />
            <MiniText x={xx + 18} y={14} textAnchor="middle" fill="#fff" fontSize={12}>{fmt(b.avg ?? 0)}</MiniText>
            <MiniText x={xx + 18} y={104} textAnchor="middle" fill="#8E8B84" fontSize={9.5} fontWeight={800}>{t(`constats.phone.bucket.${b.key}`)}</MiniText>
          </g>
        );
      })}
    </svg>
  );
};

const MiniMaillon: React.FC<{ k: MaillonConstat; t: T }> = ({ k, t }) => {
  const order = [...CRITERIA].sort((a, b) => k.weakest[b] - k.weakest[a]);
  const max = k.weakest[order[0]] || 1;
  return (
    <svg viewBox="0 0 204 120" className="w-full h-auto" aria-hidden="true">
      {order.map((key, i) => {
        const yy = 14 + i * 26, hot = i === 0, w = (110 * k.weakest[key]) / max;
        return (
          <g key={key}>
            <MiniText x={0} y={yy + 12} fill={hot ? '#fff' : '#8E8B84'} fontSize={12}>{t(`constats.critShort.${key}`)}</MiniText>
            <rect x={70} y={yy + 2} width={Math.max(6, w)} height={12} rx={6} fill="none" stroke={hot ? LIME : '#4A4A47'} strokeWidth={2.5} />
            <MiniText x={78 + w} y={yy + 12} fill={hot ? LIME : '#8E8B84'} fontSize={11}>{Math.round(k.weakest[key])}</MiniText>
          </g>
        );
      })}
    </svg>
  );
};

const MiniEmotions: React.FC<{ k: EmotionsConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const lo = Math.min(...k.items.map((i) => i.avg)) - 0.3, hi = Math.max(...k.items.map((i) => i.avg)) + 0.3;
  const x = (v: number) => 14 + ((v - lo) / (hi - lo)) * 176;
  return (
    <svg viewBox="0 0 204 120" className="w-full h-auto" aria-hidden="true">
      <line x1={x(lo)} x2={x(hi)} y1={62} y2={62} stroke={GRID} strokeWidth={2} />
      <line x1={x(k.split)} x2={x(k.split)} y1={40} y2={84} stroke="#4A4A47" strokeDasharray="3 3" />
      {k.items.map((i) => (
        <circle key={i.key} cx={x(i.avg)} cy={62} r={4} fill={i.avg >= k.split ? LIME : BURNT} opacity={0.55} />
      ))}
      <circle cx={x(k.top.avg)} cy={62} r={7} fill={LIME} />
      <circle cx={x(k.low.avg)} cy={62} r={7} fill={BURNT} />
      <MiniText x={x(k.top.avg)} y={32} textAnchor="end" fill={LIME} fontSize={11.5}>{t(`addMovie.${k.top.key}`)}</MiniText>
      <MiniText x={x(k.top.avg)} y={46} textAnchor="end" fill="#fff" fontSize={12}>{fmt(k.top.avg)}</MiniText>
      <MiniText x={x(k.low.avg)} y={98} fill={BURNT} fontSize={11.5}>{t(`addMovie.${k.low.key}`)}</MiniText>
      <MiniText x={x(k.low.avg)} y={112} fill="#fff" fontSize={12}>{fmt(k.low.avg)}</MiniText>
    </svg>
  );
};

const FilmStrip: React.FC<{ x: number; y: number; w: number; h: number; fill: string; hole: string }> = ({ x, y, w, h, fill, hole }) => {
  const holes: number[] = [];
  for (let px = x + 5; px < x + w - 4; px += 9) holes.push(px);
  return (
    <g>
      <rect x={x} y={y} width={w} height={h} rx={4} fill={fill} />
      {holes.map((px) => (
        <g key={px}>
          <rect x={px} y={y + 3} width={4} height={4} rx={1} fill={hole} />
          <rect x={px} y={y + h - 7} width={4} height={4} rx={1} fill={hole} />
        </g>
      ))}
    </g>
  );
};

const toneColor = (avg: number, best: number, worst: number) =>
  avg === best ? LIME : avg === worst ? BURNT : NEUTRAL;

const MiniDuree: React.FC<{ k: DureeConstat; fmt: Fmt }> = ({ k, fmt }) => {
  const short = k.bands[0].avg as number, long = k.bands[3].avg as number;
  const rows: [number, number, string][] = [[short, 70, '< 1h35'], [long, 170, '2h15 +']];
  const best = Math.max(short, long), worst = Math.min(short, long);
  return (
    <svg viewBox="0 0 204 120" className="w-full h-auto" aria-hidden="true">
      {rows.map(([v, w, label], i) => {
        const yy = 26 + i * 46;
        return (
          <g key={label}>
            <MiniText x={0} y={yy - 6} fill="#8E8B84" fontSize={10} fontWeight={800}>{label}</MiniText>
            <FilmStrip x={0} y={yy} w={w} h={24} fill={best === worst ? NEUTRAL : toneColor(v, best, worst)} hole={CARD} />
            <MiniText x={w + 8} y={yy + 17} fill="#fff" fontSize={15}>{fmt(v)}</MiniText>
          </g>
        );
      })}
    </svg>
  );
};

const MiniClassiques: React.FC<{ k: ClassiquesConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const best = Math.max(k.old, k.fresh), worst = Math.min(k.old, k.fresh);
  const cols: [number, string][] = [[k.old, t('constats.classiques.old')], [k.fresh, t('constats.classiques.fresh')]];
  return (
    <svg viewBox="0 0 204 120" className="w-full h-auto" aria-hidden="true">
      {cols.map(([v, label], i) => {
        const xx = 8 + i * 104, h = (70 * v) / 10;
        return (
          <g key={label}>
            <rect x={xx} y={92 - h} width={70} height={h} rx={6} fill={best === worst ? NEUTRAL : toneColor(v, best, worst)} />
            <MiniText x={xx + 35} y={86 - h} textAnchor="middle" fill="#fff" fontSize={15}>{fmt(v)}</MiniText>
            <MiniText x={xx + 35} y={108} textAnchor="middle" fill="#8E8B84" fontSize={9.5} fontWeight={800}>{label}</MiniText>
          </g>
        );
      })}
    </svg>
  );
};

const MiniRevirements: React.FC<{ k: RevirementsConstat; fmt: Fmt }> = ({ k, fmt }) => {
  const c = k.changes[0];
  const up = c.to > c.from;
  return (
    <svg viewBox="0 0 204 120" className="w-full h-auto" aria-hidden="true">
      <MiniText x={0} y={22} fill="#8E8B84" fontSize={11} fontWeight={800}>{c.title.length > 28 ? `${c.title.slice(0, 27)}…` : c.title}</MiniText>
      <MiniText x={20} y={78} textAnchor="middle" fill="#8E8B84" fontSize={26}>{fmt(c.from)}</MiniText>
      <line x1={50} x2={140} y1={68} y2={68} stroke={up ? LIME : BURNT} strokeWidth={3} strokeLinecap="round" />
      <path d="M134,61 L144,68 L134,75" fill="none" stroke={up ? LIME : BURNT} strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
      <MiniText x={176} y={78} textAnchor="middle" fill={up ? LIME : BURNT} fontSize={26}>{fmt(c.to)}</MiniText>
    </svg>
  );
};

/* ───────────────────────── Graphiques détaillés (niveau 2) ───────────────────────── */

const Label: React.FC<React.SVGProps<SVGTextElement>> = (props) => (
  <text fontFamily="inherit" fontWeight={700} fontSize={11} fill={INK2} {...props} />
);

/** Ligne sous le graphique : ce que montre le point touché, ou l'invitation à toucher. */
const Readout: React.FC<{ text: string | null; t: T }> = ({ text, t }) => (
  <p className={`min-h-[2.5rem] rounded-2xl px-3 py-2 text-xs font-bold leading-snug ${text ? 'bg-white/10 text-white' : 'text-stone-500'}`}>
    {text ?? t('constats.tapHint')}
  </p>
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
  const [pick, setPick] = useState<string | null>(null);
  const W = 340, H = 300, m = { l: 30, r: 10, t: 10, b: 30 };
  const x = (v: number) => m.l + ((v - 2) / 8) * (W - m.l - m.r);
  const y = (v: number) => H - m.b - ((v - 2) / 8) * (H - m.t - m.b);
  const sorted = [...k.points].sort((a, b) => b.you - b.crowd - (a.you - a.crowd));
  const chips = [...sorted.slice(0, 3).filter((p) => p.you - p.crowd > 0), ...sorted.slice(-3).reverse().filter((p) => p.you - p.crowd < 0)];
  return (
    <div className="space-y-4">
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
          const gap = p.you - p.crowd;
          const color = gap > 0.5 ? LIME : gap < -1.5 ? BURNT : NEUTRAL;
          return (
            <g key={p.id} {...hit(() => setPick(`${p.title} — ${t('constats.public.point', { you: fmt(p.you), crowd: fmt(p.crowd) })}`))}>
              <circle cx={x(p.crowd)} cy={y(p.you)} r={11} fill="transparent" />
              <circle cx={x(p.crowd)} cy={y(p.you)} r={4.5} fill={color} stroke="#0E0E0E" strokeWidth={1.5} />
            </g>
          );
        })}
      </svg>
      <Readout text={pick} t={t} />
      {chips.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {chips.map((p) => {
            const gap = p.you - p.crowd;
            return (
              <span key={p.id} className="inline-flex items-baseline gap-1.5 rounded-full bg-white/[0.06] px-2.5 py-1 text-[11px] font-bold text-stone-300">
                {p.title.split(' :')[0]}
                <span className="font-black tabular-nums" style={{ color: gap > 0 ? LIME : BURNT }}>
                  {gap > 0 ? '+' : '−'}{fmt(Math.abs(gap))}
                </span>
              </span>
            );
          })}
        </div>
      )}
    </div>
  );
};

const DetailPhone: React.FC<{ k: PhoneConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const [pick, setPick] = useState<string | null>(null);
  const shown = k.buckets.filter((b) => b.count > 0);
  const W = 340, H = 210, pw = 52, ph = 112, gap = (W - pw * shown.length) / shown.length;
  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('constats.phone.eyebrow')}>
        {shown.map((b, i) => {
          const xx = gap / 2 + i * (pw + gap), yy = 22, avg = b.avg ?? 0;
          return (
            <g key={b.key} {...hit(() => setPick(`${t(`constats.phone.bucket.${b.key}`)} — ${t('constats.films', { n: b.count })} · ${fmt(avg)}${b.titles.length ? ` · ${b.titles.map((s) => s.split(' :')[0]).join(', ')}…` : ''}`))}>
              <rect x={xx} y={yy} width={pw} height={ph} rx={11} fill="#1B1B1A" stroke={GRID} strokeWidth={2} />
              <rect x={xx + 5} y={yy + ph - 5 - ((ph - 10) * avg) / 10} width={pw - 10} height={((ph - 10) * avg) / 10} rx={6} fill={phoneFill(i, shown.length - 1)} />
              <rect x={xx + pw / 2 - 8} y={yy + 5} width={16} height={3} rx={1.5} fill={GRID} />
              <Label x={xx + pw / 2} y={yy - 8} textAnchor="middle" fill={INK} fontSize={15} fontWeight={900}>{fmt(avg)}</Label>
              <Label x={xx + pw / 2} y={yy + ph + 20} textAnchor="middle" fontWeight={800}>{t(`constats.phone.bucket.${b.key}`)}</Label>
              <Label x={xx + pw / 2} y={yy + ph + 35} textAnchor="middle" fill={INK3} fontSize={10}>{t('constats.films', { n: b.count })}</Label>
            </g>
          );
        })}
      </svg>
      <Readout text={pick} t={t} />
    </div>
  );
};

const DetailMaillon: React.FC<{ k: MaillonConstat; t: T }> = ({ k, t }) => {
  const order = [...CRITERIA].sort((a, b) => k.weakest[b] - k.weakest[a]);
  const W = 340, rowH = 46, H = rowH * 4 + 6, max = k.weakest[order[0]] || 1, x0 = 86, x1 = W - 44;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('constats.maillon.eyebrow')}>
      {order.map((key, i) => {
        const yy = i * rowH + 8, w = ((x1 - x0) * k.weakest[key]) / max, hot = key === k.lead;
        const n = Math.max(1, Math.round(k.weakest[key] / 3)), seg = w / n;
        return (
          <g key={key}>
            <title>{t('constats.maillon.count', { n: Math.round(k.weakest[key]) })}</title>
            <Label x={0} y={yy + 19} fill={hot ? INK : INK2} fontSize={13} fontWeight={900}>{t(`constats.critShort.${key}`)}</Label>
            {Array.from({ length: n }, (_, s) => (
              <rect key={s} x={x0 + s * seg + 1} y={yy + 6} width={Math.max(2, seg - 3)} height={18} rx={9} fill="none" stroke={hot ? LIME : NEUTRAL} strokeWidth={3} />
            ))}
            <Label x={x0 + w + 8} y={yy + 20} fill={hot ? LIME : INK2} fontSize={13} fontWeight={900}>{Math.round(k.weakest[key])}</Label>
          </g>
        );
      })}
    </svg>
  );
};

const DetailEmotions: React.FC<{ k: EmotionsConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const [pick, setPick] = useState<string | null>(null);
  const W = 340, H = 30 + k.items.length * 22, L = 112, R = W - 32;
  const x0 = Math.floor(Math.min(...k.items.map((i) => i.avg)) - 0.4), x1 = Math.ceil(Math.max(...k.items.map((i) => i.avg)) + 0.2);
  const x = (v: number) => L + ((v - x0) / (x1 - x0)) * (R - L);
  const ticks: number[] = [];
  for (let v = x0; v <= x1; v++) ticks.push(v);
  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('constats.emotions.title')}>
        <rect x={x(k.split)} y={0} width={R - x(k.split) + 6} height={H - 22} fill={LIME} opacity={0.05} />
        <line x1={x(k.split)} x2={x(k.split)} y1={0} y2={H - 22} stroke={INK3} strokeDasharray="3 4" strokeWidth={1.5} />
        {ticks.map((v) => (
          <Label key={v} x={x(v)} y={H - 6} textAnchor="middle" fill={INK3} fontSize={10}>{v}</Label>
        ))}
        {k.items.map((it, i) => {
          const yy = 14 + i * 22, good = it.avg >= k.split;
          return (
            <g key={it.key} {...hit(() => setPick(`${t(`addMovie.${it.key}`)} — ${t('constats.emotions.point', { n: it.count, avg: fmt(it.avg) })}`))}>
              <rect x={0} y={yy - 11} width={W} height={22} fill="transparent" />
              <Label x={L - 10} y={yy + 4} textAnchor="end" fill={good ? INK : INK2} fontSize={11.5} fontWeight={800}>{t(`addMovie.${it.key}`)}</Label>
              <line x1={x(x0)} x2={x(it.avg)} y1={yy} y2={yy} stroke={good ? LIME : BURNT} strokeWidth={2} opacity={0.35} />
              <circle cx={x(it.avg)} cy={yy} r={5.5} fill={good ? LIME : BURNT} stroke="#0E0E0E" strokeWidth={2} />
              <Label x={x(it.avg) + 10} y={yy + 4} fontSize={10.5} fontWeight={800}>{fmt(it.avg)}</Label>
            </g>
          );
        })}
      </svg>
      <Readout text={pick} t={t} />
    </div>
  );
};

const DetailDuree: React.FC<{ k: DureeConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const labels = { short: '< 1h35', mid1: '1h35–1h55', mid2: '1h55–2h15', long: '2h15 +' };
  const avgs = k.bands.filter((b) => b.avg != null).map((b) => b.avg as number);
  const best = Math.max(...avgs), worst = Math.min(...avgs);
  const W = 340, rowH = 44, H = rowH * 4 + 4, x0 = 96, maxW = W - x0 - 46;
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('constats.duree.eyebrow')}>
      {k.bands.map((b, i) => {
        const yy = i * rowH + 6, w = maxW * (0.3 + (0.7 * i) / 3);
        return (
          <g key={b.key}>
            <Label x={0} y={yy + 20} fontSize={11.5} fontWeight={800}>{labels[b.key]}</Label>
            <Label x={0} y={yy + 33} fill={INK3} fontSize={9.5}>{t('constats.films', { n: b.count })}</Label>
            {b.avg != null && (
              <>
                <FilmStrip x={x0} y={yy + 4} w={w} h={28} fill={k.tone === 'flat' ? NEUTRAL : toneColor(b.avg, best, worst)} hole="#0E0E0E" />
                <Label x={x0 + w + 8} y={yy + 23} fill={INK} fontSize={14} fontWeight={900}>{fmt(b.avg)}</Label>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
};

const DetailClassiques: React.FC<{ k: ClassiquesConstat; t: T; fmt: Fmt }> = ({ k, t, fmt }) => {
  const [pick, setPick] = useState<string | null>(null);
  const W = 340, H = 220, m = { l: 26, r: 12, t: 12, b: 34 };
  const stops = [0, 1, 5, 10, 20, 35], px = [0, 0.22, 0.5, 0.68, 0.86, 1];
  const ageX = (a: number) => {
    const c = Math.min(a, 35);
    const i = stops.findIndex((v) => c <= v);
    if (i <= 0) return m.l;
    const f = (c - stops[i - 1]) / (stops[i] - stops[i - 1]);
    return m.l + (px[i - 1] + f * (px[i] - px[i - 1])) * (W - m.l - m.r);
  };
  const y = (v: number) => H - m.b - ((v - 2) / 8) * (H - m.t - m.b);
  const seen = new Map<string, number>();
  const ticks: [number, string][] = [[0, t('constats.classiques.release')], [1, '1'], [5, '5'], [10, '10'], [20, '20'], [35, t('constats.classiques.years', { n: 35 })]];
  return (
    <div className="space-y-4">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('constats.classiques.eyebrow')}>
        {[2, 4, 6, 8, 10].map((v) => (
          <g key={v}>
            <line x1={m.l} x2={W - m.r} y1={y(v)} y2={y(v)} stroke={GRID} />
            <Label x={m.l - 7} y={y(v) + 3} textAnchor="end" fill={INK3} fontSize={10}>{v}</Label>
          </g>
        ))}
        {ticks.map(([a, l]) => (
          <Label key={a} x={ageX(a)} y={H - m.b + 16} textAnchor={a === 35 ? 'end' : a === 0 ? 'start' : 'middle'} fill={INK3} fontSize={9.5}>{l}</Label>
        ))}
        {k.points.map((p) => {
          const key = `${Math.min(p.age, 35)}|${p.rating}`;
          const n = (seen.get(key) ?? 0) + 1;
          seen.set(key, n);
          const cx = ageX(p.age) + (n - 1) * 5;
          const color = p.age >= 5 ? (k.tone === 'new' ? BURNT : LIME) : p.age <= 1 ? NEUTRAL : INK3;
          return (
            <g key={p.id} {...hit(() => setPick(`${p.title} (${p.year}) — ${t('constats.classiques.point', { age: p.age, rating: fmt(p.rating) })}`))}>
              <circle cx={cx} cy={y(p.rating)} r={10} fill="transparent" />
              <circle cx={cx} cy={y(p.rating)} r={4} fill={color} stroke="#0E0E0E" strokeWidth={1.5} />
            </g>
          );
        })}
        <line x1={ageX(0) - 4} x2={ageX(1) + 8} y1={y(k.fresh)} y2={y(k.fresh)} stroke={k.tone === 'new' ? LIME : BURNT} strokeWidth={2.5} strokeLinecap="round" />
        <line x1={ageX(5) - 4} x2={ageX(35)} y1={y(k.old)} y2={y(k.old)} stroke={k.tone === 'new' ? BURNT : LIME} strokeWidth={2.5} strokeLinecap="round" />
      </svg>
      <Readout text={pick} t={t} />
    </div>
  );
};

const DetailRevirements: React.FC<{ k: RevirementsConstat; fmt: Fmt }> = ({ k, fmt }) => (
  <ul className="space-y-2">
    {k.changes.slice(0, 12).map((c) => {
      const up = c.to > c.from;
      return (
        <li key={c.id} className="flex items-center justify-between gap-3 rounded-2xl bg-white/[0.05] px-4 py-3">
          <span className="min-w-0 truncate text-sm font-bold text-white">{c.title}</span>
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

/* ───────────────────────── Feuille de détail ───────────────────────── */

const detailTitle = (id: ConstatId, c: Constats, t: T, fmt: Fmt): string => {
  if (id === 'public' && c.public.unlocked) return t(`constats.public.title.${c.public.tone}`);
  if (id === 'emotions') return t('constats.emotions.title');
  return headline(id, c, t, fmt) ?? t(`constats.${id}.eyebrow`);
};

const detailLede = (id: ConstatId, c: Constats, t: T, fmt: Fmt): string[] => {
  switch (id) {
    case 'public': {
      const k = c.public;
      if (!k.unlocked) return [];
      const out = [t(`constats.public.lede.${k.tone}`, { gap: fmt(Math.abs(k.gap)) })];
      if (k.genre) out.push(t('constats.public.genre', { gap: fmt(Math.abs(k.genre.gap)), genre: k.genre.name }));
      return out;
    }
    case 'phone': {
      const k = c.phone;
      if (!k.unlocked) return [];
      const filled = k.buckets.filter((b) => b.count > 0);
      return [t('constats.phone.lede', { never: fmt(filled[0].avg ?? 0), worst: fmt(filled[filled.length - 1].avg ?? 0) })];
    }
    case 'maillon': {
      const k = c.maillon;
      if (!k.unlocked) return [];
      const out = [t('constats.maillon.lede', { n: Math.round(k.weakest[k.lead]), total: k.total })];
      if (k.crash) out.push(t('constats.maillon.crash', { avg: fmt(k.crash.avg) }));
      return out;
    }
    case 'emotions': {
      const k = c.emotions;
      return k.unlocked
        ? [t('constats.emotions.lede', { top: t(`addMovie.${k.top.key}`), topAvg: fmt(k.top.avg), low: t(`addMovie.${k.low.key}`), lowAvg: fmt(k.low.avg) })]
        : [];
    }
    case 'duree': {
      const k = c.duree;
      return k.unlocked ? [t('constats.duree.lede', { long: fmt(k.bands[3].avg ?? 0), short: fmt(k.bands[0].avg ?? 0) })] : [];
    }
    case 'classiques': {
      const k = c.classiques;
      return k.unlocked ? [t('constats.classiques.lede', { old: fmt(k.old), fresh: fmt(k.fresh) })] : [];
    }
    case 'revirements': {
      const k = c.revirements;
      if (!k.unlocked) return [];
      const top = k.changes[0];
      return [t('constats.revirements.lede', { title: top.title, from: fmt(top.from), to: fmt(top.to) })];
    }
  }
};

const ConstatSheet: React.FC<{ id: ConstatId; constats: Constats; onClose: () => void }> = ({ id, constats: c, onClose }) => {
  const { t } = useLanguage();
  const fmt = useFmt();
  const title = detailTitle(id, c, t, fmt);
  const dialog = useDialog(onClose, title);

  const chart = (() => {
    switch (id) {
      case 'public': return c.public.unlocked ? <DetailPublic k={c.public} t={t} fmt={fmt} /> : null;
      case 'phone': return c.phone.unlocked ? <DetailPhone k={c.phone} t={t} fmt={fmt} /> : null;
      case 'maillon': return c.maillon.unlocked ? <DetailMaillon k={c.maillon} t={t} /> : null;
      case 'emotions': return c.emotions.unlocked ? <DetailEmotions k={c.emotions} t={t} fmt={fmt} /> : null;
      case 'duree': return c.duree.unlocked ? <DetailDuree k={c.duree} t={t} fmt={fmt} /> : null;
      case 'classiques': return c.classiques.unlocked ? <DetailClassiques k={c.classiques} t={t} fmt={fmt} /> : null;
      case 'revirements': return c.revirements.unlocked ? <DetailRevirements k={c.revirements} fmt={fmt} /> : null;
    }
  })();

  return createPortal(
    <div {...dialog.props} className="fixed inset-0 z-[180] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      <div className="relative z-10 w-full sm:max-w-lg bg-[#0E0E0E] text-white rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] sm:max-h-[85dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/10">
        <div className="relative flex justify-center pt-3 pb-1 shrink-0" onClick={onClose}>
          <div className="w-12 h-1.5 bg-stone-700 rounded-full" />
        </div>
        <button
          onClick={onClose}
          aria-label={t('constats.close')}
          className="absolute right-5 top-4 z-20 w-8 h-8 rounded-full bg-[#1F1F1E] flex items-center justify-center text-stone-300 active:scale-90 transition-transform"
        >
          <X size={17} strokeWidth={2.5} />
        </button>
        <div className="flex-1 overflow-y-auto no-scrollbar px-6 pb-8 pt-3 space-y-4">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 pr-10">{t(`constats.${id}.eyebrow`)}</p>
          <h2 className="text-[26px] font-black tracking-tight leading-[1.05] text-balance pr-6">{title}</h2>
          {detailLede(id, c, t, fmt).map((line) => (
            <p key={line} className="text-sm leading-relaxed text-stone-400">{line}</p>
          ))}
          {chart}
          <p className="border-t border-white/10 pt-3 text-[11.5px] leading-relaxed text-stone-500">{t(`constats.${id}.foot`)}</p>
        </div>
      </div>
    </div>,
    document.body
  );
};

/* ───────────────────────── La rangée ───────────────────────── */

const Mini: React.FC<{ id: ConstatId; c: Constats; t: T; fmt: Fmt }> = ({ id, c, t, fmt }) => {
  switch (id) {
    case 'public': return c.public.unlocked ? <MiniPublic k={c.public} t={t} fmt={fmt} /> : null;
    case 'phone': return c.phone.unlocked ? <MiniPhone k={c.phone} t={t} fmt={fmt} /> : null;
    case 'maillon': return c.maillon.unlocked ? <MiniMaillon k={c.maillon} t={t} /> : null;
    case 'emotions': return c.emotions.unlocked ? <MiniEmotions k={c.emotions} t={t} fmt={fmt} /> : null;
    case 'duree': return c.duree.unlocked ? <MiniDuree k={c.duree} fmt={fmt} /> : null;
    case 'classiques': return c.classiques.unlocked ? <MiniClassiques k={c.classiques} t={t} fmt={fmt} /> : null;
    case 'revirements': return c.revirements.unlocked ? <MiniRevirements k={c.revirements} fmt={fmt} /> : null;
  }
};

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
      <div className="-mx-6 flex snap-x snap-mandatory gap-3 overflow-x-auto px-6 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {unlocked.map((id) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              haptics.soft();
              setOpen(id);
            }}
            className="snap-start shrink-0 w-[236px] min-h-[292px] rounded-[1.7rem] bg-[#161615] border border-white/5 p-4 grid grid-rows-[auto_auto_1fr_auto] gap-2 text-left text-white active:scale-[0.98] transition-transform"
          >
            <span className="text-[9px] font-black uppercase tracking-[0.18em] text-stone-500">{t(`constats.${id}.eyebrow`)}</span>
            <span className="text-[19px] font-black tracking-tight leading-[1.08] text-balance">{headline(id, constats, t, fmt)}</span>
            <span className="self-center w-full">
              <Mini id={id} c={constats} t={t} fmt={fmt} />
            </span>
            <span className="flex items-center justify-end gap-1 text-[10px] font-black uppercase tracking-[0.12em] text-bitter-lime">
              {t('constats.seeDetail')}
              <ChevronRight size={13} strokeWidth={3} />
            </span>
          </button>
        ))}
        {locked.map((id) => {
          const k = constats[id];
          return (
            <div
              key={id}
              className="snap-start shrink-0 w-[236px] min-h-[292px] rounded-[1.7rem] border-[1.5px] border-dashed border-stone-300 dark:border-white/15 p-4 grid grid-rows-[auto_auto_1fr_auto] gap-2"
            >
              <span className="text-[9px] font-black uppercase tracking-[0.18em] text-stone-400 dark:text-stone-500">{t('constats.locked')}</span>
              <span className="text-[19px] font-black tracking-tight leading-[1.08] text-stone-500 dark:text-stone-400">{t(`constats.${id}.eyebrow`)}</span>
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
