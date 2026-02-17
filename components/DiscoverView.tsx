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
  Ticket, 
  Tv, 
  Clock, 
  History,
  Layers
} from 'lucide-react';
import { UserProfile } from '../types';
import { haptics } from '../utils/haptics';
import { deepMovieSearch, AISearchResult } from '../services/ai';
import StreamingBadge from './StreamingBadge';

type SortOption = 'popularity' | 'date' | 'alpha';
type MediaType = 'movie' | 'tv';
type TimePeriod = 'this_month' | 'this_year' | 'all_time';

interface DiscoverViewProps {
  onSelectMovie: (tmdbId: number, mediaType: MediaType) => void;
  onPreview: (tmdbId: number, mediaType: MediaType) => void;
  userProfile: UserProfile | null;
}

interface TMDBItem {
  id: number;
  title?: string;
  name?: string; // For TV
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  release_date?: string;
  first_air_date?: string; // For TV
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
  const [items, setItems] = useState<TMDBItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeVibe, setActiveVibe] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [streamingFilter, setStreamingFilter] = useState<'all' | 'netflix' | 'prime' | 'disney' | 'canal' | 'cinema'>('all');
  const [mediaType, setMediaType] = useState<MediaType>('movie');
  const [timePeriod, setTimePeriod] = useState<TimePeriod>('all_time');
  const [aiResult, setAiResult] = useState<AISearchResult | null>(null);
  const [isAiSearching, setIsAiSearching] = useState(false);

  const isSearchActive = searchQuery.length > 0;

  const getDateRange = () => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    switch (timePeriod) {
      case 'this_month':
        const lastDay = new Date(year, now.getMonth() + 1, 0).getDate();
        return { gte: `${year}-${month}-01`, lte: `${year}-${month}-${lastDay}` };
      case 'this_year': return { gte: `${year}-01-01`, lte: `${year}-12-31` };
      case 'all_time': return null;
    }
  };

  const fetchItems = async () => {
    setLoading(true);
    try {
      let url = "";
      const dateRange = getDateRange();
      const dateFieldGte = mediaType === 'movie' ? 'primary_release_date.gte' : 'first_air_date.gte';
      const dateFieldLte = mediaType === 'movie' ? 'primary_release_date.lte' : 'first_air_date.lte';
      const sortDate = mediaType === 'movie' ? 'primary_release_date.desc' : 'first_air_date.desc';

      if (isSearchActive) {
        url = `${TMDB_BASE_URL}/search/${mediaType}?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&query=${encodeURIComponent(searchQuery)}&page=1&include_adult=false`;
      } else {
        const endpoint = mediaType === 'movie' ? 'discover/movie' : 'discover/tv';
        if (streamingFilter === 'cinema' && mediaType === 'movie') {
          const today = new Date();
          const twoMonthsAgo = new Date();
          twoMonthsAgo.setMonth(today.getMonth() - 2);
          url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&${dateFieldGte}=${twoMonthsAgo.toISOString().split('T')[0]}&${dateFieldLte}=${today.toISOString().split('T')[0]}&with_release_type=2|3&sort_by=popularity.desc&page=1`;
        } else {
          url = `${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&watch_region=FR`;
          if (dateRange) url += `&${dateFieldGte}=${dateRange.gte}&${dateFieldLte}=${dateRange.lte}`;
          if (streamingFilter !== 'all' && streamingFilter !== 'cinema') url += `&with_watch_providers=${streamingFilter}`;
          if (activeVibe) {
            const vibe = VIBES.find(v => v.id === activeVibe);
            if (vibe) url += `&with_genres=${vibe.genres.join(',')}`;
          }
          const sortParam = sortBy === 'popularity' ? 'popularity.desc' : sortBy === 'date' ? sortDate : (mediaType === 'movie' ? 'title.asc' : 'name.asc');
          url += `&sort_by=${sortParam}&page=1`;
        }
      }
      const res = await fetch(url);
      const data = await res.json();
      if (data.results) setItems(data.results.filter((m: any) => m.poster_path));
    } catch (error) { console.error("Discovery error", error); } finally { setLoading(false); }
  };

  useEffect(() => {
    const timer = setTimeout(() => { fetchItems(); }, isSearchActive ? 500 : 0);
    return () => clearTimeout(timer);
  }, [searchQuery, activeVibe, sortBy, streamingFilter, mediaType, timePeriod]);

  const handleDeepSearch = async () => {
    if (!searchQuery) return;
    haptics.medium();
    setIsAiSearching(true);
    setAiResult(null);
    setAiResult(await deepMovieSearch(searchQuery));
    setIsAiSearching(false);
  };

  return (
    <div className="space-y-8 animate-[fadeIn_0.4s_ease-out] pb-24">
      {/* MEDIA TOGGLE */}
      <div className="flex bg-stone-100 dark:bg-[#161616] p-1 rounded-2xl border border-stone-200/50 dark:border-white/5 w-full shadow-inner transition-colors">
         <button onClick={() => { haptics.soft(); setMediaType('movie'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mediaType === 'movie' ? 'bg-charcoal dark:bg-[#202020] text-white shadow-md' : 'text-stone-400 dark:text-stone-600 hover:text-stone-500'}`}><Film size={14} /> FILMS</button>
         <button onClick={() => { haptics.soft(); setMediaType('tv'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mediaType === 'tv' ? 'bg-charcoal dark:bg-[#202020] text-white shadow-md' : 'text-stone-400 dark:text-stone-600 hover:text-stone-500'}`}><Tv size={14} /> SÉRIES</button>
      </div>

      {/* SEARCH BAR */}
      <div className="relative group">
        <div className="absolute inset-y-0 left-5 flex items-center pointer-events-none text-stone-300 dark:text-stone-700 group-focus-within:text-charcoal dark:group-focus-within:text-white transition-colors">
            <Search size={20} strokeWidth={3} />
        </div>
        <input type="text" placeholder={`Rechercher...`} className="w-full bg-stone-100/50 dark:bg-[#161616] hover:bg-stone-100 dark:hover:bg-[#202020] focus:bg-white dark:focus:bg-[#1a1a1a] border-2 border-transparent focus:border-stone-200 dark:focus:border-white/10 rounded-[2rem] py-5 pl-14 pr-32 text-base font-black outline-none transition-all shadow-sm placeholder:text-stone-300 dark:placeholder:text-stone-700 text-charcoal dark:text-white" value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
        <div className="absolute inset-y-0 right-2 flex items-center gap-2">
            {isSearchActive && <button onClick={handleDeepSearch} className="bg-bitter-lime text-charcoal px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg flex items-center gap-2 active:scale-95 transition-transform">{isAiSearching ? <Loader2 size={14} className="animate-spin" /> : <Globe size={14} />} Deep Info</button>}
            {isSearchActive && !isAiSearching && <button onClick={() => { haptics.soft(); setSearchQuery(''); setAiResult(null); }} className="p-2 text-stone-300 dark:text-stone-700 hover:text-charcoal dark:hover:text-white"><X size={20} strokeWidth={3} /></button>}
        </div>
      </div>

      {/* AI RESULT */}
      {aiResult && (
        <div className="bg-stone-900 text-white rounded-[2.5rem] p-8 space-y-6 animate-[slideUp_0.4s_ease-out] border border-bitter-lime/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-bitter-lime/10 blur-3xl rounded-full -translate-y-1/2 translate-x-1/2" />
            <div className="flex items-center gap-3"><div className="p-2 bg-bitter-lime text-charcoal rounded-lg"><Sparkles size={16} fill="currentColor" /></div><h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">Gemini Insight</h3></div>
            <p className="text-sm font-medium leading-relaxed text-stone-300" dangerouslySetInnerHTML={{ __html: aiResult.text }} />
        </div>
      )}

      {/* FILTERS */}
      {!aiResult && (
        <div className="space-y-8 animate-[fadeIn_0.5s_ease-out]">
            <div>
              <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-700 mb-4 px-1 flex items-center gap-2"><Clock size={12} /> Période</h3>
              <div className="grid grid-cols-3 gap-3">
                {[
                    {id:'this_month', l:'Mois', i:<Calendar size={18}/>},
                    {id:'this_year', l:new Date().getFullYear().toString(), i:<Zap size={18}/>},
                    {id:'all_time', l:'Catalogue', i:<Layers size={18}/>}
                ].map(p => (
                    <button key={p.id} onClick={() => { haptics.soft(); setTimePeriod(p.id as TimePeriod); }} className={`flex flex-col items-center justify-center gap-1.5 px-3 py-4 rounded-[1.8rem] transition-all border-2 ${timePeriod === p.id ? 'bg-forest border-forest text-white shadow-xl shadow-forest/10' : 'bg-white dark:bg-[#202020] text-stone-400 dark:text-stone-600 border-stone-100 dark:border-white/5 hover:border-stone-200 dark:hover:border-white/10'}`}>
                        {p.i}<span className="text-[9px] font-black uppercase tracking-widest">{p.l}</span>
                    </button>
                ))}
              </div>
            </div>

            <div>
                <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-700 mb-4 px-1">Plateforme</h3>
                <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                    {PROVIDERS.map((provider) => {
                        if (mediaType === 'tv' && provider.id === 'cinema') return null;
                        const isActive = streamingFilter === provider.id;
                        return (
                            <button key={provider.id} onClick={() => { haptics.soft(); setStreamingFilter(provider.id as any); }} className={`flex-shrink-0 px-4 py-3 rounded-2xl font-bold text-xs transition-all border flex items-center gap-2 ${isActive ? 'bg-charcoal dark:bg-[#202020] text-white border-charcoal dark:border-forest/50 shadow-lg scale-105' : 'bg-white dark:bg-[#202020] text-stone-600 dark:text-stone-500 border-sand dark:border-white/5 hover:border-stone-300 dark:hover:border-white/10 shadow-sm'}`}>
                                {provider.isEmoji ? <span className="text-lg leading-none">{provider.logo}</span> : provider.logo ? <img src={provider.logo} alt="" className="w-5 h-5 object-contain" /> : null}
                                {provider.name}
                            </button>
                        );
                    })}
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex p-1.5 bg-stone-100 dark:bg-[#161616] rounded-2xl border border-stone-200/50 dark:border-white/5 w-full shadow-inner transition-colors">
                {(['popularity', 'date', 'alpha'] as SortOption[]).map((opt) => (
                    <button key={opt} onClick={() => { haptics.soft(); setSortBy(opt); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${sortBy === opt ? 'bg-white dark:bg-[#202020] text-forest dark:text-bitter-lime shadow-sm dark:shadow-black/30' : 'text-stone-400 dark:text-stone-600'}`}>
                    {opt === 'popularity' ? <Flame size={14} /> : opt === 'date' ? <Calendar size={14} /> : <ArrowUpAZ size={14} />} 
                    {opt === 'popularity' ? 'Pop' : opt === 'date' ? 'Date' : 'A-Z'}
                    </button>
                ))}
                </div>
            </div>
        </div>
      )}

      {/* RESULTS GRID */}
      <div className="space-y-6">
        {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4"><Loader2 size={40} className="animate-spin text-charcoal dark:text-white opacity-20" /><p className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-300 dark:text-stone-700">Synchronisation...</p></div>
        ) : items.length === 0 ? (
            <div className="py-24 flex flex-col items-center justify-center text-center px-8 bg-white dark:bg-[#1a1a1a] rounded-[3rem] border border-stone-100 dark:border-white/5 shadow-sm transition-all"><div className="w-16 h-16 bg-stone-50 dark:bg-[#202020] rounded-full flex items-center justify-center text-stone-300 dark:text-stone-700 mb-6"><Search size={24} /></div><h3 className="font-black text-charcoal dark:text-white text-base mb-2">Aucun résultat</h3><p className="text-xs text-stone-500 dark:text-stone-600 max-w-[200px] leading-relaxed">Essaye d'élargir tes critères.</p></div>
        ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 sm:gap-6">
                {items.map(item => (
                    <div key={item.id} onClick={() => { haptics.medium(); onPreview(item.id, mediaType); }} className="group relative flex flex-col gap-3 animate-[fadeIn_0.4s_ease-out] cursor-pointer">
                        <div className="relative aspect-[2/3] rounded-[2.5rem] overflow-hidden shadow-sm dark:shadow-black/20 group-hover:shadow-xl dark:group-hover:shadow-black/40 group-hover:-translate-y-1 transition-all duration-500 bg-stone-100 dark:bg-[#161616]">
                            <img src={`${TMDB_IMAGE_URL}${item.poster_path}`} className="w-full h-full object-cover" alt="" loading="lazy" />
                            <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute top-3 left-3 z-10"><StreamingBadge mediaId={item.id} mediaType={mediaType} releaseDate={item.release_date || item.first_air_date} /></div>
                            <div className="absolute bottom-3 right-3 opacity-0 group-hover:opacity-100 transition-all duration-300 translate-y-2 group-hover:translate-y-0"><button onClick={(e) => { e.stopPropagation(); haptics.medium(); onSelectMovie(item.id, mediaType); }} className="w-10 h-10 bg-forest dark:bg-lime-500 text-white dark:text-black rounded-full flex items-center justify-center shadow-lg"><Plus size={20} strokeWidth={3} /></button></div>
                            {item.vote_average > 0 && <div className="absolute top-3 right-3 bg-black/40 backdrop-blur-md px-2 py-1 rounded-lg flex items-center gap-1 text-[10px] font-black text-white"><Star size={10} fill="currentColor" /> {item.vote_average.toFixed(1)}</div>}
                        </div>
                        <div className="px-1"><h4 className="text-sm font-black text-charcoal dark:text-white leading-tight line-clamp-2 mb-1 group-hover:text-forest dark:group-hover:text-lime-500 transition-colors">{item.title || item.name}</h4><p className="text-xs text-stone-500 dark:text-stone-600 font-semibold">{(item.release_date || item.first_air_date)?.split('-')[0]}</p></div>
                    </div>
                ))}
            </div>
        )}
      </div>
    </div>
  );
};

export default DiscoverView;