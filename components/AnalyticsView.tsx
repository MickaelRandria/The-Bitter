
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
  Film, 
  ChevronRight,
  Settings2,
  History,
  Clapperboard,
  User,
  Tags,
  X,
  Star,
  Award,
  AlertOctagon,
  Scale,
  ArrowUp,
  ArrowDown,
  Minus,
  Clock,
  Trophy
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

// Phrases contextuelles pour les vibes
const getVibePhrase = (label: string, value: number) => {
  if (value > 7) {
    switch (label) {
      case 'Cérébral': return "Tu aimes les films qui font réfléchir";
      case 'Émotion': return "Les films te touchent en plein cœur";
      case 'Fun': return "Le cinéma c'est d'abord du plaisir";
      case 'Visuel': return "L'esthétique est essentielle pour toi";
      case 'Tension': return "Tu adores la montée d'adrénaline";
      default: return "";
    }
  } else if (value >= 4) {
    switch (label) {
      case 'Cérébral': return "Tu apprécies un bon scénario sans prise de tête";
      case 'Émotion': return "Tu ressens, sans te laisser submerger";
      case 'Fun': return "Un bon moment, avec du fond";
      case 'Visuel': return "Tu remarques les beaux plans, sans plus";
      case 'Tension': return "Un peu de suspense, ça ne fait pas de mal";
      default: return "";
    }
  } else {
    switch (label) {
      case 'Cérébral': return "Tu préfères ne pas trop cogiter";
      case 'Émotion': return "Tu gardes tes émotions pour toi";
      case 'Fun': return "Le divertissement pur, c'est pas ton truc";
      case 'Visuel': return "Le visuel passe au second plan";
      case 'Tension': return "Tu préfères les films calmes";
      default: return "";
    }
  }
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

    // --- 4. Insight Psycho & Heures ---
    const totalMinutes = watched.reduce((acc, m) => acc + (m.runtime || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);

    // Logique enrichie des archétypes (V2)
    let vibeInsight;
    if (averages.tension > 7) {
      vibeInsight = { label: "Le Frissonnant", desc: "Tu aimes quand ça fait monter la pression", tag: "TENSION", icon: <Zap size={24} /> };
    } else if (averages.visuel > 7 && averages.cerebral < 5) {
      vibeInsight = { label: "L'Esthète", desc: "L'image prime sur le reste", tag: "VISUEL", icon: <Aperture size={24} /> };
    } else if (averages.emotion > 7) {
      vibeInsight = { label: "Le Sensible", desc: "Tu cherches l'émotion avant tout", tag: "ÉMOTION", icon: <Heart size={24} /> };
    } else if (averages.cerebral > averages.fun + 2) {
      vibeInsight = { label: "L'Intello", desc: "Cinéma = Énigme à résoudre", tag: "CÉRÉBRAL", icon: <Brain size={24} /> };
    } else if (averages.fun > averages.cerebral + 2) {
      vibeInsight = { label: "Popcorn", desc: "Le plaisir immédiat avant tout", tag: "FUN", icon: <Smile size={24} /> };
    } else {
      vibeInsight = { label: "L'Équilibré", desc: "Le meilleur des deux mondes", tag: "VERSATILE", icon: <History size={24} /> };
    }

    // --- 5. COMPARATIF SIMPLIFIÉ ---
    const moviesWithTmdb = watched.filter(m => m.tmdbRating && m.tmdbRating > 0);
    const tmdbSum = moviesWithTmdb.reduce((acc, m) => acc + (m.tmdbRating || 0), 0);
    const tmdbAvg = moviesWithTmdb.length > 0 ? Number((tmdbSum / moviesWithTmdb.length).toFixed(1)) : 0;
    
    const userGlobalAvg = ratingAverages.global;
    const delta = Number((userGlobalAvg - tmdbAvg).toFixed(1));
    
    let comparisonLabel = "Aligné";
    let comparisonColor = "text-stone-400";
    let ComparisonIcon = Minus;
    
    if (delta >= 0.8) { comparisonLabel = "Généreux"; comparisonColor = "text-forest"; ComparisonIcon = ArrowUp; }
    else if (delta >= 0.3) { comparisonLabel = "Bienveillant"; comparisonColor = "text-lime-500"; ComparisonIcon = ArrowUp; }
    else if (delta <= -0.8) { comparisonLabel = "Intransigeant"; comparisonColor = "text-red-500"; ComparisonIcon = ArrowDown; }
    else if (delta <= -0.3) { comparisonLabel = "Exigeant"; comparisonColor = "text-orange-400"; ComparisonIcon = ArrowDown; }

    // --- 6. NOTES PAR GENRE ---
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
        .filter(g => g.count >= 1)
        .sort((a, b) => b.avg - a.avg);

    const topGenres = genreRatingsSorted.slice(0, 5);

    return { 
      averages, 
      ratingAverages,
      bestRated,
      worstRated,
      strongestPoint,
      count,
      totalHours,
      vibeInsight,
      tops: {
        actors: getTop(actorCounts),
        directors: getTop(directorCounts),
        genres: getTop(genreCounts)
      },
      comparative: {
          tmdbAvg,
          userAvg: userGlobalAvg,
          delta,
          label: comparisonLabel,
          color: comparisonColor,
          Icon: ComparisonIcon,
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

  const ADNBar = ({ label, value, icon }: { label: string, value: number, icon: React.ReactNode }) => (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-2">
          <span className="text-charcoal">{icon}</span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal">{label}</span>
        </div>
        <span className="text-xl font-black text-charcoal tracking-tighter">
          {value}<span className="text-[10px] text-stone-300 ml-0.5">/10</span>
        </span>
      </div>
      <div className="h-4 bg-stone-100 rounded-full p-[2px] border border-stone-200/50 overflow-hidden">
        <div 
          className="h-full bg-lime-400 rounded-full transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]" 
          style={{ width: `${value * 10}%` }} 
        />
      </div>
      <p className="text-[10px] font-medium text-stone-400 mt-1 pl-6">{getVibePhrase(label, value)}</p>
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
            <User size={14} /> Mon Profil
          </button>
          <button onClick={() => { haptics.soft(); setActiveTab('notes'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'notes' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}>
            <Star size={14} /> Mes Goûts
          </button>
          <button onClick={() => { haptics.soft(); setActiveTab('psycho'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 px-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'psycho' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}>
            <ScanFace size={14} /> Mon ADN
          </button>
        </div>
      </div>
      
      {/* ONGLET 1: MON PROFIL (Ex-Overview) */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-[slideUp_0.4s_ease-out]">
          
          <div>
            <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Mon<br/><span className="text-stone-300">Profil</span></h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-3">Votre identité cinéphile</p>
          </div>

          {/* Hero Archetype Card */}
          <div className="bg-charcoal text-white p-8 rounded-[2.5rem] relative overflow-hidden shadow-xl">
            <div className="absolute top-0 right-0 w-48 h-48 bg-lime-400/10 blur-[60px] rounded-full -translate-y-1/4 translate-x-1/4" />
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className="w-16 h-16 bg-bitter-lime text-charcoal rounded-2xl flex items-center justify-center shadow-lg shadow-lime-400/20">
                  {stats.vibeInsight.icon}
                </div>
                <span className="bg-white/10 border border-white/10 px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-[0.2em] text-white/80">
                  {stats.vibeInsight.tag}
                </span>
              </div>
              <h3 className="text-3xl font-black mb-2 tracking-tighter">{stats.vibeInsight.label}</h3>
              <p className="text-white/60 font-medium leading-relaxed max-w-xs">{stats.vibeInsight.desc}</p>
            </div>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-white border border-stone-200 p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[160px] shadow-sm">
              <Film size={24} className="text-stone-300" />
              <div>
                <span className="text-5xl font-black text-charcoal tracking-tighter block leading-none">{stats.count}</span>
                <span className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mt-2 block">Films Vus</span>
              </div>
            </div>
            <div className="bg-lime-400 text-charcoal p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[160px] shadow-lg">
              <Clock size={24} className="text-charcoal/20" />
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black tracking-tighter">{stats.totalHours}</span>
                  <span className="text-xl font-bold opacity-60">h</span>
                </div>
                <span className="text-[10px] font-bold text-charcoal/60 uppercase tracking-widest mt-2 block">Heures de cinéma</span>
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

      {/* ONGLET 2: MES GOÛTS (Ex-Notes) */}
      {activeTab === 'notes' && (
        <div className="space-y-8 animate-[slideUp_0.4s_ease-out]">
            <div>
                <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Mes<br/><span className="text-stone-300">Goûts</span></h2>
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-3">Comment vous jugez les films</p>
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
                    <div className="p-3 bg-stone-50 rounded-2xl text-charcoal"><Award size={20} /></div>
                    <div>
                        <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest">Votre point fort</p>
                        <p className="text-lg font-black text-charcoal leading-none">
                            {stats.strongestPoint.label} <span className="text-lime-500">({stats.strongestPoint.val})</span>
                        </p>
                        <p className="text-xs text-stone-400 font-medium mt-0.5">C'est le critère qui compte le plus pour vous.</p>
                    </div>
                </div>
            </div>

            {/* COMPARATIF SIMPLIFIÉ */}
            <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 shadow-sm">
                <div className="flex items-center gap-3 mb-6">
                    <div className="p-2.5 bg-stone-100 text-charcoal rounded-xl"><Scale size={18} /></div>
                    <div>
                    <h3 className="text-lg font-black text-charcoal leading-none">Suis-je sévère ?</h3>
                    <p className="text-[9px] font-bold text-stone-300 uppercase tracking-widest">Par rapport au grand public</p>
                    </div>
                </div>
                {stats.comparative.tmdbAvg > 0 ? (
                    <>
                    {/* Jauge visuelle sévère ↔ généreux */}
                    <div className="mb-6">
                        <div className="flex justify-between text-[9px] font-bold uppercase tracking-widest text-stone-400 mb-2">
                        <span>Sévère</span>
                        <span>Généreux</span>
                        </div>
                        <div className="h-3 bg-stone-100 rounded-full overflow-hidden relative">
                        {/* Position du curseur : delta va de -3 à +3, on mappe sur 0-100% */}
                        <div
                            className="absolute top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-charcoal border-2 border-bitter-lime shadow-lg transition-all duration-700"
                            style={{ left: `clamp(10%, ${50 + (stats.comparative.delta * 16.6)}%, 90%)` }}
                        />
                        </div>
                    </div>
                    <div className="bg-stone-50 rounded-2xl p-5 flex items-center gap-4 border border-stone-100">
                        <div className={`p-3 rounded-xl ${stats.comparative.delta > 0 ? 'bg-forest/10 text-forest' : 'bg-red-50 text-red-500'}`}>
                        {React.createElement(stats.comparative.Icon, { size: 20, strokeWidth: 3 })}
                        </div>
                        <div>
                        <p className={`text-sm font-black ${stats.comparative.color} uppercase tracking-wide leading-none mb-1`}>
                            {stats.comparative.label}
                        </p>
                        <p className="text-[10px] font-medium text-stone-400 leading-tight">
                            Vous : {stats.comparative.userAvg}/10 — Public : {stats.comparative.tmdbAvg}/10
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

            {/* 🎭 NOTES PAR GENRE */}
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

      {/* ONGLET 3: MON ADN (Ex-Psycho) */}
      {activeTab === 'psycho' && (
        <div className="space-y-8 animate-[slideUp_0.4s_ease-out]">
          <div>
            <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Mon<br/><span className="text-stone-300">ADN</span></h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-3">Ce que vous recherchez dans un film</p>
          </div>

          {/* Encart Concentration */}
          <div className={`p-6 rounded-[2rem] flex items-center gap-5 border ${
            stats.averages.smartphone > 50
                ? 'bg-red-50 border-red-100'
                : stats.averages.smartphone > 25
                ? 'bg-orange-50 border-orange-100'
                : 'bg-green-50 border-green-100'
            }`}>
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 ${
                stats.averages.smartphone > 50 ? 'bg-red-400 text-white' : stats.averages.smartphone > 25 ? 'bg-orange-400 text-white' : 'bg-forest text-white'
            }`}>
                <Smartphone size={24} />
            </div>
            <div>
                <p className="text-lg font-black text-charcoal leading-none mb-1">
                {stats.averages.smartphone > 50 ? 'Distrait' : stats.averages.smartphone > 25 ? 'Moyen' : 'Concentré'}
                </p>
                <p className="text-xs font-medium text-stone-400">
                {stats.averages.smartphone > 50
                    ? 'Tu regardes souvent ton téléphone pendant les films'
                    : stats.averages.smartphone > 25
                    ? 'Tu décroches parfois, mais ça va'
                    : 'Tu es pleinement immergé dans tes films'}
                </p>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 space-y-8 shadow-sm">
            <ADNBar label="Cérébral" value={stats.averages.cerebral} icon={<Brain size={16} />} />
            <ADNBar label="Émotion" value={stats.averages.emotion} icon={<Heart size={16} />} />
            <ADNBar label="Fun" value={stats.averages.fun} icon={<Smile size={16} />} />
            <ADNBar label="Visuel" value={stats.averages.visuel} icon={<Aperture size={16} />} />
            <ADNBar label="Tension" value={stats.averages.tension} icon={<Zap size={16} />} />
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
