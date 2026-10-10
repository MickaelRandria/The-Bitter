import React, { useMemo, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import { MovieRating, MovieVote, SharedMovie } from '../../services/supabase';
import { WatchPlan } from '../../services/plans';
import {
  PairRow,
  affinityMatrix,
  agreementByMonth,
  agreementSplit,
  criteriaDivergence,
  definers,
  genreDumbbell,
  pairRows,
  sessionHabits,
  turningFilm,
  whoLeads,
} from '../../utils/spaceStats';
import { cap, fmt1, mean } from '../../utils/verdict';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { Avatar, Poster, VerdictPerson } from './VerdictBits';

/**
 * « Nos stats » : des graphiques qui n'existent qu'à plusieurs.
 *
 * Tout se lit par paire (toi et un autre membre) : c'est la seule échelle où
 * « d'accord » veut dire quelque chose. À plus de deux, un sélecteur choisit la
 * paire, et une matrice montre toutes les affinités du groupe.
 */
interface SpaceStatsViewProps {
  spaceName: string;
  currentUserId: string;
  people: VerdictPerson[];
  movies: SharedMovie[];
  ratings: MovieRating[];
  votes: MovieVote[];
  plans: WatchPlan[];
  onClose: () => void;
}

interface Tip {
  x: number;
  y: number;
  title: string;
  sub: string;
}

const W = 300;

const SpaceStatsView: React.FC<SpaceStatsViewProps> = (props) => {
  const { t, language } = useLanguage();
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const me = props.people.find((p) => p.isMe)!;
  const others = props.people.filter((p) => !p.isMe);
  const [otherId, setOtherId] = useState(() => {
    // La paire par défaut : celle qui a le plus de films notés en commun.
    const count = (id: string) => pairRows(props.movies as never, props.ratings as never, props.currentUserId, id).length;
    return [...others].sort((a, b) => count(b.id) - count(a.id))[0]?.id ?? '';
  });
  const other = others.find((p) => p.id === otherId) ?? others[0];
  const [tip, setTip] = useState<Tip | null>(null);

  const films = props.movies.filter((m) => m.status === 'watched');
  const stats = useMemo(() => {
    if (!other) return null;
    const rows = pairRows(films as never, props.ratings as never, props.currentUserId, other.id);
    const months = agreementByMonth(rows);
    return {
      rows,
      split: agreementSplit(rows),
      defs: definers(rows),
      months,
      turning: turningFilm(rows, months),
      criteria: criteriaDivergence(films as never, props.ratings as never, props.currentUserId, other.id),
      genres: genreDumbbell(rows),
      leads: whoLeads(props.movies as never, props.votes, props.ratings as never, props.currentUserId, other.id),
      habits: sessionHabits(props.plans, props.currentUserId, other.id),
    };
  }, [other?.id, props.movies, props.ratings, props.votes, props.plans]);

  const monthLabel = (m: string, style: 'long' | 'short' = 'long') => {
    const [y, mo] = m.split('-').map(Number);
    return new Date(y, mo - 1, 1).toLocaleDateString(locale, { month: style });
  };
  const otherName = other?.name ?? '';
  const pairLabel = props.people.length === 2 ? t('stats.pairTwo') : t('stats.pairWith', { name: otherName });

  const showTip = (e: React.PointerEvent | React.MouseEvent, title: string, sub: string) => {
    const box = (e.currentTarget as Element).closest('[data-chart]')?.getBoundingClientRect();
    if (!box) return;
    setTip({ x: e.clientX - box.left, y: e.clientY - box.top, title, sub });
  };
  const tipBox = (chart: string) =>
    tip && tip.title && activeChart === chart ? (
      <span
        className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-[calc(100%+10px)] rounded-xl bg-charcoal dark:bg-white text-white dark:text-charcoal px-2.5 py-1.5 shadow-lg whitespace-nowrap"
        style={{ left: Math.max(70, Math.min(tip.x, 250)), top: tip.y }}
        role="status"
      >
        <b className="block text-[11.5px] font-black">{tip.title}</b>
        <small className="block text-[10.5px] font-semibold opacity-80">{tip.sub}</small>
      </span>
    ) : null;
  const [activeChart, setActiveChart] = useState('');
  const hover = (chart: string, title: string, sub: string) => ({
    onPointerEnter: (e: React.PointerEvent) => {
      setActiveChart(chart);
      showTip(e, title, sub);
    },
    onClick: (e: React.MouseEvent) => {
      haptics.soft();
      setActiveChart(chart);
      showTip(e, title, sub);
    },
    onPointerLeave: () => setTip(null),
  });

  const card = 'rounded-[1.6rem] bg-white dark:bg-[#161616] border border-sand dark:border-white/10 p-4 space-y-3';
  const h3 = 'text-[17px] font-black tracking-tight text-charcoal dark:text-white';
  const lead = 'text-[12.5px] font-semibold leading-snug text-stone-500 dark:text-stone-400';
  const gridLine = 'stroke-sand dark:stroke-white/10';
  const axisText = 'fill-stone-500 dark:fill-stone-400';
  const legendDot = (color: string, text: string) => (
    <span className="inline-flex items-center gap-1.5">
      <i className="inline-block w-2.5 h-2.5 rounded-full" style={{ background: color }} />
      {text}
    </span>
  );

  // ─── Carte des goûts ────────────────────────────────────────────────────────
  const scatter = (rows: PairRow[]) => {
    const H = 250;
    const L = 26;
    const T = 10;
    const w = W - L - 10;
    const h = H - T - 26;
    const x = (v: number) => L + (v / 10) * w;
    const y = (v: number) => T + h - (v / 10) * h;
    return (
      <div className="relative" data-chart>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('stats.scatterAria', { name: otherName })}>
          {[0, 2.5, 5, 7.5, 10].map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={T} y2={T + h} className={gridLine} strokeWidth={1} />
              <line x1={L} x2={L + w} y1={y(v)} y2={y(v)} className={gridLine} strokeWidth={1} />
              <text x={x(v)} y={H - 8} textAnchor="middle" className={axisText} style={{ font: '700 9px Inter, sans-serif' }}>
                {v}
              </text>
              <text x={L - 6} y={y(v) + 3} textAnchor="end" className={axisText} style={{ font: '700 9px Inter, sans-serif' }}>
                {v}
              </text>
            </g>
          ))}
          {/* Bande de l'accord : à moins d'un point de la diagonale. */}
          <polygon
            points={`${x(0)},${y(1)} ${x(9)},${y(10)} ${x(10)},${y(10)} ${x(10)},${y(9)} ${x(1)},${y(0)} ${x(0)},${y(0)}`}
            className="fill-charcoal/5 dark:fill-white/5"
          />
          <line x1={x(0)} y1={y(0)} x2={x(10)} y2={y(10)} className="stroke-charcoal/30 dark:stroke-white/30" strokeWidth={1} strokeDasharray="3 3" />
          {rows.map((r) => {
            const color = Math.abs(r.gap) <= 1 ? 'currentColor' : r.gap > 1 ? other!.color : me.color;
            return (
              <g key={r.film.id} className="text-charcoal dark:text-white cursor-pointer" {...hover('scatter', r.film.title, `${cap(t('spaces.you'))} ${fmt1(r.me)} · ${otherName} ${fmt1(r.them)}`)}>
                <circle cx={x(r.me)} cy={y(r.them)} r={12} fill="transparent" />
                <circle cx={x(r.me)} cy={y(r.them)} r={5} fill={color} className="stroke-white dark:stroke-[#161616]" strokeWidth={2} />
              </g>
            );
          })}
        </svg>
        {tipBox('scatter')}
        <div className="flex flex-wrap gap-3 text-[10.5px] font-extrabold text-stone-500 dark:text-stone-400 mt-1">
          {legendDot('currentColor', t('stats.legendAgree'))}
          {legendDot(other!.color, t('stats.legendTheyHigher', { name: otherName }))}
          {legendDot(me.color, t('stats.legendYouHigher'))}
        </div>
        <p className="mt-1 text-[10.5px] font-semibold text-stone-500 dark:text-stone-400">{t('stats.scatterAxes', { name: otherName })}</p>
      </div>
    );
  };

  // ─── Courbe de l'accord ─────────────────────────────────────────────────────
  const line = (months: { month: string; pct: number; count: number }[]) => {
    const H = 150;
    const L = 34;
    const T = 12;
    const w = W - L - 14;
    const h = H - T - 26;
    const x = (i: number) => L + (months.length === 1 ? w / 2 : (i / (months.length - 1)) * w);
    const y = (v: number) => T + h - (v / 100) * h;
    const d = months.map((m, i) => `${i ? 'L' : 'M'}${x(i)} ${y(m.pct)}`).join(' ');
    return (
      <div className="relative" data-chart>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('stats.lineAria')}>
          {[0, 50, 100].map((v) => (
            <g key={v}>
              <line x1={L} x2={L + w} y1={y(v)} y2={y(v)} className={gridLine} strokeWidth={1} />
              <text x={L - 6} y={y(v) + 3} textAnchor="end" className={axisText} style={{ font: '700 9px Inter, sans-serif' }}>
                {v} %
              </text>
            </g>
          ))}
          <path d={d} fill="none" stroke={me.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          {months.map((m, i) => (
            <g key={m.month} className="cursor-pointer" {...hover('line', `${monthLabel(m.month)} · ${m.pct} %`, t('stats.lineTip', { n: String(m.count) }))}>
              <circle cx={x(i)} cy={y(m.pct)} r={12} fill="transparent" />
              <circle cx={x(i)} cy={y(m.pct)} r={4.5} fill={me.color} className="stroke-white dark:stroke-[#161616]" strokeWidth={2} />
              <text x={x(i)} y={H - 6} textAnchor="middle" className={axisText} style={{ font: '700 9px Inter, sans-serif' }}>
                {monthLabel(m.month, 'short')}
              </text>
            </g>
          ))}
        </svg>
        {tipBox('line')}
      </div>
    );
  };

  // ─── Écarts par critère ─────────────────────────────────────────────────────
  const diverge = (rows: { key: string; gap: number }[]) => {
    const max = Math.max(2, ...rows.map((r) => Math.abs(r.gap)));
    const rowH = 30;
    const H = rows.length * rowH + 22;
    const L = 78;
    const w = W - L - 10;
    const mid = L + w / 2;
    const x = (v: number) => mid + (v / max) * (w / 2);
    return (
      <div className="relative" data-chart>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('stats.divergeAria')}>
          <line x1={mid} x2={mid} y1={0} y2={rows.length * rowH} className="stroke-charcoal/30 dark:stroke-white/30" strokeWidth={1} />
          {rows.map((r, i) => {
            const y0 = i * rowH + 7;
            const x1 = Math.min(mid, x(r.gap));
            const width = Math.max(2, Math.abs(x(r.gap) - mid));
            const color = r.gap >= 0 ? other!.color : me.color;
            const who = r.gap >= 0 ? otherName : t('spaces.you');
            return (
              <g key={r.key} className="cursor-pointer" {...hover('diverge', t(`criteria.${r.key}`), t('stats.divergeTip', { who, gap: fmt1(Math.abs(r.gap)) }))}>
                <rect x={L} y={y0 - 4} width={w} height={rowH - 6} fill="transparent" />
                <text x={L - 8} y={y0 + 11} textAnchor="end" className="fill-charcoal dark:fill-white" style={{ font: '800 11px Inter, sans-serif' }}>
                  {t(`criteria.${r.key}`)}
                </text>
                <rect x={x1} y={y0 + 2} width={width} height={14} rx={4} fill={color} />
              </g>
            );
          })}
          <text x={L} y={H - 4} className={axisText} style={{ font: '700 9px Inter, sans-serif' }}>
            {t('stats.divergeLeft')}
          </text>
          <text x={L + w} y={H - 4} textAnchor="end" className={axisText} style={{ font: '700 9px Inter, sans-serif' }}>
            {t('stats.divergeRight', { name: otherName })}
          </text>
        </svg>
        {tipBox('diverge')}
      </div>
    );
  };

  // ─── Genres ─────────────────────────────────────────────────────────────────
  const dumbbell = (rows: ReturnType<typeof genreDumbbell>) => {
    const rowH = 30;
    const H = rows.length * rowH + 20;
    const L = 92;
    const w = W - L - 12;
    const lo = Math.max(0, Math.floor(Math.min(...rows.flatMap((r) => [r.me, r.them])) - 1));
    const x = (v: number) => L + ((v - lo) / (10 - lo)) * w;
    const ticks = [lo, Math.round((lo + 10) / 2), 10];
    return (
      <div className="relative" data-chart>
        <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={t('stats.genresAria')}>
          {ticks.map((v) => (
            <g key={v}>
              <line x1={x(v)} x2={x(v)} y1={0} y2={rows.length * rowH} className={gridLine} strokeWidth={1} />
              <text x={x(v)} y={H - 4} textAnchor="middle" className={axisText} style={{ font: '700 9px Inter, sans-serif' }}>
                {v}
              </text>
            </g>
          ))}
          {rows.map((r, i) => {
            const cy = i * rowH + 15;
            return (
              <g
                key={r.genre}
                className="cursor-pointer"
                {...hover('genres', r.genre, `${cap(t('spaces.you'))} ${fmt1(r.me)} · ${otherName} ${fmt1(r.them)} · ${t('stats.filmsCount', { n: String(r.count) })}`)}
              >
                <rect x={0} y={cy - 13} width={W} height={rowH - 2} fill="transparent" />
                <text x={L - 8} y={cy + 4} textAnchor="end" className="fill-charcoal dark:fill-white" style={{ font: '800 11px Inter, sans-serif' }}>
                  {r.genre.length > 13 ? `${r.genre.slice(0, 12)}…` : r.genre}
                </text>
                <line x1={x(r.me)} x2={x(r.them)} y1={cy} y2={cy} className="stroke-charcoal/25 dark:stroke-white/25" strokeWidth={2} />
                <circle cx={x(r.me)} cy={cy} r={5.5} fill={me.color} className="stroke-white dark:stroke-[#161616]" strokeWidth={2} />
                <circle cx={x(r.them)} cy={cy} r={5.5} fill={other!.color} className="stroke-white dark:stroke-[#161616]" strokeWidth={2} />
              </g>
            );
          })}
        </svg>
        {tipBox('genres')}
        <div className="flex flex-wrap gap-3 text-[10.5px] font-extrabold text-stone-500 dark:text-stone-400">
          {legendDot(me.color, cap(t('spaces.you')))}
          {legendDot(other!.color, otherName)}
        </div>
      </div>
    );
  };

  // ─── Matrice des affinités (plus de deux membres) ───────────────────────────
  const matrix = () => {
    const ids = props.people.map((p) => p.id);
    const { cell } = affinityMatrix(props.ratings as never, ids);
    const cells: { a: string; b: string; gap: number }[] = [];
    for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) {
      const c = cell(ids[i], ids[j]);
      if (c) cells.push({ a: ids[i], b: ids[j], gap: c.gap });
    }
    if (!cells.length) return null;
    const best = [...cells].sort((x, y) => x.gap - y.gap)[0];
    const nameOf = (id: string) => (id === props.currentUserId ? t('spaces.you') : props.people.find((p) => p.id === id)?.name ?? '');
    // Une seule teinte, du clair au foncé : plus c'est foncé, plus la paire est d'accord.
    const shade = (gap: number) => `color-mix(in oklab, ${me.color} ${Math.round(18 + Math.max(0, Math.min(1, (2.5 - gap) / 2)) * 82)}%, transparent)`;
    return (
      <div className={card}>
        <h3 className={h3}>{t('stats.matrixTitle')}</h3>
        <p className={lead}>
          {t('stats.matrixLead')} <b className="text-charcoal dark:text-white">{cap(t('stats.matrixBest', { a: nameOf(best.a), b: nameOf(best.b) }))}</b>
        </p>
        <div className="relative" data-chart>
          <div className="grid gap-1 max-w-[320px] mx-auto" style={{ gridTemplateColumns: `36px repeat(${ids.length}, minmax(0, 1fr))` }}>
            <span />
            {props.people.map((p) => (
              <span key={p.id} className="flex justify-center">
                <Avatar person={p} size={26} />
              </span>
            ))}
            {props.people.map((row) => (
              <React.Fragment key={row.id}>
                <span className="flex items-center">
                  <Avatar person={row} size={26} />
                </span>
                {props.people.map((col) => {
                  if (row.id === col.id) return <span key={col.id} className="aspect-square rounded-lg bg-sand/60 dark:bg-white/5" />;
                  const c = cell(row.id, col.id);
                  return (
                    <button
                      key={col.id}
                      className="aspect-square rounded-lg flex items-center justify-center text-[11px] font-black tabular-nums text-charcoal dark:text-white"
                      style={{ background: c ? shade(c.gap) : 'transparent', border: c ? undefined : '1px dashed rgba(120,113,108,0.35)' }}
                      {...hover('matrix', `${nameOf(row.id)} · ${nameOf(col.id)}`, c ? t('stats.matrixTip', { gap: fmt1(c.gap), n: String(c.count) }) : t('stats.matrixNone'))}
                    >
                      {c ? fmt1(c.gap) : '–'}
                    </button>
                  );
                })}
              </React.Fragment>
            ))}
          </div>
          {tipBox('matrix')}
        </div>
      </div>
    );
  };

  const header = (
    <div className="flex items-center gap-3 px-4 pt-[calc(env(safe-area-inset-top,0px)+1rem)] pb-3">
      <button
        onClick={props.onClose}
        aria-label={t('common.back')}
        className="w-11 h-11 rounded-2xl bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white flex items-center justify-center active:scale-90 transition-transform"
      >
        <ArrowLeft size={20} strokeWidth={3} />
      </button>
      <div className="min-w-0">
        <b className="block text-[22px] font-black tracking-tighter text-charcoal dark:text-white leading-none">{t('stats.title')}</b>
        <small className="block mt-1 text-[11.5px] font-bold text-stone-500 dark:text-stone-400 truncate">
          {props.people.length === 2 ? t('stats.subtitleTwo', { name: otherName }) : t('stats.subtitleGroup', { space: props.spaceName, n: String(props.people.length) })}
          {stats ? ` · ${t('stats.ratedTogether', { n: String(stats.rows.length) })}` : ''}
        </small>
      </div>
    </div>
  );

  const pairs =
    others.length > 1 ? (
      <div className="flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none]">
        {others.map((p) => (
          <button
            key={p.id}
            onClick={() => {
              haptics.soft();
              setOtherId(p.id);
              setTip(null);
            }}
            aria-pressed={p.id === other?.id}
            className={`shrink-0 h-10 pl-1.5 pr-3.5 rounded-full flex items-center gap-2 text-xs font-black transition-colors ${
              p.id === other?.id ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal' : 'bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white'
            }`}
          >
            <Avatar person={p} size={28} />
            {t('stats.youAnd', { name: p.name })}
          </button>
        ))}
      </div>
    ) : null;

  const body = (() => {
    if (!stats || stats.rows.length < 3) {
      return (
        <div className={`${card} text-center py-10`}>
          <p className={h3}>{t('stats.emptyTitle')}</p>
          <p className={lead}>{t('stats.emptyBody', { name: otherName, n: String(stats?.rows.length ?? 0) })}</p>
        </div>
      );
    }
    const { rows, split, defs, months, turning, criteria, genres, leads, habits } = stats;
    const pairAvg = mean(rows.map((r) => r.joint)) ?? 0;
    const since = [...rows].map((r) => r.at).filter(Boolean).sort()[0];
    // Des rangées pleines de sept : une affiche seule sur sa ligne fait désordre.
    const sorted = [...rows].sort((a, b) => b.joint - a.joint);
    const wall = sorted.slice(0, sorted.length > 7 ? Math.min(21, Math.floor(sorted.length / 7) * 7) : sorted.length);
    const rise = months.length >= 2 ? months[months.length - 1].pct - months[0].pct : 0;
    const topCrit = criteria ? [...criteria].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))[0] : null;
    const safe = genres.length ? genres[0] : null;
    const risk = genres.length > 1 ? [...genres].sort((a, b) => Math.abs(b.them - b.me) - Math.abs(a.them - a.me))[0] : null;
    const definerItems = defs
      ? ([
          [defs.bestAgree, t('stats.defAgree')],
          [defs.worst, t('stats.defWorst')],
          [defs.mine, t('stats.defMine')],
          [defs.theirs, t('stats.defTheirs', { name: otherName })],
        ] as [PairRow | null, string][]).filter((x): x is [PairRow, string] => !!x[0])
      : [];
    const days = [t('stats.day0'), t('stats.day1'), t('stats.day2'), t('stats.day3'), t('stats.day4'), t('stats.day5'), t('stats.day6')];
    const filmCard = (row: PairRow, kicker: string, sub: string) => (
      <div className="flex gap-3 items-center rounded-2xl bg-sand dark:bg-[#1f1f1f] p-2.5">
        <Poster url={row.film.poster_url} className="w-[46px] aspect-[2/3] rounded-lg shrink-0" />
        <span className="min-w-0">
          <em className="not-italic block text-[9px] font-black uppercase tracking-[0.08em] text-stone-500 dark:text-stone-400">{kicker}</em>
          <b className="block text-[12.5px] font-black leading-tight text-charcoal dark:text-white truncate">{row.film.title}</b>
          <small className="block mt-0.5 text-[10.5px] font-semibold text-stone-500 dark:text-stone-400">{sub}</small>
        </span>
      </div>
    );

    return (
      <>
        <div className="rounded-[1.6rem] bg-charcoal dark:bg-[#161616] text-white p-3.5 space-y-3">
          <div className="flex items-end justify-between gap-3">
            <div>
              <p className="text-[9.5px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('stats.heroKicker', { pair: pairLabel })}</p>
              <p className="text-[38px] font-black tracking-[-0.06em] leading-[0.9] tabular-nums mt-1">{fmt1(pairAvg)}</p>
              <p className="text-[13px] font-extrabold mt-1">{t('stats.heroAvg', { n: String(rows.length) })}</p>
            </div>
            <p className="text-[11px] font-semibold text-white/70 text-right leading-snug">
              {since ? t('stats.since', { month: monthLabel(since.slice(0, 7)) }) : ''}
              {habits.inCinema ? (
                <>
                  <br />
                  {t('stats.inCinema', { n: String(habits.inCinema) })}
                </>
              ) : null}
            </p>
          </div>
          <div className="grid gap-1" style={{ gridTemplateColumns: `repeat(${Math.max(wall.length < 7 ? wall.length : 7, 4)}, minmax(0, 1fr))` }}>
            {wall.map((r) => (
              <Poster key={r.film.id} url={r.film.poster_url} size="w92" className="aspect-[2/3] rounded-md" />
            ))}
          </div>
        </div>

        <div className={card}>
          <h3 className={h3}>{t('stats.scatterTitle')}</h3>
          <p className={lead}>
            {t('stats.scatterLead', { name: otherName })}{' '}
            <b className="text-charcoal dark:text-white">{t('stats.scatterClose', { n: String(split.close) })}</b>
            {t('stats.scatterRest', { above: String(split.above), below: String(split.below), name: otherName })}
          </p>
          {scatter(rows)}
          {definerItems.length > 0 && (
            <>
              <p className="pt-1 text-[10px] font-black uppercase tracking-[0.18em] text-stone-500 dark:text-stone-400">{t('stats.definersTitle')}</p>
              <div className="flex gap-2.5 overflow-x-auto -mx-1 px-1 pb-1 [scrollbar-width:none]">
                {definerItems.map(([row, kicker]) => (
                  <div key={kicker} className="shrink-0 w-[112px] space-y-1.5">
                    <em className="not-italic block min-h-[22px] text-[9px] font-black uppercase tracking-[0.08em] leading-tight text-stone-500 dark:text-stone-400">
                      {kicker}
                    </em>
                    <Poster url={row.film.poster_url} size="w342" className="aspect-[2/3] rounded-xl">
                      <span className="absolute top-1.5 right-1.5 rounded-md bg-black/65 px-1.5 py-0.5 text-[10px] font-black tabular-nums text-white">
                        {fmt1(row.joint)}
                      </span>
                    </Poster>
                    <span className="block text-[11px] font-extrabold leading-tight text-charcoal dark:text-white line-clamp-2">{row.film.title}</span>
                    <span className="block text-[10.5px] font-semibold text-stone-500 dark:text-stone-400">
                      {cap(t('spaces.you'))} {fmt1(row.me)} · {otherName} {fmt1(row.them)}
                    </span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {months.length >= 2 && (
          <div className={card}>
            <h3 className={h3}>{rise >= 0 ? t('stats.lineTitleUp') : t('stats.lineTitleDown')}</h3>
            <p className={lead}>
              {t('stats.lineLead')}{' '}
              <b className="text-charcoal dark:text-white">
                {t('stats.lineDelta', { delta: `${rise >= 0 ? '+' : '−'}${Math.abs(rise)}`, month: monthLabel(months[0].month) })}
              </b>
            </p>
            {line(months)}
            {turning &&
              filmCard(
                turning.row,
                t('stats.turningKicker', { month: monthLabel(turning.month) }),
                t('stats.turningSub', { me: fmt1(turning.row.me), name: otherName, them: fmt1(turning.row.them) })
              )}
          </div>
        )}

        {criteria && (
          <div className={card}>
            <h3 className={h3}>{t('stats.divergeTitle')}</h3>
            <p className={lead}>
              {t('stats.divergeLead')}{' '}
              {topCrit && Math.abs(topCrit.gap) >= 0.5 && (
                <b className="text-charcoal dark:text-white">
                  {topCrit.gap > 0
                    ? t('stats.divergeTheyMore', { name: otherName, criterion: t(`criteria.${topCrit.key}`).toLowerCase() })
                    : t('stats.divergeYouMore', { criterion: t(`criteria.${topCrit.key}`).toLowerCase() })}
                </b>
              )}
            </p>
            {diverge(criteria)}
          </div>
        )}

        {genres.length >= 2 && (
          <div className={card}>
            <h3 className={h3}>{t('stats.genresTitle')}</h3>
            <p className={lead}>
              {t('stats.genresLead')}{' '}
              {risk && Math.abs(risk.them - risk.me) >= 1 && (
                <b className="text-charcoal dark:text-white">{t('stats.genresRisk', { genre: risk.genre.toLowerCase() })}</b>
              )}
            </p>
            {dumbbell(genres)}
            <div className="grid grid-cols-1 gap-2">
              {safe && filmCard(safe.best, t('stats.safeKicker', { genre: safe.genre.toLowerCase() }), t('stats.safeSub', { avg: fmt1(safe.best.joint) }))}
              {risk &&
                risk !== safe &&
                Math.abs(risk.them - risk.me) >= 1 &&
                filmCard(
                  risk.split,
                  t('stats.riskKicker', { genre: risk.genre.toLowerCase() }),
                  `${cap(t('spaces.you'))} ${fmt1(risk.split.me)} · ${otherName} ${fmt1(risk.split.them)}`
                )}
            </div>
          </div>
        )}

        <div className={card}>
          <h3 className={h3}>{t('stats.leadsTitle')}</h3>
          <p className={lead}>{t('stats.leadsLead')}</p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-2xl bg-sand dark:bg-[#1f1f1f] p-3">
              <b className="block text-[26px] font-black tracking-tight tabular-nums text-charcoal dark:text-white">{leads.mine}</b>
              <small className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 leading-snug">
                {leads.mineAccepted != null ? t('stats.leadsMine', { pct: String(leads.mineAccepted), name: otherName }) : t('stats.leadsMineNone')}
              </small>
            </div>
            <div className="rounded-2xl bg-sand dark:bg-[#1f1f1f] p-3">
              <b className="block text-[26px] font-black tracking-tight tabular-nums text-charcoal dark:text-white">{leads.theirs}</b>
              <small className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 leading-snug">
                {leads.theirsAccepted != null ? t('stats.leadsTheirs', { pct: String(leads.theirsAccepted), name: otherName }) : t('stats.leadsTheirsNone', { name: otherName })}
              </small>
            </div>
            {habits.day && habits.sessions >= 2 && (
              <div className="rounded-2xl bg-sand dark:bg-[#1f1f1f] p-3">
                <b className="block text-[22px] font-black tracking-tight text-charcoal dark:text-white">{days[habits.day.day]}</b>
                <small className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 leading-snug">
                  {t('stats.night', { n: String(habits.day.count), total: String(habits.sessions) })}
                </small>
              </div>
            )}
            {habits.inCinema > 0 && (
              <div className="rounded-2xl bg-sand dark:bg-[#1f1f1f] p-3">
                <b className="block text-[26px] font-black tracking-tight tabular-nums text-charcoal dark:text-white">{habits.inCinema}</b>
                <small className="block text-[11px] font-semibold text-stone-500 dark:text-stone-400 leading-snug">
                  {habits.cinema ? t('stats.cinemaAt', { name: habits.cinema.name }) : t('stats.cinemaCount')}
                </small>
              </div>
            )}
          </div>
        </div>
      </>
    );
  })();

  return (
    <div className="fixed inset-0 z-[140] bg-cream dark:bg-[#0c0c0c] overflow-y-auto overscroll-contain animate-[fadeIn_0.2s_ease-out]" role="dialog" aria-modal="true" aria-label={t('stats.title')}>
      <div className="max-w-2xl mx-auto pb-[calc(env(safe-area-inset-bottom,0px)+2rem)]" onClick={(e) => !(e.target as Element).closest('[data-chart]') && setTip(null)}>
        {header}
        {pairs}
        <div className="px-4 pt-3 space-y-3.5">
          {body}
          {props.people.length > 2 && matrix()}
        </div>
      </div>
    </div>
  );
};

export default SpaceStatsView;
