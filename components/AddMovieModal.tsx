
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, Check, Eye, Clock, Search, Loader2, Film, Calendar as CalendarIcon, ChevronLeft, ChevronRight, Sparkles, Wand2, Plus, Repeat, User, LayoutGrid, Calendar, Flame, AlertCircle, Smartphone, FlaskConical, PenTool, Drama, Aperture, Music, Calculator, Zap, Target, Hourglass, Activity, Thermometer, Minus, HeartHandshake, PartyPopper, Bomb, BrainCircuit, ToggleLeft, ToggleRight, Star, GraduationCap, Share, Instagram } from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { MovieFormData, Movie, MovieStatus, ActorInfo, VibeCriteria, QualityMetrics, PacingType } from '../types';
import { haptics } from '../utils/haptics';
import html2canvas from 'html2canvas';

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

// --- SUB-COMPONENTS ---

interface RatingStepperProps {
  label: string;
  value: number;
  onChange: (val: number) => void;
  icon: React.ReactNode;
  colorScale?: 'default' | 'vibe';
  large?: boolean;
}

const RatingStepper: React.FC<RatingStepperProps> = ({ label, value, onChange, icon, colorScale = 'default', large = false }) => {
  const getColor = (v: number) => {
    if (colorScale === 'vibe') {
        if (v < 4) return 'bg-stone-300';
        if (v < 7) return 'bg-indigo-400';
        return 'bg-purple-600';
    }
    if (v < 5) return 'bg-red-500';
    if (v < 8) return 'bg-yellow-400';
    return 'bg-emerald-500';
  };

  const getTextColor = (v: number) => {
    if (colorScale === 'vibe') {
        if (v < 4) return 'text-stone-400';
        if (v < 7) return 'text-indigo-500';
        return 'text-purple-600';
    }
    if (v < 5) return 'text-red-600';
    if (v < 8) return 'text-yellow-600';
    return 'text-emerald-600';
  };

  const handleDecrement = () => {
    haptics.soft();
    onChange(Math.max(0, value - 1));
  };

  const handleIncrement = () => {
    haptics.soft();
    onChange(Math.min(10, value + 1));
  };

  return (
    <div className={`bg-stone-50 rounded-2xl border border-stone-200 ${large ? 'p-6' : 'p-4'}`}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className={large ? "text-gray-900 scale-125" : "text-gray-900"}>{icon}</div>
          <span className={`${large ? 'text-lg' : 'text-sm'} font-black uppercase tracking-widest text-gray-900`}>{label}</span>
        </div>
        <span className={`${large ? 'text-4xl' : 'text-2xl'} font-black ${getTextColor(value)} transition-colors`}>
          {value}/10
        </span>
      </div>

      <div className="flex items-center gap-4">
        <button 
          type="button"
          onClick={handleDecrement}
          className={`${large ? 'w-16 h-16' : 'w-14 h-14'} rounded-xl border-2 border-gray-200 bg-white flex items-center justify-center text-gray-900 active:bg-gray-100 active:scale-95 transition-all touch-manipulation`}
        >
          <Minus size={large ? 28 : 24} strokeWidth={3} />
        </button>

        <div className={`flex-1 ${large ? 'h-6' : 'h-4'} bg-gray-200 rounded-full overflow-hidden relative`}>
          <div 
            className={`h-full ${getColor(value)} transition-all duration-300 ease-out`} 
            style={{ width: `${value * 10}%` }} 
          />
          <div className="absolute inset-0 flex justify-between px-1">
             {[...Array(9)].map((_, i) => (
                <div key={i} className="w-[1px] h-full bg-white/20" />
             ))}
          </div>
        </div>

        <button 
          type="button"
          onClick={handleIncrement}
          className={`${large ? 'w-16 h-16' : 'w-14 h-14'} rounded-xl bg-gray-900 flex items-center justify-center text-white active:bg-black active:scale-95 transition-all shadow-lg touch-manipulation`}
        >
          <Plus size={large ? 28 : 24} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
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
  
  const [isBitterMode, setIsBitterMode] = useState(false);
  const [globalRating, setGlobalRating] = useState(5);

  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);

  // NOUVEAU : État de succès (Victory Lap)
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const storyRef = useRef<HTMLDivElement>(null);

  // --- INITIALIZATION ---
  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false); // Reset success state on open
      if (initialData) {
        const { id, dateAdded, ...rest } = initialData;
        
        const metrics = rest.qualityMetrics || INITIAL_QUALITY;
        const vals = Object.values(metrics);
        const hasContext = (rest.hype !== undefined && rest.hype !== 5) || (rest.symptoms && rest.symptoms.length > 0) || (rest.smartphoneFactor !== undefined && rest.smartphoneFactor > 0);
        const areRatingsDiverse = !vals.every(v => v === vals[0]);
        
        const detectBitter = areRatingsDiverse || hasContext;
        setIsBitterMode(detectBitter);

        const initialAvg = Math.round((metrics.scenario + metrics.acting + metrics.visual + metrics.sound) / 4);
        setGlobalRating(initialAvg);

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
        setIsBitterMode(false);
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

  // Search Logic (Identique)
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

  const getAddictionLevel = (val: number) => {
      if(val < 20) return { label: 'Focus Absolu', color: 'text-emerald-500', bg: 'bg-emerald-500' };
      if(val < 60) return { label: 'Un œil sur Insta', color: 'text-yellow-500', bg: 'bg-yellow-500' };
      return { label: 'Dopamine Junkie', color: 'text-red-500', bg: 'bg-red-500' };
  }

  // --- STORY SHARING LOGIC ---
  const handleShareStory = async () => {
    if (!storyRef.current || isSharing) return;
    setIsSharing(true);
    haptics.medium();

    try {
      await new Promise(resolve => setTimeout(resolve, 500));
      const canvas = await html2canvas(storyRef.current, {
        scale: 2,
        backgroundColor: '#0c0c0c',
        useCORS: true,
        allowTaint: true,
      });

      canvas.toBlob(async (blob) => {
        if (!blob) { setIsSharing(false); return; }
        const file = new File([blob], 'my-bitter-review.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            await navigator.share({ files: [file] });
            haptics.success();
        } else {
            const link = document.createElement('a');
            link.download = 'my-bitter-review.png';
            link.href = canvas.toDataURL();
            link.click();
            haptics.success();
        }
        setIsSharing(false);
      }, 'image/png');
    } catch (error) {
        console.error("Story gen error", error);
        setIsSharing(false);
        haptics.error();
    }
  };

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (dateError) { haptics.error(); return; }
    if (!formData.title) return;
    
    let finalData = { ...formData, status: mode };
    
    if (mode === 'watchlist') {
        // ... watchlist reset logic ...
        finalData.ratings = { story: 0, visuals: 0, acting: 0, sound: 0 };
        finalData.qualityMetrics = INITIAL_QUALITY;
        finalData.review = '';
        finalData.tags = [];
        finalData.rewatch = false;
        finalData.smartphoneFactor = 0;
        finalData.symptoms = [];
        finalData.hype = 5;
    } else {
        if (!isBitterMode) {
            finalData.qualityMetrics = {
                scenario: globalRating,
                acting: globalRating,
                visual: globalRating,
                sound: globalRating,
            };
            finalData.vibe = {
                story: globalRating,
                visual: globalRating,
                emotion: globalRating,
                fun: globalRating,
                tension: globalRating
            };
            finalData.hype = 5;
            finalData.pacing = undefined;
            finalData.symptoms = [];
        } else {
            finalData.qualityMetrics = {
                scenario: Math.round(finalData.qualityMetrics?.scenario || 5),
                acting: Math.round(finalData.qualityMetrics?.acting || 5),
                visual: Math.round(finalData.qualityMetrics?.visual || 5),
                sound: Math.round(finalData.qualityMetrics?.sound || 5),
            };
            finalData.vibe = {
                story: finalData.qualityMetrics.scenario, 
                visual: finalData.qualityMetrics.visual, 
                emotion: Math.round(finalData.vibe?.emotion || 5),
                fun: Math.round(finalData.vibe?.fun || 5),
                tension: Math.round(finalData.vibe?.tension || 5)
            };
        }
        finalData.ratings = {
            story: finalData.qualityMetrics.scenario,
            visuals: finalData.qualityMetrics.visual,
            acting: finalData.qualityMetrics.acting,
            sound: finalData.qualityMetrics.sound
        };
    }

    onSave(finalData);
    haptics.success();
    
    // Si c'était un film vu (pas watchlist), on montre le Victory Lap
    if (mode === 'watched') {
        setIsSuccess(true);
    }
  };

  // Helper pour les sliders "épais"
  const FatSlider = ({ value, min, max, step, onChange, colorClass = "bg-stone-200 accent-charcoal" }: any) => (
    <div className="relative h-6 w-full flex items-center group/slider">
        <input 
            type="range" 
            min={min}
            max={max}
            step={step}
            value={value} 
            onChange={onChange} 
            className={`w-full h-full rounded-full appearance-none cursor-pointer touch-none ${colorClass} transition-all`} 
            style={{
                WebkitAppearance: 'none',
                appearance: 'none',
            }}
        />
        <div className="absolute inset-y-0 left-0 bg-white/20 pointer-events-none rounded-full" />
    </div>
  );

  // --- VICTORY LAP RENDERING ---
  if (isSuccess) {
      return (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-[#0c0c0c] text-white animate-[fadeIn_0.5s_ease-out]">
            {/* Background Poster Blur */}
            {formData.posterUrl && (
                <div className="absolute inset-0 z-0">
                    <img src={formData.posterUrl} className="w-full h-full object-cover opacity-20 blur-3xl scale-110" alt="" />
                    <div className="absolute inset-0 bg-[#0c0c0c]/80" />
                </div>
            )}

            <div className="relative z-10 w-full max-w-md p-8 flex flex-col items-center text-center space-y-8 animate-[scaleIn_0.4s_cubic-bezier(0.16,1,0.3,1)]">
                <div className="w-24 h-24 bg-lime-400 text-charcoal rounded-full flex items-center justify-center shadow-[0_0_60px_-15px_rgba(163,230,53,0.5)] mb-4">
                    <Check size={48} strokeWidth={4} />
                </div>
                
                <div>
                    <h2 className="text-4xl font-black tracking-tighter leading-none mb-4">C'est dans la boîte.</h2>
                    <p className="text-stone-400 font-medium text-lg max-w-xs mx-auto">
                        Le réalisateur tremble déjà. Votre verdict est enregistré.
                    </p>
                </div>

                <div className="w-full space-y-4 pt-8">
                    <button 
                        onClick={handleShareStory}
                        disabled={isSharing}
                        className="w-full bg-white text-charcoal py-5 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl hover:scale-105 active:scale-95 transition-all flex items-center justify-center gap-3"
                    >
                        {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Instagram size={20} />}
                        Partager mon verdict
                    </button>
                    
                    <button 
                        onClick={onClose}
                        className="w-full py-4 text-stone-500 font-bold text-xs uppercase tracking-widest hover:text-white transition-colors"
                    >
                        Retour à l'accueil
                    </button>
                </div>
            </div>

            {/* --- HIDDEN STORY TEMPLATE (9:16) --- */}
            <div 
                style={{ position: 'fixed', top: 0, left: '-9999px', pointerEvents: 'none' }}
            >
                <div 
                    ref={storyRef}
                    className="w-[1080px] h-[1920px] bg-[#0c0c0c] relative overflow-hidden flex flex-col"
                >
                    {/* Full Screen Poster Background */}
                    {formData.posterUrl && (
                        <img 
                            src={formData.posterUrl.replace('w780', 'original')} 
                            alt="" 
                            className="absolute inset-0 w-full h-full object-cover opacity-60" 
                            crossOrigin="anonymous"
                        />
                    )}
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-[#0c0c0c]/40 to-[#0c0c0c]" />

                    {/* Content Layer */}
                    <div className="relative z-10 flex-1 flex flex-col justify-between p-[80px]">
                        {/* Header */}
                        <div className="flex justify-between items-center">
                            <span className="text-lime-400 text-3xl font-black uppercase tracking-[0.4em]">The Bitter</span>
                            <div className="bg-white/10 backdrop-blur-md px-6 py-3 rounded-full border border-white/20">
                                <span className="text-white text-2xl font-bold tracking-wider">
                                    {formData.dateWatched ? new Date(formData.dateWatched).getFullYear() : 2026}
                                </span>
                            </div>
                        </div>

                        {/* Centerpiece: Dynamic based on Addiction */}
                        <div className="flex flex-col items-center text-center space-y-8">
                            {formData.smartphoneFactor && formData.smartphoneFactor > 50 ? (
                                <>
                                    {/* HUMILIATION MODE */}
                                    <div className="bg-red-600 text-white px-8 py-4 rounded-full inline-block mb-4 shadow-[0_0_50px_rgba(220,38,38,0.6)]">
                                        <span className="text-4xl font-black uppercase tracking-widest">⚠️ ALERTE TOXIQUE</span>
                                    </div>
                                    <h1 className="text-[180px] font-black text-white leading-[0.8] tracking-tighter drop-shadow-2xl">
                                        {formData.smartphoneFactor}%
                                    </h1>
                                    <p className="text-5xl font-black text-stone-300 uppercase tracking-[0.3em] bg-black/60 px-8 py-2">
                                        Temps d'écran
                                    </p>
                                    <p className="text-3xl text-stone-400 font-bold mt-4 italic">"J'ai scrollé pendant tout le film"</p>
                                </>
                            ) : (
                                <>
                                    {/* APPRECIATION MODE */}
                                    <div className="flex items-center gap-6 mb-8">
                                        {[...Array(5)].map((_, i) => (
                                            <Star key={i} size={60} fill={i < Math.round(((formData.ratings?.story || 0) + (formData.ratings?.visuals || 0))/2 / 2) ? "#a3e635" : "transparent"} stroke={i < Math.round(((formData.ratings?.story || 0) + (formData.ratings?.visuals || 0))/2 / 2) ? "none" : "#fff"} strokeWidth={3} />
                                        ))}
                                    </div>
                                    <h1 className="text-[120px] font-black text-white leading-[0.9] tracking-tighter line-clamp-3 mb-6 drop-shadow-2xl">
                                        {formData.title}
                                    </h1>
                                    <div className="flex gap-6 mt-8">
                                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-[3rem] flex flex-col items-center min-w-[280px]">
                                            <span className="text-2xl font-bold text-stone-400 uppercase tracking-widest mb-2">Visuel</span>
                                            <span className="text-7xl font-black text-lime-400">{formData.ratings?.visuals}/10</span>
                                        </div>
                                        <div className="bg-white/10 backdrop-blur-md border border-white/20 p-8 rounded-[3rem] flex flex-col items-center min-w-[280px]">
                                            <span className="text-2xl font-bold text-stone-400 uppercase tracking-widest mb-2">Histoire</span>
                                            <span className="text-7xl font-black text-white">{formData.ratings?.story}/10</span>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>

                        {/* Footer */}
                        <div className="mt-auto pt-[60px] flex justify-center opacity-80">
                            <span className="text-3xl font-bold text-stone-500 uppercase tracking-[0.2em]">Review générée par The Bitter App</span>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      );
  }

  // --- STANDARD FORM RENDERING ---

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm transition-opacity duration-500" onClick={onClose} />
      <div className="bg-white w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl relative z-10 max-h-[95vh] flex flex-col animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex justify-between items-center p-6 pb-2">
          <h2 className="text-3xl font-black text-gray-900 tracking-tighter">{initialData ? 'Modifier' : 'Nouveau Film'}</h2>
          <button onClick={onClose} className="p-3 bg-gray-100 rounded-full text-gray-900 hover:bg-gray-200 transition-all active:scale-90"><X size={20} strokeWidth={2.5} /></button>
        </div>

        <div className="px-6 pb-2">
           <div className="flex bg-stone-100/80 p-1.5 rounded-2xl border border-stone-200">
              <button onClick={() => { haptics.soft(); setMode('watched'); }} className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all ${mode === 'watched' ? 'bg-white text-gray-900 shadow-sm scale-[1.02] border border-stone-100' : 'text-stone-400'}`}>
                  <Eye size={18} strokeWidth={2.5} /> Vu
              </button>
              <button onClick={() => { haptics.soft(); setMode('watchlist'); }} className={`flex-1 flex items-center justify-center gap-2 py-3.5 rounded-xl text-sm font-bold transition-all ${mode === 'watchlist' ? 'bg-white text-gray-900 shadow-sm scale-[1.02] border border-stone-100' : 'text-stone-400'}`}>
                  <Clock size={18} strokeWidth={2.5} /> À voir
              </button>
           </div>
        </div>

        <div className="overflow-y-auto p-6 space-y-8 flex-1 no-scrollbar">
          {!initialData && (
              <div className="relative z-30 group/search">
                  {/* ... SEARCH UI (UNCHANGED) ... */}
                  <div className="flex bg-stone-100 p-1 rounded-2xl mb-6 border border-stone-200">
                      <button type="button" onClick={() => { haptics.soft(); setSearchMode('title'); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchMode === 'title' ? 'bg-white text-gray-900 shadow-sm' : 'text-stone-400'}`}><LayoutGrid size={12} className="inline mr-2"/> Film</button>
                      <button type="button" onClick={() => { haptics.soft(); setSearchMode('director'); }} className={`flex-1 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchMode === 'director' ? 'bg-white text-gray-900 shadow-sm' : 'text-stone-400'}`}><User size={12} className="inline mr-2"/> Réalisateur</button>
                  </div>
                  <div className="relative transition-all duration-300 transform group-focus-within/search:scale-[1.01]">
                      <div className="absolute inset-y-0 left-0 pl-5 flex items-center pointer-events-none transition-colors group-focus-within/search:text-gray-900">
                          {isSearching ? <Loader2 size={22} className="animate-spin text-gray-900" /> : <Search size={22} strokeWidth={2.5} className="text-stone-400 group-focus-within/search:text-gray-900" />}
                      </div>
                      <input type="text" placeholder={searchMode === 'title' ? "Tapez le titre d'un film..." : "Nom d'un réalisateur..."} className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl py-5 pl-14 pr-4 text-base font-bold outline-none transition-all ring-1 ring-transparent focus:ring-2 focus:ring-gray-900/10 placeholder:text-stone-400 shadow-sm focus:shadow-md text-gray-900" value={tmdbQuery} onChange={(e) => { setTmdbQuery(e.target.value); if(e.target.value === '') setShowResults(false); }} autoFocus={!tmdbIdToLoad} />
                  </div>
                  {showResults && searchMode === 'title' && tmdbResults.length > 0 && (
                      <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden animate-[fadeIn_0.3s_ease-out] z-40">
                          {tmdbResults.map((movie) => (
                              <button key={movie.id} onClick={() => { haptics.medium(); fetchMovieDetails(movie.id); }} className="w-full text-left p-4 hover:bg-stone-50 flex items-center gap-4 border-b border-stone-50 last:border-0 transition-colors">
                                  {movie.poster_path ? <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} className="w-12 h-16 object-cover rounded-xl shadow-md" alt=""/> : <div className="w-12 h-16 bg-stone-100 rounded-xl flex items-center justify-center"><Film size={20} className="text-stone-300" /></div>}
                                  <div><div className="font-bold text-sm text-gray-900">{movie.title}</div><div className="text-[10px] font-black uppercase text-stone-400 mt-1">{movie.release_date?.split('-')[0] || 'Inconnu'}</div></div>
                              </button>
                          ))}
                      </div>
                  )}
                  {showResults && searchMode === 'director' && personResults.length > 0 && (
                       <div className="absolute top-full left-0 right-0 mt-3 bg-white rounded-3xl shadow-2xl border border-stone-100 overflow-hidden animate-[fadeIn_0.3s_ease-out] z-40">
                          {personResults.map((person) => (
                              <button key={person.id} onClick={() => { haptics.medium(); fetchPersonCredits(person); }} className="w-full text-left p-4 hover:bg-stone-50 flex items-center gap-4 border-b border-stone-50 last:border-0 transition-colors">
                                  {person.profile_path ? <img src={`${TMDB_IMAGE_URL}${person.profile_path}`} className="w-12 h-12 object-cover rounded-full shadow-md" alt=""/> : <div className="w-12 h-12 bg-stone-100 rounded-full flex items-center justify-center"><User size={20} className="text-stone-300" /></div>}
                                  <div><div className="font-bold text-sm text-gray-900">{person.name}</div><div className="text-[9px] font-black uppercase text-stone-400 tracking-wider">Réalisateur/Acteur</div></div>
                              </button>
                          ))}
                      </div>
                  )}
                  {selectedPerson && personFilmography.length > 0 && (
                    <div className="mt-6 p-6 bg-stone-50 border border-stone-200 rounded-[2.5rem] animate-[fadeIn_0.5s_ease-out] shadow-inner">
                       <div className="flex items-center justify-between mb-6 px-1">
                          <div className="flex items-center gap-3">
                            <div className="w-12 h-12 rounded-full overflow-hidden border-2 border-white shadow-sm"><img src={`${TMDB_IMAGE_URL}${selectedPerson.profile_path}`} className="w-full h-full object-cover" alt="" /></div>
                            <div><h4 className="text-base font-black text-gray-900 leading-none mb-1">{selectedPerson.name}</h4><p className="text-[9px] font-black uppercase text-forest tracking-widest">SÉLECTIONNEZ UNE ŒUVRE</p></div>
                          </div>
                          <button onClick={() => { haptics.soft(); setSelectedPerson(null); }} className="p-2 bg-white rounded-full text-stone-400 shadow-sm active:scale-90 transition-transform"><X size={14} /></button>
                       </div>
                       <div className="grid grid-cols-2 gap-4 max-h-[350px] overflow-y-auto no-scrollbar pr-1">
                          {sortedFilmography.map(movie => (
                             <button key={movie.id} onClick={() => { haptics.medium(); fetchMovieDetails(movie.id); }} className="flex flex-col text-left group/item animate-[fadeIn_0.3s_ease-out]">
                                <div className="aspect-[2/3] rounded-2xl overflow-hidden mb-2 shadow-sm group-hover/item:shadow-lg transition-all relative">
                                   <img src={`${TMDB_IMAGE_URL}${movie.poster_path}`} alt={movie.title} className="w-full h-full object-cover group-hover/item:scale-110 transition-transform duration-700" />
                                   <div className="absolute inset-0 bg-black/20 opacity-0 group-hover/item:opacity-100 transition-opacity flex items-center justify-center"><Plus size={24} className="text-white drop-shadow-lg" strokeWidth={3} /></div>
                                </div>
                                <p className="text-[10px] font-black text-gray-900 leading-tight uppercase tracking-tighter line-clamp-2 px-1">{movie.title}</p>
                             </button>
                          ))}
                       </div>
                    </div>
                  )}
              </div>
          )}

          <div className="space-y-6 pt-2">
            <div className="group/input">
              <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1 transition-colors group-focus-within/input:text-gray-900">Titre du film</label>
              <input type="text" className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 text-gray-900 font-black text-lg outline-none focus:ring-2 focus:ring-stone-100 transition-all placeholder:text-stone-300" placeholder="Ex: Inception" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
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
                  <div className="flex items-center gap-2 mt-2 text-red-600 animate-[shake_0.4s_ease-in-out]">
                      <AlertCircle size={14} strokeWidth={2.5} />
                      <span className="text-[10px] font-bold">{dateError}</span>
                  </div>
              )}
            </div>
            
            <div className="grid grid-cols-2 gap-4">
               <div>
                <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Réalisateur</label>
                <div className="relative group/director">
                  <input type="text" className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-bold outline-none focus:ring-2 focus:ring-stone-100 transition-all text-gray-900" value={formData.director} onChange={e => setFormData({...formData, director: e.target.value, directorId: undefined})} />
                </div>
              </div>
              <div>
                <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Genre</label>
                 <select className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-bold outline-none border focus:ring-2 focus:ring-stone-100 appearance-none text-gray-900" value={formData.genre} onChange={e => { haptics.soft(); setFormData({...formData, genre: e.target.value}); }}>
                   {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                 </select>
              </div>
            </div>
          </div>

          {mode === 'watched' && (
             <div className="animate-[fadeIn_0.5s_ease-out] space-y-8">
                
                {/* --- TOGGLE MODE BITTER / SIMPLE (NEW LIME DESIGN) --- */}
                <div 
                    onClick={() => { haptics.medium(); setIsBitterMode(!isBitterMode); }}
                    className={`cursor-pointer group relative p-6 rounded-3xl border-2 transition-all duration-500 overflow-hidden ${
                        isBitterMode 
                        ? 'bg-lime-400 border-lime-400 text-charcoal shadow-2xl shadow-lime-400/30' 
                        : 'bg-white border-stone-100 hover:border-stone-200 text-charcoal shadow-sm'
                    }`}
                >
                    <div className="relative z-10 flex items-center justify-between">
                        <div className="flex items-center gap-4">
                            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-500 shadow-lg ${
                                isBitterMode 
                                ? 'bg-charcoal text-lime-400' 
                                : 'bg-stone-50 text-stone-400'
                            }`}>
                                {isBitterMode ? <FlaskConical size={28} strokeWidth={1.5} /> : <Star size={28} strokeWidth={1.5} />}
                            </div>
                            <div>
                                <h3 className="text-lg font-black tracking-tight leading-none mb-1">
                                    {isBitterMode ? 'Mode Bitter' : 'Notation Rapide'}
                                </h3>
                                <p className={`text-[10px] font-bold uppercase tracking-widest ${
                                    isBitterMode ? 'text-charcoal/70' : 'text-stone-400'
                                }`}>
                                    {isBitterMode ? 'Analyse technique & sensorielle' : 'Une seule note globale'}
                                </p>
                            </div>
                        </div>
                        <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${isBitterMode ? 'bg-charcoal' : 'bg-stone-200'}`}>
                            <div className={`w-5 h-5 rounded-full shadow-md transition-transform duration-300 ${
                                isBitterMode ? 'translate-x-5 bg-white' : 'translate-x-0 bg-white'
                            }`} />
                        </div>
                    </div>
                    {/* Background decoration for Bitter Mode */}
                    {isBitterMode && (
                        <div className="absolute top-0 right-0 w-64 h-64 bg-white/30 blur-[60px] rounded-full pointer-events-none -translate-y-1/2 translate-x-1/3 mix-blend-overlay" />
                    )}
                </div>

                {!isBitterMode ? (
                    // --- MODE SIMPLE : Note Globale Unique ---
                    <div className="animate-[scaleIn_0.3s_ease-out]">
                        <RatingStepper 
                            label="Note Globale"
                            icon={<Star size={24} fill="currentColor" className="text-yellow-500" />}
                            value={globalRating}
                            onChange={setGlobalRating}
                            large={true}
                        />
                    </div>
                ) : (
                    // --- MODE BITTER : Interface Complète ---
                    <div className="animate-[slideUp_0.4s_ease-out] space-y-8">
                        
                        {/* --- 0. SMARTPHONE CONFESSIONAL (NEW) --- */}
                        <div className="bg-[#141414] p-8 rounded-[2.5rem] shadow-xl border border-white/5 relative overflow-hidden">
                            <div className="absolute top-0 right-0 w-32 h-32 bg-lime-400/10 rounded-full blur-[40px] pointer-events-none" />
                            
                            <div className="flex items-center gap-3 mb-8">
                                <div className={`p-3 rounded-2xl shadow-lg transition-colors duration-500 ${getAddictionLevel(formData.smartphoneFactor || 0).bg} text-white`}>
                                    <Smartphone size={24} strokeWidth={2} />
                                </div>
                                <div>
                                    <span className="block text-base font-black text-white leading-none mb-1">Temps d'écran</span>
                                    <span className="text-[9px] font-bold text-stone-500 uppercase tracking-[0.2em]">Confessionnal</span>
                                </div>
                            </div>

                            <div className="mb-2 flex justify-between items-end">
                                <span className={`text-xl font-black transition-colors duration-300 ${getAddictionLevel(formData.smartphoneFactor || 0).color}`}>
                                    {getAddictionLevel(formData.smartphoneFactor || 0).label}
                                </span>
                                <span className="text-4xl font-black text-white">{formData.smartphoneFactor || 0}%</span>
                            </div>

                            <FatSlider
                                min={0}
                                max={100}
                                step={10}
                                value={formData.smartphoneFactor || 0}
                                onChange={(e: any) => { haptics.soft(); setFormData({ ...formData, smartphoneFactor: Number(e.target.value) }); }}
                                colorClass="bg-stone-800 accent-lime-400"
                            />
                            
                            <p className="text-[10px] font-medium text-stone-500 mt-4 text-center">
                                "Avez-vous scrollé pendant le film ?"
                            </p>
                        </div>

                        {/* --- 1. NOTATION TECHNIQUE (BLUEPRINT STYLE) --- */}
                        <div className="bg-white p-2 rounded-[2.5rem] border border-stone-200 shadow-sm relative overflow-hidden">
                            <div className="absolute inset-0 bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:16px_16px] opacity-30 pointer-events-none" />
                            
                            <div className="relative z-10 p-6 pb-2">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="bg-stone-100 p-2.5 rounded-xl text-charcoal"><PenTool size={20} strokeWidth={2} /></div>
                                    <div>
                                        <span className="block text-base font-black text-charcoal leading-none">Technique</span>
                                        <span className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">ANALYSE CRITIQUE</span>
                                    </div>
                                </div>
                                
                                <div className="space-y-4">
                                    <RatingStepper label="Scénario" icon={<BrainCircuit size={18} strokeWidth={2.5} />} value={formData.qualityMetrics?.scenario || 5} onChange={(val) => setFormData({ ...formData, qualityMetrics: { ...formData.qualityMetrics!, scenario: val } })} />
                                    <RatingStepper label="Jeu d'acteur" icon={<Drama size={18} strokeWidth={2.5} />} value={formData.qualityMetrics?.acting || 5} onChange={(val) => setFormData({ ...formData, qualityMetrics: { ...formData.qualityMetrics!, acting: val } })} />
                                    <RatingStepper label="Réalisation" icon={<Aperture size={18} strokeWidth={2.5} />} value={formData.qualityMetrics?.visual || 5} onChange={(val) => setFormData({ ...formData, qualityMetrics: { ...formData.qualityMetrics!, visual: val } })} />
                                    <RatingStepper label="Son & BO" icon={<Music size={18} strokeWidth={2.5} />} value={formData.qualityMetrics?.sound || 5} onChange={(val) => setFormData({ ...formData, qualityMetrics: { ...formData.qualityMetrics!, sound: val } })} />
                                </div>
                            </div>
                        </div>

                        {/* --- 2. RESSENTI & VIBE (ORGANIC STYLE) --- */}
                        <div className="bg-gradient-to-br from-indigo-50/50 to-purple-50/50 p-2 rounded-[2.5rem] border border-indigo-100 shadow-sm relative overflow-hidden">
                            <div className="relative z-10 p-6 pb-2">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="bg-white p-2.5 rounded-xl text-indigo-600 shadow-sm"><Sparkles size={20} strokeWidth={2} /></div>
                                    <div>
                                        <span className="block text-base font-black text-indigo-950 leading-none">Vibe & Ressenti</span>
                                        <span className="text-[9px] font-bold text-indigo-300 uppercase tracking-[0.2em]">EXPÉRIENCE PURE</span>
                                    </div>
                                </div>
                                
                                <div className="space-y-4">
                                    <RatingStepper label="Émotion" icon={<HeartHandshake size={18} strokeWidth={2.5} />} value={formData.vibe?.emotion || 5} colorScale="vibe" onChange={(val) => setFormData({ ...formData, vibe: { ...formData.vibe!, emotion: val } })} />
                                    <RatingStepper label="Divertissement" icon={<PartyPopper size={18} strokeWidth={2.5} />} value={formData.vibe?.fun || 5} colorScale="vibe" onChange={(val) => setFormData({ ...formData, vibe: { ...formData.vibe!, fun: val } })} />
                                    <RatingStepper label="Tension" icon={<Bomb size={18} strokeWidth={2.5} />} value={formData.vibe?.tension || 5} colorScale="vibe" onChange={(val) => setFormData({ ...formData, vibe: { ...formData.vibe!, tension: val } })} />
                                </div>
                            </div>
                        </div>

                        {/* --- 3. CONTEXTE (LAB STYLE) --- */}
                        <div className="bg-stone-50 p-8 rounded-[2.5rem] border border-stone-200">
                            <div className="flex items-center gap-3 mb-8 border-b border-stone-200 pb-6">
                                <div className="bg-charcoal text-white p-2.5 rounded-xl"><Activity size={20} strokeWidth={2} /></div>
                                <div>
                                    <span className="block text-base font-black text-charcoal leading-none">Contexte</span>
                                    <span className="text-[9px] font-bold text-stone-400 uppercase tracking-[0.2em]">FACTEURS EXTERNES</span>
                                </div>
                            </div>
                            
                            {/* HYPE */}
                            <div className="mb-10">
                                <div className="flex justify-between items-center mb-4">
                                    <div className="flex items-center gap-2 text-stone-500">
                                        <Thermometer size={16} />
                                        <span className="text-[10px] font-bold uppercase tracking-widest">Attente initiale (Hype)</span>
                                    </div>
                                    <span className="text-2xl font-black text-charcoal">{formData.hype}/10</span>
                                </div>
                                <FatSlider
                                    min={0}
                                    max={10}
                                    value={formData.hype}
                                    onChange={(e: any) => { haptics.soft(); setFormData({ ...formData, hype: Number(e.target.value) }); }}
                                    colorClass="bg-gradient-to-r from-stone-200 to-charcoal accent-charcoal"
                                />
                                <div className="flex justify-between mt-2 text-[9px] font-bold text-stone-400 uppercase tracking-widest px-1">
                                    <span>Osef</span>
                                    <span>Curieux</span>
                                    <span>Ultra Hype</span>
                                </div>
                            </div>

                            {/* PACING */}
                            <div className="mb-10">
                                <div className="flex items-center gap-2 text-stone-500 mb-4">
                                    <Hourglass size={16} />
                                    <span className="text-[10px] font-bold uppercase tracking-widest">Le Rythme (Pacing)</span>
                                </div>
                                <div className="flex bg-white p-1.5 rounded-2xl border border-stone-200 shadow-sm">
                                    <button 
                                        type="button"
                                        onClick={() => { haptics.soft(); setFormData({ ...formData, pacing: 'slow' }); }}
                                        className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${formData.pacing === 'slow' ? 'bg-stone-100 text-stone-600 scale-95 shadow-inner' : 'text-stone-300 hover:bg-stone-50'}`}
                                    >
                                        <Hourglass size={20} strokeWidth={2.5} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Longuet</span>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => { haptics.soft(); setFormData({ ...formData, pacing: 'perfect' }); }}
                                        className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${formData.pacing === 'perfect' ? 'bg-forest text-white shadow-lg scale-105 z-10' : 'text-stone-300 hover:bg-stone-50'}`}
                                    >
                                        <Target size={20} strokeWidth={2.5} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Impeccable</span>
                                    </button>
                                    <button 
                                        type="button"
                                        onClick={() => { haptics.soft(); setFormData({ ...formData, pacing: 'fast' }); }}
                                        className={`flex-1 py-4 rounded-xl flex flex-col items-center justify-center gap-1 transition-all ${formData.pacing === 'fast' ? 'bg-orange-50 text-orange-600 scale-95 shadow-inner' : 'text-stone-300 hover:bg-stone-50'}`}
                                    >
                                        <Zap size={20} strokeWidth={2.5} />
                                        <span className="text-[9px] font-black uppercase tracking-widest">Rushé</span>
                                    </button>
                                </div>
                            </div>

                            {/* SYMPTOMS */}
                            <div>
                                <div className="flex items-center gap-2 text-stone-500 mb-4">
                                    <Activity size={16} />
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
                                                className={`py-3 px-2 rounded-xl border-2 transition-all flex flex-col items-center justify-center gap-1 ${isActive ? 'bg-charcoal border-charcoal text-white shadow-lg scale-95' : 'bg-white border-transparent text-stone-400 hover:border-stone-200'}`}
                                            >
                                                <span className="text-xl">{symptom.emoji}</span>
                                                <span className="text-[9px] font-black uppercase tracking-tighter">{symptom.label}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
                
                <div>
                   <label className="text-[11px] font-black text-stone-500 uppercase tracking-widest mb-2.5 block ml-1">Votre Critique</label>
                   <textarea className="w-full bg-stone-50 hover:bg-stone-100 focus:bg-white border-2 border-transparent rounded-2xl p-5 font-medium outline-none focus:ring-2 focus:ring-stone-100 transition-all h-24 resize-none text-sm leading-relaxed text-gray-900" placeholder="En quelques mots..." value={formData.review} onChange={e => setFormData({...formData, review: e.target.value})} />
                </div>
             </div>
          )}
        </div>

        <div className="p-6 border-t border-zinc-100 bg-white rounded-b-3xl">
          <button 
            onClick={handleSubmit} 
            disabled={!!dateError}
            className={`w-full text-white font-black text-sm uppercase tracking-[0.2em] py-5 rounded-2xl shadow-xl active:scale-[0.97] transition-all hover:brightness-110 flex items-center justify-center gap-3 ${!!dateError ? 'bg-stone-300 shadow-none cursor-not-allowed' : 'bg-purple-900 shadow-purple-900/20'}`}
          >
            {initialData ? <Check size={20} strokeWidth={3} /> : <Plus size={20} strokeWidth={3} />}
            {initialData ? 'Mettre à jour' : (mode === 'watched' ? (isFutureDate ? 'Planifier la séance' : 'Enregistrer le film') : 'Mettre en file d\'attente')}
          </button>
        </div>
      </div>
    </div>
  );
};

export default AddMovieModal;
