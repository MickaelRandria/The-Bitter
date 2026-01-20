import React, { useState, useEffect } from 'react';
import { X, Check, Eye, Clock, Search, Loader2, Film, DownloadCloud } from 'lucide-react';
import { GENRES, THEME_COLORS } from '../constants';
import { MovieFormData, ThemeColor, Movie, MovieStatus } from '../types';

const TMDB_API_KEY = 'c0b50025397f8839b2c49a4bcf377527';
const TMDB_BASE_URL = 'https://api.themoviedb.org/3';
const TMDB_IMAGE_URL = 'https://image.tmdb.org/t/p/w780';

interface AddMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (movie: MovieFormData) => void;
  initialData: Movie | null;
}

const INITIAL_FORM_STATE: MovieFormData = {
  title: '',
  director: '',
  actors: '',
  year: new Date().getFullYear(),
  genre: GENRES[0],
  ratings: { story: 5, visuals: 5, acting: 5, sound: 5 },
  review: '',
  theme: 'black',
  posterUrl: '',
  status: 'watched'
};

const AddMovieModal: React.FC<AddMovieModalProps> = ({ isOpen, onClose, onSave, initialData }) => {
  const [formData, setFormData] = useState<MovieFormData>(INITIAL_FORM_STATE);
  const [mode, setMode] = useState<MovieStatus>('watched');
  
  // TMDB State
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const { id, dateAdded, ...rest } = initialData;
        setFormData(rest);
        setMode(rest.status || 'watched');
      } else {
        setFormData(INITIAL_FORM_STATE);
        setMode('watched');
        setTmdbQuery('');
        setTmdbResults([]);
      }
    }
  }, [isOpen, initialData]);

  // Update form status when mode changes
  useEffect(() => {
    setFormData(prev => ({ ...prev, status: mode }));
  }, [mode]);

  // Search TMDB
  useEffect(() => {
    const searchMovies = async () => {
        if (!tmdbQuery || tmdbQuery.length < 2) {
            setTmdbResults([]);
            return;
        }

        setIsSearching(true);
        try {
            // Using language=fr-FR for French results
            const res = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(tmdbQuery)}&language=fr-FR`);
            const data = await res.json();
            if (data.results) {
                setTmdbResults(data.results.slice(0, 5)); // Limit to 5 results
                setShowResults(true);
            }
        } catch (error) {
            console.error("TMDB Search Error", error);
        } finally {
            setIsSearching(false);
        }
    };

    const debounce = setTimeout(searchMovies, 500);
    return () => clearTimeout(debounce);
  }, [tmdbQuery]);

  const fetchMovieDetails = async (tmdbId: number) => {
      setIsSearching(true);
      try {
          // Fetch details + credits (director/actors) in French
          const res = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
          const data = await res.json();

          const director = data.credits?.crew?.find((p: any) => p.job === 'Director')?.name || '';
          const actors = data.credits?.cast?.slice(0, 3).map((p: any) => p.name).join(', ') || '';
          const year = data.release_date ? parseInt(data.release_date.split('-')[0]) : new Date().getFullYear();
          const posterUrl = data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '';
          
          // Genre Mapping (French TMDB to our GENRES)
          let genre = GENRES[0];
          if (data.genres && data.genres.length > 0) {
              const tmdbGenre = data.genres[0].name;
              // Attempt to find match in our French GENRES list
              const match = GENRES.find(g => g.toLowerCase() === tmdbGenre.toLowerCase()) 
                         || GENRES.find(g => tmdbGenre.includes(g));
              if (match) genre = match;
          }

          setFormData(prev => ({
              ...prev,
              title: data.title,
              director,
              actors,
              year,
              genre,
              posterUrl,
              review: data.overview || '' 
          }));
          
          setTmdbQuery(''); // Clear search to hide dropdown
          setShowResults(false);

      } catch (error) {
          console.error("TMDB Details Error", error);
      } finally {
          setIsSearching(false);
      }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title) return;
    onSave({ ...formData, status: mode });
  };

  // Label translations for ratings
  const ratingLabels: Record<string, string> = {
      story: 'Histoire',
      visuals: 'Visuel',
      acting: 'Jeu',
      sound: 'Son'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl relative z-10 max-h-[90vh] flex flex-col animate-[slideUp_0.3s_cubic-bezier(0.16, 1, 0.3, 1)]">
        
        <div className="flex justify-between items-center p-6 border-b border-zinc-100">
          <h2 className="text-xl font-bold text-primary tracking-tight">
            {initialData ? 'Modifier' : 'Nouveau Film'}
          </h2>
          <button onClick={onClose} className="p-2 bg-zinc-100 rounded-full text-zinc-500 hover:bg-zinc-200 transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* --- Toggle Mode --- */}
        <div className="px-6 pt-4">
           <div className="flex bg-zinc-100 p-1 rounded-2xl">
              <button 
                 onClick={() => setMode('watched')}
                 className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'watched' ? 'bg-white text-charcoal shadow-sm' : 'text-zinc-400'}`}
              >
                  <Eye size={16} />
                  Vu
              </button>
              <button 
                 onClick={() => setMode('watchlist')}
                 className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold transition-all ${mode === 'watchlist' ? 'bg-white text-charcoal shadow-sm' : 'text-zinc-400'}`}
              >
                  <Clock size={16} />
                  À voir
              </button>
           </div>
        </div>

        <div className="overflow-y-auto p-6 space-y-6 flex-1">
          
          {/* --- TMDB Search Bar --- */}
          {!initialData && (
              <div className="relative z-20">
                  <div className="relative group">
                      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                          {isSearching ? <Loader2 size={18} className="animate-spin text-forest" /> : <Search size={18} className="text-stone-400" />}
                      </div>
                      <input 
                          type="text"
                          placeholder="Rechercher un film..."
                          className="w-full bg-stone-50 border border-transparent focus:border-forest/20 focus:bg-white rounded-xl py-3 pl-10 pr-4 text-sm font-bold outline-none transition-all shadow-sm"
                          value={tmdbQuery}
                          onChange={(e) => {
                              setTmdbQuery(e.target.value);
                              if(e.target.value === '') setShowResults(false);
                          }}
                      />
                  </div>

                  {/* Search Results Dropdown */}
                  {showResults && tmdbResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-2 bg-white rounded-xl shadow-xl border border-stone-100 overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                          {tmdbResults.map((movie) => (
                              <button 
                                key={movie.id}
                                onClick={() => fetchMovieDetails(movie.id)}
                                className="w-full text-left p-3 hover:bg-stone-50 flex items-center gap-3 border-b border-stone-50 last:border-0 transition-colors"
                              >
                                  {movie.poster_path ? (
                                      <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} alt="" className="w-10 h-14 object-cover rounded-md shadow-sm" />
                                  ) : (
                                      <div className="w-10 h-14 bg-stone-200 rounded-md flex items-center justify-center">
                                          <Film size={16} className="text-stone-400" />
                                      </div>
                                  )}
                                  <div>
                                      <div className="font-bold text-sm text-charcoal">{movie.title}</div>
                                      <div className="text-xs text-stone-400">
                                          {movie.release_date ? movie.release_date.split('-')[0] : 'Inconnu'}
                                      </div>
                                  </div>
                                  <div className="ml-auto">
                                      <DownloadCloud size={16} className="text-forest opacity-0 group-hover:opacity-100" />
                                  </div>
                              </button>
                          ))}
                      </div>
                  )}
              </div>
          )}

          <div className="space-y-4">
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Titre</label>
              <input
                type="text"
                className="w-full bg-zinc-50 rounded-xl p-4 text-primary font-bold text-lg outline-none ring-2 ring-transparent focus:ring-primary transition-all placeholder:text-zinc-300"
                placeholder="Titre du film"
                value={formData.title}
                onChange={e => setFormData({...formData, title: e.target.value})}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Réalisateur</label>
                <input
                  type="text"
                  className="w-full bg-zinc-50 rounded-xl p-3 font-medium outline-none focus:bg-white focus:ring-2 focus:ring-zinc-200 transition-all"
                  value={formData.director}
                  onChange={e => setFormData({...formData, director: e.target.value})}
                />
              </div>
              <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Année</label>
                <input
                  type="number"
                  className="w-full bg-zinc-50 rounded-xl p-3 font-medium outline-none focus:bg-white focus:ring-2 focus:ring-zinc-200 transition-all"
                  value={formData.year}
                  onChange={e => setFormData({...formData, year: Number(e.target.value)})}
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">URL de l'affiche (Optionnel)</label>
              <div className="flex gap-2">
                  <input
                    type="url"
                    className="flex-1 bg-zinc-50 rounded-xl p-3 font-medium outline-none focus:bg-white focus:ring-2 focus:ring-zinc-200 transition-all placeholder:text-zinc-300 text-sm"
                    placeholder="https://..."
                    value={formData.posterUrl || ''}
                    onChange={e => setFormData({...formData, posterUrl: e.target.value})}
                  />
                  {formData.posterUrl && (
                      <div className="w-10 h-10 rounded-lg bg-zinc-100 overflow-hidden shrink-0 border border-zinc-200">
                          <img src={formData.posterUrl} alt="Preview" className="w-full h-full object-cover" />
                      </div>
                  )}
              </div>
            </div>

            <div>
                <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Acteurs principaux</label>
                <input
                  type="text"
                  placeholder="ex: Timothée Chalamet, Zendaya"
                  className="w-full bg-zinc-50 rounded-xl p-3 font-medium outline-none focus:bg-white focus:ring-2 focus:ring-zinc-200 transition-all placeholder:text-zinc-300"
                  value={formData.actors || ''}
                  onChange={e => setFormData({...formData, actors: e.target.value})}
                />
            </div>

            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Couleur du thème</label>
              <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
                {THEME_COLORS.map(color => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => setFormData({...formData, theme: color})}
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-transform ${formData.theme === color ? 'scale-110 ring-2 ring-offset-2 ring-zinc-300' : ''}`}
                    style={{ 
                      backgroundColor: color === 'black' ? '#18181B' : 
                                      color === 'orange' ? '#FF5722' : 
                                      color === 'green' ? '#10B981' : 
                                      color === 'yellow' ? '#FACC15' : 
                                      color === 'blue' ? '#38BDF8' : '#A855F7' 
                    }}
                  >
                    {formData.theme === color && <Check size={16} className={color === 'yellow' ? 'text-black' : 'text-white'} />}
                  </button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Genre</label>
               <select 
                  className="w-full bg-zinc-50 rounded-xl p-3 font-medium outline-none"
                  value={formData.genre}
                  onChange={e => setFormData({...formData, genre: e.target.value})}
               >
                 {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
               </select>
            </div>
          </div>

          {/* Conditional Rendering based on Mode */}
          {mode === 'watched' ? (
             <div className="animate-[fadeIn_0.3s_ease-out]">
                <div className="grid grid-cols-2 gap-4 mb-4">
                   {Object.entries(formData.ratings).map(([key, val]) => (
                      <div key={key} className="bg-zinc-50 p-3 rounded-xl">
                         <div className="flex justify-between mb-2">
                            <span className="text-xs font-bold uppercase text-zinc-400">{ratingLabels[key] || key}</span>
                            <span className="text-xs font-bold">{val}</span>
                         </div>
                         <input 
                            type="range" min="1" max="10" 
                            value={val}
                            onChange={(e) => setFormData({
                              ...formData, 
                              ratings: {...formData.ratings, [key]: Number(e.target.value)}
                            })}
                            className="w-full h-1 bg-zinc-200 rounded-full appearance-none accent-black"
                         />
                      </div>
                   ))}
                </div>
                
                <div>
                   <label className="text-xs font-bold text-zinc-400 uppercase tracking-wider mb-2 block">Critique</label>
                   <textarea
                      className="w-full bg-zinc-50 rounded-xl p-3 font-medium outline-none focus:bg-white focus:ring-2 focus:ring-zinc-200 transition-all h-24 resize-none"
                      placeholder="Votre avis..."
                      value={formData.review}
                      onChange={e => setFormData({...formData, review: e.target.value})}
                   />
                </div>
             </div>
          ) : (
             <div className="bg-sand/50 p-6 rounded-2xl text-center animate-[fadeIn_0.3s_ease-out]">
                 <Clock size={32} className="mx-auto text-stone-400 mb-2" />
                 <p className="text-sm font-bold text-charcoal">Ajouté à la liste</p>
                 <p className="text-xs text-stone-500 mt-1">Vous pourrez noter ce film une fois vu.</p>
             </div>
          )}

        </div>

        <div className="p-4 border-t border-zinc-100">
          <button 
            onClick={handleSubmit}
            className={`w-full text-white font-bold text-lg py-4 rounded-2xl shadow-lg active:scale-[0.98] transition-all hover:bg-black ${mode === 'watched' ? 'bg-charcoal' : 'bg-forest'}`}
          >
            {initialData ? 'Mettre à jour' : (mode === 'watched' ? 'Enregistrer' : 'Ajouter à la liste')}
          </button>
        </div>

      </div>
    </div>
  );
};

export default AddMovieModal;