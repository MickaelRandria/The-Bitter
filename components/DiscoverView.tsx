import React, { useState, useEffect, useMemo } from 'react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { Loader2, Plus, Star, CalendarDays, SlidersHorizontal, ArrowUpAZ, Calendar, Flame, Ticket, Tv, Play } from 'lucide-react';
import { UserProfile } from '../types';

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

interface ProviderInfo {
  provider_name: string;
  logo_path: string;
}

type SortOption = 'popularity' | 'date' | 'alpha';

// --- CONFIGURATION DES MOODS & GENRES ---
// Mapping des IDs de genres TMDB pour l'algorithme Hero et les filtres Moods
const GENRE_MAP: Record<string, number> = {
  'Action': 28, 'Adventure': 12, 'Animation': 16, 'Comedy': 35, 'Crime': 80,
  'Documentary': 99, 'Drama': 18, 'Family': 10751, 'Fantasy': 14, 'History': 36,
  'Horror': 27, 'Music': 10402, 'Mystery': 9648, 'Romance': 10749, 'Science Fiction': 878,
  'TV Movie': 10770, 'Thriller': 53, 'War': 10752, 'Western': 37,
  // Mapping des noms français utilisés dans l'app
  'Science-Fiction': 878, 'Drame': 18, 'Comédie': 35, 'Horreur': 27, 'Biopic': 36, 'Aventure': 12
};

const MOODS = [
  { id: 'all', label: 'Tout', emojis: '🌍', genres: [] },
  { id: 'cerebral', label: 'Cérébral', emojis: '🤯', genres: [99, 80, 9648, 36] }, // Doc, Crime, Mystère, Histoire
  { id: 'fun', label: 'Divertissement', emojis: '🍿', genres: [28, 12, 16, 878, 14] }, // Action, Adv, Anim, SciFi, Fantasy
  { id: 'lol', label: 'Rigolade', emojis: '😂', genres: [35, 10751] }, // Comédie, Famille
  { id: 'scary', label: 'Frisson', emojis: '😨', genres: [27, 53] }, // Horreur, Thriller
  { id: 'feels', label: 'Émotion', emojis: '🥰', genres: [18, 10749] }, // Drame, Romance
];

