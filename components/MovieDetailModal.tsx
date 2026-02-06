
import React, { useEffect, useState } from 'react';
import { X, Calendar, Clock, Star, Play, Eye, Plus, User, Film, Tv, Loader2, ChevronRight } from 'lucide-react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { MovieStatus } from '../types';
import { haptics } from '../utils/haptics';

interface MovieDetailModalProps {
  tmdbId: number;
  isOpen: boolean;
  onClose: () => void;
  onAction: (id: number, status: MovieStatus) => void;
}

interface MovieDetail {
  id: number;
  title: string;
  overview: string;
  poster_path: string;
  backdrop_path: string;
  release_date: string;
  runtime: number;
  vote_average: number;
  genres: { name: string }[];
  credits: {
    crew: { job: string; name: string }[];
    cast: { name: string; character: string; profile_path: string }[];
  };
  'watch/providers': {
    results: {
      FR?: {
        flatrate?: { provider_name: string; logo_path: string }[];
        rent?: { provider_name: string; logo_path: string }[];
        buy?: { provider_name: string; logo_path: string }[];
      };
    };
  };
}

const MovieDetailModal: React.FC<MovieDetailModalProps> = ({ tmdbId, isOpen, onClose, onAction }) => {
  const [movie, setMovie] = useState<MovieDetail | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && tmdbId) {
      const fetchDetails = async () => {
        setLoading(true);
        try {
          const res = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&language=fr-FR&append_to_response=credits,watch/providers`);
          const data = await res.json();
          setMovie(data);
        } catch (e) {
          console.error(e);
        } finally {
          setLoading(false);
        }
      };
      fetchDetails();
    } else {
      setMovie(null);
    }
  }, [isOpen, tmdbId]);

  if (!isOpen) return null;

  const director = movie?.credits.crew.find(c => c.job === 'Director')?.name;
  const cast = movie?.credits.cast.slice(0, 6) || [];
  const providers = movie?.['watch/providers']?.results?.FR?.flatrate || [];

  return (
    <div className="fixed inset-0 z-[80] flex items-end sm:items-center justify-center pointer-events-none">
      <div 
        className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm transition-opacity duration-300 pointer-events-auto" 
        onClick={onClose} 
      />
      
      <div className="bg-cream w-full sm:max-w-md h-[85vh] sm:h-auto sm:max-h-[90vh] rounded-t-[3rem] sm:rounded-[3rem] shadow-2xl relative z-10 flex flex-col animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] pointer-events-auto overflow-hidden">
        
        {loading ? (
           <div className="flex-1 flex flex-col items-center justify-center">
              <Loader2 size={40} className="animate-spin text-forest mb-4" />
           </div>
        ) : movie ? (
          <>
            {/* Header Image */}
            <div className="relative h-64 sm:h-72 shrink-0">
               <img 
                 src={movie.backdrop_path ? `${TMDB_IMAGE_URL}${movie.backdrop_path}` : `${TMDB_IMAGE_URL}${movie.poster_path}`} 
                 className="w-full h-full object-cover"
                 alt={movie.title}
               />
               <div className="absolute inset-0 bg-gradient-to-b from-black/30 via-transparent to-cream" />
               <button 
                 onClick={onClose} 
                 className="absolute top-6 right-6 w-10 h-10 bg-white/20 backdrop-blur-md text-white rounded-full flex items-center justify-center active:scale-90 transition-transform z-20 border border-white/20"
               >
                 <X size={20} strokeWidth={2.5} />
               </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto -mt-12 relative z-10 px-8 pb-32 no-scrollbar">
               {/* Poster & Title Block */}
               <div className="flex gap-5 mb-8">
                  <div className="w-24 aspect-[2/3] rounded-2xl overflow-hidden shadow-xl border-2 border-white shrink-0 -mt-8 bg-stone-200">
                    <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} className="w-full h-full object-cover" alt="" />
                  </div>
                  <div className="flex-1 pt-2">
                     <h2 className="text-2xl font-black text-charcoal leading-tight mb-1 line-clamp-2">{movie.title}</h2>
                     <p className="text-xs font-bold text-stone-400 uppercase tracking-wider mb-2">
                        {movie.release_date?.split('-')[0]} • {director}
                     </p>
                     <div className="flex items-center gap-2">
                        <div className="flex items-center gap-1 bg-charcoal text-white px-2 py-0.5 rounded-md text-[10px] font-black">
                           <Star size={8} fill="currentColor" className="text-bitter-lime" />
                           {movie.vote_average.toFixed(1)}
                        </div>
                        <div className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black text-stone-400 border border-stone-200">
                           <Clock size={8} />
                           {movie.runtime} min
                        </div>
                     </div>
                  </div>
               </div>

               {/* Providers */}
               {providers.length > 0 && (
                 <div className="mb-8">
                   <h3 className="text-[10px] font-black uppercase text-stone-400 tracking-widest mb-3">Disponible sur</h3>
                   <div className="flex gap-3 overflow-x-auto no-scrollbar pb-2">
                     {providers.map(p => (
                       <div key={p.provider_name} className="flex items-center gap-2 bg-white border border-stone-100 pr-3 rounded-xl p-1 shadow-sm">
                          <img src={`${TMDB_IMAGE_URL}${p.logo_path}`} className="w-6 h-6 rounded-lg" alt="" />
                          <span className="text-[10px] font-bold text-charcoal whitespace-nowrap">{p.provider_name}</span>
                       </div>
                     ))}
                   </div>
                 </div>
               )}

               {/* Synopsis */}
               <div className="mb-8">
                 <h3 className="text-[10px] font-black uppercase text-stone-400 tracking-widest mb-3">Synopsis</h3>
                 <p className="text-sm font-medium text-stone-600 leading-relaxed">
                   {movie.overview || "Aucun résumé disponible."}
                 </p>
               </div>

               {/* Cast */}
               <div className="mb-8">
                 <h3 className="text-[10px] font-black uppercase text-stone-400 tracking-widest mb-3">Distribution</h3>
                 <div className="flex gap-4 overflow-x-auto no-scrollbar pb-2 -mx-2 px-2">
                    {cast.map(person => (
                      <div key={person.name} className="w-16 shrink-0 flex flex-col gap-1">
                         <div className="w-16 h-16 rounded-2xl overflow-hidden bg-stone-100 shadow-sm">
                            {person.profile_path ? (
                              <img src={`${TMDB_IMAGE_URL}${person.profile_path}`} className="w-full h-full object-cover" alt="" />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-stone-300"><User size={20} /></div>
                            )}
                         </div>
                         <p className="text-[9px] font-bold text-charcoal leading-tight truncate">{person.name}</p>
                         <p className="text-[8px] font-medium text-stone-400 truncate">{person.character}</p>
                      </div>
                    ))}
                 </div>
               </div>
            </div>

            {/* Sticky Actions */}
            <div className="absolute bottom-0 left-0 right-0 p-6 bg-cream border-t border-sand flex gap-3 z-30">
               <button 
                  onClick={() => { haptics.soft(); onAction(movie.id, 'watched'); }}
                  className="flex-1 bg-charcoal text-white py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl flex items-center justify-center gap-2 active:scale-95 transition-all"
               >
                  <Eye size={18} /> J'ai vu
               </button>
               <button 
                  onClick={() => { haptics.soft(); onAction(movie.id, 'watchlist'); }}
                  className="flex-1 bg-white text-charcoal border border-stone-200 py-4 rounded-2xl font-black text-xs uppercase tracking-widest shadow-sm flex items-center justify-center gap-2 active:scale-95 transition-all"
               >
                  <Plus size={18} /> À voir
               </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
};

export default MovieDetailModal;
