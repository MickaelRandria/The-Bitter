import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Check, Eye, Clock, Search, Loader2, Film, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Sparkles, Wand2, Plus, Repeat, User, LayoutGrid, Calendar, Flame, AlertCircle } from 'lucide-react';
import { GENRES, THEME_COLORS, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { MovieFormData, Movie, MovieStatus, ActorInfo } from '../types';

interface AddMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (movie: MovieFormData) => void;
  initialData: Movie | null;
  tmdbIdToLoad?: number | null;
  onOpenFilmography?: (id: number, name: string) => void;
}

const QUALITIES = [
  'Incontournable', 'Esthétique', 'Scénario', "Jeu d'acteur", 
  'B.O. Marquante', 'Bouleversant', 'Immersif', 'Surprenant'
];

const INITIAL_FORM_STATE: MovieFormData = {
  title: '',
  tmdbId: undefined,
  director: '',
  directorId: undefined,
  actors: '',
  actorIds: [],
  year: new Date().getFullYear(),
  releaseDate: undefined,
  runtime: 0,
  genre: GENRES[0],
  ratings: { story: 5, visuals: 5, acting: 5, sound: 5 },
  review: '',
  theme: 'black',
  posterUrl: '',
  status: 'watched',
  dateWatched: Date.now(),
  tmdbRating: 0,
  rewatch: false,
  tags: []
};

interface MiniCalendarPickerProps {
  value: number;
  onChange: (date: number) => void;
  minDate?: number;
  maxDate?: number;
  label?: string;
}

