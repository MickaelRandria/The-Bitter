import React, { useState, useEffect, useMemo } from 'react';
import { X, Loader2, Star, CalendarDays, TrendingUp, Film } from 'lucide-react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';

interface FilmographyModalProps {
  personId: number;
  personName: string;
  isOpen: boolean;
  onClose: () => void;
  onSelectMovie: (tmdbId: number) => void;
}

const FilmographyModal: React.FC<FilmographyModalProps> = ({ personId, personName, isOpen, onClose, onSelectMovie }) => {
  const [movies, setMovies] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (isOpen && personId) {
      const fetchFilmography = async () => {
        setLoading(true);
        try {
          const res = await fetch(`${TMDB_BASE_URL}/person/${personId}/movie_credits?api_key=${TMDB_API_KEY}&language=fr-FR`);
          const data = await res.json();
          
          // Combiner cast et crew (certains réalisateurs jouent aussi)
          const allCredits = [...(data.cast || []), ...(data.crew || [])];
          
          // Enlever les doublons (ID de film) et les films sans poster
          const uniqueMovies = Array.from(new Map(allCredits.map(item => [item['id'], item])).values())
            .filter((m: any) => m.poster_path);

          // Trier par popularité et prendre les 10 premiers
          const topMovies = uniqueMovies
            .sort((a: any, b: any) => b.popularity - a.popularity)
            .slice(0, 10);

          setMovies(topMovies);
        } catch (error) {
          console.error("Erreur filmographie:", error);
        } finally {
          setLoading(false);
        }
      };
      fetchFilmography();
    }
  }, [isOpen, personId]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      
      <div className="relative z-10 bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-[scaleIn_0.3s_ease-out]">
        <div className="p-6 flex justify-between items-center border-b border-sand">
          <div>
            <h3 className="text-2xl font-black text-charcoal tracking-tight leading-none">Top 10</h3>
            <p className="text-[10px] font-black uppercase text-forest tracking-widest mt-1">Filmographie de {personName}</p>
          </div>
          <button onClick={onClose} className="p-2.5 bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200 transition-all active:scale-90">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-20 gap-3 text-stone-300">
              <Loader2 size={32} className="animate-spin text-forest" />
              <p className="text-[10px] font-black uppercase tracking-widest">Récupération des œuvres...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              {movies.map((movie) => (
                <button 
                  key={movie.id} 
                  onClick={() => onSelectMovie(movie.id)}
                  className="flex flex-col items-start text-left group animate-[fadeIn_0.5s_ease-out]"
                >
                  <div className="w-full aspect-[2/3] rounded-2xl overflow-hidden bg-stone-100 mb-2 shadow-sm group-hover:shadow-lg transition-all relative">
                    <img 
                      src={`${TMDB_IMAGE_URL}${movie.poster_path}`} 
                      alt={movie.title} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                    />
                    <div className="absolute top-1.5 right-1.5 bg-black/50 backdrop-blur-md text-white px-1.5 py-0.5 rounded-lg flex items-center gap-1">
                      <Star size={8} fill="currentColor" className="text-tz-yellow" />
                      <span className="text-[8px] font-bold">{movie.vote_average?.toFixed(1) || '--'}</span>
                    </div>
                  </div>
                  <h4 className="font-black text-[11px] text-charcoal leading-tight line-clamp-2 mb-1 group-hover:text-forest transition-colors uppercase tracking-tighter">
                    {movie.title}
                  </h4>
                  <p className="text-[9px] font-bold text-stone-400">
                    {movie.release_date ? movie.release_date.split('-')[0] : 'N/A'}
                  </p>
                </button>
              ))}
            </div>
          )}
          
          {!loading && movies.length === 0 && (
            <div className="text-center py-20 opacity-40">
              <Film size={40} className="mx-auto mb-3 text-stone-300" />
              <p className="text-sm font-bold text-charcoal">Aucune filmographie trouvée.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default FilmographyModal;