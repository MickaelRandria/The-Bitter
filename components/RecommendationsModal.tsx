import React, { useState, useEffect } from 'react';
import { X, Sparkles, Plus, Check, Loader2, Calendar } from 'lucide-react';
import { Movie, MovieFormData } from '../types';
import { getRecommendations, getMovieDetailsForAdd } from '../services/tmdb';
import { TMDB_IMAGE_URL } from '../constants';
import { haptics } from '../utils/haptics';

interface RecommendationsModalProps {
  sourceMovie: Movie | null;
  isOpen: boolean;
  onClose: () => void;
  onAddMovie: (movie: MovieFormData) => void;
  existingTmdbIds: Set<number>;
}

const RecommendationsModal: React.FC<RecommendationsModalProps> = ({ sourceMovie, isOpen, onClose, onAddMovie, existingTmdbIds }) => {
  const [recommendations, setRecommendations] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [addingId, setAddingId] = useState<number | null>(null);

  useEffect(() => {
    if (isOpen && sourceMovie && sourceMovie.tmdbId) {
      const fetchRecs = async () => {
        setLoading(true);
        const recs = await getRecommendations(sourceMovie.tmdbId!);
        // Filtrer les films déjà dans la collection et ceux sans poster
        const filtered = recs.filter(r => r.poster_path && !existingTmdbIds.has(r.id)).slice(0, 6);
        setRecommendations(filtered);
        setLoading(false);
      };
      fetchRecs();
    } else {
        setRecommendations([]);
    }
  }, [isOpen, sourceMovie, existingTmdbIds]);

  const handleAdd = async (tmdbId: number) => {
      setAddingId(tmdbId);
      haptics.soft();
      const movieData = await getMovieDetailsForAdd(tmdbId);
      if (movieData) {
          onAddMovie(movieData);
          haptics.success();
      }
      setAddingId(null);
  };

  if (!isOpen || !sourceMovie) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      
      <div className="relative z-10 bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-[scaleIn_0.3s_ease-out]">
        {/* Header */}
        <div className="p-8 pb-6 border-b border-sand bg-stone-50/50">
           <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <div className="p-3 bg-forest text-white rounded-2xl shadow-lg shadow-forest/20">
                        <Sparkles size={24} className="animate-pulse" />
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-charcoal tracking-tight leading-none">Parce que tu as vu...</h3>
                        <p className="text-sm font-bold text-stone-400 mt-1 truncate max-w-[200px] sm:max-w-md">"{sourceMovie.title}"</p>
                    </div>
                </div>
                <button onClick={onClose} className="p-3 bg-white border border-sand rounded-full text-stone-400 hover:text-charcoal hover:border-stone-300 transition-all active:scale-90">
                    <X size={20} strokeWidth={2.5} />
                </button>
           </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 sm:p-8 no-scrollbar bg-white">
            {loading ? (
                <div className="flex flex-col items-center justify-center py-20 gap-4 opacity-50">
                    <Loader2 size={40} className="animate-spin text-forest" />
                    <p className="text-[10px] font-black uppercase tracking-widest text-stone-400">Analyse de vos goûts...</p>
                </div>
            ) : recommendations.length === 0 ? (
                <div className="text-center py-20 opacity-40">
                    <p className="font-bold text-stone-400">Aucune recommandation trouvée pour ce film.</p>
                </div>
            ) : (
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                    {recommendations.map(movie => {
                        const isAdded = existingTmdbIds.has(movie.id);
                        const isAdding = addingId === movie.id;

                        return (
                            <div key={movie.id} className="group relative flex flex-col text-left animate-[fadeIn_0.5s_ease-out]">
                                <div className="w-full aspect-[2/3] rounded-3xl overflow-hidden bg-stone-100 mb-3 shadow-sm group-hover:shadow-xl transition-all relative">
                                    <img 
                                        src={`${TMDB_IMAGE_URL}${movie.poster_path}`} 
                                        alt={movie.title} 
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700"
                                    />
                                    {/* Action Button Overlay */}
                                    <div className={`absolute inset-0 bg-black/40 transition-opacity duration-300 flex items-center justify-center ${isAdding ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                                        <button 
                                            onClick={() => !isAdded && !isAdding && handleAdd(movie.id)}
                                            disabled={isAdded || isAdding}
                                            className={`w-14 h-14 rounded-full flex items-center justify-center shadow-2xl scale-0 group-hover:scale-100 transition-all duration-300 delay-75 ${isAdded ? 'bg-forest text-white cursor-default' : 'bg-white text-charcoal hover:scale-110 active:scale-90'}`}
                                        >
                                            {isAdding ? <Loader2 size={24} className="animate-spin" /> : (isAdded ? <Check size={24} strokeWidth={3} /> : <Plus size={24} strokeWidth={3} />)}
                                        </button>
                                    </div>
                                    
                                    {movie.vote_average > 0 && (
                                        <div className="absolute top-2 right-2 bg-black/50 backdrop-blur-md text-white px-2 py-1 rounded-lg text-[9px] font-bold">
                                            {movie.vote_average.toFixed(1)}
                                        </div>
                                    )}
                                </div>
                                
                                <h4 className="font-black text-xs text-charcoal leading-tight uppercase tracking-tighter line-clamp-2 mb-1 group-hover:text-forest transition-colors">
                                    {movie.title}
                                </h4>
                                <div className="flex items-center gap-1.5 text-stone-400 opacity-80">
                                    <Calendar size={10} />
                                    <span className="text-[9px] font-bold">{movie.release_date?.split('-')[0] || 'N/A'}</span>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
        
        <div className="p-6 bg-stone-50 border-t border-sand text-center">
             <p className="text-[9px] font-black text-stone-300 uppercase tracking-widest">Powered by TMDB AI</p>
        </div>
      </div>
    </div>
  );
};

export default RecommendationsModal;