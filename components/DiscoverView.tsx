
import React, { useState, useEffect, useMemo } from 'react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { 
  Loader2, 
  Plus, 
  Star, 
  Search, 
  X, 
  Flame, 
  Calendar, 
  ArrowUpAZ, 
  Brain,
  Zap,
  Smile,
  Heart,
  Aperture,
  Smartphone,
  Check,
  Sparkles,
  ExternalLink,
  Globe,
  Film,
  Ticket
} from 'lucide-react';
import { UserProfile } from '../types';
import { haptics } from '../utils/haptics';
import { deepMovieSearch, AISearchResult } from '../services/ai';

type SortOption = 'popularity' | 'date' | 'alpha';

interface DiscoverViewProps {
  onSelectMovie: (tmdbId: number) => void;
  onPreview: (tmdbId: number) => void;
  userProfile: UserProfile | null;
}

interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  release_date: string;
  popularity: number;
  genre_ids: number[];
  overview: string;
}

const PROVIDERS = [
  { id: 'all', name: 'Tous', logo: null },
  { id: 8, name: 'Netflix', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Netflix_icon.svg/500px-Netflix_icon.svg.png' },
  { id: 119, name: 'Prime', logo: 'https://img.icons8.com/fluent/1200/amazon-prime-video.jpg' },
  { id: 337, name: 'Disney+', logo: 'https://store-images.s-microsoft.com/image/apps.14187.14495311847124170.7646206e-bd82-4cf0-8b8c-d06a67bc302c.2e474878-acb7-4afb-a503-c2a1a32feaa8?h=210' },
  { id: 381, name: 'Canal+', logo: 'https://play-lh.googleusercontent.com/Z2HJDfXSpjq2liULCCujhfzmRoTOZ1z-6A4JO_SrY-Iw92FZ1owOZ_5AlDqOtAvnrw' },
  { id: 'cinema', name: 'Cinéma', logo: '🎬', isEmoji: true }
];

const VIBES = [
  { id: 'cerebral', label: 'Cérébral', icon: <Brain size={14} />, genres: [99, 9648, 18] },
  { id: 'tension', label: 'Tension', icon: <Zap size={14} />, genres: [53, 27, 80] },
  { id: 'fun', label: 'Fun', icon: <Smile size={14} />, genres: [35, 28, 12] },
  { id: 'emotion', label: 'Émotion', icon: <Heart size={14} />, genres: [18, 10749] },
  { id: 'visual', label: 'Visuel', icon: <Aperture size={14} />, genres: [878, 14, 16] },
  { id: 'distraction', label: 'Distraction', icon: <Smartphone size={14} />, genres: [10751, 10402, 10770] },
];

const DiscoverView: React.FC<DiscoverViewProps> = ({ onSelectMovie, onPreview, userProfile }) => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVibe, setActiveVibe] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<number[]>([]);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [streamingFilter, setStreamingFilter] = useState<'all' | 'netflix' | 'prime' | 'disney' | 'canal' | 'cinema'>('all');
  
  // AI Deep Search State
  const [aiResult, setAiResult] = useState<AISearchResult | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);

  const isSearchActive = searchQuery.length > 0;

  const nextMonths = useMemo(() => {
    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      months.push(d);
    }
    return months;
  }, []);

  const fetchMovies = async () => {
    setLoading(true);
    try {
      let url = "";
      if (isSearchActive) {
        url = `${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&query=${encodeURIComponent(searchQuery)}&page=1&include_adult=false`;
      } else {
        const targetDate = nextMonths[selectedMonthIndex];
        const year = targetDate.getFullYear();
        const month = String(targetDate.getMonth() + 1).padStart(2, '0');
        
        // 🔥 LOGIC: Streaming & Cinema filters
        if (streamingFilter === 'cinema') {
            const today = new Date();
            const twoMonthsAgo = new Date();
            twoMonthsAgo.setMonth(today.getMonth() - 2);
            const releaseStart = twoMonthsAgo.toISOString().split('T')[0];
            const releaseEnd = today.toISOString().split('T')[0];
            
            url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&primary_release_date.gte=${releaseStart}&primary_release_date.lte=${releaseEnd}&with_release_type=2|3&sort_by=popularity.desc&page=1`;
        } else if (streamingFilter !== 'all') {
            url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&watch_region=FR&with_watch_providers=${streamingFilter}&primary_release_date.gte=${year}-${month}-01&primary_release_date.lte=${year}-${month}-31&sort_by=popularity.desc&page=1`;
        } else {
            // Default discover behavior
            const firstDay = `${year}-${month}-01`;
            const lastDayObj = new Date(year, parseInt(month), 0);
            const lastDay = `${year}-${month}-${lastDayObj.getDate()}`;
            url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&watch_region=FR&primary_release_date.gte=${firstDay}&primary_release_date.lte=${lastDay}&sort_by=${sortBy === 'popularity' ? 'popularity.desc' : sortBy === 'date' ? 'primary_release_date.desc' : 'title.asc'}&page=1`;
        }
        
        if (activeVibe) {
          const vibe = VIBES.find(v => v.id === activeVibe);
          if (vibe) url += `&with_genres=${vibe.genres.join(',')}`;
        }
      }

      const res = await fetch(url);
      const data = await res.json();
      
      if (data.results) {
        let results = data.results.filter((m: any) => m.poster_path);
        setMovies(results);
      }
    } catch (error) {
      console.error("Discovery error", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const timer = setTimeout(() => { fetchMovies(); }, isSearchActive ? 500 : 0);
    return () => clearTimeout(timer);
  }, [searchQuery, activeVibe, selectedProviders, selectedMonthIndex, sortBy, streamingFilter]);

  const handleDeepSearch = async () => {
    if (!searchQuery) return;
    haptics.medium();
    setIsAiSearching(true);
    setAiResult(null);
    const result = await deepMovieSearch(searchQuery);
    setAiResult(result);
    setIsAiSearching(false);
  };

  const getPlatformBadge = (movie: TMDBMovie) => {
    // Si un filtre streaming spécifique est actif, on affiche le logo de ce provider
    if (streamingFilter !== 'all' && streamingFilter !== 'cinema') {
        const provider = PROVIDERS.find(p => p.id === streamingFilter);
        if (provider) return { type: 'provider', data: provider };
    }

    // Logic "Au cinéma" basé sur la date de sortie récente ( < 3 mois)
    const releaseDate = new Date(movie.release_date);
    const now = new Date();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(now.getMonth() - 3);

    if (releaseDate >= threeMonthsAgo && releaseDate <= now) {
        return { type: 'cinema', label: 'Au Cinéma' };
    }
    
    // Si c'est "Cinema" filter, forcer le badge
    if (streamingFilter === 'cinema') {
        return { type: 'cinema', label: 'Au Cinéma' };
    }

    return null;
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.4s_ease-out] pb-24">
      {/* 1. SEARCH BAR */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-stone-300 group-focus-within:text-charcoal transition-colors">
            <Search size={20} strokeWidth={3} />
        </div>
        <input 
            type="text" 
            placeholder="Rechercher un film ou une actualité..." 
            className="w-full bg-stone-100/50 hover:bg-stone-100 focus:bg-white border-2 border-transparent focus:border-stone-200 rounded-[2rem] py-5 pl-14 pr-32 text-base font-black outline-none transition-all shadow-sm placeholder:text-stone-300 text-charcoal"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="absolute inset-y-0 right-2 flex items-center gap-2">
            {isSearchActive && (
                <button 
                  onClick={handleDeepSearch}
                  className="bg-bitter-lime text-charcoal px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 active:scale-95 transition-transform"
                >
                    {isAiSearching ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />}
                    Deep Info
                </button>
            )}
            {isSearchActive && !isAiSearching && (
                <button onClick={() => { haptics.soft(); setSearchQuery(''); setAiResult(null); }} className="p-2 text-stone-300 hover:text-charcoal">
                    <X size={20} strokeWidth={3} />
                </button>
            )}
        </div>
      </div>

      {/* AI RESULT DISPLAY */}
      {aiResult && (
        <div className="bg-stone-900 text-white rounded-[2.5rem] p-8 space-y-6 animate-[slideUp_0.4s_ease-out] border border-bitter-lime/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-bitter-lime/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center gap-3">
                <div className="p-2 bg-bitter-lime text-charcoal rounded-lg">
                    <Sparkles size={16} fill="currentColor" />
                </div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">Gemini Insight</h3>
            </div>
            <p 
                className="text-sm font-medium leading-relaxed text-stone-300"
                dangerouslySetInnerHTML={{ __html: aiResult.text }}
            />
            {aiResult.sources.length > 0 && (
                <div className="space-y-3 pt-4 border-t border-white/10">
                    <p className="text-[9px] font-black uppercase tracking-widest text-stone-500">Sources vérifiées</p>
                    <div className="flex flex-wrap gap-2">
                        {aiResult.sources.map((source, i) => (
                            <a 
                                key={i} 
                                href={source.uri} 
                                target="_blank" 
                                rel="noopener noreferrer"
                                className="flex items-center gap-2 px-3 py-1.5 bg-white/5 hover:bg-white/10 rounded-lg text-[10px] font-bold text-stone-300 transition-colors"
                            >
                                {source.title}
                                <ExternalLink size={10} />
                            </a>
                        ))}
                    </div>
                </div>
            )}
        </div>
      )}

      {/* 2. FILTERS & SORTING */}
      {!aiResult && (
        <>
            {/* Streaming Filters */}
            <div className="mb-2">
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 mb-4 px-1">
                    Plateforme
                </h3>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {PROVIDERS.map((provider) => (
                    <button
                        key={provider.id}
                        onClick={() => {
                            haptics.soft();
                            setStreamingFilter(provider.id as any);
                        }}
                        className={`flex-shrink-0 px-4 py-3 rounded-2xl font-bold text-xs transition-all border flex items-center gap-2 ${
                            streamingFilter === provider.id
                            ? 'bg-charcoal text-white border-charcoal shadow-lg scale-105'
                            : 'bg-white text-stone-600 border-sand hover:border-stone-300'
                        }`}
                    >
                        {/* @ts-ignore */}
                        {provider.isEmoji ? (
                            <span className="text-lg leading-none">{provider.logo}</span>
                        ) : provider.logo ? (
                            <img src={provider.logo} alt={provider.name} className="w-5 h-5 object-contain" />
                        ) : null}
                        {provider.name}
                    </button>
                    ))}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex items-center justify-between px-1">
                    <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Trier par</span>
                </div>
                <div className="flex p-1.5 bg-stone-100 rounded-2xl border border-stone-200/50 w-full">
                {(['popularity', 'date', 'alpha'] as SortOption[]).map((opt) => (
                    <button 
                    key={opt}
                    onClick={() => { haptics.soft(); setSortBy(opt); }} 
                    className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === opt ? 'bg-white text-forest shadow-sm' : 'text-stone-400'}`}
                    >
                    {opt === 'popularity' ? <Flame size={14} /> : opt === 'date' ? <Calendar size={14} /> : <ArrowUpAZ size={14} />} 
                    {opt === 'popularity' ? 'Popularité' : opt === 'date' ? 'Date' : 'Titre'}
                    </button>
                ))}
                </div>
            </div>
        </>
      )}

      {/* 3. GRID RESULTS */}
      <div className="space-y-6">
        {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
                <Loader2 size={40} className="animate-spin text-charcoal opacity-20" />
                <p className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-300">Synchronisation TMDB...</p>
            </div>
        ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
                {movies.map(movie => {
                    const badge = getPlatformBadge(movie);
                    return (
                        <div key={movie.id} onClick={() => { haptics.medium(); onPreview(movie.id); }} className="group relative flex flex-col gap-3 animate-[fadeIn_0.4s_ease-out] cursor-pointer">
                            <div className="relative aspect-[2/3] rounded-[2.5rem] overflow-hidden shadow-sm group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-500 bg-stone-100">
                                <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} className="w-full h-full object-cover" alt={movie.title} loading="lazy" />
                                <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                                
                                {/* Badge Overlay */}
                                {badge && (
                                    <div className="absolute top-3 left-3 z-10">
                                        {badge.type === 'cinema' ? (
                                            <div className="bg-charcoal/90 backdrop-blur-md text-white px-2.5 py-1 rounded-lg flex items-center gap-1.5 shadow-lg border border-white/10">
                                                <Ticket size={10} className="text-bitter-lime" />
                                                <span className="text-[9px] font-black uppercase tracking-wide">{badge.label}</span>
                                            </div>
                                        ) : badge.type === 'provider' && badge.data?.logo ? (
                                            <div className="bg-white/90 backdrop-blur-md p-1.5 rounded-xl shadow-lg border border-white/20">
                                                <img src={badge.data.logo} alt="" className="w-4 h-4 object-contain rounded-md" />
                                            </div>
                                        ) : null}
                                    </div>
                                )}

                                {movie.vote_average > 0 && (
                                    <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1">
                                        <Star size={10} fill="currentColor" className="text-white" />
                                        <span className="text-[10px] font-black text-white">{movie.vote_average.toFixed(1)}</span>
                                    </div>
                                )}
                            </div>
                            <div className="px-1">
                                <h4 className="text-sm font-black text-charcoal leading-tight line-clamp-2 mb-1 group-hover:text-forest transition-colors">{movie.title}</h4>
                                <p className="text-xs text-stone-500 mb-1 font-semibold">
                                    {movie.release_date 
                                        ? new Date(movie.release_date).toLocaleDateString('fr-FR', { 
                                            day: '2-digit', 
                                            month: 'short', 
                                            year: 'numeric' 
                                        })
                                        : 'Prochainement'
                                    }
                                </p>
                            </div>
                        </div>
                    );
                })}
            </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverView;
