import React, { useState, useMemo, useEffect, useRef } from 'react';
import { Movie, UserProfile } from '../types';
import {
  Smartphone,
  Brain,
  Zap,
  Heart,
  Aperture,
  Smile,
  Film,
  Scale,
  ArrowUp,
  ArrowDown,
  Minus,
  Clock,
  Lock,
  ThumbsUp,
  ThumbsDown,
  TrendingUp,
  TrendingDown,
  Star,
  User,
  CalendarDays,
  BarChart2,
  Share2,
  Target,
  Route,
} from 'lucide-react';
import { haptics } from '../utils/haptics';
import { getAdvancedArchetype } from '../utils/archetypes';
import { computeHypeReality, computePacingInsight, getAvgRating } from '../utils/insights';
import { supabase } from '../services/supabase';
import { toPng } from 'html-to-image';
import { useLanguage } from '../contexts/LanguageContext';

interface AnalyticsViewProps {
  movies: Movie[];
  userProfile: UserProfile | null;
  onNavigateToCalendar?: () => void;
  onRecalibrate?: () => void;
  onViewDirector?: (name: string, id?: number) => void;
}

type TabMode = 'overview' | 'notes' | 'psycho';

const MIN_MOVIES_FOR_ANALYTICS = 5;

const getVibePhrase = (key: string, value: number, t: (k: string) => string): string => {
  const tier = value > 7 ? 'high' : value >= 4 ? 'mid' : 'low';
  return t(`vibe.phrase.${key}.${tier}`);
};

const RadarChart: React.FC<{ data: { label: string; value: number }[] }> = ({ data }) => {
  const cx = 100,
    cy = 100,
    r = 70;
  const n = data.length;
  const angle = (i: number) => (Math.PI * 2 * i) / n - Math.PI / 2;
  const toXY = (i: number, frac: number) => ({
    x: cx + r * frac * Math.cos(angle(i)),
    y: cy + r * frac * Math.sin(angle(i)),
  });
  const dataPoints = data.map((d, i) => toXY(i, d.value / 10));
  const dataPath =
    dataPoints
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
      .join(' ') + ' Z';
  return (
    <svg
      viewBox="0 0 200 200"
      style={{ overflow: 'visible' }}
      className="w-full max-w-[240px] mx-auto"
    >
      {[0.25, 0.5, 0.75, 1].map((level) => {
        const pts = Array.from({ length: n }, (_, i) => toXY(i, level));
        const p =
          pts
            .map((pt, i) => `${i === 0 ? 'M' : 'L'}${pt.x.toFixed(1)} ${pt.y.toFixed(1)}`)
            .join(' ') + ' Z';
        return (
          <path
            key={level}
            d={p}
            fill="none"
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-stone-200 dark:text-stone-700"
          />
        );
      })}
      {Array.from({ length: n }, (_, i) => {
        const end = toXY(i, 1);
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={end.x.toFixed(1)}
            y2={end.y.toFixed(1)}
            stroke="currentColor"
            strokeWidth={0.5}
            className="text-stone-200 dark:text-stone-700"
          />
        );
      })}
      <path
        d={dataPath}
        fill="currentColor"
        fillOpacity={0.18}
        stroke="currentColor"
        strokeWidth={2}
        className="text-forest dark:text-lime-500"
      />
      {dataPoints.map((p, i) => (
        <circle
          key={i}
          cx={p.x.toFixed(1)}
          cy={p.y.toFixed(1)}
          r={3}
          fill="currentColor"
          className="text-forest dark:text-lime-500"
        />
      ))}
      {data.map((d, i) => {
        const lr = r + 20;
        const lx = cx + lr * Math.cos(angle(i));
        const ly = cy + lr * Math.sin(angle(i));
        const anchor = lx > cx + 8 ? 'start' : lx < cx - 8 ? 'end' : 'middle';
        return (
          <text
            key={i}
            x={lx.toFixed(1)}
            y={ly.toFixed(1)}
            textAnchor={anchor}
            dominantBaseline="middle"
            fontSize={8.5}
            fontWeight="800"
            fill="currentColor"
            className="text-stone-500 dark:text-stone-400"
          >
            {d.label} · {d.value}
          </text>
        );
      })}
    </svg>
  );
};