const MiniCalendarPicker: React.FC<MiniCalendarPickerProps> = ({ value, onChange, minDate, maxDate, label = "Date de visionnage" }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [viewDate, setViewDate] = useState(new Date(value));
  const containerRef = useRef<HTMLDivElement>(null);

  const selectedDate = new Date(value);
  const currentMonth = viewDate.getMonth();
  const currentYear = viewDate.getFullYear();

  const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
  const firstDayOfMonth = new Date(currentYear, currentMonth, 1).getDay();
  const startOffset = (firstDayOfMonth + 6) % 7;

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const monthNames = ["Janvier", "Février", "Mars", "Avril", "Mai", "Juin", "Juillet", "Août", "Septembre", "Octobre", "Novembre", "Décembre"];

  const handlePrevMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleSelectDay = (day: number, e: React.MouseEvent) => {
    e.stopPropagation();
    const newDate = new Date(currentYear, currentMonth, day);
    onChange(newDate.getTime());
    setIsOpen(false);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between bg-stone-50 hover:bg-stone-100 p-4 rounded-2xl transition-all border-2 border-transparent focus:border-forest/20 group active:scale-[0.98]"
      >
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white rounded-xl shadow-sm flex items-center justify-center text-forest group-hover:scale-110 transition-transform">
            <CalendarIcon size={20} strokeWidth={2.5} />
          </div>
          <div className="text-left">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-0.5">{label}</p>
            <p className="font-bold text-lg text-charcoal leading-none">
              {selectedDate.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>
        <div className={`transition-transform duration-300 ${isOpen ? 'rotate-180' : ''} pr-2`}>
           <ChevronLeft className="-rotate-90 text-stone-300" size={20} />
        </div>
      </button>

      {isOpen && (
        <div className="absolute top-full left-0 right-0 mt-3 bg-white/95 backdrop-blur-xl border border-stone-100 shadow-2xl rounded-3xl p-5 z-50 animate-[scaleIn_0.2s_ease-out] origin-top">
          <div className="flex items-center justify-between mb-4">
            <button onClick={handlePrevMonth} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
              <ChevronLeft size={18} className="text-charcoal" />
            </button>
            <h4 className="font-black text-sm text-charcoal uppercase tracking-wider">
              {monthNames[currentMonth]} {currentYear}
            </h4>
            <button onClick={handleNextMonth} className="p-2 hover:bg-stone-100 rounded-full transition-colors">
              <ChevronRight size={18} className="text-charcoal" />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map(d => (
              <div key={d} className="text-[10px] font-black text-stone-300 text-center py-1">{d}</div>
            ))}
            {Array.from({ length: startOffset }).map((_, i) => (
              <div key={`empty-${i}`} />
            ))}
            {days.map(day => {
              const currentDayTime = new Date(currentYear, currentMonth, day).getTime();
              // Check bounds
              const isDisabled = (minDate && currentDayTime < minDate) || (maxDate && currentDayTime > maxDate);

              const isSelected = selectedDate.getDate() === day && selectedDate.getMonth() === currentMonth && selectedDate.getFullYear() === currentYear;
              const isToday = new Date().getDate() === day && new Date().getMonth() === currentMonth && new Date().getFullYear() === currentYear;
              
              return (
                <button
                  key={day}
                  type="button"
                  disabled={isDisabled}
                  onClick={(e) => !isDisabled && handleSelectDay(day, e)}
                  className={`
                    h-9 w-full rounded-xl text-xs font-bold transition-all flex items-center justify-center
                    ${isDisabled ? 'opacity-20 cursor-not-allowed pointer-events-none text-stone-300' : (
                        isSelected ? 'bg-forest text-white shadow-lg shadow-forest/20 scale-110 z-10' : 'hover:bg-stone-100 text-charcoal'
                    )}
                    ${isToday && !isSelected ? 'border border-forest/30' : ''}
                  `}
                >
                  {day}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

type SearchMode = 'title' | 'director';
type FilmographySort = 'popularity' | 'latest';

const AddMovieModal: React.FC<AddMovieModalProps> = ({ isOpen, onClose, onSave, initialData, tmdbIdToLoad, onOpenFilmography }) => {
  const [formData, setFormData] = useState<MovieFormData>(INITIAL_FORM_STATE);
  const [mode, setMode] = useState<MovieStatus>('watched');
  const [searchMode, setSearchMode] = useState<SearchMode>('title');
  const [tmdbQuery, setTmdbQuery] = useState('');
  const [tmdbResults, setTmdbResults] = useState<any[]>([]);
  const [personResults, setPersonResults] = useState<any[]>([]);
  const [selectedPerson, setSelectedPerson] = useState<any | null>(null);
  const [personFilmography, setPersonFilmography] = useState<any[]>([]);
  const [filmographySort, setFilmographySort] = useState<FilmographySort>('popularity');
  const [dateError, setDateError] = useState<string | null>(null);
  
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const { id, dateAdded, ...rest } = initialData;
        setFormData({
            ...rest,
            dateWatched: rest.dateWatched || dateAdded || Date.now(),
            tmdbRating: rest.tmdbRating || 0,
            rewatch: rest.rewatch || false,
            tags: rest.tags || []
        });
        setMode(rest.status || 'watched');
      } else {
        setFormData({ ...INITIAL_FORM_STATE, dateWatched: Date.now() });
        setMode('watched');
        setSearchMode('title');
        setTmdbQuery('');
        setTmdbResults([]);
        setPersonResults([]);
        setSelectedPerson(null);
        setPersonFilmography([]);
        setDateError(null);
        
        if (tmdbIdToLoad) {
           fetchMovieDetails(tmdbIdToLoad);
        }
      }
    }
  }, [isOpen, initialData, tmdbIdToLoad]);

  useEffect(() => {
    setFormData(prev => ({ ...prev, status: mode }));
  }, [mode]);

  // Validation Date vs Release
  useEffect(() => {
    if (formData.releaseDate && formData.dateWatched) {
       const release = new Date(formData.releaseDate).getTime();
       // On compare juste les jours, donc on reset les heures
       const releaseDay = new Date(release).setHours(0,0,0,0);
       const watchedDay = new Date(formData.dateWatched).setHours(0,0,0,0);

       if (watchedDay < releaseDay) {
           setDateError("Impossible : Le film n'était pas encore sorti à cette date.");
       } else {
           setDateError(null);
       }
    } else {
        setDateError(null);
    }
  }, [formData.dateWatched, formData.releaseDate]);

  const isFutureDate = useMemo(() => {
     if (!formData.dateWatched) return false;
     return formData.dateWatched > Date.now();
  }, [formData.dateWatched]);

  useEffect(() => {
    const handleSearch = async () => {
        if (!tmdbQuery || tmdbQuery.length < 2) {
            setTmdbResults([]);
            setPersonResults([]);
            return;
        }
        setIsSearching(true);
        try {
            if (searchMode === 'title') {
                const res = await fetch(`${TMDB_BASE_URL}/search/movie?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(tmdbQuery)}&language=fr-FR`);
                const data = await res.json();
                if (data.results) {
                    setTmdbResults(data.results.slice(0, 5));
                    setShowResults(true);
                }
            } else {
                const res = await fetch(`${TMDB_BASE_URL}/search/person?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(tmdbQuery)}&language=fr-FR`);
                const data = await res.json();
                if (data.results) {
                    setPersonResults(data.results.slice(0, 5));
                    setShowResults(true);
                }
            }
        } catch (error) {
            console.error("TMDB Search Error", error);
        } finally {
            setIsSearching(false);
        }
    };
    const debounce = setTimeout(handleSearch, 500);
    return () => clearTimeout(debounce);
  }, [tmdbQuery, searchMode]);

  const fetchPersonCredits = async (person: any) => {
      setIsSearching(true);
      try {
          const res = await fetch(`${TMDB_BASE_URL}/person/${person.id}/movie_credits?api_key=${TMDB_API_KEY}&language=fr-FR`);
          const data = await res.json();
          
          const allCredits = [...(data.crew || []), ...(data.cast || [])];
          const uniqueMovies = Array.from(new Map(allCredits.map(item => [item['id'], item])).values())
            .filter((m: any) => m.poster_path);

          setSelectedPerson(person);
          setPersonFilmography(uniqueMovies);
          setTmdbQuery('');
          setShowResults(false);
      } catch (error) {
          console.error("Filmography Error", error);
      } finally {
          setIsSearching(false);
      }
  };

  const sortedFilmography = useMemo(() => {
    const m = [...personFilmography];
    if (filmographySort === 'popularity') {
      return m.sort((a: any, b: any) => b.popularity - a.popularity).slice(0, 10);
    } else {
      return m.sort((a: any, b: any) => {
        const dateA = new Date(a.release_date || 0).getTime();
        const dateB = new Date(b.release_date || 0).getTime();
        return dateB - dateA;
      }).slice(0, 10);
    }
  }, [personFilmography, filmographySort]);

  const fetchMovieDetails = async (tmdbId: number) => {
      setIsSearching(true);
      try {
          const res = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
          const data = await res.json();
          
          const directorObj = data.credits?.crew?.find((p: any) => p.job === 'Director');
          const director = directorObj?.name || '';
          const directorId = directorObj?.id;

          const actorItems = data.credits?.cast?.slice(0, 3) || [];
          const actors = actorItems.map((p: any) => p.name).join(', ') || '';
          const actorIds: ActorInfo[] = actorItems.map((p: any) => ({ id: p.id, name: p.name }));

          const releaseDate = data.release_date || ''; // Stocker la date complète
          const year = releaseDate ? parseInt(releaseDate.split('-')[0]) : new Date().getFullYear();
          const posterUrl = data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '';
          const tmdbRating = data.vote_average ? Number(data.vote_average.toFixed(1)) : 0;
          const runtime = data.runtime || 0;
          
          let genre = GENRES[0];
          if (data.genres && data.genres.length > 0) {
              const tmdbGenre = data.genres[0].name;
              const match = GENRES.find(g => g.toLowerCase() === tmdbGenre.toLowerCase()) || GENRES.find(g => tmdbGenre.includes(g));
              if (match) genre = match;
          }
          setFormData(prev => ({
              ...prev,
              title: data.title,
              tmdbId: data.id,
              director,
              directorId,
              actors,
              actorIds,
              year,
              releaseDate, // New Field
              runtime,
              genre,
              posterUrl,
              tmdbRating,
              review: data.overview || '' 
          }));
          setTmdbQuery('');
          setShowResults(false);
          setSelectedPerson(null);
          setPersonFilmography([]);
      } catch (error) {
          console.error("TMDB Details Error", error);
      } finally {
          setIsSearching(false);
      }
  };

  const toggleTag = (tag: string) => {
    setFormData(prev => {
      const currentTags = prev.tags || [];
      if (currentTags.includes(tag)) {
        return { ...prev, tags: currentTags.filter(t => t !== tag) };
      } else {
        return { ...prev, tags: [...currentTags, tag] };
      }
    });
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateError) return;
    if (!formData.title) return;
    
    // Si on ajoute en watchlist, on ne sauvegarde pas les notes ni les critiques
    const finalData = { ...formData, status: mode };
    if (mode === 'watchlist') {
        finalData.ratings = { story: 0, visuals: 0, acting: 0, sound: 0 };
        finalData.review = '';
        finalData.tags = [];
        finalData.rewatch = false;
        // removed resetting dateWatched to 0, allowing user planned date
    }

    onSave(finalData);
  };

  const ratingLabels: Record<string, string> = {
      story: 'Histoire',
      visuals: 'Visuel',
      acting: 'Jeu',
      sound: 'Son'
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm transition-opacity duration-500" onClick={onClose} />
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl relative z-10 max-h-[95vh] flex flex-col animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex justify-between items-center p-6 pb-2">
          <h2 className="text-3xl font-black text-charcoal tracking-tighter">{initialData ? 'Modifier' : 'Nouveau Film'}</h2>
          <button onClick={onClose} className="p-2.5 bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200 transition-all active:scale-90"><X size={20} strokeWidth={2.5} /></button>
        </div>

        <div className="px-6 pb-2">
           <div className="flex bg-stone-100/80 p-1.5 rounded-2xl border border-stone-100">
              <button onClick={() => setMode('watched')} className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all ${mode === 'watched' ? 'bg-white text-charcoal shadow-sm scale-[1.02]' : 'text-stone-400'}`}>
                  <Eye size={18} strokeWidth={2.5} /> Vu
              </button>
              <button onClick={() => setMode('watchlist')} className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all ${mode === 'watchlist' ? 'bg-white text-charcoal shadow-sm scale-[1.02]' : 'text-stone-400'}`}>
                  <Clock size={18} strokeWidth={2.5} /> À voir
              </button>
           </div>
        </div>

        <div className="overflow-y-auto p-6 space-y-8 flex-1 no-scrollbar">
          {!initialData && (
              <div className="relative z-30 group/search">
                  <div className="mb-4 flex items-center justify-between px-1">
                     <div className="flex items-center gap-2">
                        <Wand2 size={14} className="text-forest animate-pulse" />
                        <span className="text-[10px] font-black uppercase text-forest tracking-[0.2em]">Assistant Magique</span>
                     </div>
                  </div>

                  {/* Mode Selector - Highly Distinct as Requested */}
                  <div className="flex bg-stone-100 p-1 rounded-2xl mb-6 border border-sand">
                      <button 
                        type="button"
                        onClick={() => { setSearchMode('title'); setTmdbQuery(''); setShowResults(false); setSelectedPerson(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchMode === 'title' ? 'bg-white text-charcoal shadow-sm scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}
                      >
                        <LayoutGrid size={12} /> Film
                      </button>
                      <button 
                        type="button"
                        onClick={() => { setSearchMode('director'); setTmdbQuery(''); setShowResults(false); setSelectedPerson(null); }}
                        className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchMode === 'director' ? 'bg-white text-charcoal shadow-sm scale-[1.02]' : 'text-stone-400 hover:text-stone-500'}`}
                      >
                        <User size={12} /> Réalisateur
                      </button>
                  </div>
                  
                  <div className="relative transition-all duration-300 transform group-focus-within/search:scale-[1.01]">
                      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none transition-colors group-focus-within/search:text-forest">
                          {isSearching ? <Loader2 size={22} className="animate-spin text-forest" /> : <Search size={22} strokeWidth={2.5} className="text-stone-300 group-focus-within/search:text-forest" />}
                      </div>
                      <input 
                          type="text"
                          placeholder={searchMode === 'title' ? "Tapez le titre d'un film..." : "Nom d'un réalisateur..."}
                          className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl py-5 pl-14 pr-4 text-base font-bold outline-none transition-all ring-1 ring-transparent focus:ring-2 focus:ring-forest/10 placeholder:text-stone-300 shadow-sm focus:shadow-md"
                          value={tmdbQuery}
                          onChange={(e) => {
                              setTmdbQuery(e.target.value);
                              if(e.target.value === '') setShowResults(false);
                          }}
                          autoFocus={!tmdbIdToLoad}
                      />
                  </div>

                  {/* Results for Title Search */}
                  {showResults && searchMode === 'title' && tmdbResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden animate-[fadeIn_0.3s_ease-out] z-40">
                          <div className="bg-stone-50 px-5 py-2.5 text-[10px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-100">Films TMDB</div>
                          {tmdbResults.map((movie) => (
                              <button key={movie.id} onClick={() => fetchMovieDetails(movie.id)} className="w-full text-left p-4 hover:bg-forest/5 flex items-center gap-4 border-b border-stone-50 last:border-0 transition-colors group/item active:bg-forest/10">
                                  {movie.poster_path ? (
                                      <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} alt="" className="w-12 h-16 object-cover rounded-xl shadow-md group-hover/item:scale-105 transition-transform duration-300" />
                                  ) : (
                                      <div className="w-12 h-16 bg-stone-100 rounded-xl flex items-center justify-center"><Film size={20} className="text-stone-300" /></div>
                                  )}
                                  <div>
                                      <div className="font-bold text-sm text-charcoal group-hover/item:text-forest transition-colors">{movie.title}</div>
                                      <div className="text-[10px] font-black uppercase text-stone-400 flex items-center gap-2 mt-1">
                                          {movie.release_date ? movie.release_date.split('-')[0] : 'Inconnu'}
                                      </div>
                                  </div>
                              </button>
                          ))}
                      </div>
                  )}

                  {/* Results for Director Search */}
                  {showResults && searchMode === 'director' && personResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden animate-[fadeIn_0.3s_ease-out] z-40">
                          <div className="bg-stone-50 px-5 py-2.5 text-[10px] font-black text-stone-400 uppercase tracking-widest border-b border-stone-100">Célébrités</div>
                          {personResults.map((person) => (
                              <button key={person.id} onClick={() => fetchPersonCredits(person)} className="w-full text-left p-4 hover:bg-forest/5 flex items-center gap-4 border-b border-stone-50 last:border-0 transition-colors group/item active:bg-forest/10">
                                  {person.profile_path ? (
                                      <img src={`${TMDB_IMAGE_URL}${person.profile_path}`} alt="" className="w-12 h-12 object-cover rounded-full shadow-md group-hover/item:scale-105 transition-transform" />
                                  ) : (
                                      <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center"><User size={20} className="text-stone-300" /></div>
                                  )}
                                  <div>
                                      <div className="font-bold text-sm text-charcoal group-hover/item:text-forest transition-colors">{person.name}</div>
                                      <div className="text-[9px] font-black uppercase text-stone-400 tracking-wider">
                                          {person.known_for_department === 'Directing' ? 'Réalisateur' : 'Acteur / Artiste'}
                                      </div>
                                  </div>
                              </button>
                          ))}
                      </div>
                  )}

                  {/* Enhanced Filmography View inside Search Context */}
                  {selectedPerson && personFilmography.length > 0 && (
                    <div className="mt-6 p-6 bg-stone-50 border border-sand rounded-[2.5rem] animate-[fadeIn_0.5s_ease-out] shadow-inner">
                       <div className="flex items-center justify-between mb-6 px-1">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm">
                                <img src={`${TMDB_IMAGE_URL}${selectedPerson.profile_path}`} className="w-full h-full object-cover" alt="" />
                            </div>
                            <div>
                                <h4 className="text-base font-black text-charcoal leading-none mb-1">{selectedPerson.name}</h4>
                                <p className="text-[9px] font-black uppercase text-forest tracking-widest">SÉLECTIONNEZ UNE ŒUVRE</p>
                            </div>
                          </div>
                          <button onClick={() => setSelectedPerson(null)} className="p-2 bg-white rounded-full text-stone-400 shadow-sm active:scale-90 transition-transform"><X size={14} /></button>
                       </div>

                       {/* Sort Toggle for Filmography */}
                       <div className="flex gap-2 mb-6">
                           <button 
                            type="button"
                            onClick={() => setFilmographySort('popularity')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${filmographySort === 'popularity' ? 'bg-charcoal text-white shadow-md' : 'bg-white text-stone-400 border border-sand'}`}
                           >
                               <Flame size={12} /> Top 10
                           </button>
                           <button 
                            type="button"
                            onClick={() => setFilmographySort('latest')}
                            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${filmographySort === 'latest' ? 'bg-charcoal text-white shadow-md' : 'bg-white text-stone-400 border border-sand'}`}
                           >
                               <Calendar size={12} /> Récents
                           </button>
                       </div>

                       <div className="grid grid-cols-2 gap-4 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                          {sortedFilmography.map(movie => (
                             <button key={movie.id} onClick={() => fetchMovieDetails(movie.id)} className="flex flex-col text-left group/item animate-[fadeIn_0.3s_ease-out]">
                                <div className="aspect-[2/3] rounded-2xl overflow-hidden mb-2 shadow-sm group-hover/item:shadow-lg transition-all relative">
                                   <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} alt={movie.title} className="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-700" />
                                   <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center">
                                       <Plus size={24} className="text-white drop-shadow-lg" strokeWidth={3} />
                                   </div>
                                </div>
                                <p className="text-[10px] font-black text-charcoal leading-tight uppercase tracking-tighter line-clamp-2 px-1">{movie.title}</p>
                                <p className="text-[9px] font-bold text-stone-400 px-1">{movie.release_date?.split('-')[0]}</p>
                             </button>
                          ))}
                       </div>
                    </div>
                  )}
              </div>
          )}

          {/* Form Content */}
          <div className="space-y-6 pt-2">
            <div className="group/input">
              <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1 transition-colors group-focus-within/input:text-charcoal">Titre du film</label>
              <input type="text" className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 text-charcoal font-black text-lg outline-none focus:ring-2 focus:ring-stone-100 transition-all placeholder:text-stone-200/50" placeholder="Ex: Inception" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
            </div>

            <div className="animate-[fadeIn_0.4s_ease-out]">
              <MiniCalendarPicker 
                  value={formData.dateWatched || Date.now()} 
                  onChange={(date) => setFormData(prev => ({ ...prev, dateWatched: date }))} 
                  minDate={mode === 'watchlist' ? new Date().setHours(0,0,0,0) : undefined}
                  maxDate={mode === 'watched' ? new Date().setHours(23,59,59,999) : undefined}
                  label={mode === 'watchlist' ? "Date prévue" : "Date de visionnage"}
              />
              {mode === 'watched' && dateError && (
                  <div className="flex items-center gap-2 mt-2 text-red-500 animate-[shake_0.4s_ease-in-out]">
                      <AlertCircle size={14} strokeWidth={2.5} />
                      <span className="text-[10px] font-bold">{dateError}</span>
                  </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Réalisateur</label>
                <div className="relative group/director">
                  <input type="text" className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-bold outline-none focus:ring-2 focus:ring-stone-100 transition-all" value={formData.director} onChange={e => setFormData({...formData, director: e.target.value, directorId: undefined})} />
                  {formData.directorId && onOpenFilmography && (
                    <button 
                      type="button"
                      onClick={() => onOpenFilmography(formData.directorId!, formData.director)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-forest hover:text-charcoal transition-colors p-2"
                      title="Voir filmographie"
                    >
                      <Film size={14} />
                    </button>
                  )}
                </div>
              </div>
              <div>
                <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Année</label>
                <input type="number" className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-bold outline-none focus:ring-2 focus:ring-stone-100 transition-all" value={formData.year} onChange={e => setFormData({...formData, year: Number(e.target.value)})} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4 items-end">
               <div>
                  <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Affiche (URL)</label>
                  <input type="url" className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-bold outline-none focus:ring-2 focus:ring-stone-100 transition-all text-xs" placeholder="https://..." value={formData.posterUrl || ''} onChange={e => setFormData({...formData, posterUrl: e.target.value})} />
               </div>
               <div className="bg-tz-yellow/10 border border-tz-yellow/20 p-5 rounded-2xl flex flex-col justify-center h-[68px]">
                  <label className="text-[9px] font-black text-tz-yellow uppercase tracking-widest block mb-1">Public TMDB</label>
                  <div className="text-xl font-black text-charcoal leading-none">{formData.tmdbRating || 0}<span className="text-xs opacity-30 ml-1">/10</span></div>
               </div>
            </div>

            <div>
                <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Distribution</label>
                <input type="text" placeholder="ex: Timothée Chalamet, Zendaya" className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-bold outline-none focus:ring-2 focus:ring-stone-100 transition-all placeholder:text-stone-200/50" value={formData.actors || ''} onChange={e => setFormData({...formData, actors: e.target.value})} />
                {formData.actorIds && formData.actorIds.length > 0 && onOpenFilmography && (
                  <div className="flex gap-2 mt-2">
                    {formData.actorIds.map(actor => (
                      <button 
                        key={actor.id}
                        type="button"
                        onClick={() => onOpenFilmography(actor.id, actor.name)}
                        className="text-[9px] font-black text-forest hover:text-charcoal bg-sand px-2 py-1 rounded-lg uppercase tracking-wider transition-colors"
                      >
                        {actor.name}
                      </button>
                    ))}
                  </div>
                )}
            </div>

            <div>
              <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-3 block ml-1">Ambiance Visuelle</label>
              <div className="flex gap-4 overflow-x-auto pb-2 no-scrollbar px-1">
                {THEME_COLORS.map(color => (
                  <button key={color} type="button" onClick={() => setFormData({...formData, theme: color})} className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 transition-all hover:scale-110 active:scale-90 ${formData.theme === color ? 'scale-110 ring-4 ring-offset-2 ring-stone-100 shadow-xl' : 'opacity-60 hover:opacity-100'}`} style={{ backgroundColor: color === 'black' ? '#18181B' : color === 'orange' ? '#FF5722' : color === 'green' ? '#10B981' : color === 'yellow' ? '#FACC15' : color === 'blue' ? '#38BDF8' : '#A855F7' }}>{formData.theme === color && <Check size={20} strokeWidth={3} className={color === 'yellow' ? 'text-black' : 'text-white'} />}</button>
                ))}
              </div>
            </div>
            
            <div>
              <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Genre Principal</label>
               <select className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-bold outline-none border focus:ring-2 focus:ring-stone-100 appearance-none bg-[url('data:image/svg+xml;charset=utf-8,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22none%22%20stroke%3D%22%2371717a%22%20stroke-width%3D%222%22%20stroke-linecap%3D%22round%22%20stroke-linejoin%3D%22round%22%3E%3Cpath%20d%3D%22M2%204l4%204%204-4%22%2F%3E%3C%2Fsvg%3E')] bg-[length:14px_14px] bg-[right_1.5rem_center] bg-no-repeat" value={formData.genre} onChange={e => setFormData({...formData, genre: e.target.value})}>
                 {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
               </select>
            </div>
          </div>

          {mode === 'watched' && (
             <div className="animate-[fadeIn_0.5s_ease-out] space-y-6">
                <div className="grid grid-cols-2 gap-4">
                   {Object.entries(formData.ratings).map(([key, val]) => (
                      <div key={key} className="bg-stone-50 p-5 rounded-2xl group/range transition-all hover:bg-stone-100/50 border border-transparent hover:border-stone-100">
                         <div className="flex justify-between mb-3">
                            <span className="text-[9px] font-black uppercase text-stone-500 tracking-widest">{ratingLabels[key] || key}</span>
                            <span className="text-xs font-black text-charcoal">{val}</span>
                         </div>
                         <input type="range" min="1" max="10" value={val} onChange={(e) => setFormData({ ...formData, ratings: {...formData.ratings, [key]: Number(e.target.value)} })} className="w-full h-1.5 bg-stone-200 rounded-full appearance-none accent-charcoal cursor-pointer" />
                      </div>
                   ))}
                </div>

                <div className="space-y-4">
                   <div className="bg-stone-50 p-4 rounded-2xl flex items-center justify-between cursor-pointer hover:bg-stone-100 transition-colors" onClick={() => setFormData(prev => ({ ...prev, rewatch: !prev.rewatch }))}>
                      <div className="flex items-center gap-3">
                         <div className={`w-10 h-10 rounded-xl flex items-center justify-center transition-colors ${formData.rewatch ? 'bg-forest text-white' : 'bg-white text-stone-300'}`}>
                            <Repeat size={18} strokeWidth={2.5} />
                         </div>
                         <div>
                            <p className="text-xs font-black text-charcoal uppercase tracking-wide">Je pourrais le revoir ?</p>
                            <p className="text-[10px] font-medium text-stone-400">Marquer comme répétable</p>
                         </div>
                      </div>
                   </div>

                   <div>
                      <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Qualificatifs</label>
                      <div className="flex flex-wrap gap-2">
                         {QUALITIES.map(tag => {
                            const isSelected = (formData.tags || []).includes(tag);
                            return (
                               <button
                                  type="button"
                                  key={tag}
                                  onClick={() => toggleTag(tag)}
                                  className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all active:scale-95 border ${isSelected ? 'bg-charcoal text-white border-charcoal shadow-lg' : 'bg-white text-stone-400 border-stone-100 hover:border-stone-200'}`}
                               >
                                  {tag}
                               </button>
                            );
                         })}
                      </div>
                   </div>
                </div>
                
                <div>
                   <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Votre Critique / Résumé</label>
                   <textarea className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-medium outline-none focus:ring-2 focus:ring-stone-100 transition-all h-28 resize-none text-sm leading-relaxed" placeholder="Une œuvre marquante..." value={formData.review} onChange={e => setFormData({...formData, review: e.target.value})} />
                </div>
             </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-100 bg-white rounded-b-3xl">
          <button 
            onClick={handleSubmit} 
            disabled={!!dateError}
            className={`w-full text-white font-black text-xs uppercase tracking-[0.2em] py-5 rounded-2xl shadow-xl active:scale-[0.97] transition-all hover:brightness-110 flex items-center justify-center gap-3 ${!!dateError ? 'bg-stone-300 shadow-none cursor-not-allowed' : (mode === 'watched' ? 'bg-charcoal shadow-charcoal/20' : 'bg-forest shadow-forest/20')}`}
          >
            {initialData ? <Check size={18} strokeWidth={3} /> : <Plus size={18} strokeWidth={3} />}
            {initialData ? 'Mettre à jour' : (mode === 'watched' ? (isFutureDate ? 'Planifier la séance' : 'Ajouter à l\'historique') : 'Mettre en file d\'attente')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddMovieModal;