
import React, { useState, useMemo } from 'react';
import { Movie, UserProfile } from '../types';
import { 
  ScanFace, 
  Smartphone, 
  Brain, 
  Zap, 
  Heart, 
  Aperture, 
  Smile, 
  PiggyBank, 
  Film, 
  ChevronRight,
  Settings2,
  History,
  Clapperboard,
  User,
  Tags,
  Calculator,
  X,
  Star,
  Award,
  AlertOctagon,
  BarChart3,
  PenTool,
  Trophy,
  Target,
  Link2,
  ArrowLeftRight,
  Split,
  GitCommit,
  Scale,
  TrendingUp,
  Percent,
  ArrowUp,
  ArrowDown,
  Minus
} from 'lucide-react';
import { haptics } from '../utils/haptics';

interface AnalyticsViewProps {
  movies: Movie[];
  userProfile: UserProfile | null;
  onNavigateToCalendar?: () => void;
  onRecalibrate?: () => void;
}

type TabMode = 'overview' | 'notes' | 'psycho';
type FilterType = 'actor' | 'director' | 'genre';

// Helper statistique : Corrélation de Pearson
const calculatePearson = (x: number[], y: number[]) => {
  const n = x.length;
  if (n === 0) return 0;
  
  const sumX = x.reduce((a, b) => a + b, 0);
  const sumY = y.reduce((a, b) => a + b, 0);
  const sumXY = x.reduce((sum, xi, i) => sum + xi * y[i], 0);
  const sumX2 = x.reduce((sum, xi) => sum + xi * xi, 0);
  const sumY2 = y.reduce((sum, yi) => sum + yi * yi, 0);

  const numerator = (n * sumXY) - (sumX * sumY);
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  if (denominator === 0) return 0;
  return numerator / denominator;
};

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ movies, userProfile, onRecalibrate }) => {
  const [activeTab, setActiveTab] = useState<TabMode>('overview');
  const [activeFilter, setActiveFilter] = useState<{ type: FilterType, value: string } | null>(null);

  const stats = useMemo(() => {
    const watched = movies.filter(m => m.status === 'watched');
    const count = watched.length;
    if (count === 0) return null;

    // --- 1. Moyennes et Sommes ---
    const sums = watched.reduce((acc, m) => {
      acc.cerebral += m.vibe?.story || 5;
      acc.emotion += m.vibe?.emotion || 5;
      acc.fun += m.vibe?.fun || 5;
      acc.visuel += m.vibe?.visual || 5;
      acc.tension += m.vibe?.tension || 5;
      acc.smartphone += m.smartphoneFactor || 0;
      
      acc.ratingStory += m.ratings.story;
      acc.ratingVisuals += m.ratings.visuals;
      acc.ratingActing += m.ratings.acting;
      acc.ratingSound += m.ratings.sound;
      
      return acc;
    }, { 
      cerebral: 0, emotion: 0, fun: 0, visuel: 0, tension: 0, smartphone: 0,
      ratingStory: 0, ratingVisuals: 0, ratingActing: 0, ratingSound: 0
    });

    const averages = {
      cerebral: Number((sums.cerebral / count).toFixed(1)),
      emotion: Number((sums.emotion / count).toFixed(1)),
      fun: Number((sums.fun / count).toFixed(1)),
      visuel: Number((sums.visuel / count).toFixed(1)),
      tension: Number((sums.tension / count).toFixed(1)),
      smartphone: Math.round(sums.smartphone / count)
    };
    
    const ratingAverages = {
        story: Number((sums.ratingStory / count).toFixed(1)),
        visuals: Number((sums.ratingVisuals / count).toFixed(1)),
        acting: Number((sums.ratingActing / count).toFixed(1)),
        sound: Number((sums.ratingSound / count).toFixed(1)),
        global: Number(((sums.ratingStory + sums.ratingVisuals + sums.ratingActing + sums.ratingSound) / (4 * count)).toFixed(1))
    };

    // --- 2. Best/Worst/Strongest ---
    const sortedByRating = [...watched].sort((a, b) => {
        const avgA = (a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4;
        const avgB = (b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4;
        return avgB - avgA;
    });
    
    const bestRated = sortedByRating[0];
    const worstRated = sortedByRating[count - 1];
    
    const criteriaScores = [
        { id: 'story', label: 'Scénario', val: ratingAverages.story },
        { id: 'visuals', label: 'Visuel', val: ratingAverages.visuals },
        { id: 'acting', label: 'Jeu d\'acteur', val: ratingAverages.acting },
        { id: 'sound', label: 'Son', val: ratingAverages.sound },
    ];
    
    const strongestPoint = criteriaScores.reduce((prev, current) => (prev.val > current.val) ? prev : current);

    // --- 3. Tops (Actors, Directors, Genres) ---
    const actorCounts: Record<string, number> = {};
    const directorCounts: Record<string, number> = {};
    const genreCounts: Record<string, number> = {};

    watched.forEach(m => {
      if (m.actorIds && m.actorIds.length > 0) {
        m.actorIds.forEach(a => { actorCounts[a.name] = (actorCounts[a.name] || 0) + 1; });
      } else if (m.actors) {
        m.actors.split(',').forEach(a => { 
            const name = a.trim(); 
            if(name) actorCounts[name] = (actorCounts[name] || 0) + 1; 
        });
      }
      if (m.director) directorCounts[m.director] = (directorCounts[m.director] || 0) + 1;
      if (m.genre) genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1;
    });

    const getTop = (counts: Record<string, number>) => 
      Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 3);

    // --- 4. Insight Psycho ---
    const vibeInsight = averages.cerebral > averages.fun + 2 
      ? { label: "L'Intello", desc: "Cinéma = Énigme", tag: "CÉRÉBRAL", icon: <Brain size={24} /> }
      : averages.fun > averages.cerebral + 2 
        ? { label: "Popcorn", desc: "Plaisir immédiat", tag: "FUN", icon: <Smile size={24} /> }
        : { label: "L'Équilibré", desc: "Le meilleur des deux", tag: "VERSATILE", icon: <History size={24} /> };

    const ticketPrice = 8.5;
    const monthlyCost = 11.0; 
    const savings = (count * ticketPrice) - monthlyCost;

    // --- 5. CORRÉLATIONS ---
    const dataStory = watched.map(m => m.ratings.story);
    const dataVisuals = watched.map(m => m.ratings.visuals);
    const dataActing = watched.map(m => m.ratings.acting);
    const dataSound = watched.map(m => m.ratings.sound);

    const correlations = [
      { label: 'Script ↔ Jeu', val: calculatePearson(dataStory, dataActing), type: 'narratif' },
      { label: 'Script ↔ Visuel', val: calculatePearson(dataStory, dataVisuals), type: 'visuel' },
      { label: 'Visuel ↔ Son', val: calculatePearson(dataVisuals, dataSound), type: 'technique' },
      { label: 'Jeu ↔ Son', val: calculatePearson(dataActing, dataSound), type: 'mixte' },
    ];

    const maxCorr = correlations.reduce((prev, curr) => Math.abs(curr.val) > Math.abs(prev.val) ? curr : prev);
    
    let correlationInsight = "";
    if (Math.abs(maxCorr.val) < 0.3) {
      correlationInsight = "Vos critères sont très indépendants. Vous jugez chaque aspect isolément.";
    } else if (maxCorr.type === 'narratif') {
      correlationInsight = "Quand l'histoire est bonne, vous avez tendance à mieux noter les acteurs (et inversement).";
    } else if (maxCorr.type === 'technique') {
      correlationInsight = "Pour vous, l'esthétique et l'ambiance sonore sont indissociables.";
    } else {
      correlationInsight = `Il y a un lien fort entre ${maxCorr.label.replace('↔', 'et')}.`;
    }

    // --- 6. FILMS POLARISANTS ---
    const polarizingMovies = watched.map(m => {
        const scores = [
            { k: 'Story', v: m.ratings.story },
            { k: 'Visuel', v: m.ratings.visuals },
            { k: 'Jeu', v: m.ratings.acting },
            { k: 'Son', v: m.ratings.sound }
        ];
        scores.sort((a, b) => a.v - b.v);
        const min = scores[0];
        const max = scores[3];
        const gap = max.v - min.v;
        return { ...m, gap, minCriteria: min, maxCriteria: max };
    })
    .filter(m => m.gap >= 3)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 2);

    // --- 7. TABLEAU DE BORD COMPARATIF (NOUVEAU) ---
    // A. Comparaison TMDB
    const moviesWithTmdb = watched.filter(m => m.tmdbRating && m.tmdbRating > 0);
    const tmdbSum = moviesWithTmdb.reduce((acc, m) => acc + (m.tmdbRating || 0), 0);
    const tmdbAvg = moviesWithTmdb.length > 0 ? Number((tmdbSum / moviesWithTmdb.length).toFixed(1)) : 0;
    
    // Note: On compare la moyenne de l'utilisateur *sur ces mêmes films* pour être précis, ou sa moyenne globale si dataset petit
    const userGlobalAvg = ratingAverages.global;
    const delta = Number((userGlobalAvg - tmdbAvg).toFixed(1));
    
    let comparisonLabel = "Aligné";
    let comparisonColor = "text-stone-400";
    let ComparisonIcon = Minus;
    
    if (delta >= 0.8) { comparisonLabel = "Généreux"; comparisonColor = "text-forest"; ComparisonIcon = ArrowUp; }
    else if (delta >= 0.3) { comparisonLabel = "Bienveillant"; comparisonColor = "text-lime-500"; ComparisonIcon = ArrowUp; }
    else if (delta <= -0.8) { comparisonLabel = "Intransigeant"; comparisonColor = "text-red-500"; ComparisonIcon = ArrowDown; }
    else if (delta <= -0.3) { comparisonLabel = "Exigeant"; comparisonColor = "text-orange-400"; ComparisonIcon = ArrowDown; }

    // B. Écart-Type (Cohérence)
    // Calcul de la variance
    const variance = watched.reduce((acc, m) => {
        const mAvg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
        return acc + Math.pow(mAvg - userGlobalAvg, 2);
    }, 0) / count;
    const stdDev = Number(Math.sqrt(variance).toFixed(1));
    
    // Standard "Typique" arbitraire ~1.5
    const typicalStdDev = 1.8;
    const consistencyLabel = stdDev < typicalStdDev ? "Cohérent" : "Imprévisible";

    // C. % de films > 8 (Générosité)
    const highRatedCount = watched.filter(m => {
        const mAvg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
        return mAvg >= 8;
    }).length;
    const highRatedPercent = Math.round((highRatedCount / count) * 100);
    const typicalHighPercent = 35; // Standard

    // --- 8. NOTES PAR GENRE (NOUVEAU) ---
    const genreRatings: Record<string, { sum: number, count: number, avg: number }> = {};

    watched.forEach(m => {
        if (!m.genre) return;
        if (!genreRatings[m.genre]) {
            genreRatings[m.genre] = { sum: 0, count: 0, avg: 0 };
        }
        const mAvg = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
        genreRatings[m.genre].sum += mAvg;
        genreRatings[m.genre].count += 1;
    });

    Object.keys(genreRatings).forEach(genre => {
        genreRatings[genre].avg = Number((genreRatings[genre].sum / genreRatings[genre].count).toFixed(1));
    });

    const genreRatingsSorted = Object.entries(genreRatings)
        .map(([name, data]) => ({ name, ...data }))
        .filter(g => g.count >= 1) // On peut filtrer pour ne garder que ceux avec au moins X films
        .sort((a, b) => b.avg - a.avg);

    const topGenres = genreRatingsSorted.slice(0, 5);

    return { 
      averages, 
      ratingAverages,
      bestRated,
      worstRated,
      strongestPoint,
      count, 
      savings, 
      vibeInsight,
      tops: {
        actors: getTop(actorCounts),
        directors: getTop(directorCounts),
        genres: getTop(genreCounts)
      },
      correlations,
      maxCorr,
      correlationInsight,
      polarizingMovies,
      comparative: {
          tmdbAvg,
          userAvg: userGlobalAvg,
          delta,
          label: comparisonLabel,
          color: comparisonColor,
          Icon: ComparisonIcon,
          stdDev,
          typicalStdDev,
          consistencyLabel,
          highRatedPercent,
          typicalHighPercent
      },
      topGenres
    };
  }, [movies]);

  const drillDownData = useMemo(() => {
    if (!activeFilter) return [];
    return movies
      .filter(m => m.status === 'watched')
      .filter(m => {
        const val = activeFilter.value;
        if (activeFilter.type === 'director') return m.director === val;
        if (activeFilter.type === 'genre') return m.genre === val;
        if (activeFilter.type === 'actor') {
           if (m.actorIds) return m.actorIds.some(a => a.name === val);
           return m.actors.split(',').map(s => s.trim()).includes(val);
        }
        return false;
      })
      .sort((a, b) => {
        const ra = (a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4;
        const rb = (b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4;
        return rb - ra;
      });
  }, [movies, activeFilter]);

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-10 text-center">
        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-6">
          <ScanFace size={40} className="text-stone-300" />
        </div>
        <h3 className="text-2xl font-black text-charcoal mb-2">Pas encore d'ADN</h3>
        <p className="text-stone-400 font-medium">Notez quelques films pour que votre analyste puisse travailler.</p>
      </div>
    );
  }

  const ADNBar = ({ label, value, icon, percentage = false }: { label: string, value: number, icon: React.ReactNode, percentage?: boolean }) => (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-2">
          <span className="text-charcoal">{icon}</span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal">{label}</span>
        </div>
        <span className="text-xl font-black text-charcoal tracking-tighter">
          {value}{percentage ? <span className="text-[10px] ml-0.5">%</span> : <span className="text-[10px] text-stone-300 ml-0.5">/10</span>}
        </span>
      </div>
      <div className="h-4 bg-stone-100 rounded-full p-[2px] border border-stone-200/50 overflow-hidden">
        <div 
          className="h-full bg-lime-400 rounded-full transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]" 
          style={{ width: percentage ? `${value}%` : `${value * 10}%` }} 
        />
      </div>
    </div>
  );

  const RatingProgress = ({ label, value }: { label: string, value: number }) => (
      <div className="flex items-center gap-4">
          <span className="text-[10px] font-bold text-stone-400 w-16 uppercase tracking-wider">{label}</span>
          <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
              <div className="h-full bg-charcoal rounded-full" style={{ width: `${value * 10}%` }} />
          </div>
          <span className="text-sm font-black text-charcoal w-8 text-right">{value}</span>
      </div>
  );

  return (
    <div className="space-y-8 animate-[fadeIn_0.4s_ease-out] pb-24 relative">
      
      {/* TABS NAVIGATION */}
      <div className="flex items-center justify-between pt-2 px-1">
        <div className="bg-stone-100 p-1 rounded-[1.2rem] flex flex-1 shadow-inner border border-stone-200/50 mx-auto overflow-x-auto no-scrollbar">
          <button onClick={() => { haptics.soft(); setActiveTab('overview'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'overview' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}>
            <Calculator size={14} /> Vue d'ensemble
          </button>
          <button onClick={() => { haptics.soft(); setActiveTab('notes'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'notes' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}>
            <Star size={14} /> Mes Notes
          </button>
          <button onClick={() => { haptics.soft(); setActiveTab('psycho'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'psycho' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}>
            <ScanFace size={14} /> Analyse Psycho
          </button>
        </div>
      </div>
      
      {/* ONGLET 1: VUE D'ENSEMBLE (Old Audit) */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-[slideUp_0.4s_ease-out]">
          <div>
            <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Statistiques<br/><span className="text-stone-300">Comptables</span></h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-3">Données brutes & Rentabilité</p>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-charcoal text-white p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[160px] shadow-xl">
              <Film size={24} className="text-white/20" />
              <div>
                <span className="text-6xl font-black tracking-tighter block leading-none">{stats.count}</span>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-2 block">Films Vus</span>
              </div>
            </div>
            <div className="bg-lime-400 text-charcoal p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[160px] shadow-lg">
              <PiggyBank size={24} className="text-charcoal/20" />
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black tracking-tighter">{Math.round(stats.savings)}</span>
                  <span className="text-xl font-bold">€</span>
                </div>
                <span className="text-[10px] font-bold text-charcoal/60 uppercase tracking-widest mt-2 block">Économies / Mois</span>
              </div>
            </div>
          </div>
          <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 space-y-10 shadow-sm">
            <div>
              <div className="flex items-center gap-2 mb-6 opacity-30"><Clapperboard size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Top Réalisateurs</h4></div>
              <div className="space-y-4">
                {stats.tops.directors.map(([name, count], i) => (
                  <button key={name} onClick={() => { haptics.medium(); setActiveFilter({ type: 'director', value: name }); }} className="flex justify-between items-center group w-full text-left">
                    <div className="flex items-center gap-3"><span className="text-[10px] font-black text-stone-200 w-4">{i + 1}</span><span className="text-sm font-bold text-charcoal group-hover:text-forest transition-colors">{name}</span></div>
                    <div className="flex items-center gap-2"><span className="text-[10px] font-black text-stone-300">{count} films</span><ChevronRight size={14} className="text-stone-200 group-hover:text-charcoal group-hover:translate-x-1 transition-all" /></div>
                  </button>
                ))}
              </div>
            </div>
            <div className="h-px bg-stone-100" />
            <div>
              <div className="flex items-center gap-2 mb-6 opacity-30"><User size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Top Casting</h4></div>
              <div className="space-y-4">
                {stats.tops.actors.map(([name, count], i) => (
                  <button key={name} onClick={() => { haptics.medium(); setActiveFilter({ type: 'actor', value: name }); }} className="flex justify-between items-center group w-full text-left">
                    <div className="flex items-center gap-3"><span className="text-[10px] font-black text-stone-200 w-4">{i + 1}</span><span className="text-sm font-bold text-charcoal group-hover:text-forest transition-colors">{name}</span></div>
                    <div className="flex items-center gap-2"><span className="text-[10px] font-black text-stone-300">{count} films</span><ChevronRight size={14} className="text-stone-200 group-hover:text-charcoal group-hover:translate-x-1 transition-all" /></div>
                  </button>
                ))}
              </div>
            </div>
            <div className="h-px bg-stone-100" />
            <div>
              <div className="flex items-center gap-2 mb-6 opacity-30"><Tags size={14} /><h4 className="text-[10px] font-black uppercase tracking-widest">Genres Favoris</h4></div>
              <div className="flex flex-wrap gap-2">
                {stats.tops.genres.map(([name, count]) => (
                  <button key={name} onClick={() => { haptics.medium(); setActiveFilter({ type: 'genre', value: name }); }} className="bg-stone-50 border border-stone-100 px-4 py-2 rounded-xl flex items-center gap-3 hover:border-lime-400 hover:bg-white transition-all active:scale-95">
                    <span className="text-xs font-bold text-charcoal">{name}</span>
                    <span className="bg-charcoal text-white px-2 py-0.5 rounded text-[8px] font-black">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ONGLET 2: MES NOTES (New) */}
      {activeTab === 'notes' && (
        <div className="space-y-8 animate-[slideUp_0.4s_ease-out]">
            <div>
                <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Moyennes<br/><span className="text-stone-300">Critiques</span></h2>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-3">Distribution de vos évaluations</p>
            </div>

            {/* Global & Details */}
            <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex items-start gap-8 mb-8">
                    <div className="bg-lime-400 text-charcoal p-6 rounded-[1.8rem] flex flex-col items-center justify-center min-w-[100px] shadow-lg">
                        <span className="text-4xl font-black tracking-tighter">{stats.ratingAverages.global}</span>
                        <span className="text-[8px] font-bold uppercase tracking-widest mt-1 opacity-70">Global</span>
                    </div>
                    <div className="flex-1 space-y-3 pt-1">
                        <RatingProgress label="Scénario" value={stats.ratingAverages.story} />
                        <RatingProgress label="Visuel" value={stats.ratingAverages.visuals} />
                        <RatingProgress label="Jeu" value={stats.ratingAverages.acting} />
                        <RatingProgress label="Son" value={stats.ratingAverages.sound} />
                    </div>
                </div>
                
                <div className="pt-6 border-t border-stone-100 flex items-center gap-4">
                    <div className="p-3 bg-stone-50 rounded-2xl text-charcoal"><Target size={20} /></div>
                    <div>
                        <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Votre point fort</p>
                        <p className="text-lg font-black text-charcoal leading-none">
                            {stats.strongestPoint.label} <span className="text-lime-500">({stats.strongestPoint.val})</span>
                        </p>
                        <p className="text-xs text-stone-400 font-medium mt-0.5">C'est le critère qui compte le plus pour vous.</p>
                    </div>
                </div>
            </div>

            {/* 🏆 TABLEAU DE BORD COMPARATIF (NOUVEAU) */}
            <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden">
                <div className="absolute top-0 right-0 p-6 opacity-5"><Scale size={64} /></div>
                
                <div className="flex items-center gap-3 mb-8">
                    <div className="p-2.5 bg-stone-100 text-charcoal rounded-xl"><Scale size={18} /></div>
                    <div>
                        <h3 className="text-lg font-black text-charcoal leading-none">Comparatif Global</h3>
                        <p className="text-[9px] font-bold text-stone-300 uppercase tracking-widest">Vs Monde Réel</p>
                    </div>
                </div>

                {stats.comparative.tmdbAvg > 0 ? (
                    <>
                        <div className="grid grid-cols-2 gap-8 mb-8">
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">Vous</p>
                                <p className="text-3xl font-black text-charcoal">{stats.comparative.userAvg}</p>
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">TMDB (Public)</p>
                                <p className="text-3xl font-black text-stone-300">{stats.comparative.tmdbAvg}</p>
                            </div>
                        </div>

                        <div className="bg-stone-50 rounded-2xl p-5 mb-8 flex items-center gap-4 border border-stone-100">
                            <div className={`p-3 rounded-xl ${stats.comparative.delta > 0 ? 'bg-forest/10 text-forest' : 'bg-red-50 text-red-500'}`}>
                                {React.createElement(stats.comparative.Icon, { size: 20, strokeWidth: 3 })}
                            </div>
                            <div>
                                <p className={`text-sm font-black ${stats.comparative.color} uppercase tracking-wide leading-none mb-1`}>
                                    {stats.comparative.label} ({stats.comparative.delta > 0 ? '+' : ''}{stats.comparative.delta})
                                </p>
                                <p className="text-[10px] font-medium text-stone-400 leading-tight">
                                    Par rapport à la moyenne mondiale.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                            <div className="bg-stone-50 rounded-2xl p-4 border border-stone-100">
                                <div className="flex items-center gap-2 mb-2 text-stone-400">
                                    <TrendingUp size={14} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">Cohérence</span>
                                </div>
                                <p className="text-xl font-black text-charcoal mb-1">{stats.comparative.stdDev}</p>
                                <p className="text-[9px] font-medium text-stone-400">
                                    Typique: {stats.comparative.typicalStdDev} ({stats.comparative.consistencyLabel})
                                </p>
                            </div>
                            <div className="bg-stone-50 rounded-2xl p-4 border border-stone-100">
                                <div className="flex items-center gap-2 mb-2 text-stone-400">
                                    <Percent size={14} />
                                    <span className="text-[8px] font-black uppercase tracking-widest">Coups de cœur</span>
                                </div>
                                <p className="text-xl font-black text-charcoal mb-1">{stats.comparative.highRatedPercent}%</p>
                                <p className="text-[9px] font-medium text-stone-400">
                                    Films {'>'} 8/10 (Typique: {stats.comparative.typicalHighPercent}%)
                                </p>
                            </div>
                        </div>
                    </>
                ) : (
                    <div className="bg-orange-50 border border-orange-100 p-6 rounded-[2rem] text-center">
                        <AlertOctagon size={24} className="text-orange-400 mx-auto mb-2" />
                        <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest mb-1">Données insuffisantes</p>
                        <p className="text-xs text-orange-800/60 font-medium">Ajoutez des films via la recherche TMDB pour voir la comparaison.</p>
                    </div>
                )}
            </div>

            {/* 🎭 NOTES PAR GENRE (NOUVEAU) */}
            <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-stone-100 text-charcoal rounded-xl"><Tags size={18} /></div>
                    <div>
                        <h3 className="text-lg font-black text-charcoal leading-none">Notes par Genre</h3>
                        <p className="text-[9px] font-bold text-stone-300 uppercase tracking-widest">Vos catégories favorites</p>
                    </div>
                </div>

                <div className="space-y-5">
                    {stats.topGenres.map((genre) => (
                        <div key={genre.name}>
                            <div className="flex justify-between items-end mb-2">
                                <span className="text-xs font-bold text-charcoal uppercase tracking-wide">{genre.name}</span>
                                <span className="text-sm font-black text-forest">{genre.avg}</span>
                            </div>
                            <div className="h-2 bg-stone-100 rounded-full overflow-hidden">
                                <div 
                                    className="h-full bg-charcoal rounded-full transition-all duration-1000"
                                    style={{ width: `${(genre.avg / 10) * 100}%` }}
                                />
                            </div>
                        </div>
                    ))}
                    {stats.topGenres.length === 0 && (
                        <p className="text-center text-xs text-stone-400 font-medium italic">Pas assez de données pour le moment.</p>
                    )}
                </div>
            </div>

            {/* 🔥 CORRÉLATIONS ENTRE CRITÈRES (AMÉLIORÉ) */}
            <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-stone-100 text-charcoal rounded-xl"><Link2 size={18} /></div>
                    <div>
                        <h3 className="text-lg font-black text-charcoal leading-none">Corrélations</h3>
                        <p className="text-[9px] font-bold text-stone-300 uppercase tracking-widest">Liens logiques entre vos notes</p>
                    </div>
                </div>

                <div className="space-y-4">
                    {stats.correlations.map((corr, idx) => {
                        const intensity = Math.abs(corr.val);
                        // Labels textuels simplifiés
                        const label = intensity > 0.7 ? 'Fort' : intensity > 0.4 ? 'Moyen' : 'Faible';
                        const colorClass = intensity > 0.7 ? 'bg-forest' : intensity > 0.4 ? 'bg-orange-400' : 'bg-stone-300';
                        
                        return (
                            <div key={idx} className="flex items-center justify-between gap-4">
                                <span className="text-xs font-bold text-stone-500 w-28 shrink-0">{corr.label}</span>
                                <div className="flex-1 h-2 bg-stone-100 rounded-full overflow-hidden">
                                    <div className={`h-full rounded-full transition-all duration-700 ${colorClass}`} style={{ width: `${intensity * 100}%` }} />
                                </div>
                                <span className="text-[9px] font-black uppercase tracking-wider text-charcoal w-12 text-right">
                                    {label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                <div className="mt-6 pt-6 border-t border-stone-100 flex gap-4">
                    <div className="text-stone-300 shrink-0"><GitCommit size={20} /></div>
                    <p className="text-xs font-medium text-stone-500 leading-relaxed italic">
                        "{stats.correlationInsight}"
                    </p>
                </div>
            </div>

            {/* 🎲 FILMS POLARISANTS (NOUVEAU) */}
            {stats.polarizingMovies.length > 0 && (
                <div className="bg-stone-50 border border-stone-100 rounded-[2.5rem] p-8 shadow-sm relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10"><Split size={64} /></div>
                    
                    <div className="flex items-center gap-3 mb-6 relative z-10">
                        <div className="p-2.5 bg-white text-charcoal rounded-xl shadow-sm"><ArrowLeftRight size={18} /></div>
                        <div>
                            <h3 className="text-lg font-black text-charcoal leading-none">Films Polarisants</h3>
                            <p className="text-[9px] font-bold text-stone-400 uppercase tracking-widest">Vos plus grands écarts</p>
                        </div>
                    </div>

                    <div className="space-y-4 relative z-10">
                        {stats.polarizingMovies.map(movie => (
                            <div key={movie.id} className="bg-white p-5 rounded-[1.8rem] shadow-sm border border-stone-100/50">
                                <div className="flex justify-between items-start mb-3">
                                    <h4 className="font-black text-charcoal text-sm uppercase tracking-tight">{movie.title}</h4>
                                    <span className="text-[9px] font-black bg-stone-100 text-stone-500 px-2 py-1 rounded-lg">Écart: {movie.gap}pts</span>
                                </div>
                                <div className="flex items-center justify-between text-xs font-bold">
                                    <div className="flex items-center gap-2 text-red-400">
                                        <div className="w-1.5 h-1.5 rounded-full bg-red-400" />
                                        {movie.minCriteria.k}: {movie.minCriteria.v}
                                    </div>
                                    <div className="h-px bg-stone-200 flex-1 mx-3" />
                                    <div className="flex items-center gap-2 text-forest">
                                        {movie.maxCriteria.k}: {movie.maxCriteria.v}
                                        <div className="w-1.5 h-1.5 rounded-full bg-forest" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                    
                    <div className="mt-6 text-center">
                        <p className="text-[10px] font-medium text-stone-400 max-w-[200px] mx-auto leading-relaxed">
                            Vous avez un jugement nuancé : capable d'aimer un aspect tout en détestant un autre.
                        </p>
                    </div>
                </div>
            )}

            {/* Best & Worst */}
            <div className="grid grid-cols-2 gap-4">
                <div className="bg-stone-50 border border-stone-100 p-6 rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10"><Trophy size={48} /></div>
                    <div className="flex items-center gap-2 mb-4 text-forest">
                        <Award size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Le Meilleur</span>
                    </div>
                    <p className="text-xl font-black text-charcoal leading-tight line-clamp-2 mb-2">{stats.bestRated.title}</p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg shadow-sm border border-stone-100">
                        <Star size={10} fill="currentColor" className="text-lime-500" />
                        <span className="text-xs font-black">{((stats.bestRated.ratings.story + stats.bestRated.ratings.visuals + stats.bestRated.ratings.acting + stats.bestRated.ratings.sound)/4).toFixed(1)}</span>
                    </div>
                </div>

                <div className="bg-stone-50 border border-stone-100 p-6 rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-6 opacity-10"><AlertOctagon size={48} /></div>
                    <div className="flex items-center gap-2 mb-4 text-red-400">
                        <AlertOctagon size={18} />
                        <span className="text-[9px] font-black uppercase tracking-widest">Le Pire</span>
                    </div>
                    <p className="text-xl font-black text-charcoal leading-tight line-clamp-2 mb-2">{stats.worstRated.title}</p>
                    <div className="inline-flex items-center gap-1.5 px-3 py-1 bg-white rounded-lg shadow-sm border border-stone-100">
                        <Star size={10} fill="currentColor" className="text-red-400" />
                        <span className="text-xs font-black">{((stats.worstRated.ratings.story + stats.worstRated.ratings.visuals + stats.worstRated.ratings.acting + stats.worstRated.ratings.sound)/4).toFixed(1)}</span>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* ONGLET 3: ANALYSE PSYCHO (Old Miroir) */}
      {activeTab === 'psycho' && (
        <div className="space-y-12 animate-[slideUp_0.4s_ease-out]">
          <div>
            <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Analyse<br/><span className="text-stone-300">Psychologique</span></h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-3">Qui êtes-vous vraiment ?</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 space-y-8 shadow-sm">
            <ADNBar label="Smartphone" value={stats.averages.smartphone} icon={<Smartphone size={16} />} percentage={true} />
            <ADNBar label="Cérébral" value={stats.averages.cerebral} icon={<Brain size={16} />} />
            <ADNBar label="Émotion" value={stats.averages.emotion} icon={<Heart size={16} />} />
            <ADNBar label="Fun" value={stats.averages.fun} icon={<Smile size={16} />} />
            <ADNBar label="Visuel" value={stats.averages.visuel} icon={<Aperture size={16} />} />
            <ADNBar label="Tension" value={stats.averages.tension} icon={<Zap size={16} />} />
          </div>
          <div className="bg-white border border-stone-100 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm">
            <div className="w-14 h-14 bg-charcoal text-lime-400 rounded-2xl flex items-center justify-center shrink-0">
              {stats.vibeInsight.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-black text-charcoal leading-none">{stats.vibeInsight.label}</span>
                <span className="text-[8px] font-black bg-stone-100 px-2 py-0.5 rounded text-stone-400 uppercase tracking-widest">{stats.vibeInsight.tag}</span>
              </div>
              <p className="text-xs font-medium text-stone-500">{stats.vibeInsight.desc}</p>
            </div>
          </div>
        </div>
      )}

      {activeFilter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
          <div className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]" onClick={() => setActiveFilter(null)} />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col max-h-[80vh] overflow-hidden animate-[scaleIn_0.3s_cubic-bezier(0.16,1,0.3,1)]">
             <div className="p-8 pb-6 flex justify-between items-center border-b border-sand">
                <div className="flex items-center gap-3">
                    <div className="bg-bitter-lime p-3 rounded-2xl text-charcoal">
                        {activeFilter.type === 'actor' ? <User size={20} /> : activeFilter.type === 'director' ? <Clapperboard size={20} /> : <Tags size={20} />}
                    </div>
                    <div><h3 className="text-2xl font-black text-charcoal tracking-tight leading-none mb-1">{activeFilter.type === 'actor' ? 'Acteur' : activeFilter.type === 'director' ? 'Réalisateur' : 'Genre'}</h3><p className="text-xs font-bold text-stone-400 uppercase tracking-widest">{activeFilter.value}</p></div>
                </div>
                <button onClick={() => setActiveFilter(null)} className="p-2.5 bg-stone-100 rounded-full text-stone-500"><X size={20} strokeWidth={2.5} /></button>
             </div>
             <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                {drillDownData.map((movie) => {
                  const rating = ((movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4).toFixed(1);
                  return (
                    <div key={movie.id} className="bg-stone-50 p-4 rounded-2xl border border-stone-100 flex gap-4 group">
                       <div className="w-16 h-24 rounded-xl overflow-hidden bg-stone-200 shrink-0 shadow-sm border border-white">
                          {movie.posterUrl ? <img src={movie.posterUrl} className="w-full h-full object-cover" alt="" /> : <Film size={20} className="m-auto mt-8 opacity-20" />}
                       </div>
                       <div className="flex-1 min-w-0 py-1">
                          <h4 className="font-black text-charcoal leading-tight mb-1 truncate">{movie.title}</h4>
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3">Sortie {movie.year}</p>
                          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-charcoal bg-bitter-lime shadow-sm"><Star size={10} fill="currentColor" /><span className="text-xs font-black">{rating}</span></div>
                       </div>
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      )}

      <div className="px-6 pt-4">
        <button onClick={() => { haptics.medium(); onRecalibrate?.(); }} className="w-full py-4 rounded-2xl border-2 border-dashed border-stone-200 text-[9px] font-black uppercase tracking-[0.2em] text-stone-300 hover:text-charcoal hover:border-stone-300 transition-all flex items-center justify-center gap-2">
          <Settings2 size={12} /> Refaire ma calibration psychologique
        </button>
      </div>
    </div>
  );
};

export default AnalyticsView;