const AnalyticsView: React.FC<AnalyticsViewProps> = ({
  movies,
  userProfile,
  onRecalibrate,
  onViewDirector,
}) => {
  const { t, language } = useLanguage();
  const [activeTab, setActiveTab] = useState<TabMode>('overview');
  const [isSharing, setIsSharing] = useState(false);
  const shareCardRef = useRef<HTMLDivElement>(null);

  const handleShareArchetype = async () => {
    if (!shareCardRef.current || !stats) return;
    setIsSharing(true);
    const el = shareCardRef.current;
    // Make visible in viewport so browser paints it, then capture
    el.style.opacity = '1';
    el.style.zIndex = '9999';
    await new Promise((r) => requestAnimationFrame(r));
    await new Promise((r) => requestAnimationFrame(r));
    try {
      const opts = { pixelRatio: 2, backgroundColor: '#1A1A1A' };
      await toPng(el, opts); // warm-up: loads fonts/resources into cache
      const dataUrl = await toPng(el, opts);
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], 'mon-archetype-the-bitter.png', { type: 'image/png' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: t('analytics.shareTitle', { title: stats.advancedArchetype.title }),
        });
      } else {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = 'the-bitter-archetype.png';
        a.click();
      }
    } catch (e) {
      if (import.meta.env.DEV) console.error(e);
    } finally {
      el.style.opacity = '0';
      el.style.zIndex = '-1';
      setIsSharing(false);
    }
  };

  const watchedCount = useMemo(() => movies.filter((m) => m.status === 'watched').length, [movies]);
  const isLocked = watchedCount < MIN_MOVIES_FOR_ANALYTICS;

  const stats = useMemo(() => {
    const locale = language === 'fr' ? 'fr-FR' : 'en-US';
    if (isLocked) return null;

    const watched = movies.filter((m) => m.status === 'watched');
    const count = watched.length;
    if (count === 0) return null;

    const sums = watched.reduce(
      (acc, m) => {
        acc.cerebral += m.vibe?.story || 5;
        acc.emotion += m.vibe?.emotion || 5;
        acc.fun += m.vibe?.fun || 5;
        acc.visual += m.vibe?.visual || 5;
        acc.tension += m.vibe?.tension || 5;
        acc.smartphone += m.smartphoneFactor || 0;
        acc.ratingStory += m.ratings.story;
        acc.ratingVisuals += m.ratings.visuals;
        acc.ratingActing += m.ratings.acting;
        acc.ratingSound += m.ratings.sound;
        return acc;
      },
      {
        cerebral: 0,
        emotion: 0,
        fun: 0,
        visual: 0,
        tension: 0,
        smartphone: 0,
        ratingStory: 0,
        ratingVisuals: 0,
        ratingActing: 0,
        ratingSound: 0,
      }
    );

    const averages = {
      cerebral: Number((sums.cerebral / count).toFixed(1)),
      emotion: Number((sums.emotion / count).toFixed(1)),
      fun: Number((sums.fun / count).toFixed(1)),
      visual: Number((sums.visual / count).toFixed(1)),
      tension: Number((sums.tension / count).toFixed(1)),
      smartphone: Math.round(sums.smartphone / count),
    };

    const ratingAverages = {
      story: Number((sums.ratingStory / count).toFixed(1)),
      visuals: Number((sums.ratingVisuals / count).toFixed(1)),
      acting: Number((sums.ratingActing / count).toFixed(1)),
      sound: Number((sums.ratingSound / count).toFixed(1)),
      global: Number(
        (
          (sums.ratingStory + sums.ratingVisuals + sums.ratingActing + sums.ratingSound) /
          (4 * count)
        ).toFixed(1)
      ),
    };

    const distinctGenreCount = new Set(watched.map((m) => m.genre).filter(Boolean)).size;

    const advancedArchetype = getAdvancedArchetype({
      vibes: averages,
      quality: {
        scenario: ratingAverages.story,
        acting: ratingAverages.acting,
        visual: ratingAverages.visuals,
        sound: ratingAverages.sound,
      },
      smartphone: averages.smartphone,
      distinctGenreCount,
      severityIndex: userProfile?.severityIndex || 5,
      rhythmIndex: userProfile?.patienceLevel || 5,
    });

    const totalMinutes = watched.reduce((acc, m) => acc + (m.runtime || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);

    // --- SÉVÉRITÉ ---
    const moviesWithTmdb = watched.filter((m) => m.tmdbRating && m.tmdbRating > 0);
    const tmdbSum = moviesWithTmdb.reduce((acc, m) => acc + (m.tmdbRating || 0), 0);
    const tmdbAvg =
      moviesWithTmdb.length > 0 ? Number((tmdbSum / moviesWithTmdb.length).toFixed(1)) : 0;
    const userGlobalAvg = ratingAverages.global;
    const delta = Number((userGlobalAvg - tmdbAvg).toFixed(1));

    let comparisonLabel = 'analytics.aligned';
    let comparisonColor = 'text-stone-400 dark:text-stone-500';
    let ComparisonIcon = Minus;

    if (delta >= 0.8) {
      comparisonLabel = 'analytics.generous';
      comparisonColor = 'text-forest dark:text-lime-500';
      ComparisonIcon = ArrowUp;
    } else if (delta >= 0.3) {
      comparisonLabel = 'analytics.benevolent';
      comparisonColor = 'text-lime-500';
      ComparisonIcon = ArrowUp;
    } else if (delta <= -0.8) {
      comparisonLabel = 'analytics.uncompromising';
      comparisonColor = 'text-red-500';
      ComparisonIcon = ArrowDown;
    } else if (delta <= -0.3) {
      comparisonLabel = 'analytics.demanding';
      comparisonColor = 'text-orange-400';
      ComparisonIcon = ArrowDown;
    }

    // --- PALMARÈS ---
    const sortedByRating = [...watched].sort((a, b) => {
      const avgA = (a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4;
      const avgB = (b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4;
      return avgB - avgA;
    });
    const bestRated = sortedByRating[0];
    const worstRated = sortedByRating[count - 1];

    // --- SURPRISE & DÉCEPTION (delta vs TMDB) ---
    const moviesWithDelta = moviesWithTmdb.map((m) => {
      const userAvg =
        (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
      return { ...m, userVsTmdb: Number((userAvg - (m.tmdbRating ?? 0)).toFixed(1)) };
    });
    const biggestSurprise =
      moviesWithDelta.length > 0
        ? [...moviesWithDelta].sort((a, b) => b.userVsTmdb - a.userVsTmdb)[0]
        : null;
    const biggestDisappointment =
      moviesWithDelta.length > 0
        ? [...moviesWithDelta].sort((a, b) => a.userVsTmdb - b.userVsTmdb)[0]
        : null;

    // --- RÉALISATEUR PRÉFÉRÉ ---
    const directorMap: Record<string, { sum: number; count: number; posterUrl?: string }> = {};
    watched.forEach((m) => {
      if (!m.director) return;
      if (!directorMap[m.director])
        directorMap[m.director] = { sum: 0, count: 0, posterUrl: m.posterUrl };
      const mAvg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
      directorMap[m.director].sum += mAvg;
      directorMap[m.director].count += 1;
    });
    const favoriteDirector =
      Object.entries(directorMap)
        .filter(([, d]) => d.count >= 2)
        .map(([name, d]) => ({
          name,
          avg: Number((d.sum / d.count).toFixed(1)),
          count: d.count,
          posterUrl: d.posterUrl,
        }))
        .sort((a, b) => b.avg - a.avg)[0] || null;

    // --- CRITÈRES : dominant & point aveugle ---
    const criteriaScores = [
      { id: 'story', label: 'criteria.story', val: ratingAverages.story },
      { id: 'visuals', label: 'criteria.visuals', val: ratingAverages.visuals },
      { id: 'acting', label: 'criteria.acting', val: ratingAverages.acting },
      { id: 'sound', label: 'criteria.sound', val: ratingAverages.sound },
    ];
    const dominantCriterion = [...criteriaScores].sort((a, b) => a.val - b.val)[0];
    const blindSpotCriterion = [...criteriaScores].sort((a, b) => b.val - a.val)[0];

    // --- TOP GENRES (avec count) ---
    const genreRatings: Record<string, { sum: number; count: number; avg: number }> = {};
    watched.forEach((m) => {
      if (!m.genre) return;
      if (!genreRatings[m.genre]) genreRatings[m.genre] = { sum: 0, count: 0, avg: 0 };
      const mAvg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
      genreRatings[m.genre].sum += mAvg;
      genreRatings[m.genre].count += 1;
    });
    Object.keys(genreRatings).forEach((g) => {
      genreRatings[g].avg = Number((genreRatings[g].sum / genreRatings[g].count).toFixed(1));
    });
    const genreRatingsSorted = Object.entries(genreRatings)
      .map(([name, data]) => ({ name, ...data }))
      .sort((a, b) => b.avg - a.avg);

    // --- MOIS LE PLUS ACTIF ---
    const monthCounts: Record<string, number> = {};
    watched.forEach((m) => {
      if (!m.dateWatched) return;
      const d = new Date(m.dateWatched);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      monthCounts[key] = (monthCounts[key] || 0) + 1;
    });
    const mostActiveMonthEntry = Object.entries(monthCounts).sort((a, b) => b[1] - a[1])[0] || null;
    let mostActiveMonth: { label: string; count: number } | null = null;
    if (mostActiveMonthEntry) {
      const [key, mCount] = mostActiveMonthEntry;
      const [year, month] = key.split('-');
      const d = new Date(parseInt(year), parseInt(month), 1);
      mostActiveMonth = {
        label: d.toLocaleDateString(locale, { month: 'long', year: 'numeric' }),
        count: mCount,
      };
    }

    // --- 12 DERNIERS MOIS ---
    const now = new Date();
    const last12Months = Array.from({ length: 12 }, (_, i) => {
      const d = new Date(now.getFullYear(), now.getMonth() - (11 - i), 1);
      const key = `${d.getFullYear()}-${d.getMonth()}`;
      return {
        label: d.toLocaleDateString(locale, { month: 'short' }),
        count: monthCounts[key] || 0,
      };
    });

    // --- PAR DÉCENNIE ---
    const decadeMap: Record<string, { sum: number; count: number }> = {};
    watched.forEach((m) => {
      if (!m.year) return;
      const decade = Math.floor(m.year / 10) * 10;
      const key = `${decade}`;
      if (!decadeMap[key]) decadeMap[key] = { sum: 0, count: 0 };
      const mAvg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
      decadeMap[key].sum += mAvg;
      decadeMap[key].count += 1;
    });
    const decadeData = Object.entries(decadeMap)
      .map(([decade, d]) => ({
        decade: `${decade}s`,
        avg: Number((d.sum / d.count).toFixed(1)),
        count: d.count,
      }))
      .sort((a, b) => a.decade.localeCompare(b.decade));

    // --- DISTRIBUTION DES NOTES ---
    const ratingDist: Record<number, number> = {};
    for (let i = 1; i <= 10; i++) ratingDist[i] = 0;
    watched.forEach((m) => {
      if (!m.ratings) return;
      const avg = Math.round(
        (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4
      );
      const clamped = Math.max(1, Math.min(10, avg));
      ratingDist[clamped]++;
    });
    const maxRatingCount = Math.max(...Object.values(ratingDist), 1);

    // --- TENDANCE HEBDOMADAIRE (26 dernières semaines) ---
    const getWeekStart = (d: Date): number => {
      const copy = new Date(d);
      const day = copy.getDay();
      const diff = day === 0 ? -6 : 1 - day;
      copy.setHours(0, 0, 0, 0);
      copy.setDate(copy.getDate() + diff);
      return copy.getTime();
    };
    const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
    const thisWeekStart = getWeekStart(now);
    const weeklyMap: Record<number, { sum: number; count: number }> = {};
    watched.forEach((m) => {
      if (!m.dateWatched) return;
      const ws = getWeekStart(new Date(m.dateWatched));
      if (!weeklyMap[ws]) weeklyMap[ws] = { sum: 0, count: 0 };
      const mAvg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
      weeklyMap[ws].sum += mAvg;
      weeklyMap[ws].count += 1;
    });
    const weeklyTrend = Array.from({ length: 26 }, (_, i) => {
      const ws = thisWeekStart - (25 - i) * WEEK_MS;
      const data = weeklyMap[ws];
      const d = new Date(ws);
      const prevD = i > 0 ? new Date(thisWeekStart - (25 - (i - 1)) * WEEK_MS) : null;
      return {
        weekIndex: i,
        weekStart: d,
        avg: data ? Number((data.sum / data.count).toFixed(1)) : null,
        count: data?.count || 0,
        monthLabel: d.toLocaleDateString(locale, { month: 'short' }),
        isFirstOfMonth: !prevD || prevD.getMonth() !== d.getMonth(),
      };
    });
    const firstHalf = weeklyTrend.slice(0, 13).filter((w) => w.avg !== null);
    const secondHalf = weeklyTrend.slice(13).filter((w) => w.avg !== null);
    const firstHalfAvg =
      firstHalf.length > 0
        ? firstHalf.reduce((s, w) => s + (w.avg ?? 0), 0) / firstHalf.length
        : null;
    const secondHalfAvg =
      secondHalf.length > 0
        ? secondHalf.reduce((s, w) => s + (w.avg ?? 0), 0) / secondHalf.length
        : null;
    const weeklyTrendDelta =
      firstHalfAvg !== null && secondHalfAvg !== null
        ? Number((secondHalfAvg - firstHalfAvg).toFixed(1))
        : null;
    const hasWeeklyData = weeklyTrend.some((w) => w.count > 0);

    const hypeReality = computeHypeReality(watched);
    const pacingInsight = computePacingInsight(watched);

    return {
      averages,
      ratingAverages,
      totalHours,
      bestRated,
      worstRated,
      advancedArchetype,
      comparisonLabel,
      comparisonColor,
      ComparisonIcon,
      delta,
      tmdbAvg,
      userGlobalAvg,
      genreRatingsSorted,
      criteriaScores,
      dominantCriterion,
      blindSpotCriterion,
      favoriteDirector,
      biggestSurprise,
      biggestDisappointment,
      mostActiveMonth,
      last12Months,
      decadeData,
      ratingDist,
      maxRatingCount,
      weeklyTrend,
      weeklyTrendDelta,
      hasWeeklyData,
      hypeReality,
      pacingInsight,
    };
  }, [movies, isLocked, userProfile?.severityIndex, userProfile?.patienceLevel, language]);

  // Recalibration silencieuse de l'archétype en DB
  useEffect(() => {
    if (
      stats &&
      userProfile?.id &&
      userProfile?.role !== stats.advancedArchetype.title &&
      supabase
    ) {
      const updateRole = async () => {
        await supabase
          .from('profiles')
          .update({ role: stats.advancedArchetype.title })
          .eq('id', userProfile.id);
      };
      updateRole();
    }
  }, [stats?.advancedArchetype.title, userProfile?.id, userProfile?.role]);

  if (isLocked) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center animate-[fadeIn_0.5s_ease-out]">
        <div className="w-24 h-24 bg-stone-100 dark:bg-[#161616] rounded-full flex items-center justify-center mb-6 text-stone-300 dark:text-stone-600 transition-colors">
          <Lock size={40} />
        </div>
        <h2 className="text-2xl font-black text-charcoal dark:text-white mb-2">
          {t('analytics.locked')}
        </h2>
        <p className="text-sm font-medium text-stone-500 dark:text-stone-600 max-w-xs mx-auto leading-relaxed mb-8">
          {t('analytics.lockedDesc', { n: String(MIN_MOVIES_FOR_ANALYTICS - watchedCount), s: MIN_MOVIES_FOR_ANALYTICS - watchedCount > 1 ? 's' : '' })}
        </p>
        <div className="w-full max-w-xs bg-stone-100 dark:bg-[#202020] h-2 rounded-full overflow-hidden transition-colors">
          <div
            className="h-full bg-forest transition-all duration-1000"
            style={{ width: `${(watchedCount / MIN_MOVIES_FOR_ANALYTICS) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest">
          {watchedCount} / {MIN_MOVIES_FOR_ANALYTICS} Films
        </p>
      </div>
    );
  }

  if (!stats) return null;

  const {
    averages,
    criteriaScores,
    totalHours,
    bestRated,
    worstRated,
    advancedArchetype,
    comparisonLabel,
    comparisonColor,
    ComparisonIcon,
    delta,
    tmdbAvg,
    userGlobalAvg,
    genreRatingsSorted,
    dominantCriterion,
    blindSpotCriterion,
    favoriteDirector,
    biggestSurprise,
    biggestDisappointment,
    mostActiveMonth,
    last12Months,
    decadeData,
    ratingDist,
    maxRatingCount,
    weeklyTrend,
    weeklyTrendDelta,
    hasWeeklyData,
    hypeReality,
    pacingInsight,
  } = stats;

  const maxDecadeCount = Math.max(...decadeData.map((d) => d.count), 1);

  return (
    <div className="pb-24 animate-[fadeIn_0.3s_ease-out]">
      {/* Navigation Tabs */}
      <div className="flex bg-stone-100 dark:bg-[#161616] p-1 rounded-2xl border border-stone-200/50 dark:border-white/5 mb-8 w-full max-w-md mx-auto transition-colors">
        {(['overview', 'notes', 'psycho'] as TabMode[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              haptics.soft();
              setActiveTab(tab);
            }}
            className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-sm dark:shadow-black/20' : 'text-stone-400 dark:text-stone-600'}`}
          >
            {tab === 'overview' ? t('analytics.tabOverview') : tab === 'notes' ? t('analytics.tabNotes') : t('analytics.tabDNA')}
          </button>
        ))}
      </div>

      {/* ─── TAB : PROFIL ─── */}
      {activeTab === 'overview' && (
        <div className="space-y-6 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          <div className="bg-charcoal dark:bg-[#1a1a1a] text-white rounded-[2.5rem] p-8 text-center relative overflow-hidden shadow-xl dark:shadow-black/40 transition-all">
            <div className="absolute top-0 right-0 w-64 h-64 bg-forest/20 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10">
              <div className="w-20 h-20 bg-white/10 dark:bg-white/5 backdrop-blur-md rounded-3xl flex items-center justify-center text-4xl mb-6 mx-auto shadow-inner border border-white/10 dark:border-white/5">
                {advancedArchetype.icon}
              </div>
              <div className="inline-block bg-forest text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3">
                {advancedArchetype.tag}
              </div>
              <h2 className="text-3xl font-black mb-3 tracking-tighter">
                {advancedArchetype.title}
              </h2>
              <p className="text-stone-400 dark:text-stone-500 text-sm font-medium leading-relaxed mb-6">
                "{advancedArchetype.description}"
              </p>
              {advancedArchetype.secondaryTrait && (
                <div className="bg-white/5 border border-white/10 rounded-xl p-3 inline-block">
                  <p className="text-[10px] font-bold text-stone-300 dark:text-stone-400 uppercase tracking-wide">
                    {t('analytics.sign')} {advancedArchetype.secondaryTrait}
                  </p>
                </div>
              )}
              <div className="mt-6">
                <button
                  onClick={() => {
                    haptics.soft();
                    handleShareArchetype();
                  }}
                  disabled={isSharing}
                  className="flex items-center gap-2 mx-auto px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 border border-white/20 text-white text-[10px] font-black uppercase tracking-widest transition-all active:scale-95 disabled:opacity-50"
                >
                  <Share2 size={12} />
                  {isSharing ? t('analytics.sharing') : t('analytics.shareArchetype')}
                </button>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white dark:bg-[#202020] p-5 rounded-[2rem] border border-stone-100 dark:border-white/10 shadow-sm dark:shadow-black/20 flex flex-col justify-between aspect-square transition-all">
              <div className="w-10 h-10 bg-stone-50 dark:bg-[#161616] rounded-2xl flex items-center justify-center text-stone-400 dark:text-stone-500">
                <Clock size={20} />
              </div>
              <div>
                <p className="text-2xl font-black text-charcoal dark:text-white">{totalHours}h</p>
                <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-wider">
                  {t('analytics.screenTime')}
                </p>
              </div>
            </div>
            <div className="bg-white dark:bg-[#202020] p-5 rounded-[2rem] border border-stone-100 dark:border-white/10 shadow-sm dark:shadow-black/20 flex flex-col justify-between aspect-square transition-all">
              <div className="w-10 h-10 bg-stone-50 dark:bg-[#161616] rounded-2xl flex items-center justify-center text-stone-400 dark:text-stone-500">
                <Film size={20} />
              </div>
              <div>
                <p className="text-2xl font-black text-charcoal dark:text-white">{watchedCount}</p>
                <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-wider">
                  {t('analytics.analysed')}
                </p>
              </div>
            </div>
          </div>

          {/* Graphique 12 derniers mois */}
          {last12Months.some((m) => m.count > 0) &&
            (() => {
              const maxCount = Math.max(...last12Months.map((m) => m.count), 1);
              return (
                <div className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all">
                  <div className="flex items-center gap-3 mb-6">
                    <div className="p-2 bg-stone-50 dark:bg-[#161616] rounded-xl text-stone-400 dark:text-stone-500">
                      <BarChart2 size={18} />
                    </div>
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500">
                      {t('analytics.activity12m')}
                    </h3>
                  </div>
                  <div className="flex items-end gap-1.5 h-20">
                    {last12Months.map((m, i) => (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div
                          className="w-full rounded-t-md transition-all duration-700"
                          style={{
                            height: `${(m.count / maxCount) * 64}px`,
                            minHeight: m.count > 0 ? '4px' : '0',
                            backgroundColor: m.count > 0 ? '#3E5238' : 'transparent',
                            opacity: m.count > 0 ? 0.4 + (m.count / maxCount) * 0.6 : 1,
                          }}
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-1.5 mt-2">
                    {last12Months.map((m, i) => (
                      <div
                        key={i}
                        className="flex-1 text-center text-[7px] font-bold text-stone-300 dark:text-stone-600 uppercase"
                      >
                        {m.label.slice(0, 1)}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
        </div>
      )}

      {/* ─── TAB : GOÛTS ─── */}
      {activeTab === 'notes' && (
        <div className="space-y-6 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          {/* SÉVÉRITÉ — reformatée */}
          <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-stone-100 dark:bg-[#161616] rounded-xl text-charcoal dark:text-white">
                <Scale size={18} />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-stone-400">
                {t('analytics.severity')}
              </h3>
            </div>
            <div className="flex items-end justify-between mb-4">
              <div>
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-1">
                  {t('analytics.yourAvg')}
                </p>
                <p className="text-4xl font-black text-charcoal dark:text-white tracking-tighter">
                  {userGlobalAvg}
                </p>
              </div>
              <div className="text-center px-4">
                <div
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-sm font-black ${comparisonColor} border-current/20`}
                >
                  <ComparisonIcon size={14} />
                  {t(comparisonLabel)}
                </div>
                <p className="text-[9px] font-bold text-stone-400 mt-1">
                  {delta > 0 ? '+' : ''}
                  {delta} pts
                </p>
              </div>
              <div className="text-right">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-1">
                  {t('analytics.world')}
                </p>
                {tmdbAvg > 0 ? (
                  <p className="text-4xl font-black text-stone-300 dark:text-stone-600 tracking-tighter">
                    {tmdbAvg}
                  </p>
                ) : (
                  <p className="text-sm font-bold text-stone-300 dark:text-stone-600">N/A</p>
                )}
              </div>
            </div>
            <div className="relative h-1.5 bg-stone-100 dark:bg-[#161616] rounded-full overflow-hidden">
              <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-stone-300 dark:bg-stone-700 z-10" />
              <div
                className={`absolute top-0 bottom-0 transition-all duration-1000 ${delta > 0 ? 'bg-forest' : 'bg-orange-400'}`}
                style={{
                  left: delta > 0 ? '50%' : `${50 - Math.min(Math.abs(delta) * 15, 50)}%`,
                  width: `${Math.min(Math.abs(delta) * 15, 50)}%`,
                }}
              />
            </div>
          </div>

          {/* DISTRIBUTION DES NOTES */}
          <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all">
            <div className="flex items-center gap-3 mb-5">
              <div className="p-2 bg-stone-100 dark:bg-[#161616] rounded-xl text-charcoal dark:text-white">
                <BarChart2 size={18} />
              </div>
              <h3 className="text-sm font-black uppercase tracking-widest text-stone-400">
                {t('analytics.distribution')}
              </h3>
            </div>
            <div className="flex items-end gap-1 h-14 mb-2">
              {Array.from({ length: 10 }, (_, i) => i + 1).map((rating) => {
                const count = ratingDist[rating] || 0;
                const barH = Math.round((count / maxRatingCount) * 48);
                const barColor =
                  rating >= 8
                    ? 'bg-forest dark:bg-lime-500'
                    : rating <= 3
                      ? 'bg-orange-400'
                      : 'bg-stone-300 dark:bg-stone-600';
                return (
                  <div
                    key={rating}
                    className="flex-1 flex flex-col items-center justify-end gap-0.5"
                  >
                    <div
                      className={`w-full rounded-t-sm transition-all duration-700 ${barColor}`}
                      style={{ height: `${barH}px` }}
                    />
                    <span className="text-[7px] font-bold text-stone-400 dark:text-stone-600">
                      {rating}
                    </span>
                  </div>
                );
              })}
            </div>
            <div className="flex justify-between mt-3 pt-3 border-t border-stone-100 dark:border-white/5">
              {[
                {
                  labelKey: 'analytics.severe',
                  range: '≤ 3',
                  count: [1, 2, 3].reduce((s, k) => s + (ratingDist[k] || 0), 0),
                  color: 'text-orange-400',
                },
                {
                  labelKey: 'analytics.middle',
                  range: '4–7',
                  count: [4, 5, 6, 7].reduce((s, k) => s + (ratingDist[k] || 0), 0),
                  color: 'text-stone-400',
                },
                {
                  labelKey: 'analytics.generous',
                  range: '≥ 8',
                  count: [8, 9, 10].reduce((s, k) => s + (ratingDist[k] || 0), 0),
                  color: 'text-forest dark:text-lime-500',
                },
              ].map(({ labelKey, range, count, color }) => (
                <div key={labelKey} className="text-center">
                  <p className={`text-lg font-black ${color}`}>{count}</p>
                  <p className="text-[8px] font-black uppercase tracking-widest text-stone-400">
                    {t(labelKey)}
                  </p>
                  <p className="text-[7px] font-bold text-stone-300 dark:text-stone-600">{range}</p>
                </div>
              ))}
            </div>
          </div>

          {/* TENDANCE HEBDOMADAIRE */}
          {hasWeeklyData &&
            (() => {
              const Y_LABELS = [0, 2, 4, 6, 8, 10];
              const SVG_W = 280,
                SVG_H = 80;
              const PAD_L = 18,
                PAD_R = 8,
                PAD_T = 8,
                PAD_B = 20;
              const plotW = SVG_W - PAD_L - PAD_R;
              const plotH = SVG_H - PAD_T - PAD_B;
              const xOf = (i: number) => PAD_L + (i / 25) * plotW;
              const yOf = (v: number) => PAD_T + plotH - (v / 10) * plotH;

              // Single polyline through all weeks with data (connected even across gaps)
              const activePoints = weeklyTrend
                .filter((w) => w.avg !== null)
                .map((w) => `${xOf(w.weekIndex).toFixed(1)},${yOf(w.avg ?? 0).toFixed(1)}`);

              // Month labels at first-of-month transitions
              const monthLabels = weeklyTrend.filter((w) => w.isFirstOfMonth);

              return (
                <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all">
                  <div className="flex items-center justify-between mb-5">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-stone-100 dark:bg-[#161616] rounded-xl text-charcoal dark:text-white">
                        <TrendingUp size={18} />
                      </div>
                      <h3 className="text-sm font-black uppercase tracking-widest text-stone-400">
                        {t('analytics.trend26w')}
                      </h3>
                    </div>
                    {weeklyTrendDelta !== null && (
                      <div
                        className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-black ${weeklyTrendDelta > 0 ? 'bg-forest/10 dark:bg-lime-500/10 text-forest dark:text-lime-400' : weeklyTrendDelta < 0 ? 'bg-orange-400/10 text-orange-400' : 'bg-stone-100 dark:bg-stone-800 text-stone-400'}`}
                      >
                        {weeklyTrendDelta > 0 ? (
                          <TrendingUp size={10} />
                        ) : weeklyTrendDelta < 0 ? (
                          <TrendingDown size={10} />
                        ) : (
                          <Minus size={10} />
                        )}
                        {weeklyTrendDelta > 0 ? '+' : ''}
                        {weeklyTrendDelta}
                      </div>
                    )}
                  </div>
                  <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className="w-full overflow-visible">
                    {/* Y-axis labels + grid lines */}
                    {Y_LABELS.map((v) => (
                      <g key={v}>
                        <line
                          x1={PAD_L}
                          y1={yOf(v).toFixed(1)}
                          x2={SVG_W - PAD_R}
                          y2={yOf(v).toFixed(1)}
                          stroke="currentColor"
                          strokeWidth={0.5}
                          strokeDasharray="2 3"
                          className="text-stone-200 dark:text-stone-700"
                        />
                        <text
                          x={PAD_L - 3}
                          y={yOf(v).toFixed(1)}
                          textAnchor="end"
                          dominantBaseline="middle"
                          fontSize={5.5}
                          fontWeight="800"
                          fill="currentColor"
                          className="text-stone-300 dark:text-stone-600"
                        >
                          {v}
                        </text>
                      </g>
                    ))}
                    {/* Single polyline connecting all data points */}
                    {activePoints.length > 1 && (
                      <polyline
                        points={activePoints.join(' ')}
                        fill="none"
                        stroke="currentColor"
                        strokeWidth={1.5}
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="text-forest dark:text-lime-500"
                      />
                    )}
                    {/* Dots on active weeks */}
                    {weeklyTrend
                      .filter((w) => w.avg !== null)
                      .map((w) => (
                        <circle
                          key={w.weekIndex}
                          cx={xOf(w.weekIndex).toFixed(1)}
                          cy={yOf(w.avg ?? 0).toFixed(1)}
                          r={2.5}
                          fill="currentColor"
                          className="text-forest dark:text-lime-500"
                        />
                      ))}
                    {/* Month labels */}
                    {monthLabels.map((w) => (
                      <text
                        key={w.weekIndex}
                        x={xOf(w.weekIndex).toFixed(1)}
                        y={SVG_H - 4}
                        textAnchor="middle"
                        fontSize={6}
                        fontWeight="800"
                        fill="currentColor"
                        className="text-stone-400 dark:text-stone-600 uppercase"
                      >
                        {w.monthLabel.slice(0, 3)}
                      </text>
                    ))}
                  </svg>
                </div>
              );
            })()}

          {/* LE PALMARÈS */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 ml-1">
              {t('analytics.palmares')}
            </h3>

            <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-5 rounded-[2rem] shadow-sm dark:shadow-black/20 flex gap-4 items-center transition-all">
              <div className="w-16 aspect-[2/3] bg-forest rounded-xl overflow-hidden shadow-md shrink-0 border border-white/5">
                {bestRated?.posterUrl ? (
                  <img src={bestRated.posterUrl} className="w-full h-full object-cover" alt="" />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-white/20">
                    <Film size={20} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 text-forest dark:text-lime-500">
                  <ThumbsUp size={12} fill="currentColor" />
                  <span className="text-[9px] font-black uppercase tracking-widest">
                    {t('analytics.favorite')}
                  </span>
                </div>
                <h4 className="font-black text-charcoal dark:text-white truncate leading-tight">
                  {bestRated?.title}
                </h4>
                <p className="text-[10px] font-bold text-stone-400 uppercase mt-0.5">
                  {bestRated?.director} · {bestRated?.year}
                </p>
              </div>
              <div className="bg-forest dark:bg-lime-500 text-white dark:text-black w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow-lg">
                {(
                  (bestRated.ratings.story +
                    bestRated.ratings.visuals +
                    bestRated.ratings.acting +
                    bestRated.ratings.sound) /
                  4
                ).toFixed(1)}
              </div>
            </div>

            <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-5 rounded-[2rem] shadow-sm dark:shadow-black/20 flex gap-4 items-center transition-all">
              <div className="w-16 aspect-[2/3] bg-stone-100 dark:bg-[#161616] rounded-xl overflow-hidden shadow-md shrink-0 border border-white/5">
                {worstRated?.posterUrl ? (
                  <img
                    src={worstRated.posterUrl}
                    className="w-full h-full object-cover opacity-50 grayscale"
                    alt=""
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-stone-300 dark:text-stone-700">
                    <Film size={20} />
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1 text-orange-400">
                  <ThumbsDown size={12} fill="currentColor" />
                  <span className="text-[9px] font-black uppercase tracking-widest">
                    {t('analytics.worst')}
                  </span>
                </div>
                <h4 className="font-black text-stone-500 dark:text-stone-400 truncate leading-tight">
                  {worstRated?.title}
                </h4>
                <p className="text-[10px] font-bold text-stone-300 dark:text-stone-500 uppercase mt-0.5">
                  {worstRated?.director} · {worstRated?.year}
                </p>
              </div>
              <div className="bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 w-10 h-10 rounded-full flex items-center justify-center font-black text-sm border border-stone-200 dark:border-white/5">
                {(
                  (worstRated.ratings.story +
                    worstRated.ratings.visuals +
                    worstRated.ratings.acting +
                    worstRated.ratings.sound) /
                  4
                ).toFixed(1)}
              </div>
            </div>
          </div>

          {/* SURPRISE & DÉCEPTION */}
          {(biggestSurprise || biggestDisappointment) && (
            <div className="space-y-3">
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 ml-1">
                {t('analytics.contrarian')}
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {biggestSurprise && (
                  <div className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 p-4 rounded-[2rem] shadow-sm dark:shadow-black/20 flex flex-col gap-3 transition-all">
                    <div className="flex items-center gap-2 text-forest dark:text-lime-500">
                      <TrendingUp size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        {t('analytics.yourSurprise')}
                      </span>
                    </div>
                    <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-stone-100 dark:bg-[#161616]">
                      {biggestSurprise.posterUrl ? (
                        <img
                          src={biggestSurprise.posterUrl}
                          className="w-full h-full object-cover"
                          alt=""
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-300">
                          <Film size={16} />
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="font-black text-charcoal dark:text-white text-sm leading-tight line-clamp-2">
                        {biggestSurprise.title}
                      </h4>
                      <p className="text-[9px] font-bold text-stone-400 mt-1">
                        {biggestSurprise.year}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-1 bg-forest/10 dark:bg-lime-500/10 text-forest dark:text-lime-400 px-2 py-0.5 rounded-full">
                        <span className="text-[9px] font-black">
                          +{biggestSurprise.userVsTmdb > 0 ? biggestSurprise.userVsTmdb : '—'} vs
                          TMDB
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                {biggestDisappointment && biggestDisappointment.id !== biggestSurprise?.id && (
                  <div className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 p-4 rounded-[2rem] shadow-sm dark:shadow-black/20 flex flex-col gap-3 transition-all">
                    <div className="flex items-center gap-2 text-orange-400">
                      <TrendingDown size={14} />
                      <span className="text-[9px] font-black uppercase tracking-widest">
                        {t('analytics.yourDisappointment')}
                      </span>
                    </div>
                    <div className="w-full aspect-[2/3] rounded-xl overflow-hidden bg-stone-100 dark:bg-[#161616]">
                      {biggestDisappointment.posterUrl ? (
                        <img
                          src={biggestDisappointment.posterUrl}
                          className="w-full h-full object-cover opacity-60 grayscale"
                          alt=""
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-stone-300">
                          <Film size={16} />
                        </div>
                      )}
                    </div>
                    <div>
                      <h4 className="font-black text-charcoal dark:text-white text-sm leading-tight line-clamp-2">
                        {biggestDisappointment.title}
                      </h4>
                      <p className="text-[9px] font-bold text-stone-400 mt-1">
                        {biggestDisappointment.year}
                      </p>
                      <div className="mt-2 inline-flex items-center gap-1 bg-orange-400/10 text-orange-400 px-2 py-0.5 rounded-full">
                        <span className="text-[9px] font-black">
                          {biggestDisappointment.userVsTmdb} vs TMDB
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* RÉALISATEUR PRÉFÉRÉ */}
          {favoriteDirector && (
            <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-5 rounded-[2rem] shadow-sm dark:shadow-black/20 transition-all">
              <div className="flex items-center gap-3 mb-4">
                <div className="p-2 bg-stone-100 dark:bg-[#161616] rounded-xl text-stone-400 dark:text-stone-500">
                  <User size={16} />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-400">
                  {t('analytics.director')}
                </h3>
              </div>
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-2xl bg-stone-100 dark:bg-[#161616] flex items-center justify-center overflow-hidden shrink-0">
                  {favoriteDirector.posterUrl ? (
                    <img
                      src={favoriteDirector.posterUrl}
                      className="w-full h-full object-cover opacity-60 grayscale"
                      alt=""
                    />
                  ) : (
                    <User size={24} className="text-stone-300 dark:text-stone-600" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4
                    className={`font-black text-charcoal dark:text-white text-lg leading-tight truncate transition-colors duration-200 ${onViewDirector ? 'hover:text-forest dark:hover:text-lime-500 cursor-pointer underline decoration-current/20 underline-offset-4' : ''}`}
                    onClick={() => {
                      if (onViewDirector) {
                        haptics.soft();
                        onViewDirector(favoriteDirector.name);
                      }
                    }}
                  >
                    {favoriteDirector.name}
                  </h4>
                  <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mt-0.5">
                    {t('analytics.directorFilms', { count: String(favoriteDirector.count), s: favoriteDirector.count > 1 ? 's' : '' })}
                  </p>
                </div>
                <div className="bg-charcoal dark:bg-[#161616] text-white w-12 h-12 rounded-2xl flex items-center justify-center font-black text-sm shadow-lg shrink-0">
                  {favoriteDirector.avg}
                </div>
              </div>
            </div>
          )}

          {/* CRITÈRES avec dominant & point aveugle */}
          <div className="space-y-3">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 ml-1">
              {t('analytics.yourEye')}
            </h3>

            <div className="grid grid-cols-2 gap-2 mb-3">
              <div className="bg-red-50 dark:bg-red-500/10 border border-red-100 dark:border-red-500/20 rounded-2xl p-3">
                <p className="text-[8px] font-black uppercase tracking-widest text-red-400 mb-1">
                  {t('analytics.moreExacting')}
                </p>
                <p className="text-sm font-black text-charcoal dark:text-white">
                  {t(dominantCriterion.label)}
                </p>
                <p className="text-[10px] font-bold text-red-400">{dominantCriterion.val} / 10</p>
              </div>
              <div className="bg-forest/5 dark:bg-lime-500/10 border border-forest/10 dark:border-lime-500/20 rounded-2xl p-3">
                <p className="text-[8px] font-black uppercase tracking-widest text-forest dark:text-lime-400 mb-1">
                  {t('analytics.moreGenerous')}
                </p>
                <p className="text-sm font-black text-charcoal dark:text-white">
                  {t(blindSpotCriterion.label)}
                </p>
                <p className="text-[10px] font-bold text-forest dark:text-lime-400">
                  {blindSpotCriterion.val} / 10
                </p>
              </div>
            </div>

            <div className="bg-stone-50 dark:bg-[#161616] rounded-[2rem] p-5 border border-stone-100 dark:border-white/5 space-y-4">
              {criteriaScores.map((c) => {
                const isDominant = c.id === dominantCriterion.id;
                const isBlind = c.id === blindSpotCriterion.id;
                return (
                  <div key={c.id} className="flex items-center gap-3">
                    <span className="text-[9px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest w-20 shrink-0">
                      {t(c.label)}
                    </span>
                    <div className="flex-1 h-1.5 bg-stone-200 dark:bg-[#202020] rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${isDominant ? 'bg-red-400' : isBlind ? 'bg-forest dark:bg-lime-500' : 'bg-charcoal dark:bg-white'}`}
                        style={{ width: `${c.val * 10}%` }}
                      />
                    </div>
                    <span
                      className={`text-xs font-black w-6 text-right ${isDominant ? 'text-red-400' : isBlind ? 'text-forest dark:text-lime-400' : 'text-charcoal dark:text-white'}`}
                    >
                      {c.val}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* TOP GENRES avec count */}
          <div className="bg-stone-50 dark:bg-[#161616] rounded-[2.5rem] p-6 border border-stone-100 dark:border-white/5 transition-all">
            <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-4 flex items-center gap-2">
              <Star size={12} /> {t('analytics.topGenres')}
            </h3>
            <div className="space-y-3.5">
              {genreRatingsSorted.slice(0, 6).map((g, i) => (
                <div key={g.name} className="flex items-center gap-3">
                  <span className="text-[9px] font-black text-stone-300 dark:text-stone-600 w-4 shrink-0">
                    {i + 1}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline gap-1.5 mb-1">
                      <span className="text-xs font-bold text-charcoal dark:text-white truncate">
                        {g.name}
                      </span>
                      <span className="text-[9px] font-bold text-stone-300 dark:text-stone-600 shrink-0">
                        {g.count} film{g.count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <div className="h-1.5 bg-stone-200 dark:bg-[#202020] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-forest dark:bg-lime-500 rounded-full transition-all duration-700"
                        style={{ width: `${g.avg * 10}%` }}
                      />
                    </div>
                  </div>
                  <span className="text-[10px] font-black text-charcoal dark:text-white w-7 text-right shrink-0">
                    {g.avg}
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* PAR DÉCENNIE */}
          {decadeData.length > 1 && (
            <div className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 rounded-[2.5rem] p-6 shadow-sm dark:shadow-black/20 transition-all">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-5">
                {t('analytics.byDecade')}
              </h3>
              <div className="space-y-3">
                {decadeData.map((d) => (
                  <div key={d.decade} className="flex items-center gap-3">
                    <span className="text-[9px] font-black text-stone-400 dark:text-stone-500 w-12 shrink-0">
                      {d.decade}
                    </span>
                    <div className="flex-1 relative h-6 flex items-center">
                      <div className="absolute inset-y-0 left-0 right-0 bg-stone-50 dark:bg-[#161616] rounded-full" />
                      <div
                        className="absolute inset-y-0 left-0 bg-charcoal/10 dark:bg-white/10 rounded-full transition-all duration-700"
                        style={{ width: `${(d.count / maxDecadeCount) * 100}%` }}
                      />
                      <span className="relative z-10 text-[9px] font-black text-stone-400 pl-3">
                        {d.count} film{d.count > 1 ? 's' : ''}
                      </span>
                    </div>
                    <span className="text-[10px] font-black text-charcoal dark:text-white w-7 text-right shrink-0">
                      {d.avg}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* HYPE VS RÉALITÉ */}
          {hypeReality && (
            <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all">
              <div className="flex items-center gap-3 mb-5">
                <div className="p-2 bg-stone-100 dark:bg-[#161616] rounded-xl text-charcoal dark:text-white">
                  <Target size={18} />
                </div>
                <h3 className="text-sm font-black uppercase tracking-widest text-stone-400">
                  {t('analytics.hypeVsReality')}
                </h3>
              </div>
              <div className="mb-5">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 mb-1">
                  {hypeReality.profileLabel}
                </p>
                <p
                  className={`text-4xl font-black tracking-tighter ${hypeReality.globalDelta >= 0 ? 'text-forest dark:text-lime-500' : 'text-orange-400'}`}
                >
                  {hypeReality.globalDelta > 0 ? '+' : ''}
                  {hypeReality.globalDelta}
                </p>
              </div>

              {hypeReality.topSurprises.length > 0 && (
                <div className="space-y-2 mt-2">
                  <p className="text-[9px] font-black uppercase tracking-widest text-forest dark:text-lime-500 mb-1">
                    ✦ {t('analytics.goodSurprises')}
                  </p>
                  {hypeReality.topSurprises.map(({ movie: m, delta }) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 bg-stone-50 dark:bg-[#161616] rounded-2xl px-4 py-3 border border-stone-100 dark:border-white/5"
                    >
                      <p className="text-xs font-black text-charcoal dark:text-white truncate flex-1 min-w-0">
                        {m.title}
                      </p>
                      <span className="text-sm font-black text-forest dark:text-lime-500 shrink-0">
                        +{delta}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {hypeReality.topDisappointments.length > 0 && (
                <div className="space-y-2 mt-4">
                  <p className="text-[9px] font-black uppercase tracking-widest text-orange-400 mb-1">
                    ✦ {t('analytics.disappointments')}
                  </p>
                  {hypeReality.topDisappointments.map(({ movie: m, delta }) => (
                    <div
                      key={m.id}
                      className="flex items-center justify-between gap-3 bg-stone-50 dark:bg-[#161616] rounded-2xl px-4 py-3 border border-stone-100 dark:border-white/5"
                    >
                      <p className="text-xs font-black text-charcoal dark:text-white truncate flex-1 min-w-0">
                        {m.title}
                      </p>
                      <span className="text-sm font-black text-orange-400 shrink-0">{delta}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* MOIS LE PLUS ACTIF */}
          {mostActiveMonth && (
            <div className="bg-charcoal dark:bg-[#1a1a1a] text-white rounded-[2rem] p-5 flex items-center justify-between shadow-xl dark:shadow-black/40 transition-all">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-white/10 rounded-2xl flex items-center justify-center">
                  <CalendarDays size={18} />
                </div>
                <div>
                  <p className="text-[9px] font-black uppercase tracking-widest text-stone-400">
                    {t('analytics.mostActiveMonth')}
                  </p>
                  <p className="font-black text-white capitalize">{mostActiveMonth.label}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="text-2xl font-black text-bitter-lime">{mostActiveMonth.count}</p>
                <p className="text-[9px] font-black uppercase tracking-wider text-stone-400">
                  films
                </p>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── TAB : ADN ─── */}
      {activeTab === 'psycho' && (
        <div className="space-y-6 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
          {/* RADAR CHART */}
          <div className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all">
            <RadarChart
              data={[
                { label: t('vibe.story'), value: averages.cerebral },
                { label: t('vibe.tension'), value: averages.tension },
                { label: t('vibe.fun'), value: averages.fun },
                { label: t('vibe.visual'), value: averages.visual },
                { label: t('vibe.emotion'), value: averages.emotion },
              ]}
            />
            <div className="mt-5 space-y-2">
              {[
                { key: 'story', val: averages.cerebral, icon: Brain },
                { key: 'tension', val: averages.tension, icon: Zap },
                { key: 'fun', val: averages.fun, icon: Smile },
                { key: 'visual', val: averages.visual, icon: Aperture },
                { key: 'emotion', val: averages.emotion, icon: Heart },
              ].map((item) => (
                <div key={item.key} className="flex items-center gap-3">
                  <div className="p-1.5 bg-stone-50 dark:bg-[#161616] rounded-lg text-stone-400 dark:text-stone-500 shrink-0">
                    <item.icon size={13} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 w-20 shrink-0">
                    {t(`vibe.${item.key}`)}
                  </span>
                  <p className="text-[10px] font-medium text-stone-500 dark:text-stone-400 flex-1 leading-tight">
                    {getVibePhrase(item.key, item.val, t)}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="bg-charcoal dark:bg-[#1a1a1a] text-white p-6 rounded-[2.5rem] relative overflow-hidden shadow-xl dark:shadow-black/40 transition-all">
            <div className="absolute top-0 right-0 w-32 h-32 bg-forest/20 blur-[50px] rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="relative z-10 flex justify-between items-center mb-4">
              <h3 className="text-sm font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 flex items-center gap-2">
                <Smartphone size={16} /> {t('analytics.immersion')}
              </h3>
              <span className="text-2xl font-black text-white">{100 - averages.smartphone}%</span>
            </div>
            <div className="w-full bg-white/10 dark:bg-white/5 h-2 rounded-full overflow-hidden mb-4 transition-colors">
              <div
                className="h-full bg-forest dark:bg-lime-500"
                style={{ width: `${100 - averages.smartphone}%` }}
              />
            </div>
            <p className="text-xs font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
              {t('analytics.phoneTime', { pct: String(averages.smartphone) })}
            </p>
          </div>
        </div>
      )}

      <div className="mt-8 text-center">
        <button
          onClick={onRecalibrate}
          className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 hover:text-charcoal dark:hover:text-white transition-colors border-b border-stone-200 dark:border-stone-800 pb-0.5"
        >
          {t('analytics.recalibrate')}
        </button>
      </div>

      {/* Share card — in viewport but invisible so browser paints it */}
      <div
        ref={shareCardRef}
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -1,
          width: '320px',
          background: '#1A1A1A',
          borderRadius: '24px',
          padding: '32px',
          fontFamily: 'Inter, sans-serif',
          color: '#fff',
        }}
      >
        <div
          style={{
            fontSize: '10px',
            fontWeight: 900,
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: '#6b7280',
            marginBottom: '12px',
          }}
        >
          The Bitter
        </div>
        <div style={{ fontSize: '48px', marginBottom: '12px' }}>{advancedArchetype.icon}</div>
        <div
          style={{
            display: 'inline-block',
            background: '#3E5238',
            color: '#fff',
            padding: '3px 10px',
            borderRadius: '999px',
            fontSize: '9px',
            fontWeight: 900,
            letterSpacing: '0.15em',
            textTransform: 'uppercase',
            marginBottom: '10px',
          }}
        >
          {advancedArchetype.tag}
        </div>
        <div
          style={{
            fontSize: '26px',
            fontWeight: 900,
            letterSpacing: '-0.02em',
            marginBottom: '6px',
          }}
        >
          {advancedArchetype.title}
        </div>
        <div style={{ fontSize: '11px', color: '#9ca3af', marginBottom: '24px', lineHeight: 1.5 }}>
          {advancedArchetype.description}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
          {[
            { label: t('analytics.shareFilms'), value: watchedCount },
            { label: t('analytics.shareHours'), value: `${totalHours}h` },
            { label: t('analytics.shareAvg'), value: stats.ratingAverages.global },
          ].map((s) => (
            <div
              key={s.label}
              style={{
                background: '#252525',
                borderRadius: '12px',
                padding: '10px 8px',
                textAlign: 'center',
              }}
            >
              <div style={{ fontSize: '18px', fontWeight: 900 }}>{s.value}</div>
              <div
                style={{
                  fontSize: '8px',
                  fontWeight: 700,
                  color: '#9ca3af',
                  textTransform: 'uppercase',
                  letterSpacing: '0.1em',
                }}
              >
                {s.label}
              </div>
            </div>
          ))}
        </div>
        {stats.genreRatingsSorted[0] && (
          <div
            style={{
              marginTop: '16px',
              fontSize: '9px',
              color: '#6b7280',
              fontWeight: 700,
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
            }}
          >
            {t('analytics.favGenre', { name: stats.genreRatingsSorted[0].name })}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnalyticsView;
