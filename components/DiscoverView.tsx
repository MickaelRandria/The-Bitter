
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
  Globe
} from 'lucide-react';
import { UserProfile } from '../types';
import { haptics } from '../utils/haptics';
import { deepMovieSearch, AISearchResult } from '../services/ai';

type SortOption = 'popularity' | 'date' | 'alpha';

interface DiscoverViewProps {
  onSelectMovie: (tmdbId: number) => void;
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
  { id: 8, name: 'Netflix', logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/75/Netflix_icon.svg/500px-Netflix_icon.svg.png' },
  { id: 119, name: 'Prime', logo: 'https://img.icons8.com/fluent/1200/amazon-prime-video.jpg' },
  { id: 337, name: 'Disney+', logo: 'https://store-images.s-microsoft.com/image/apps.14187.14495311847124170.7646206e-bd82-4cf0-8b8c-d06a67bc302c.2e474878-acb7-4afb-a503-c2a1a32feaa8?h=210' },
  { id: 381, name: 'Canal+', logo: 'https://play-lh.googleusercontent.com/Z2HJDfXSpjq2liULCCujhfzmRoTOZ1z-6A4JO_SrY-Iw92FZ1owOZ_5AlDqOtAvnrw' },
];

const VIBES = [
  { id: 'cerebral', label: 'Cérébral', icon: <Brain size={14} />, genres: [99, 9648, 18] },
  { id: 'tension', label: 'Tension', icon: <Zap size={14} />, genres: [53, 27, 80] },
  { id: 'fun', label: 'Fun', icon: <Smile size={14} />, genres: [35, 28, 12] },
  { id: 'emotion', label: 'Émotion', icon: <Heart size={14} />, genres: [18, 10749] },
  { id: 'visual', label: 'Visuel', icon: <Aperture size={14} />, genres: [878, 14, 16] },
  { id: 'distraction', label: 'Distraction', icon: <Smartphone size={14} />, genres: [10751, 10402, 10770] },
];

const DiscoverView: React.FC<DiscoverViewProps> = ({ onSelectMovie, userProfile }) => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVibe, setActiveVibe] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<number[]>([]);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [heroMovie, setHeroMovie] = useState<{ movie: TMDBMovie, reason: string } | null>(null);

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
        const month = targetDate.getMonth() + 1;
        const firstDay = `${year}-${month.toString().padStart(2, '0')}-01`;
        const lastDayObj = new Date(year, month, 0);
        const lastDay = `${year}-${month.toString().padStart(2, '0')}-${lastDayObj.getDate()}`;

        url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&watch_region=FR&sort_by=${sortBy === 'popularity' ? 'popularity.desc' : sortBy === 'date' ? 'primary_release_date.desc' : 'title.asc'}&page=1`;
        
        if (activeVibe) {
          const vibe = VIBES.find(v => v.id === activeVibe);
          if (vibe) url += `&with_genres=${vibe.genres.join(',')}`;
        }

        if (selectedProviders.length > 0) {
          url += `&with_watch_providers=${selectedProviders.join('|')}&with_watch_monetization_types=flatrate`;
        } else if (!activeVibe && !isSearchActive) {
          url += `&with_release_type=2|3&primary_release_date.gte=${firstDay}&primary_release_date.lte=${lastDay}`;
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
  }, [searchQuery, activeVibe, selectedProviders, selectedMonthIndex, sortBy]);

  const handleDeepSearch = async () => {
    if (!searchQuery) return;
    haptics.medium();
    setIsAiSearching(true);
    setAiResult(null);
    const result = await deepMovieSearch(searchQuery);
    setAiResult(result);
    setIsAiSearching(false);
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

      {/* 2. SORTING */}
      {!aiResult && (
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
                {movies.map(movie => (
                    <div key={movie.id} onClick={() => onSelectMovie(movie.id)} className="group relative flex flex-col gap-3 animate-[fadeIn_0.4s_ease-out] cursor-pointer">
                        <div className="relative aspect-[2/3] rounded-[2.5rem] overflow-hidden shadow-sm group-hover:shadow-xl group-hover:-translate-y-1 transition-all duration-500">
                            <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} className="w-full h-full object-cover" alt={movie.title} loading="lazy" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
                            <button onClick={(e) => { e.stopPropagation(); haptics.medium(); onSelectMovie(movie.id); }} className="absolute bottom-4 right-4 w-12 h-12 bg-forest text-white rounded-full flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300 active:scale-90">
                                <Plus size={24} strokeWidth={3} />
                            </button>
                            {movie.vote_average > 0 && (
                                <div className="absolute top-4 left-4 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1">
                                    <Star size={10} fill="currentColor" className="text-white" />
                                    <span className="text-[10px] font-black text-white">{movie.vote_average.toFixed(1)}</span>
                                </div>
                            )}
                        </div>
                        <div className="px-1">
                            <h4 className="text-sm font-black text-charcoal leading-tight line-clamp-2 mb-1 group-hover:text-forest transition-colors">{movie.title}</h4>
                            <span className="text-[10px] font-bold text-stone-300 uppercase tracking-tighter">
                                {movie.release_date?.split('-')[0] || 'N/A'}
                            </span>
                        </div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverView;
