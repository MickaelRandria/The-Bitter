import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Check, Eye, Clock, Search, Loader2, Film, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Sparkles, Wand2, Plus, Repeat, User, LayoutGrid, Calendar, Flame, AlertCircle, Smartphone, FlaskConical, PenTool, Drama, Aperture, Music, Calculator, Zap, Target, Hourglass, Activity, Thermometer } from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { MovieFormData, Movie, MovieStatus, ActorInfo, VibeCriteria, QualityMetrics, PacingType } from '../types';
import { haptics } from '../utils/haptics';

interface AddMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (movie: MovieFormData) => void;
  initialData: Movie | null;
  tmdbIdToLoad?: number | null;
  onOpenFilmography?: (id: number, name: string) => void;
}

const INITIAL_VIBE: VibeCriteria = {
  story: 5,
  emotion: 5,
  fun: 5,
  visual: 5,
  tension: 5
};

const INITIAL_QUALITY: QualityMetrics = {
  scenario: 5,
  acting: 5,
  visual: 5,
  sound: 5
};

const SYMPTOMS_LIST = [
  { id: 'tears', label: 'Larmes', emoji: '😭' },
  { id: 'laugh', label: 'Barre de rire', emoji: '😂' },
  { id: 'jump', label: 'Sursaut', emoji: '😱' },
  { id: 'mindblown', label: 'Mindfuck', emoji: '🤯' },
  { id: 'sleep', label: 'Sieste', emoji: '😴' },
  { id: 'angry', label: 'Colère', emoji: '😡' },
  { id: 'cringe', label: 'Malaise', emoji: '🤢' },
  { id: 'love', label: 'Papillons', emoji: '❤️' },
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
  tags: [],
  smartphoneFactor: 0,
  vibe: INITIAL_VIBE,
  qualityMetrics: INITIAL_QUALITY,
  hype: 5,
  pacing: undefined,
  symptoms: []
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
    haptics.soft();
    setViewDate(new Date(currentYear, currentMonth - 1, 1));
  };

  const handleNextMonth = (e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.soft();
    setViewDate(new Date(currentYear, currentMonth + 1, 1));
  };

  const handleSelectDay = (day: number, e: React.MouseEvent) => {
    e.stopPropagation();
    haptics.soft();
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
        onClick={() => { haptics.soft(); setIsOpen(!isOpen); }}
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
  
  // --- BITTER ADVANCED MODE STATE ---
  const [isAdvancedMode, setIsAdvancedMode] = useState(false);
  const [globalRating, setGlobalRating] = useState(5); // Used for Simple Mode

  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // Initial Data Loading
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        const { id, dateAdded, ...rest } = initialData;
        
        // Determine initial mode based on whether QualityMetrics exist and differ from default
        const hasQualityMetrics = !!rest.qualityMetrics;
        
        // Initial Ratings calculation
        const initialAvg = Math.round((rest.ratings.story + rest.ratings.visuals + rest.ratings.acting + rest.ratings.sound) / 4);

        setFormData({
            ...rest,
            dateWatched: rest.dateWatched || dateAdded || Date.now(),
            tmdbRating: rest.tmdbRating || 0,
            rewatch: rest.rewatch || false,
            tags: rest.tags || [],
            smartphoneFactor: rest.smartphoneFactor || 0,
            vibe: rest.vibe || INITIAL_VIBE,
            qualityMetrics: rest.qualityMetrics || INITIAL_QUALITY,
            hype: rest.hype !== undefined ? rest.hype : 5,
            pacing: rest.pacing,
            symptoms: rest.symptoms || []
        });
        setMode(rest.status || 'watched');
        setGlobalRating(initialAvg);
        // On n'active le mode avancé par défaut que si on a des données spécifiques
        setIsAdvancedMode(hasQualityMetrics);
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
        setIsAdvancedMode(false);
        setGlobalRating(5);
        
        if (tmdbIdToLoad) {
           fetchMovieDetails(tmdbIdToLoad);
        }
      }
    }
  }, [isOpen, initialData, tmdbIdToLoad]);

  useEffect(() => {
    setFormData(prev => ({ ...prev, status: mode }));
  }, [mode]);

  // --- LOGIC: AUTO-CALCULATE RATING IN ADVANCED MODE ---
  useEffect(() => {
      if (isAdvancedMode && formData.qualityMetrics) {
          const { scenario, acting, visual, sound } = formData.qualityMetrics;
          const avg = (scenario + acting + visual + sound) / 4;
          // Round to 1 decimal place
          const roundedAvg = Math.round(avg * 10) / 10;
          setGlobalRating(roundedAvg);
      }
  }, [isAdvancedMode, formData.qualityMetrics]);

  // Validation Date
  useEffect(() => {
    if (formData.releaseDate && formData.dateWatched) {
       const release = new Date(formData.releaseDate).getTime();
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

  // Search Logic (Kept same as before - condensed)
  useEffect(() => {
    const handleSearch = async () => {
        if (!tmdbQuery || tmdbQuery.length < 2) {
            setTmdbResults([]);
            setPersonResults([]);
            return;
        }
        setIsSearching(true);
        try {
            const endpoint = searchMode === 'title' ? 'movie' : 'person';
            const res = await fetch(`${TMDB_BASE_URL}/search/${endpoint}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(tmdbQuery)}&language=fr-FR`);
            const data = await res.json();
            if (data.results) {
                if (searchMode === 'title') setTmdbResults(data.results.slice(0, 5));
                else setPersonResults(data.results.slice(0, 5));
                setShowResults(true);
            }
        } catch (error) { console.error(error); } finally { setIsSearching(false); }
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
          const uniqueMovies = Array.from(new Map(allCredits.map(item => [item['id'], item])).values()).filter((m: any) => m.poster_path);
          setSelectedPerson(person);
          setPersonFilmography(uniqueMovies);
          setTmdbQuery('');
          setShowResults(false);
      } catch (error) { console.error(error); } finally { setIsSearching(false); }
  };

  const sortedFilmography = useMemo(() => {
    const m = [...personFilmography];
    if (filmographySort === 'popularity') return m.sort((a: any, b: any) => b.popularity - a.popularity).slice(0, 10);
    return m.sort((a: any, b: any) => new Date(b.release_date || 0).getTime() - new Date(a.release_date || 0).getTime()).slice(0, 10);
  }, [personFilmography, filmographySort]);

  const fetchMovieDetails = async (tmdbId: number) => {
      setIsSearching(true);
      try {
          const res = await fetch(`${TMDB_BASE_URL}/movie/${tmdbId}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
          const data = await res.json();
          const directorObj = data.credits?.crew?.find((p: any) => p.job === 'Director');
          const actorItems = data.credits?.cast?.slice(0, 3) || [];
          
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
              director: directorObj?.name || '',
              directorId: directorObj?.id,
              actors: actorItems.map((p: any) => p.name).join(', ') || '',
              actorIds: actorItems.map((p: any) => ({ id: p.id, name: p.name })),
              year: data.release_date ? parseInt(data.release_date.split('-')[0]) : new Date().getFullYear(),
              releaseDate: data.release_date || '',
              runtime: data.runtime || 0,
              genre,
              posterUrl: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '',
              tmdbRating: data.vote_average ? Number(data.vote_average.toFixed(1)) : 0,
              review: data.overview || '' 
          }));
          setTmdbQuery('');
          setShowResults(false);
          setSelectedPerson(null);
          setPersonFilmography([]);
      } catch (error) { console.error(error); } finally { setIsSearching(false); }
  };

  const toggleSymptom = (symptomId: string) => {
    haptics.soft();
    setFormData(prev => {
      const current = prev.symptoms || [];
      if (current.includes(symptomId)) {
        return { ...prev, symptoms: current.filter(s => s !== symptomId) };
      } else {
        return { ...prev, symptoms: [...current, symptomId] };
      }
    });
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateError) { haptics.error(); return; }
    if (!formData.title) return;
    
    let finalData = { ...formData, status: mode };
    
    if (mode === 'watchlist') {
        finalData.ratings = { story: 0, visuals: 0, acting: 0, sound: 0 };
        finalData.qualityMetrics = INITIAL_QUALITY;
        finalData.review = '';
        finalData.tags = [];
        finalData.rewatch = false;
        finalData.smartphoneFactor = 0;
        finalData.symptoms = [];
        finalData.hype = 5;
    } else {
        // MAPPING DES NOTES SELON LE MODE
        if (isAdvancedMode) {
            // En mode avancé, on utilise les qualityMetrics pour peupler le legacy rating
            finalData.ratings = {
                story: finalData.qualityMetrics?.scenario || 5,
                visuals: finalData.qualityMetrics?.visual || 5,
                acting: finalData.qualityMetrics?.acting || 5,
                sound: finalData.qualityMetrics?.sound || 5
            };
        } else {
            // En mode simple, on écrase tout avec la note globale
            finalData.ratings = {
                story: globalRating,
                visuals: globalRating,
                acting: globalRating,
                sound: globalRating
            };
            // On synchronise aussi les quality metrics pour garder la cohérence
            finalData.qualityMetrics = {
                scenario: globalRating,
                acting: globalRating,
                visual: globalRating,
                sound: globalRating
            };
            // Reset complex fields in simple mode
            finalData.symptoms = [];
            finalData.pacing = undefined;
        }
    }

    haptics.success();
    onSave(finalData);
  };

  const getSmartphoneLabel = (val: number) => {
    if (val < 20) return 'Immersion Totale 🧘';
    if (val < 60) return 'Second Écran 📱';
    return 'Bruit de fond complet 🗣️';
  };

  // Helper pour les sliders "épais" mobile-first
  const FatSlider = ({ value, min, max, step, onChange, colorClass = "bg-stone-200 accent-charcoal" }: any) => (
    <div className="relative h-6 w-full flex items-center">
        <input 
            type="range" 
            min={min}
            max={max}
            step={step}
            value={value} 
            onChange={onChange} 
            className={`w-full h-full rounded-full appearance-none cursor-pointer touch-none ${colorClass}`} 
            style={{
                WebkitAppearance: 'none',
                appearance: 'none',
            }}
        />
    </div>
  );

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
              <button onClick={() => { haptics.soft(); setMode('watched'); }} className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all ${mode === 'watched' ? 'bg-white text-charcoal shadow-sm scale-[1.02]' : 'text-stone-400'}`}>
                  <Eye size={18} strokeWidth={2.5} /> Vu
              </button>
              <button onClick={() => { haptics.soft(); setMode('watchlist'); }} className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all ${mode === 'watchlist' ? 'bg-white text-charcoal shadow-sm scale-[1.02]' : 'text-stone-400'}`}>
                  <Clock size={18} strokeWidth={2.5} /> À voir
              </button>
           </div>
        </div>

        <div className="overflow-y-auto p-6 space-y-8 flex-1 no-scrollbar">
          {!initialData && (
              <div className="relative z-30 group/search">
                  {/* ... SEARCH UI (Condensed) ... */}
                  <div className="flex bg-stone-100 p-1 rounded-2xl mb-6 border border-sand">
                      <button type="button" onClick={() => { haptics.soft(); setSearchMode('title'); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchMode === 'title' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}><LayoutGrid size={12} className="inline mr-2"/> Film</button>
                      <button type="button" onClick={() => { haptics.soft(); setSearchMode('director'); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchMode === 'director' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}><User size={12} className="inline mr-2"/> Réalisateur</button>
                  </div>
                  <div className="relative transition-all duration-300 transform group-focus-within/search:scale-[1.01]">
                      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none transition-colors group-focus-within/search:text-forest">
                          {isSearching ? <Loader2 size={22} className="animate-spin text-forest" /> : <Search size={22} strokeWidth={2.5} className="text-stone-300 group-focus-within/search:text-forest" />}
                      </div>
                      <input type="text" placeholder={searchMode === 'title' ? "Tapez le titre d'un film..." : "Nom d'un réalisateur..."} className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl py-5 pl-14 pr-4 text-base font-bold outline-none transition-all ring-1 ring-transparent focus:ring-2 focus:ring-forest/10 placeholder:text-stone-300 shadow-sm focus:shadow-md" value={tmdbQuery} onChange={(e) => { setTmdbQuery(e.target.value); if(e.target.value === '') setShowResults(false); }} autoFocus={!tmdbIdToLoad} />
                  </div>
                  {showResults && searchMode === 'title' && tmdbResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden animate-[fadeIn_0.3s_ease-out] z-40">
                          {tmdbResults.map((movie) => (
                              <button key={movie.id} onClick={() => { haptics.medium(); fetchMovieDetails(movie.id); }} className="w-full text-left p-4 hover:bg-forest/5 flex items-center gap-4 border-b border-stone-50 last:border-0 transition-colors">
                                  {movie.poster_path ? <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} className="w-12 h-16 object-cover rounded-xl shadow-md" alt=""/> : <div className="w-12 h-16 bg-stone-100 rounded-xl flex items-center justify-center"><Film size={20} className="text-stone-300" /></div>}
                                  <div><div className="font-bold text-sm text-charcoal">{movie.title}</div><div className="text-[10px] font-black uppercase text-stone-400 mt-1">{movie.release_date?.split('-')[0] || 'Inconnu'}</div></div>
                              </button>
                          ))}
                      </div>
                  )}
                  {showResults && searchMode === 'director' && personResults.length > 0 && (
                       <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden animate-[fadeIn_0.3s_ease-out] z-40">
                          {personResults.map((person) => (
                              <button key={person.id} onClick={() => { haptics.medium(); fetchPersonCredits(person); }} className="w-full text-left p-4 hover:bg-forest/5 flex items-center gap-4 border-b border-stone-50 last:border-0 transition-colors">
                                  {person.profile_path ? <img src={`${TMDB_IMAGE_URL}${person.profile_path}`} className="w-12 h-12 object-cover rounded-full shadow-md" alt=""/> : <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center"><User size={20} className="text-stone-300" /></div>}
                                  <div><div className="font-bold text-sm text-charcoal">{person.name}</div><div className="text-[9px] font-black uppercase text-stone-400 tracking-wider">Réalisateur/Acteur</div></div>
                              </button>
                          ))}
                      </div>
                  )}
                  {selectedPerson && personFilmography.length > 0 && (
                    <div className="mt-6 p-6 bg-stone-50 border border-sand rounded-[2.5rem] animate-[fadeIn_0.5s_ease-out] shadow-inner">
                       <div className="flex items-center justify-between mb-6 px-1">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm"><img src={`${TMDB_IMAGE_URL}${selectedPerson.profile_path}`} className="w-full h-full object-cover" alt="" /></div>
                            <div><h4 className="text-base font-black text-charcoal leading-none mb-1">{selectedPerson.name}</h4><p className="text-[9px] font-black uppercase text-forest tracking-widest">SÉLECTIONNEZ UNE ŒUVRE</p></div>
                          </div>
                          <button onClick={() => { haptics.soft(); setSelectedPerson(null); }} className="p-2 bg-white rounded-full text-stone-400 shadow-sm active:scale-90 transition-transform"><X size={14} /></button>
                       </div>
                       <div className="flex gap-2 mb-6">
                           <button type="button" onClick={() => { haptics.soft(); setFilmographySort('popularity'); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${filmographySort === 'popularity' ? 'bg-charcoal text-white shadow-md' : 'bg-white text-stone-400 border border-sand'}`}><Flame size={12} /> Top 10</button>
                           <button type="button" onClick={() => { haptics.soft(); setFilmographySort('latest'); }} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-[9px] font-black uppercase tracking-widest transition-all ${filmographySort === 'latest' ? 'bg-charcoal text-white shadow-md' : 'bg-white text-stone-400 border border-sand'}`}><Calendar size={12} /> Récents</button>
                       </div>
                       <div className="grid grid-cols-2 gap-4 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                          {sortedFilmography.map(movie => (
                             <button key={movie.id} onClick={() => { haptics.medium(); fetchMovieDetails(movie.id); }} className="flex flex-col text-left group/item animate-[fadeIn_0.3s_ease-out]">
                                <div className="aspect-[2/3] rounded-2xl overflow-hidden mb-2 shadow-sm group-hover/item:shadow-lg transition-all relative">
                                   <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} alt={movie.title} className="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-700" />
                                   <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center"><Plus size={24} className="text-white drop-shadow-lg" strokeWidth={3} /></div>
                                </div>
                                <p className="text-[10px] font-black text-charcoal leading-tight uppercase tracking-tighter line-clamp-2 px-1">{movie.title}</p>
                             </button>
                          ))}
                       </div>
                    </div>
                  )}
              </div>
          )}

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
                </div>
              </div>
              <div>
                <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Genre</label>
                 <select className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-bold outline-none border focus:ring-2 focus:ring-stone-100 appearance-none" value={formData.genre} onChange={e => { haptics.soft(); setFormData({...formData, genre: e.target.value}); }}>
                   {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                 </select>
              </div>
            </div>
          </div>

          {mode === 'watched' && (
             <div className="animate-[fadeIn_0.5s_ease-out] space-y-8">
                
                {/* GLOBAL RATING */}
                <div>
                   <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Note Globale</label>
                   <div className={`p-6 rounded-3xl border transition-all duration-300 ${isAdvancedMode ? 'bg-stone-100 border-stone-200' : 'bg-stone-50 border-transparent hover:border-stone-100'}`}>
                       <div className="flex justify-between items-end mb-4">
                            <div className="flex items-center gap-3">
                                <span className={`text-4xl font-black transition-colors ${isAdvancedMode ? 'text-stone-400' : 'text-charcoal'}`}>{globalRating}</span>
                                {isAdvancedMode && (
                                    <span className="bg-forest/10 text-forest px-2 py-1 rounded-md text-[9px] font-black uppercase tracking-wider flex items-center gap-1">
                                        <Calculator size={10} /> Calculé
                                    </span>
                                )}
                            </div>
                            <span className="text-xs font-bold text-stone-400 mb-1">/10</span>
                       </div>
                       <FatSlider 
                         min={1}
                         max={10}
                         step={0.1}
                         value={globalRating}
                         onChange={(e: any) => { 
                             if(!isAdvancedMode) {
                                 haptics.soft(); 
                                 setGlobalRating(Number(e.target.value)); 
                             }
                         }}
                         colorClass={isAdvancedMode ? 'bg-stone-200 accent-stone-400 cursor-not-allowed' : 'bg-stone-200 accent-charcoal'}
                       />
                   </div>
                </div>

                {/* --- TOGGLE ADVANCED MODE --- */}
                <button 
                  type="button"
                  onClick={() => { haptics.medium(); setIsAdvancedMode(!isAdvancedMode); }}
                  className={`w-full py-4 px-6 rounded-2xl border-2 font-black text-xs uppercase tracking-[0.15em] transition-all flex items-center justify-center gap-2 ${isAdvancedMode ? 'bg-lime-50 border-lime-500 text-lime-700' : 'bg-transparent border-lime-500 text-lime-600 hover:bg-lime-50'}`}
                >
                    <FlaskConical size={18} strokeWidth={2.5} />
                    {isAdvancedMode ? 'Désactiver l\'Analyse' : 'Analyser le film (Mode Bitter)'}
                </button>

                {/* --- ADVANCED MODE SECTIONS --- */}
                {isAdvancedMode && (
                    <div className="animate-[slideUp_0.4s_ease-out] space-y-8">
                        
                        {/* BLOC 1 : QUALITÉ TECHNIQUE */}
                        <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-100">
                             <div className="flex items-center gap-2 mb-6 border-b border-stone-200 pb-4">
                                <PenTool size={18} className="text-charcoal" />
                                <span className="text-[11px] font-black uppercase text-charcoal tracking-widest">Critères Techniques</span>
                            </div>
                            
                            <div className="space-y-8">
                                {[
                                    { key: 'scenario', label: 'Scénario', icon: <PenTool size={14} /> },
                                    { key: 'acting', label: 'Jeu d\'acteur', icon: <Drama size={14} /> },
                                    { key: 'visual', label: 'Réalisation', icon: <Aperture size={14} /> },
                                    { key: 'sound', label: 'Son & BO', icon: <Music size={14} /> },
                                ].map((metric) => (
                                    <div key={metric.key} className="space-y-3">
                                        <div className="flex justify-between items-center">
                                            <div className="flex items-center gap-2 text-stone-500">
                                                {metric.icon}
                                                <span className="text-[10px] font-bold uppercase tracking-widest">{metric.label}</span>
                                            </div>
                                            <span className="text-xs font-black text-charcoal">{(formData.qualityMetrics as any)[metric.key]}/10</span>
                                        </div>
                                        <FatSlider
                                            min={0}
                                            max={10}
                                            value={(formData.qualityMetrics as any)[metric.key]} 
                                            onChange={(e: any) => { 
                                                haptics.soft(); 
                                                setFormData({ 
                                                    ...formData, 
                                                    qualityMetrics: { ...formData.qualityMetrics!, [metric.key]: Number(e.target.value) } 
                                                }); 
                                            }} 
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* BLOC 2 : L'EXPÉRIENCE BITTER (Hype, Pacing, Symptoms) */}
                        <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-100">
                             <div className="flex items-center gap-2 mb-6 border-b border-stone-200 pb-4">
                                <Activity size={18} className="text-charcoal" />
                                <span className="text-[11px] font-black uppercase text-charcoal tracking-widest">L'Expérience Bitter</span>
                            </div>
                            
                            {/* 1. HYPE DELTA */}
                            <div className="mb-10">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-2 text-stone-500">
                                        <Thermometer size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Attente initiale (Hype)</span>
                                    </div>
                                    <span className="text-2xl font-black text-charcoal">{formData.hype}/10</span>
                                </div>
                                <FatSlider
                                    min={0}
                                    max={10}
                                    value={formData.hype}
                                    onChange={(e: any) => { haptics.soft(); setFormData({ ...formData, hype: Number(e.target.value) }); }}
                                    colorClass="bg-stone-200 accent-charcoal"
                                />
                                <div className="flex justify-between mt-2 text-[9px] font-bold text-stone-400 uppercase tracking-widest px-1">
                                    <span>Osef total</span>
                                    <span>Curieux</span>
                                    <span>Hype absolue</span>
                                </div>
                            </div>

                            {/* 2. PACING */}
                            <div className="mb-10">
                                <div className="flex items-center gap-2 text-stone-500 mb-4">
                                    <Hourglass size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Le Rythme (Pacing)</span>
                                </div>
                                <div className="flex bg-white p-1.5 rounded-2xl border border-stone-100 shadow-sm">
                                    <button 
                                        type="button"
                                        onClick={() => { haptics.soft(); setFormData({ ...formData, pacing: 'slow' }); }}
                                        className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${formData.pacing === 'slow' ? 'bg-stone-200 text-stone-600' : 'text-stone-300 hover:bg-stone-50'}`}
                                    >
                                        <Hourglass size={20} strokeWidth={2.5} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Longuet</span>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => { haptics.soft(); setFormData({ ...formData, pacing: 'perfect' }); }}
                                        className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${formData.pacing === 'perfect' ? 'bg-forest text-white shadow-md scale-105 z-10' : 'text-stone-300 hover:bg-stone-50'}`}
                                    >
                                        <Target size={20} strokeWidth={2.5} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Impeccable</span>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => { haptics.soft(); setFormData({ ...formData, pacing: 'fast' }); }}
                                        className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${formData.pacing === 'fast' ? 'bg-orange-100 text-orange-600' : 'text-stone-300 hover:bg-stone-50'}`}
                                    >
                                        <Zap size={20} strokeWidth={2.5} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Rushé</span>
                                    </button>
                                </div>
                            </div>

                            {/* 3. SYMPTOMS */}
                            <div>
                                <div className="flex items-center gap-2 text-stone-500 mb-4">
                                    <Activity size={14} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Réactions Physiques</span>
                                </div>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {SYMPTOMS_LIST.map(symptom => {
                                        const isActive = (formData.symptoms || []).includes(symptom.id);
                                        return (
                                            <button
                                                key={symptom.id}
                                                type="button"
                                                onClick={() => toggleSymptom(symptom.id)}
                                                className={`py-3 px-2 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${isActive ? 'bg-charcoal border-charcoal text-white shadow-lg scale-95' : 'bg-white border-transparent text-stone-400 hover:border-stone-100'}`}
                                            >
                                                <span className="text-xl">{symptom.emoji}</span>
                                                <span className="text-[9px] font-black uppercase tracking-tighter">{symptom.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>

                        {/* BLOC 3 : CONTEXTE & RESSENTI (Legacy renamed) */}
                        <div className="bg-lime-50/50 p-6 rounded-[2rem] border border-lime-100">
                             <div className="flex items-center gap-2 mb-6 border-b border-lime-200 pb-4">
                                <Flame size={18} className="text-lime-700" />
                                <span className="text-[11px] font-black uppercase text-lime-700 tracking-widest">Contexte & Profil Radar</span>
                            </div>

                             {/* SMARTPHONE */}
                            <div className="mb-10">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-2 text-lime-800">
                                        <Smartphone size={14} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Distraction</span>
                                    </div>
                                    <span className="text-xs font-black text-lime-800">{formData.smartphoneFactor}%</span>
                                </div>
                                <FatSlider
                                    min={0}
                                    max={100}
                                    step={5}
                                    value={formData.smartphoneFactor || 0}
                                    onChange={(e: any) => { haptics.soft(); setFormData({ ...formData, smartphoneFactor: Number(e.target.value) }); }}
                                    colorClass="bg-lime-200 accent-lime-600"
                                />
                                <div className="mt-2 text-center">
                                    <span className="text-[9px] font-bold text-lime-700 uppercase tracking-widest">
                                        {getSmartphoneLabel(formData.smartphoneFactor || 0)}
                                    </span>
                                </div>
                            </div>

                            {/* RADAR VIBE */}
                            <div className="space-y-8">
                                {[
                                    { key: 'story', label: 'Cérébral', sub: 'Complexité / Scénario', emoji: '🧠' },
                                    { key: 'emotion', label: 'Émotion', sub: 'Larmes / Frissons', emoji: '😭' },
                                    { key: 'fun', label: 'Fun', sub: 'Humour / Divertissement', emoji: '😂' },
                                    { key: 'visual', label: 'Visuel', sub: 'Esthétique / FX', emoji: '🎨' },
                                    { key: 'tension', label: 'Tension', sub: 'Angoisse / Suspense', emoji: '😱' },
                                ].map((axis) => (
                                    <div key={axis.key} className="space-y-3">
                                        <div className="flex justify-between items-end">
                                            <div className="flex items-center gap-3">
                                                <span className="text-xl leading-none">{axis.emoji}</span>
                                                <div className="flex flex-col">
                                                    <span className="text-[11px] font-black uppercase text-lime-900 tracking-widest">{axis.label}</span>
                                                    <span className="text-[9px] font-bold text-lime-700/60 uppercase tracking-wide">{axis.sub}</span>
                                                </div>
                                            </div>
                                            <span className="text-xs font-black text-lime-900">{(formData.vibe as any)[axis.key]}/10</span>
                                        </div>
                                        <FatSlider
                                            min={0}
                                            max={10}
                                            value={(formData.vibe as any)[axis.key]} 
                                            onChange={(e: any) => { 
                                                haptics.soft(); 
                                                setFormData({ 
                                                    ...formData, 
                                                    vibe: { ...formData.vibe!, [axis.key]: Number(e.target.value) } 
                                                }); 
                                            }}
                                            colorClass="bg-lime-200 accent-lime-600"
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                )}
                
                <div>
                   <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Votre Critique</label>
                   <textarea className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-medium outline-none focus:ring-2 focus:ring-stone-100 transition-all h-24 resize-none text-sm leading-relaxed" placeholder="En quelques mots..." value={formData.review} onChange={e => setFormData({...formData, review: e.target.value})} />
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