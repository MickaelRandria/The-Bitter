import React, { useState, useMemo, useEffect } from 'react';
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
  Trophy,
  Lock,
  ThumbsUp,
  ThumbsDown,
  TrendingDown
} from 'lucide-react';
import { haptics } from '../utils/haptics';
import { getAdvancedArchetype } from '../utils/archetypes';
import { supabase } from '../services/supabase';

interface AnalyticsViewProps {
  movies: Movie[];
  userProfile: UserProfile | null;
  onNavigateToCalendar?: () => void;
  onRecalibrate?: () => void;
}

type TabMode = 'overview' | 'notes' | 'psycho';
type FilterType = 'actor' | 'director' | 'genre';

const MIN_MOVIES_FOR_ANALYTICS = 5;

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

  const watchedCount = useMemo(() => movies.filter(m => m.status === 'watched').length, [movies]);
  const isLocked = watchedCount < MIN_MOVIES_FOR_ANALYTICS;

  const stats = useMemo(() => {
    if (isLocked) return null;

    const watched = movies.filter(m => m.status === 'watched');
    const count = watched.length;
    if (count === 0) return null;

    const sums = watched.reduce((acc, m) => {
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
    }, { 
      cerebral: 0, emotion: 0, fun: 0, visual: 0, tension: 0, smartphone: 0,
      ratingStory: 0, ratingVisuals: 0, ratingActing: 0, ratingSound: 0
    });

    const averages = {
      cerebral: Number((sums.cerebral / count).toFixed(1)),
      emotion: Number((sums.emotion / count).toFixed(1)),
      fun: Number((sums.fun / count).toFixed(1)),
      visual: Number((sums.visual / count).toFixed(1)),
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

    const genreCounts: Record<string, number> = {};
    watched.forEach(m => {
      if (m.genre) genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1;
    });

    // Calcul du nombre réel de genres distincts pour l'archétype Omnivore
    const distinctGenreCount = Object.keys(genreCounts).length;

    // --- PALMARÈS ---
    const sortedByRating = [...watched].sort((a, b) => {
        const avgA = (a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4;
        const avgB = (b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4;
        return avgB - avgA;
    });
    const bestRated = sortedByRating[0];
    const worstRated = sortedByRating[count - 1];

    const totalMinutes = watched.reduce((acc, m) => acc + (m.runtime || 0), 0);
    const totalHours = Math.floor(totalMinutes / 60);

    // Phase 2 : Calcul comportemental de l'archétype
    const advancedArchetype = getAdvancedArchetype({
      vibes: averages,
      quality: {
        scenario: ratingAverages.story,
        acting: ratingAverages.acting,
        visual: ratingAverages.visuals,
        sound: ratingAverages.sound
      },
      smartphone: averages.smartphone,
      distinctGenreCount: distinctGenreCount,
      severityIndex: userProfile?.severityIndex || 5,
      rhythmIndex: userProfile?.patienceLevel || 5 // patienceLevel = Rhythm dans l'UI
    });

    const moviesWithTmdb = watched.filter(m => m.tmdbRating && m.tmdbRating > 0);
    const tmdbSum = moviesWithTmdb.reduce((acc, m) => acc + (m.tmdbRating || 0), 0);
    const tmdbAvg = moviesWithTmdb.length > 0 ? Number((tmdbSum / moviesWithTmdb.length).toFixed(1)) : 0;
    
    const userGlobalAvg = ratingAverages.global;
    const delta = Number((userGlobalAvg - tmdbAvg).toFixed(1));
    
    let comparisonLabel = "Aligné";
    let comparisonColor = "text-stone-400 dark:text-stone-500";
    let ComparisonIcon = Minus;
    
    if (delta >= 0.8) { comparisonLabel = "Généreux"; comparisonColor = "text-forest dark:text-lime-500"; ComparisonIcon = ArrowUp; }
    else if (delta >= 0.3) { comparisonLabel = "Bienveillant"; comparisonColor = "text-lime-500"; ComparisonIcon = ArrowUp; }
    else if (delta <= -0.8) { comparisonLabel = "Intransigeant"; comparisonColor = "text-red-500"; ComparisonIcon = ArrowDown; }
    else if (delta <= -0.3) { comparisonLabel = "Exigeant"; comparisonColor = "text-orange-400"; ComparisonIcon = ArrowDown; }

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
        genreRatingsSorted,
        criteriaScores: [
            { id: 'story', label: 'Scénario', val: ratingAverages.story },
            { id: 'visuals', label: 'Visuel', val: ratingAverages.visuals },
            { id: 'acting', label: 'Jeu', val: ratingAverages.acting },
            { id: 'sound', label: 'Son', val: ratingAverages.sound },
        ]
    };
  }, [movies, isLocked, userProfile?.severityIndex, userProfile?.patienceLevel]);

  // Recalibration automatique de l'archétype en DB si nécessaire
  useEffect(() => {
    if (stats && userProfile?.id && userProfile?.role !== stats.advancedArchetype.title && supabase) {
        // Mettre à jour le rôle silencieusement
        const updateRole = async () => {
            await supabase
                .from('profiles')
                .update({ role: stats.advancedArchetype.title })
                .eq('id', userProfile.id);
            // On ne déclenche pas de reload total ici pour éviter les loops, 
            // le changement sera visible au prochain rechargement de l'app ou du profil
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
         <h2 className="text-2xl font-black text-charcoal dark:text-white mb-2">Profil en construction</h2>
         <p className="text-sm font-medium text-stone-500 dark:text-stone-600 max-w-xs mx-auto leading-relaxed mb-8">
             Notez encore {MIN_MOVIES_FOR_ANALYTICS - watchedCount} films pour débloquer votre analyse.
         </p>
         <div className="w-full max-w-xs bg-stone-100 dark:bg-[#202020] h-2 rounded-full overflow-hidden transition-colors">
             <div className="h-full bg-forest transition-all duration-1000" style={{ width: `${(watchedCount / MIN_MOVIES_FOR_ANALYTICS) * 100}%` }} />
         </div>
         <p className="mt-2 text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest">{watchedCount} / {MIN_MOVIES_FOR_ANALYTICS} Films</p>
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
      genreRatingsSorted
  } = stats;

  return (
    <div className="pb-24 animate-[fadeIn_0.3s_ease-out]">
        {/* Navigation Tabs */}
        <div className="flex bg-stone-100 dark:bg-[#161616] p-1 rounded-2xl border border-stone-200/50 dark:border-white/5 mb-8 w-full max-w-md mx-auto transition-colors">
            {(['overview', 'notes', 'psycho'] as TabMode[]).map((tab) => (
                <button 
                    key={tab}
                    onClick={() => { haptics.soft(); setActiveTab(tab); }} 
                    className={`flex-1 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === tab ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-sm dark:shadow-black/20' : 'text-stone-400 dark:text-stone-600'}`}
                >
                    {tab === 'overview' ? 'Profil' : tab === 'notes' ? 'Goûts' : 'ADN'}
                </button>
            ))}
        </div>

        {activeTab === 'overview' && (
            <div className="space-y-6 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                {/* Archetype Card */}
                <div className="bg-charcoal dark:bg-[#1a1a1a] text-white rounded-[2.5rem] p-8 text-center relative overflow-hidden shadow-xl dark:shadow-black/40 transition-all">
                    <div className="absolute top-0 right-0 w-64 h-64 bg-forest/20 blur-[80px] rounded-full -translate-y-1/2 translate-x-1/2" />
                    
                    <div className="relative z-10">
                        <div className="w-20 h-20 bg-white/10 dark:bg-white/5 backdrop-blur-md rounded-3xl flex items-center justify-center text-4xl mb-6 mx-auto shadow-inner border border-white/10 dark:border-white/5">
                            {advancedArchetype.icon}
                        </div>
                        <div className="inline-block bg-forest text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest mb-3">
                            {advancedArchetype.tag}
                        </div>
                        <h2 className="text-3xl font-black mb-3 tracking-tighter">{advancedArchetype.title}</h2>
                        <p className="text-stone-400 dark:text-stone-500 text-sm font-medium leading-relaxed mb-6">
                            "{advancedArchetype.description}"
                        </p>
                        
                        {advancedArchetype.secondaryTrait && (
                             <div className="bg-white/5 border border-white/10 rounded-xl p-3 inline-block">
                                <p className="text-[10px] font-bold text-stone-300 dark:text-stone-400 uppercase tracking-wide">
                                    Signe : {advancedArchetype.secondaryTrait}
                                </p>
                             </div>
                        )}
                    </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                     <div className="bg-white dark:bg-[#202020] p-5 rounded-[2rem] border border-stone-100 dark:border-white/10 shadow-sm dark:shadow-black/20 flex flex-col justify-between aspect-square transition-all">
                        <div className="w-10 h-10 bg-stone-50 dark:bg-[#161616] rounded-2xl flex items-center justify-center text-stone-400 dark:text-stone-500">
                             <Clock size={20} />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-charcoal dark:text-white">{totalHours}h</p>
                            <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-wider">Devant l'écran</p>
                        </div>
                     </div>
                     <div className="bg-white dark:bg-[#202020] p-5 rounded-[2rem] border border-stone-100 dark:border-white/10 shadow-sm dark:shadow-black/20 flex flex-col justify-between aspect-square transition-all">
                        <div className="w-10 h-10 bg-stone-50 dark:bg-[#161616] rounded-2xl flex items-center justify-center text-stone-400 dark:text-stone-500">
                             <Film size={20} />
                        </div>
                        <div>
                            <p className="text-2xl font-black text-charcoal dark:text-white">{watchedCount}</p>
                            <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-wider">Analysés</p>
                        </div>
                     </div>
                </div>
            </div>
        )}

        {activeTab === 'notes' && (
            <div className="space-y-6 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                {/* Sévérité */}
                <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-6 rounded-[2.5rem] shadow-sm dark:shadow-black/20 transition-all">
                    <div className="flex items-center gap-3 mb-4">
                        <div className="p-2 bg-stone-100 dark:bg-[#161616] rounded-xl text-charcoal dark:text-white"><Scale size={18} /></div>
                        <h3 className="text-sm font-black uppercase tracking-widest text-stone-400 dark:text-stone-400">Sévérité</h3>
                    </div>
                    
                    <div className="flex items-center justify-between mb-2">
                         <span className={`text-xl font-black ${comparisonColor}`}>{comparisonLabel}</span>
                         <div className={`flex items-center gap-1 px-2 py-1 rounded-lg bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5`}>
                             <ComparisonIcon size={12} className={comparisonColor} />
                             <span className={`text-xs font-black ${comparisonColor}`}>{Math.abs(delta)} pts</span>
                             <span className="text-[9px] font-bold text-stone-400 dark:text-stone-600 uppercase">vs Monde</span>
                         </div>
                    </div>
                    
                    <div className="relative h-2 bg-stone-100 dark:bg-[#161616] rounded-full overflow-hidden transition-colors mt-4">
                        <div className="absolute left-1/2 top-0 bottom-0 w-0.5 bg-stone-300 dark:bg-stone-700 z-10" />
                        <div 
                            className={`absolute top-0 bottom-0 w-full transition-all duration-1000 ${delta > 0 ? 'bg-forest' : 'bg-orange-400'}`}
                            style={{ 
                                left: '50%', 
                                transform: `translateX(${delta > 0 ? 0 : '-100%'})`,
                                width: `${Math.min(Math.abs(delta) * 20, 50)}%`
                            }} 
                        />
                    </div>
                </div>

                {/* --- HAUTS & BAS --- */}
                <div className="grid grid-cols-1 gap-4">
                    <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-400 ml-1">Le Palmarès</h3>
                    
                    {/* Meilleur Film */}
                    <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-5 rounded-[2rem] shadow-sm dark:shadow-black/20 flex gap-4 items-center transition-all">
                        <div className="w-16 aspect-[2/3] bg-forest rounded-xl overflow-hidden shadow-md shrink-0 border border-white/5">
                            {bestRated?.posterUrl ? <img src={bestRated.posterUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-white/20"><Film size={20} /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 text-forest dark:text-lime-500">
                                <ThumbsUp size={12} fill="currentColor" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Coup de cœur</span>
                            </div>
                            <h4 className="font-black text-charcoal dark:text-white truncate leading-tight">{bestRated?.title}</h4>
                            <p className="text-[10px] font-bold text-stone-400 dark:text-stone-400 uppercase mt-0.5">{bestRated?.director} • {bestRated?.year}</p>
                        </div>
                        <div className="bg-forest dark:bg-lime-500 text-white dark:text-black w-10 h-10 rounded-full flex items-center justify-center font-black text-sm shadow-lg">
                            {((bestRated.ratings.story + bestRated.ratings.visuals + bestRated.ratings.acting + bestRated.ratings.sound) / 4).toFixed(1)}
                        </div>
                    </div>

                    {/* Pire Film */}
                    <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-5 rounded-[2rem] shadow-sm dark:shadow-black/20 flex gap-4 items-center transition-all">
                        <div className="w-16 aspect-[2/3] bg-stone-100 dark:bg-[#161616] rounded-xl overflow-hidden shadow-md shrink-0 border border-white/5">
                            {worstRated?.posterUrl ? <img src={worstRated.posterUrl} className="w-full h-full object-cover opacity-50 grayscale" alt="" /> : <div className="w-full h-full flex items-center justify-center text-stone-300 dark:text-stone-700"><Film size={20} /></div>}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1 text-orange-400">
                                <ThumbsDown size={12} fill="currentColor" />
                                <span className="text-[9px] font-black uppercase tracking-widest">Douleur Visuelle</span>
                            </div>
                            <h4 className="font-black text-stone-500 dark:text-stone-400 truncate leading-tight">{worstRated?.title}</h4>
                            <p className="text-[10px] font-bold text-stone-300 dark:text-stone-500 uppercase mt-0.5">{worstRated?.director} • {worstRated?.year}</p>
                        </div>
                        <div className="bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-500 w-10 h-10 rounded-full flex items-center justify-center font-black text-sm border border-stone-200 dark:border-white/5">
                            {((worstRated.ratings.story + worstRated.ratings.visuals + worstRated.ratings.acting + worstRated.ratings.sound) / 4).toFixed(1)}
                        </div>
                    </div>
                </div>

                {/* Critères Moyens */}
                <div className="grid grid-cols-2 gap-3 pt-2">
                     <h3 className="col-span-2 text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-400 ml-1">Moyennes par Critère</h3>
                     {criteriaScores.map(c => (
                         <div key={c.id} className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 p-4 rounded-2xl flex flex-col gap-2 transition-all shadow-sm dark:shadow-black/10">
                             <div className="flex justify-between items-start">
                                 <span className="text-[9px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest">{c.label}</span>
                                 <span className="text-lg font-black text-charcoal dark:text-white">{c.val}</span>
                             </div>
                             <div className="h-1.5 bg-stone-50 dark:bg-[#161616] rounded-full overflow-hidden transition-colors">
                                 <div className="h-full bg-charcoal dark:bg-white rounded-full" style={{ width: `${c.val * 10}%` }} />
                             </div>
                         </div>
                     ))}
                </div>

                <div className="bg-stone-50 dark:bg-[#161616] rounded-[2.5rem] p-6 border border-stone-100 dark:border-white/5 transition-all">
                    <h3 className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-400 mb-4 flex items-center gap-2">
                        <Star size={12} /> Top Genres
                    </h3>
                    <div className="space-y-3">
                        {genreRatingsSorted.slice(0, 4).map((g, i) => (
                            <div key={g.name} className="flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                    <span className="text-[9px] font-black text-stone-300 dark:text-stone-500 w-4">{i + 1}</span>
                                    <span className="text-xs font-bold text-charcoal dark:text-white">{g.name}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                     <div className="w-16 h-1.5 bg-stone-200 dark:bg-[#202020] rounded-full overflow-hidden transition-colors">
                                         <div className="h-full bg-forest dark:bg-lime-500" style={{ width: `${g.avg * 10}%` }} />
                                     </div>
                                     <span className="text-[10px] font-black text-charcoal dark:text-white w-6 text-right">{g.avg}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        )}

        {activeTab === 'psycho' && (
            <div className="space-y-6 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                <div className="grid grid-cols-2 gap-3">
                    {[
                        { label: 'Cérébral', val: averages.cerebral, icon: Brain },
                        { label: 'Émotion', val: averages.emotion, icon: Heart },
                        { label: 'Fun', val: averages.fun, icon: Smile },
                        { label: 'Tension', val: averages.tension, icon: Zap },
                        { label: 'Visuel', val: averages.visual, icon: Aperture }
                    ].map(item => {
                        const phrase = getVibePhrase(item.label, item.val);
                        return (
                            <div key={item.label} className="bg-white dark:bg-[#202020] border border-stone-100 dark:border-white/10 p-5 rounded-[2rem] shadow-sm dark:shadow-black/20 col-span-2 sm:col-span-1 transition-all">
                                <div className="flex items-center gap-3 mb-2">
                                    <div className="p-2 bg-stone-50 dark:bg-[#161616] rounded-xl text-stone-400 dark:text-stone-500 transition-colors">
                                        <item.icon size={16} />
                                    </div>
                                    <span className="text-xs font-black uppercase tracking-widest text-charcoal dark:text-white">{item.label}</span>
                                </div>
                                <div className="mb-2">
                                    <span className="text-2xl font-black text-charcoal dark:text-white">{item.val}</span>
                                    <span className="text-xs font-bold text-stone-300 dark:text-stone-700">/10</span>
                                </div>
                                <p className="text-[10px] font-medium text-stone-500 dark:text-stone-400 leading-tight">
                                    {phrase}
                                </p>
                            </div>
                        );
                    })}
                </div>

                <div className="bg-charcoal dark:bg-[#1a1a1a] text-white p-6 rounded-[2.5rem] relative overflow-hidden shadow-xl dark:shadow-black/40 transition-all">
                     <div className="absolute top-0 right-0 w-32 h-32 bg-forest/20 blur-[50px] rounded-full -translate-y-1/2 translate-x-1/2" />
                     <div className="relative z-10 flex justify-between items-center mb-4">
                         <h3 className="text-sm font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 flex items-center gap-2">
                             <Smartphone size={16} /> Immersion
                         </h3>
                         <span className="text-2xl font-black text-white">{100 - averages.smartphone}%</span>
                     </div>
                     <div className="w-full bg-white/10 dark:bg-white/5 h-2 rounded-full overflow-hidden mb-4 transition-colors">
                         <div className="h-full bg-forest dark:bg-lime-500" style={{ width: `${100 - averages.smartphone}%` }} />
                     </div>
                     <p className="text-xs font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                         Vous passez environ {averages.smartphone}% du temps sur votre téléphone.
                     </p>
                </div>
            </div>
        )}

        <div className="mt-8 text-center">
            <button 
                onClick={onRecalibrate}
                className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 hover:text-charcoal dark:hover:text-white transition-colors border-b border-stone-200 dark:border-stone-800 pb-0.5"
            >
                Recalibrer mon profil
            </button>
        </div>
    </div>
  );
};

export default AnalyticsView;