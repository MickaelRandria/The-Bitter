
import React, { useState, useEffect } from 'react';
import { Check, Loader2, FastForward, PenTool, Star, Film } from 'lucide-react';
import { TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL, TMDB_GENRE_MAP } from '../constants';
import { haptics } from '../utils/haptics';

interface TMDBMovie {
  id: number;
  title: string;
  poster_path: string;
  backdrop_path: string;
  vote_average: number;
  release_date: string;
  overview: string;
}

interface MovieDeckProps {
  onRate: (tmdbId: number) => void;
  onClose: () => void;
  advanceTrigger?: number;
  favoriteGenres?: string[];
}

const MovieDeck: React.FC<MovieDeckProps> = ({ onRate, onClose, advanceTrigger = 0, favoriteGenres = [] }) => {
  const [movies, setMovies] = useState<TMDBMovie[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [loading, setLoading] = useState(true);

  // Auto-advance déclenché depuis App.tsx après sauvegarde d'une note
  useEffect(() => {
    if (advanceTrigger > 0 && currentIndex < movies.length) {
      const timer = setTimeout(() => {
        setCurrentIndex(prev => prev + 1);
        haptics.soft();
      }, 500); // Délai pour une transition naturelle après fermeture modale
      return () => clearTimeout(timer);
    }
  }, [advanceTrigger]);

  useEffect(() => {
    const fetchPersonalized = async () => {
      setLoading(true);
      try {
        const genreIds = favoriteGenres.map(name => TMDB_GENRE_MAP[name]).filter(Boolean).join(',');
        const genreParam = genreIds ? `&with_genres=${genreIds}` : '';
        // On récupère les plus gros succès dans ces genres
        const url = `${TMDB_BASE_URL}/discover/movie?api_key=${TMDB_API_KEY}&language=fr-FR&sort_by=vote_count.desc&include_adult=false&page=1${genreParam}`;
        
        const res = await fetch(url);
        const data = await res.json();
        if (data.results) {
          // Limite stricte à 5 films pour l'onboarding
          setMovies(data.results.filter((m: any) => m.poster_path).slice(0, 5));
        }
      } catch (e) {
        console.error("Deck error", e);
      } finally {
        setLoading(false);
      }
    };
    fetchPersonalized();
  }, [favoriteGenres]);

  const handleSkip = () => {
    haptics.soft();
    setCurrentIndex(prev => prev + 1);
  };

  const handleRate = () => {
    haptics.medium();
    if (movies[currentIndex]) onRate(movies[currentIndex].id);
  };

  if (loading) return (
    <div className="flex flex-col items-center justify-center py-32 gap-6">
      <div className="relative">
        <Loader2 size={48} className="animate-spin text-forest" />
        <div className="absolute inset-0 flex items-center justify-center">
            <Film size={16} className="text-forest/40" />
        </div>
      </div>
      <p className="text-[10px] font-black uppercase tracking-[0.3em] text-stone-400 animate-pulse">Filtrage de votre zone de confort...</p>
    </div>
  );

  if (currentIndex >= movies.length || movies.length === 0) return (
    <div className="flex flex-col items-center justify-center py-20 text-center animate-[scaleIn_0.5s_ease-out]">
      <div className="w-24 h-24 bg-forest text-white rounded-[2.5rem] flex items-center justify-center mb-8 shadow-2xl shadow-forest/20 rotate-3">
        <Check size={48} strokeWidth={3} />
      </div>
      <h3 className="text-3xl font-black text-charcoal mb-3 tracking-tighter">Profil Calibré</h3>
      <p className="text-stone-400 font-medium max-w-xs mb-10 leading-relaxed">
        Votre analyste interne est prêt. Accédez à vos statistiques bento.
      </p>
      <button 
        onClick={onClose} 
        className="bg-charcoal text-white px-10 py-5 rounded-2xl font-black text-xs uppercase tracking-widest shadow-xl active:scale-95 transition-all hover:bg-forest"
      >
        Voir ma collection
      </button>
    </div>
  );

  const movie = movies[currentIndex];

  return (
    <div className="relative w-full max-w-sm mx-auto h-[75vh] flex flex-col items-center justify-center px-4">
      {/* Background Stacks */}
      <div className="absolute top-6 w-[85%] h-full bg-stone-200/40 rounded-[2.5rem] -z-10 translate-y-4 scale-[0.96]" />
      <div className="absolute top-3 w-[92%] h-full bg-stone-100/60 rounded-[2.5rem] -z-10 translate-y-2 scale-[0.98]" />

      {/* Main Card */}
      <div key={movie.id} className="relative w-full h-full bg-white rounded-[2.5rem] shadow-2xl overflow-hidden animate-[scaleIn_0.4s_cubic-bezier(0.16,1,0.3,1)] border border-stone-100">
        <img 
            src={`${TMDB_IMAGE_URL}${movie.poster_path}`} 
            alt={movie.title} 
            className="w-full h-full object-cover pointer-events-none select-none" 
        />
        
        <div className="absolute inset-0 bg-gradient-to-t from-charcoal via-charcoal/30 to-transparent flex flex-col justify-end p-8">
          <div className="flex items-center gap-2 mb-3">
            <span className="bg-white/10 backdrop-blur-md text-white px-3 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest shadow-lg border border-white/10">
                Spécial {favoriteGenres[0] || 'Culte'}
            </span>
            <div className="flex items-center gap-1.5 bg-white/10 backdrop-blur-xl text-white px-2.5 py-1.5 rounded-xl border border-white/10">
                <Star size={10} fill="currentColor" className="text-tz-yellow" />
                <span className="text-[10px] font-bold">{movie.vote_average.toFixed(1)}</span>
            </div>
          </div>
          
          <h2 className="text-4xl font-black text-white tracking-tighter leading-[0.9] mb-3 drop-shadow-lg">
            {movie.title}
          </h2>
          <p className="text-[11px] font-bold text-white/60 uppercase tracking-[0.2em] mb-8">
            Sortie • {movie.release_date.split('-')[0]}
          </p>

          <div className="flex gap-4">
            <button 
                onClick={handleSkip} 
                className="flex-1 bg-white/10 backdrop-blur-2xl border border-white/20 text-white p-6 rounded-[2.2rem] flex flex-col items-center gap-2 hover:bg-red-500 transition-all active:scale-90"
            >
                <FastForward size={24} />
                <span className="text-[9px] font-black uppercase tracking-widest">Passer</span>
            </button>
            <button 
                onClick={handleRate} 
                className="flex-[1.5] bg-forest text-white p-6 rounded-[2.2rem] flex flex-col items-center gap-2 shadow-xl shadow-forest/20 hover:scale-105 active:scale-95 transition-all"
            >
                <PenTool size={24} />
                <span className="text-[9px] font-black uppercase tracking-widest">Je note</span>
            </button>
          </div>
        </div>
      </div>
      
      {/* Step Indicator */}
      <div className="mt-8 flex items-center gap-1.5">
          {movies.map((_, i) => (
              <div key={i} className={`h-1 rounded-full transition-all duration-500 ${i === currentIndex ? 'w-8 bg-charcoal' : 'w-2 bg-stone-200'}`} />
          ))}
      </div>
    </div>
  );
};

export default MovieDeck;
