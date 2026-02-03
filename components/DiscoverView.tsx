
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
  Sparkles
} from 'lucide-react';
import { UserProfile } from '../types';
import { haptics } from '../utils/haptics';

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

type SortOption = 'popularity' | 'date' | 'alpha';

const DiscoverView: React.FC<DiscoverViewProps> = ({ onSelectMovie, userProfile }) => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVibe, setActiveVibe] = useState<string | null>(null);
  const [selectedProviders, setSelectedProviders] = useState<number[]>([]);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [heroMovie, setHeroMovie] = useState<{ movie: TMDBMovie, reason: string } | null>(null);

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

  const formatDate = (dateStr: string) => {
    if (!dateStr) return 'Prochainement';
    try {
      const parts = dateStr.split('-');
      if (parts.length < 3) return dateStr;
      return `${parts[2]}/${parts[1]}/${parts[0]}`;
    } catch {
      return dateStr;
    }
  };

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
        
        if (isSearchActive) {
          results.sort((a: TMDBMovie, b: TMDBMovie) => {
            if (sortBy === 'popularity') return b.popularity - a.popularity;
            if (sortBy === 'date') return new Date(b.release_date).getTime() - new Date(a.release_date).getTime();
            return a.title.localeCompare(b.title);
          });
        }
        
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

  useEffect(() => {
    if (!userProfile || movies.length === 0 || isSearchActive) {
      setHeroMovie(null);
      return;
    }
    const favGenre = userProfile.favoriteGenres?.[0];
    if (favGenre) {
        const movie = movies.find(m => m.backdrop_path && !userProfile.movies.some(um => um.tmdbId === m.id));
        if (movie) setHeroMovie({ movie, reason: favGenre });
    }
  }, [movies, userProfile, isSearchActive]);

  const toggleProvider = (id: number) => {
    haptics.soft();
    setSelectedProviders(prev => prev.includes(id) ? prev.filter(p => p !== id) : [...prev, id]);
  };

  const handleQuickAdd = (e: React.MouseEvent, id: number) => {
      e.stopPropagation();
      haptics.medium();
      onSelectMovie(id);
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
            placeholder="Rechercher un film..." 
            className="w-full bg-stone-100/50 hover:bg-stone-100 focus:bg-white border-2 border-transparent focus:border-stone-200 rounded-[2rem] py-5 pl-14 pr-12 text-base font-black outline-none transition-all shadow-sm placeholder:text-stone-300 text-charcoal"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
        />
        {isSearchActive && (
            <button onClick={() => { haptics.soft(); setSearchQuery(''); }} className="absolute inset-y-0 right-4 flex items-center px-2 text-stone-300 hover:text-charcoal">
                <X size={20} strokeWidth={3} />
            </button>
        )}
      </div>

      {/* 2. SORTING */}
      <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Trier par</span>
          </div>
          <div className="flex p-1.5 bg-stone-100 rounded-2xl border border-stone-200/50 w-full">
            <button onClick={() => { haptics.soft(); setSortBy('popularity'); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === 'popularity' ? 'bg-white text-forest shadow-sm' : 'text-stone-400'}`}>
              <Flame size={14} /> Popularité
            </button>
            <button onClick={() => { haptics.soft(); setSortBy('date'); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === 'date' ? 'bg-white text-forest shadow-sm' : 'text-stone-400'}`}>
              <Calendar size={14} /> Date
            </button>
            <button onClick={() => { haptics.soft(); setSortBy('alpha'); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === 'alpha' ? 'bg-white text-forest shadow-sm' : 'text-stone-400'}`}>
              <ArrowUpAZ size={14} /> Titre
            </button>
          </div>
      </div>

      {/* 3. STREAMING PROVIDERS */}
      <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Streaming</span>
              <span className="text-[8px] font-bold text-stone-300 uppercase tracking-widest">FRANCE</span>
          </div>
          <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-6 px-6">
              {PROVIDERS.map(p => {
                  const isActive = selectedProviders.includes(p.id);
                  return (
                      <button key={p.id} onClick={() => toggleProvider(p.id)} className={`flex items-center gap-2 p-1.5 pr-4 rounded-2xl border-2 transition-all shrink-0 ${isActive ? 'bg-charcoal border-charcoal text-white shadow-lg' : 'bg-white border-stone-100 text-stone-400'}`}>
                          <div className="w-8 h-8 rounded-xl bg-stone-100 overflow-hidden shadow-sm flex items-center justify-center">
                            <img src={p.logo} alt={p.name} className="w-full h-full object-cover" />
                          </div>
                          <span className="text-[10px] font-black uppercase tracking-widest">{p.name}</span>
                          {isActive && <Check size={12} strokeWidth={4} className="ml-1 text-forest" />}
                      </button>
                  );
              })}
          </div>
      </div>

      {/* 4. VIBE MATCHING */}
      <div className="space-y-3">
          <div className="flex items-center justify-between px-1">
              <span className="text-[10px] font-black uppercase tracking-widest text-stone-400">Vibe Matching</span>
              {activeVibe && (
                  <button onClick={() => { haptics.soft(); setActiveVibe(null); }} className="text-[9px] font-black text-forest uppercase tracking-widest underline underline-offset-2">Réinitialiser</button>
              )}
          </div>
          <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-6 px-6">
              {VIBES.map(v => {
                  const isActive = activeVibe === v.id;
                  return (
                      <button key={v.id} onClick={() => { haptics.soft(); setActiveVibe(isActive ? null : v.id); }} className={`flex items-center gap-2 px-5 py-3 rounded-full border-2 transition-all shrink-0 text-[10px] font-black uppercase tracking-widest ${isActive ? 'bg-forest border-forest text-white shadow-lg' : 'bg-white border-stone-100 text-stone-400'}`}>
                          {v.icon}
                          {v.label}
                      </button>
                  );
              })}
          </div>
      </div>

      {/* 5. HERO BANNER (RE-INTEGRATED) */}
      {heroMovie && !isSearchActive && (
         <div 
            className="relative w-full aspect-[16/9] rounded-[2.5rem] overflow-hidden shadow-2xl group cursor-pointer animate-[fadeIn_0.6s_ease-out] border border-white/5"
            onClick={() => onSelectMovie(heroMovie.movie.id)}
         >
            <img src={`${TMDB_IMAGE_URL.replace('w780', 'original')}${heroMovie.movie.backdrop_path}`} className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105" alt="" />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/20 to-transparent" />
            <div className="absolute bottom-0 left-0 p-8 w-full z-10">
                <div className="flex items-center gap-3 mb-4">
                    <span className="bg-forest text-white px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg shadow-forest/20 flex items-center gap-1.5">
                        <Sparkles size={10} fill="currentColor" /> Bitter Recommends
                    </span>
                    <span className="text-[9px] font-bold text-white/60 uppercase tracking-widest">Basé sur vos goûts</span>
                </div>
                <h3 className="text-3xl font-black text-white tracking-tighter leading-tight mb-4 line-clamp-2">{heroMovie.movie.title}</h3>
                <button className="bg-white text-charcoal px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 shadow-xl hover:scale-105 active:scale-95 transition-all">
                    <Plus size={16} strokeWidth={3} /> Ajouter à ma liste
                </button>
            </div>
         </div>
      )}

      {/* 6. GRID RESULTS */}
      <div className="space-y-6">
        <div className="flex items-center justify-between px-1">
            {!isSearchActive && !activeVibe && selectedProviders.length === 0 ? (
                <div className="flex gap-2 overflow-x-auto no-scrollbar max-w-[65%]">
                    {nextMonths.map((date, idx) => (
                        <button key={idx} onClick={() => { haptics.soft(); setSelectedMonthIndex(idx); }} className={`whitespace-nowrap px-3 py-1.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${selectedMonthIndex === idx ? 'bg-stone-200 text-charcoal' : 'text-stone-300'}`}>{date.toLocaleDateString('fr-FR', { month: 'short' }).toUpperCase()}</button>
                    ))}
                </div>
            ) : (
                <div className="text-[10px] font-black uppercase tracking-widest text-charcoal">{movies.length} résultats</div>
            )}
        </div>

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
                            <button onClick={(e) => handleQuickAdd(e, movie.id)} className="absolute bottom-4 right-4 w-12 h-12 bg-forest text-white rounded-full flex items-center justify-center shadow-2xl opacity-0 group-hover:opacity-100 translate-y-4 group-hover:translate-y-0 transition-all duration-300 active:scale-90">
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
                            <div className="flex items-center gap-2">
                                <span className="text-[10px] font-bold text-stone-300 tracking-tighter uppercase">{formatDate(movie.release_date)}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
        )}

        {!loading && movies.length === 0 && (
            <div className="py-32 text-center">
                <div className="w-20 h-20 bg-stone-50 rounded-full flex items-center justify-center mx-auto mb-6 text-stone-200"><X size={32} /></div>
                <h3 className="text-xl font-black text-charcoal mb-2">Aucun résultat</h3>
                <p className="text-sm font-medium text-stone-400">Essayez de modifier vos filtres ou votre recherche pour la région FR.</p>
            </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverView;