const DiscoverView: React.FC<DiscoverViewProps> = ({ onSelectMovie, userProfile }) => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  const [activeMood, setActiveMood] = useState<string>('all');
  const [heroMovie, setHeroMovie] = useState<{ movie: TMDBMovie, reason: string } | null>(null);
  
  const [providersMap, setProvidersMap] = useState<Record<number, ProviderInfo | 'cinema'>>({});

  const nextMonths = useMemo(() => {
    const months = [];
    for (let i = 0; i < 6; i++) {
      const d = new Date();
      d.setMonth(d.getMonth() + i);
      months.push(d);
    }
    return months;
  }, []);

  useEffect(() => {
    const fetchMoviesByMonth = async () => {
      setLoading(true);
      setProvidersMap({});
      try {
        const targetDate = nextMonths[selectedMonthIndex];
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;
        
        const firstDay = `${year}-${month.toString().padStart(2, '0')}-01`;
        const lastDayObj = new Date(year, month, 0); 
        const lastDay = `${lastDayObj.getFullYear()}-${(lastDayObj.getMonth() + 1).toString().padStart(2, '0')}-${lastDayObj.getDate()}`;

        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&sort_by=popularity.desc&include_adult=false&include_video=false&page=1&primary_release_date.gte=${firstDay}&primary_release_date.lte=${lastDay}`;

        const res = await fetch(url);
        const data = await res.json();
        
        if (data.results) {
          const validMovies = data.results.filter((m: TMDBMovie) => m.release_date);
          setMovies(validMovies);
          fetchProviders(validMovies);
        }
      } catch (error) {
        console.error("Failed to fetch movies", error);
      } finally {
        setLoading(false);
      }
    };

    fetchMoviesByMonth();
  }, [selectedMonthIndex, nextMonths]);

  // --- LOGIQUE HERO PERSONNALISÉ ---
  useEffect(() => {
    if (!userProfile || movies.length === 0) {
      setHeroMovie(null);
      return;
    }

    // 1. Déterminer le genre préféré de l'utilisateur
    const genreCounts: Record<string, number> = {};
    userProfile.movies.forEach(m => {
        const g = m.genre;
        genreCounts[g] = (genreCounts[g] || 0) + 1;
    });

    const favoriteGenreName = Object.keys(genreCounts).reduce((a, b) => genreCounts[a] > genreCounts[b] ? a : b, '');
    
    if (!favoriteGenreName) return;

    // 2. Convertir le nom du genre en ID TMDB
    const favoriteGenreId = GENRE_MAP[favoriteGenreName];
    if (!favoriteGenreId) return;

    // 3. Trouver un film à l'affiche correspondant
    // On exclut les films déjà dans la liste de l'utilisateur (par ID TMDB)
    const existingIds = new Set(userProfile.movies.map(m => m.tmdbId).filter(Boolean));
    
    const recommendation = movies.find(m => 
      m.genre_ids && 
      m.genre_ids.includes(favoriteGenreId) && 
      !existingIds.has(m.id) &&
      m.backdrop_path // Il faut une belle image pour le Hero
    );

    if (recommendation) {
      setHeroMovie({
        movie: recommendation,
        reason: favoriteGenreName
      });
    } else {
        setHeroMovie(null);
    }

  }, [userProfile, movies]);


  const fetchProviders = async (movieList: TMDBMovie[]) => {
      const newProviders: Record<number, ProviderInfo | 'cinema'> = {};
      const promises = movieList.map(async (movie) => {
          try {
              const res = await fetch(`${TMDB_BASE_URL}/movie/${movie.id}/watch/providers?api_key=${TMDB_API_KEY}`);
              const data = await res.json();
              if (data.results && data.results.FR) {
                  const frData = data.results.FR;
                  if (frData.flatrate && frData.flatrate.length > 0) {
                      newProviders[movie.id] = {
                          provider_name: frData.flatrate[0].provider_name,
                          logo_path: frData.flatrate[0].logo_path
                      };
                  } else {
                      newProviders[movie.id] = 'cinema';
                  }
              } else {
                  newProviders[movie.id] = 'cinema';
              }
          } catch (e) {
              newProviders[movie.id] = 'cinema';
          }
      });
      await Promise.all(promises);
      setProvidersMap(prev => ({ ...prev, ...newProviders }));
  };

  const filteredMovies = useMemo(() => {
    let m = [...movies];
    
    // Filtre par Mood
    if (activeMood !== 'all') {
      const mood = MOODS.find(mood => mood.id === activeMood);
      if (mood) {
        m = m.filter(movie => movie.genre_ids.some(id => mood.genres.includes(id)));
      }
    }

    if (sortBy === 'alpha') {
      return m.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'popularity') {
      return m.sort((a, b) => b.popularity - a.popularity);
    } else {
      return m.sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime());
    }
  }, [movies, sortBy, activeMood]);

  const formatDateShort = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).toUpperCase().replace('.', '');
  };

  const formatMonthLabel = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { month: 'long', year: '2-digit' });
  };

  const renderProviderBadge = (movieId: number) => {
      const info = providersMap[movieId];
      if (!info) return null;
      if (info === 'cinema') {
          return (
              <div className="absolute top-2 left-2 bg-charcoal text-white px-2 py-1 rounded-lg flex items-center gap-1.5 shadow-lg z-10 animate-[fadeIn_0.5s_ease-out]">
                  <Ticket size={10} strokeWidth={2.5} />
                  <span className="text-[9px] font-black uppercase tracking-wider">Cinéma</span>
              </div>
          );
      } else {
          return (
              <div className="absolute top-2 left-2 bg-white text-charcoal pl-1 pr-2 py-1 rounded-lg flex items-center gap-1.5 shadow-lg z-10 animate-[fadeIn_0.5s_ease-out]">
                  <img src={`${TMDB_IMAGE_URL}${info.logo_path}`} alt={info.provider_name} className="w-4 h-4 rounded-md object-cover" />
                  <span className="text-[9px] font-black uppercase tracking-wider max-w-[60px] truncate">{info.provider_name}</span>
              </div>
          );
      }
  };

  return (
    <div className="animate-[fadeIn_0.4s_ease-out]">
      <div className="mt-2 mb-6">
         <h2 className="text-3xl font-black text-charcoal tracking-tight">À l'affiche</h2>
         <p className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.15em] mt-1">SORTIES CINÉMA & STREAMING</p>
      </div>

      {/* --- SECTION HERO (Recommandation Personnalisée) --- */}
      {heroMovie && activeMood === 'all' && (
         <div className="w-full relative rounded-[2.5rem] overflow-hidden shadow-2xl mb-10 aspect-[16/9] sm:aspect-[21/9] group cursor-pointer" onClick={() => onSelectMovie(heroMovie.movie.id)}>
            <img 
               src={`${TMDB_IMAGE_URL.replace('w780', 'original')}${heroMovie.movie.backdrop_path}`} 
               alt={heroMovie.movie.title}
               className="w-full h-full object-cover transition-transform duration-1000 group-hover:scale-105"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/40 to-transparent" />
            <div className="absolute bottom-0 left-0 p-6 sm:p-10 w-full">
               <div className="flex items-center gap-2 mb-2 animate-[fadeIn_0.5s_ease-out]">
                   <span className="bg-forest text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-2">
                      <Star size={10} fill="currentColor" /> {heroMovie.reason}
                   </span>
                   <span className="text-[10px] font-bold text-white/60 uppercase tracking-widest">Recommandé pour vous</span>
               </div>
               <h3 className="text-3xl sm:text-5xl font-black text-white tracking-tighter leading-none mb-4 max-w-2xl">{heroMovie.movie.title}</h3>
               <p className="text-white/80 text-sm font-medium line-clamp-2 max-w-xl mb-6 hidden sm:block">{heroMovie.movie.overview}</p>
               
               <button className="bg-white text-charcoal px-6 py-3 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center gap-2 hover:scale-105 active:scale-95 transition-all">
                  <Play size={14} fill="currentColor" /> Ajouter à ma liste
               </button>
            </div>
         </div>
      )}

      {/* --- MOOD PICKER --- */}
      <div className="flex gap-3 overflow-x-auto pb-6 mb-2 no-scrollbar -mx-6 px-6">
         {MOODS.map(mood => (
            <button
               key={mood.id}
               onClick={() => setActiveMood(mood.id)}
               className={`whitespace-nowrap px-6 py-3 rounded-full text-[11px] font-black uppercase tracking-widest transition-all duration-300 border flex items-center gap-2 ${activeMood === mood.id ? 'bg-charcoal text-white border-charcoal shadow-lg scale-105' : 'bg-white text-stone-400 border-sand hover:border-stone-300'}`}
            >
               <span className="text-sm">{mood.emojis}</span> {mood.label}
            </button>
         ))}
      </div>

      {/* --- FILTRES MOIS & TRI --- */}
      <div className="flex items-center justify-between mb-4">
          <div className="flex gap-2 overflow-x-auto no-scrollbar max-w-[70%]">
            {nextMonths.map((date, index) => {
               const isActive = index === selectedMonthIndex;
               const label = formatMonthLabel(date);
               return (
                <button 
                    key={index} 
                    onClick={() => setSelectedMonthIndex(index)} 
                    className={`whitespace-nowrap px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${isActive ? 'bg-stone-200 text-charcoal' : 'text-stone-400 hover:text-stone-600'}`}
                >
                    {label.split(' ')[0]}
                </button>
               );
            })}
          </div>
          
          <div className="flex items-center gap-2 group cursor-pointer bg-white border border-sand px-3 py-1.5 rounded-xl shadow-sm hover:border-stone-300 transition-colors">
            {sortBy === 'popularity' ? <Flame size={12} /> : sortBy === 'alpha' ? <ArrowUpAZ size={12} /> : <Calendar size={12} />}
            <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as SortOption)} 
                className="bg-transparent text-[10px] font-black uppercase text-charcoal outline-none cursor-pointer tracking-widest appearance-none pr-4 relative z-10"
            >
                <option value="popularity">Top</option>
                <option value="date">Date</option>
                <option value="alpha">A-Z</option>
            </select>
            <SlidersHorizontal size={10} className="text-stone-400 absolute right-3 pointer-events-none" />
         </div>
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-[30vh] text-stone-300 gap-3">
          <Loader2 size={32} className="animate-spin text-forest" />
          <p className="text-xs font-black uppercase tracking-widest">Recherche des séances...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-24">
            {filteredMovies.map((movie, index) => (
            <div key={movie.id} className="group relative flex flex-col items-start text-left">
                <button onClick={() => onSelectMovie(movie.id)} className="w-full relative group/poster">
                    <div className="w-full aspect-[2/3] rounded-3xl overflow-hidden bg-stone-100 shadow-sm relative mb-3 group-hover/poster:shadow-xl transition-all duration-300">
                        {movie.poster_path ? (
                            <img 
                                src={`${TMDB_IMAGE_URL}${movie.poster_path}`} 
                                alt={movie.title} 
                                className="w-full h-full object-cover transition-transform duration-700 group-hover/poster:scale-105"
                                loading="lazy"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-300">
                                <span className="text-[10px] font-black uppercase tracking-widest">Sans Affiche</span>
                            </div>
                        )}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/poster:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[1px]">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-charcoal shadow-2xl scale-50 group-hover/poster:scale-100 transition-all duration-300 delay-75">
                                <Plus size={24} strokeWidth={3} />
                            </div>
                        </div>
                        {renderProviderBadge(movie.id)}
                        {sortBy === 'popularity' && activeMood === 'all' && index < 3 && (
                             <div className="absolute bottom-2 left-2 w-6 h-6 bg-charcoal text-white rounded-full flex items-center justify-center text-[10px] font-black shadow-lg z-10 border border-white/10">
                                #{index + 1}
                             </div>
                        )}
                        {movie.vote_average > 0 && (
                            <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md text-white px-2 py-1 rounded-lg flex items-center gap-1">
                                <Star size={10} fill="currentColor" className="text-tz-yellow" />
                                <span className="text-[10px] font-bold">{movie.vote_average.toFixed(1)}</span>
                            </div>
                        )}
                    </div>
                </button>
                <h3 className="font-black text-sm text-charcoal leading-tight line-clamp-2 group-hover:text-forest transition-colors w-full">{movie.title}</h3>
                <div className="flex items-center gap-2 mt-2 opacity-60">
                    <div className="w-5 h-5 rounded-full bg-sand flex items-center justify-center text-charcoal">
                        <CalendarDays size={10} strokeWidth={2.5} />
                    </div>
                    <span className="text-[10px] font-black tracking-wider uppercase text-forest">
                        {formatDateShort(movie.release_date)}
                    </span>
                </div>
            </div>
            ))}
            
            {filteredMovies.length === 0 && (
                 <div className="col-span-full py-20 text-center opacity-40">
                    <p className="text-sm font-bold text-charcoal">Aucun film pour cette humeur.</p>
                 </div>
            )}
        </div>
      )}
    </div>
  );
};

export default DiscoverView;
