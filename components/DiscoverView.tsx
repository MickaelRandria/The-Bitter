import React, { useState, useEffect, useMemo } from 'react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { Loader2, Plus, Star, CalendarDays, SlidersHorizontal, ArrowUpAZ, Calendar, Flame, Ticket, Tv } from 'lucide-react';

interface DiscoverViewProps {
  onSelectMovie: (tmdbId: number) => void;
}

interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string;
  vote_average: number;
  release_date: string;
  popularity: number;
}

interface ProviderInfo {
  provider_name: string;
  logo_path: string;
}

type SortOption = 'popularity' | 'date' | 'alpha';

const DiscoverView: React.FC<DiscoverViewProps> = ({ onSelectMovie }) => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonthIndex, setSelectedMonthIndex] = useState(0);
  const [sortBy, setSortBy] = useState<SortOption>('popularity');
  
  // Stockage des infos de diffusion (Cinema vs Streaming)
  const [providersMap, setProvidersMap] = useState<Record<number, ProviderInfo | 'cinema'>>({});

  // Générer les 6 prochains mois
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
      setProvidersMap({}); // Reset providers on month change
      try {
        const targetDate = nextMonths[selectedMonthIndex];
        
        const year = targetDate.getFullYear();
        const month = targetDate.getMonth() + 1;
        
        const firstDay = `${year}-${month.toString().padStart(2, '0')}-01`;
        const lastDayObj = new Date(year, month, 0); 
        const lastDay = `${lastDayObj.getFullYear()}-${(lastDayObj.getMonth() + 1).toString().padStart(2, '0')}-${lastDayObj.getDate()}`;

        // Note: Suppression de with_release_type=2|3 pour inclure les sorties directes en streaming
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&sort_by=popularity.desc&include_adult=false&include_video=false&page=1&primary_release_date.gte=${firstDay}&primary_release_date.lte=${lastDay}`;

        const res = await fetch(url);
        const data = await res.json();
        
        if (data.results) {
          const validMovies = data.results.filter((m: TMDBMovie) => m.release_date);
          setMovies(validMovies);
          
          // Lancer la récupération des providers en arrière-plan pour ces films
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

  // Fonction pour récupérer les providers (Netflix, etc.) ou déterminer si c'est Cinéma
  const fetchProviders = async (movieList: TMDBMovie[]) => {
      const newProviders: Record<number, ProviderInfo | 'cinema'> = {};
      
      // On utilise Promise.all pour paralléliser mais on limite à la liste affichée pour ne pas exploser les quotas
      const promises = movieList.map(async (movie) => {
          try {
              const res = await fetch(`${TMDB_BASE_URL}/movie/${movie.id}/watch/providers?api_key=${TMDB_API_KEY}`);
              const data = await res.json();
              
              if (data.results && data.results.FR) {
                  const frData = data.results.FR;
                  
                  // Priorité au Streaming par abonnement (Flatrate)
                  if (frData.flatrate && frData.flatrate.length > 0) {
                      // On prend le premier provider (souvent le plus important)
                      newProviders[movie.id] = {
                          provider_name: frData.flatrate[0].provider_name,
                          logo_path: frData.flatrate[0].logo_path
                      };
                  } else {
                      // Si pas de streaming, on assume Cinéma pour les films récents/à venir
                      // (Ou VOD achat/location, mais on simplifie en Cinéma/Physique pour l'affichage "À l'affiche")
                      newProviders[movie.id] = 'cinema';
                  }
              } else {
                  // Pas d'info provider spécifique => Probablement sortie salle classique à venir
                  newProviders[movie.id] = 'cinema';
              }
          } catch (e) {
              newProviders[movie.id] = 'cinema';
          }
      });

      await Promise.all(promises);
      setProvidersMap(prev => ({ ...prev, ...newProviders }));
  };

  const sortedMovies = useMemo(() => {
    const m = [...movies];
    if (sortBy === 'alpha') {
      return m.sort((a, b) => a.title.localeCompare(b.title));
    } else if (sortBy === 'popularity') {
      return m.sort((a, b) => b.popularity - a.popularity);
    } else {
      return m.sort((a, b) => new Date(a.release_date).getTime() - new Date(b.release_date).getTime());
    }
  }, [movies, sortBy]);

  const formatDateShort = (dateString: string) => {
    if (!dateString) return 'N/A';
    const date = new Date(dateString);
    return date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'short' }).toUpperCase().replace('.', '');
  };

  const formatMonthLabel = (date: Date) => {
    return date.toLocaleDateString('fr-FR', { month: 'long', year: '2-digit' });
  };

  const getSortIcon = () => {
      switch(sortBy) {
          case 'popularity': return <Flame size={12} className="text-charcoal" fill="currentColor" />;
          case 'alpha': return <ArrowUpAZ size={12} className="text-charcoal" />;
          default: return <Calendar size={12} className="text-charcoal" />;
      }
  };

  const renderProviderBadge = (movieId: number) => {
      const info = providersMap[movieId];
      
      if (!info) return null; // Loading state invisible

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
                  <img 
                      src={`${TMDB_IMAGE_URL}${info.logo_path}`} 
                      alt={info.provider_name} 
                      className="w-4 h-4 rounded-md object-cover"
                  />
                  <span className="text-[9px] font-black uppercase tracking-wider max-w-[60px] truncate">{info.provider_name}</span>
              </div>
          );
      }
  };

  return (
    <div className="animate-[fadeIn_0.4s_ease-out]">
      <div className="mt-2 mb-6 flex items-end justify-between">
         <div>
            <h2 className="text-3xl font-black text-charcoal tracking-tight">À l'affiche</h2>
            <p className="text-[10px] font-bold text-stone-300 uppercase tracking-[0.15em] mt-1">SORTIES CINÉMA & STREAMING</p>
         </div>
         
         {/* Sort Control */}
         <div className="flex items-center gap-2 mb-1 group cursor-pointer bg-white border border-sand px-3 py-1.5 rounded-xl shadow-sm hover:border-stone-300 transition-colors">
            {getSortIcon()}
            <select 
                value={sortBy} 
                onChange={(e) => setSortBy(e.target.value as SortOption)} 
                className="bg-transparent text-[10px] font-black uppercase text-charcoal outline-none cursor-pointer tracking-widest appearance-none pr-4 relative z-10"
            >
                <option value="popularity">Populaire</option>
                <option value="date">Date</option>
                <option value="alpha">A-Z</option>
            </select>
            <SlidersHorizontal size={10} className="text-stone-400 absolute right-3 pointer-events-none" />
         </div>
      </div>

      {/* Month Selector */}
      <div className="flex gap-2.5 overflow-x-auto pb-4 mb-2 no-scrollbar -mx-6 px-6">
        {nextMonths.map((date, index) => {
           const isActive = index === selectedMonthIndex;
           const label = formatMonthLabel(date);
           const formattedLabel = label.charAt(0).toUpperCase() + label.slice(1);
           
           return (
            <button 
                key={index} 
                onClick={() => setSelectedMonthIndex(index)} 
                className={`whitespace-nowrap px-5 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all duration-300 ${isActive ? 'bg-charcoal text-white shadow-lg shadow-charcoal/20 scale-105' : 'bg-white border border-sand text-stone-400 hover:border-stone-200'}`}
            >
                {formattedLabel}
            </button>
           );
        })}
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center h-[40vh] text-stone-300 gap-3">
          <Loader2 size={32} className="animate-spin text-forest" />
          <p className="text-xs font-black uppercase tracking-widest">Recherche des séances...</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pb-24">
            {sortedMovies.map((movie, index) => (
            <div key={movie.id} className="group relative flex flex-col items-start text-left">
                {/* Main Clickable Area for Adding Movie */}
                <button 
                    onClick={() => onSelectMovie(movie.id)}
                    className="w-full relative group/poster"
                >
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
                        
                        {/* Overlay with Add Button */}
                        <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/poster:opacity-100 transition-opacity duration-300 flex items-center justify-center backdrop-blur-[1px]">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center text-charcoal shadow-2xl scale-50 group-hover/poster:scale-100 transition-all duration-300 delay-75">
                                <Plus size={24} strokeWidth={3} />
                            </div>
                        </div>

                        {/* Provider / Cinema Badge (Top Left) */}
                        {renderProviderBadge(movie.id)}

                        {/* Top 3 Popularity Badge (Si on trie par popularité, on l'affiche en bas à gauche pour ne pas gêner le provider) */}
                        {sortBy === 'popularity' && index < 3 && (
                             <div className="absolute bottom-2 left-2 w-6 h-6 bg-charcoal text-white rounded-full flex items-center justify-center text-[10px] font-black shadow-lg z-10 border border-white/10">
                                #{index + 1}
                             </div>
                        )}

                        {/* Rating Badge */}
                        {movie.vote_average > 0 && (
                            <div className="absolute top-2 right-2 bg-black/40 backdrop-blur-md text-white px-2 py-1 rounded-lg flex items-center gap-1">
                                <Star size={10} fill="currentColor" className="text-tz-yellow" />
                                <span className="text-[10px] font-bold">{movie.vote_average.toFixed(1)}</span>
                            </div>
                        )}
                    </div>
                </button>
                
                <h3 className="font-black text-sm text-charcoal leading-tight line-clamp-2 group-hover:text-forest transition-colors w-full">
                    {movie.title}
                </h3>
                
                {/* Precise Release Date */}
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
            
            {sortedMovies.length === 0 && (
                 <div className="col-span-full py-20 text-center opacity-40">
                    <p className="text-sm font-bold text-charcoal">Aucune sortie majeure trouvée.</p>
                 </div>
            )}
        </div>
      )}
    </div>
  );
};

export default DiscoverView;