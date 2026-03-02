import React, { useState, useEffect } from 'react';
import { X, Star, Loader2, Film } from 'lucide-react';
import { TMDB_IMAGE_URL } from '../constants';
import { getDirectorMovies, searchPerson } from '../services/tmdb';
import { haptics } from '../utils/haptics';

interface DirectorMoviesModalProps {
  directorName: string;
  directorId?: number;
  onClose: () => void;
  onSelectMovie: (tmdbId: number) => void;
}

const DirectorMoviesModal: React.FC<DirectorMoviesModalProps> = ({ directorName, directorId, onClose, onSelectMovie }) => {
  const [movies, setMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchMovies = async () => {
      setLoading(true);
      setError(null);
      try {
        let id = directorId;
        if (!id) {
          id = await searchPerson(directorName) || undefined;
        }

        if (id) {
          const results = await getDirectorMovies(id);
          setMovies(results);
        } else {
          setError("Réalisateur non trouvé");
        }
      } catch (err) {
        console.error(err);
        setError("Erreur lors de la récupération des films");
      } finally {
        setLoading(false);
      }
    };

    fetchMovies();
  }, [directorName, directorId]);

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4 animate-[fadeIn_0.3s_ease-out]">
      <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" onClick={onClose} />
      
      <div className="relative w-full max-w-2xl bg-[#0c0c0c] text-white rounded-t-[3rem] sm:rounded-[3rem] overflow-hidden shadow-2xl border border-white/10 flex flex-col max-h-[90vh] sm:max-h-[80vh] animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        
        {/* HEADER */}
        <div className="p-8 pb-4 flex justify-between items-start">
          <div className="flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.3em] text-bitter-lime mb-2">Top Films</p>
            <h2 className="text-4xl sm:text-5xl font-black uppercase tracking-tighter leading-none break-words">
              {directorName}
            </h2>
          </div>
          <button 
            onClick={onClose}
            className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center hover:bg-white/10 transition-colors shrink-0"
          >
            <X size={24} />
          </button>
        </div>

        {/* CONTENT */}
        <div className="flex-1 overflow-y-auto no-scrollbar p-8 pt-4">
          {loading ? (
            <div className="py-20 flex flex-col items-center justify-center gap-4">
              <Loader2 size={40} className="animate-spin text-bitter-lime opacity-50" />
              <p className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-500">Exploration de la filmographie...</p>
            </div>
          ) : error ? (
            <div className="py-20 text-center">
              <p className="text-stone-500 font-medium">{error}</p>
            </div>
          ) : movies.length === 0 ? (
            <div className="py-20 text-center">
              <p className="text-stone-500 font-medium">Aucun film trouvé pour ce réalisateur.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {movies.map((movie) => (
                <div 
                  key={movie.id}
                  onClick={() => { haptics.medium(); onSelectMovie(movie.id); }}
                  className="group flex items-center gap-4 p-4 rounded-3xl bg-white/5 hover:bg-white/10 border border-white/5 transition-all cursor-pointer active:scale-[0.98]"
                >
                  <div className="w-16 aspect-[2/3] rounded-xl overflow-hidden bg-stone-900 shrink-0 shadow-lg">
                    {movie.poster_path ? (
                      <img 
                        src={`${TMDB_IMAGE_URL}${movie.poster_path}`} 
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500" 
                        alt="" 
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-white/10">
                        <Film size={20} />
                      </div>
                    )}
                  </div>
                  
                  <div className="flex-1 min-w-0">
                    <h4 className="font-black text-lg leading-tight truncate group-hover:text-bitter-lime transition-colors">
                      {movie.title}
                    </h4>
                    <p className="text-xs font-bold text-stone-500 uppercase mt-1">
                      {movie.release_date ? movie.release_date.split('-')[0] : 'N/A'}
                    </p>
                  </div>

                  <div className="flex flex-col items-end gap-1">
                    <div className="flex items-center gap-1.5 bg-black/40 px-3 py-1.5 rounded-full border border-white/10">
                      <Star size={12} fill="#D9FF00" className="text-bitter-lime" />
                      <span className="text-sm font-black text-white">
                        {movie.vote_average ? movie.vote_average.toFixed(1) : '—'}
                      </span>
                    </div>
                    <span className="text-[8px] font-black uppercase tracking-widest text-stone-600">
                      {movie.vote_count} votes
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* FOOTER HINT */}
        <div className="p-8 pt-0 text-center">
            <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-700">
                Clique sur un film pour voir les détails
            </p>
        </div>
      </div>
    </div>
  );
};

export default DirectorMoviesModal;
