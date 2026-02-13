
// DO NOT add any new files, classes, or namespaces.
// Fix for type narrowing of "movie" | "tv" union literals.

import React, { useState, useEffect, useRef } from 'react';
import { X, Eye, Clock, Smartphone, FlaskConical, Zap, BrainCircuit, Smile, Heart, ToggleLeft, ToggleRight, Minus, Plus, Search, Loader2, Info, Tv, Film, Calendar } from 'lucide-react';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { MovieFormData, Movie, MovieStatus, VibeCriteria, QualityMetrics } from '../types';
import { haptics } from '../utils/haptics';
import { SharedSpace, addMovieToSpace } from '../services/supabase';

interface AddMovieModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (movie: MovieFormData) => void;
  initialData: Movie | null;
  tmdbIdToLoad?: number | null;
  initialStatus?: MovieStatus;
  sharedSpace?: SharedSpace | null; 
  currentUserId?: string; 
  onSharedMovieAdded?: () => void;
  initialMediaType?: 'movie' | 'tv';
}

const INITIAL_VIBE: VibeCriteria = { story: 5, emotion: 5, fun: 5, visual: 5, tension: 5 };
const INITIAL_QUALITY: QualityMetrics = { scenario: 5, acting: 5, visual: 5, sound: 5 };

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
  status: 'watched',
  dateWatched: Date.now(),
  smartphoneFactor: 0,
  vibe: INITIAL_VIBE,
  qualityMetrics: INITIAL_QUALITY,
  hype: 5,
  mediaType: 'movie',
  numberOfSeasons: 0,
  tmdbRating: 0 // Initialize tmdbRating
};

const RatingStepper: React.FC<{ label: string; value: number; onChange: (val: number) => void; isBitter?: boolean }> = ({ label, value, onChange, isBitter }) => {
  const isHigh = value >= 7;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value.replace(',', '.'));
    if (!isNaN(val)) onChange(Math.min(10, Math.max(0, val)));
    else if (e.target.value === '') onChange(0);
  };

  return (
    <div className={`bg-white rounded-[1.5rem] p-3 border transition-all hover:border-stone-200 flex flex-col h-full shadow-sm ${isBitter ? 'border-stone-100' : 'border-stone-100'}`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[8px] font-black text-stone-400 uppercase tracking-widest leading-none truncate pr-1">{label}</span>
        <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 shrink-0 ${isHigh ? (isBitter ? 'bg-charcoal' : 'bg-forest') : 'bg-stone-200'}`} />
      </div>

      <div className="flex items-center justify-between gap-1 flex-1 min-h-[48px]">
        <button type="button" onClick={() => { haptics.soft(); onChange(Math.max(0, value - 0.5)); }} className="w-8 h-8 rounded-xl bg-stone-50 border border-stone-200 flex items-center justify-center active:scale-90 transition-all shadow-sm shrink-0">
          <Minus size={12} strokeWidth={3} />
        </button>
        <div className="flex-1 flex justify-center items-center overflow-hidden">
          <input 
            type="number" 
            inputMode="decimal" 
            step="0.5" 
            min="0" 
            max="10" 
            value={value === 0 ? '' : value} 
            placeholder="0" 
            onChange={handleInputChange} 
            className="w-full text-center text-2xl font-black tracking-tighter text-charcoal bg-transparent outline-none py-0 appearance-none leading-none m-0 border-none ring-0 focus:ring-0" 
            style={{ WebkitAppearance: 'none', MozAppearance: 'textfield' }} 
          />
        </div>
        <button type="button" onClick={() => { haptics.soft(); onChange(Math.min(10, value + 0.5)); }} className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-all shadow-md shrink-0 ${isBitter ? 'bg-bitter-lime' : 'bg-forest text-white'}`}>
          <Plus size={12} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};

const AddMovieModal: React.FC<AddMovieModalProps> = ({ 
    isOpen, 
    onClose, 
    onSave, 
    initialData, 
    tmdbIdToLoad, 
    initialStatus = 'watched',
    sharedSpace,
    currentUserId,
    onSharedMovieAdded,
    initialMediaType = 'movie'
}) => {
  const [formData, setFormData] = useState<MovieFormData>(INITIAL_FORM_STATE);
  const [mode, setMode] = useState<MovieStatus>(initialStatus);
  const [isBitterMode, setIsBitterMode] = useState(false);
  const [globalRating, setGlobalRating] = useState(5);
  const [searchResults, setSearchResults] = useState<any[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [showResults, setShowResults] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  
  // Date Picker State
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  
  // Nouveau state pour le type de recherche
  const [searchType, setSearchType] = useState<'movie' | 'tv'>('movie');
  
  const skipSearchRef = useRef(false);
  const searchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        skipSearchRef.current = true;
        setFormData({ ...initialData });
        setMode(initialData.status || 'watched');
        setGlobalRating((initialData.ratings.story + initialData.ratings.visuals + initialData.ratings.acting + initialData.ratings.sound) / 4);
        setIsBitterMode(!!initialData.vibe || !!initialData.qualityMetrics);
        // Fix for line 128: ensure literal type narrowing for "movie" | "tv" union
        setSearchType(initialData.mediaType === 'tv' ? 'tv' : 'movie');
        
        // Init Date
        if (initialData.dateWatched) {
            setSelectedDate(new Date(initialData.dateWatched).toISOString().split('T')[0]);
        }
      } else if (tmdbIdToLoad) {
        // Important: Set searchType BEFORE loading to use correct endpoint
        // Fix for searchType assignment: ensure it receives exactly the literal union type allowed by state
        const type: 'movie' | 'tv' = initialMediaType === 'tv' ? 'tv' : 'movie';
        setSearchType(type);
        handleSelectTMDBMovie(tmdbIdToLoad, type);
        setMode(initialStatus);
        setSelectedDate(new Date().toISOString().split('T')[0]);
      } else {
        skipSearchRef.current = false;
        setFormData({ ...INITIAL_FORM_STATE });
        setMode(initialStatus);
        setSearchResults([]);
        setShowResults(false);
        setSearchType('movie');
        setSelectedDate(new Date().toISOString().split('T')[0]);
      }
    }
  }, [isOpen, initialData, tmdbIdToLoad, initialStatus, initialMediaType]);

  // Refined Debounce Logic
  useEffect(() => {
    if (!isOpen) return;

    if (searchTimeoutRef.current) {
        window.clearTimeout(searchTimeoutRef.current);
    }

    if (skipSearchRef.current) {
        skipSearchRef.current = false;
        return;
    }

    if (formData.title.trim().length < 2) {
        setSearchResults([]);
        setShowResults(false);
        return;
    }

    searchTimeoutRef.current = window.setTimeout(() => {
        searchTMDB(formData.title);
    }, 300);

    return () => {
        if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    };
  }, [formData.title, searchType]);

  const searchTMDB = async (query: string) => {
    setIsSearching(true);
    setShowResults(true);
    try {
      // Switch endpoint based on searchType
      const endpoint = searchType === 'tv' ? 'search/tv' : 'search/movie';
      const res = await fetch(`${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&query=${encodeURIComponent(query)}&page=1`);
      const data = await res.json();
      
      // Normalize TV results to look like Movie results for the dropdown
      const normalizedResults = data.results.map((item: any) => {
        if (searchType === 'tv') {
          return {
            ...item,
            title: item.name, // TV shows use 'name'
            release_date: item.first_air_date // TV shows use 'first_air_date'
          };
        }
        return item;
      });
      
      setSearchResults(normalizedResults.slice(0, 5));
    } catch (e) { 
      console.error(e); 
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  const handleSelectTMDBMovie = async (id: number, explicitType?: 'movie' | 'tv') => {
    haptics.medium();
    setIsSearching(true);
    setShowResults(false);
    skipSearchRef.current = true;
    
    // Explicitly narrow the union type to avoid "string" widening
    const typeToUse: 'movie' | 'tv' = explicitType || searchType;

    try {
      const endpoint = typeToUse === 'tv' ? 'tv' : 'movie';
      const res = await fetch(`${TMDB_BASE_URL}/${endpoint}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
      const data = await res.json();
      
      let director = 'Inconnu';
      
      if (typeToUse === 'tv') {
        // Pour les séries, on cherche le créateur
        if (data.created_by && data.created_by.length > 0) {
          director = data.created_by.map((c: any) => c.name).join(', ');
        }
      } else {
        // Pour les films, on cherche le réalisateur
        director = data.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'Inconnu';
      }
      
      const genre = data.genres?.[0]?.name || GENRES[0];
      const yearStr = typeToUse === 'tv' ? data.first_air_date : data.release_date;
      const year = yearStr ? parseInt(yearStr.split('-')[0]) : new Date().getFullYear();
      
      setFormData(prev => ({
        ...prev,
        title: typeToUse === 'tv' ? data.name : data.title,
        tmdbId: data.id,
        year: year,
        director: director,
        posterUrl: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '',
        review: data.overview || '',
        genre: genre,
        mediaType: typeToUse,
        numberOfSeasons: typeToUse === 'tv' ? data.number_of_seasons : undefined,
        tmdbRating: data.vote_average ? Number(data.vote_average.toFixed(1)) : 0
      }));
    } catch (e) { console.error(e); }
    setIsSearching(false);
  };

  const handleSubmit = async () => {
    if (isSaving) return;
    
    // Validation du titre
    if (!formData.title.trim()) {
        alert("Veuillez saisir un titre de film.");
        return;
    }

    haptics.medium();
    setIsSaving(true);

    // Si on est en mode "À voir", on force les notes à 0
    const isWatchlist = mode === 'watchlist';

    const finalRatings = isWatchlist
      ? { story: 0, visuals: 0, acting: 0, sound: 0 }
      : (isBitterMode 
          ? { story: formData.qualityMetrics?.scenario || 5, visuals: formData.qualityMetrics?.visual || 5, acting: formData.qualityMetrics?.acting || 5, sound: formData.qualityMetrics?.sound || 5 }
          : { story: globalRating, visuals: globalRating, acting: globalRating, sound: globalRating }
        );

    // Use selected date for dateWatched
    const finalDateWatched = isWatchlist ? undefined : new Date(selectedDate).getTime();
    
    // --- MODE ESPACE PARTAGÉ ---
    if (sharedSpace) {
        if (!currentUserId) {
            alert("Erreur de session : Identifiant utilisateur manquant. Veuillez vous reconnecter.");
            setIsSaving(false);
            return;
        }

        try {
            const result = await addMovieToSpace(sharedSpace.id, {
                tmdb_id: formData.tmdbId,
                title: formData.title,
                director: formData.director,
                year: formData.year,
                genre: formData.genre,
                poster_url: formData.posterUrl,
                status: mode,
                media_type: formData.mediaType,
                number_of_seasons: formData.numberOfSeasons
            }, currentUserId);
            
            if (result) {
                haptics.success();
                onSharedMovieAdded?.(); // Rafraîchir la vue parent
                onClose(); 
            } else {
                throw new Error("Opération échouée. Vérifiez que vous êtes bien membre de cet espace.");
            }
        } catch (err: any) {
            console.error("Erreur addMovieToSpace:", err);
            haptics.error();
            alert("Erreur lors de l'ajout : " + (err.message || "Erreur inconnue"));
        } finally {
            setIsSaving(false);
        }
        return;
    }

    // --- MODE LOCAL ---
    onSave({ ...formData, status: mode, ratings: finalRatings, dateWatched: finalDateWatched });
    haptics.success();
    setIsSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-charcoal/40" onClick={onClose} />
      <div className="bg-cream w-full sm:max-w-md rounded-t-[3.5rem] sm:rounded-[3.5rem] shadow-2xl relative z-10 max-h-[92vh] flex flex-col animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        
        {/* En-tête conditionnel pour Espace Partagé */}
        <div className="flex justify-between items-center p-8 border-b border-black/5 bg-white shrink-0">
          <div className="min-w-0">
            {sharedSpace && (
                <p className="text-[10px] font-black uppercase tracking-widest text-forest mb-1 truncate">
                    Ajout dans : {sharedSpace.name}
                </p>
            )}
            <h2 className="text-2xl font-black tracking-tighter truncate">{formData.title || 'Nouveau Verdict'}</h2>
          </div>
          <button onClick={onClose} className="p-3 bg-charcoal text-white rounded-full active:scale-90 transition-all ml-4 shrink-0"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-6 sm:p-8 space-y-8 no-scrollbar flex-1 pb-32">
           <div className="flex bg-stone-100 p-1.5 rounded-full border border-stone-200/50">
              <button onClick={() => { haptics.soft(); setMode('watched'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all ${mode === 'watched' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}><Eye size={16} strokeWidth={2.5} /> Vu</button>
              <button onClick={() => { haptics.soft(); setMode('watchlist'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all ${mode === 'watchlist' ? 'bg-white text-charcoal shadow-sm' : 'text-stone-400'}`}><Clock size={16} strokeWidth={2.5} /> À voir</button>
           </div>

           {/* Date Picker - Only for Watched mode */}
           {mode === 'watched' && (
             <div className="bg-stone-50 border border-stone-100 rounded-3xl p-4 flex items-center justify-between animate-[fadeIn_0.3s_ease-out]">
                <div className="flex items-center gap-3 text-stone-400">
                    <div className="p-2 bg-white rounded-xl shadow-sm"><Calendar size={16} /></div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Visionnage</span>
                </div>
                <input 
                    type="date"
                    value={selectedDate}
                    max={new Date().toISOString().split('T')[0]}
                    onChange={(e) => {
                        haptics.soft();
                        setSelectedDate(e.target.value);
                    }}
                    className="bg-transparent font-black text-sm text-charcoal text-right focus:outline-none uppercase tracking-wide cursor-pointer"
                />
             </div>
           )}

           <div className="space-y-6 relative">
              <div className="group">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 mb-2 block ml-1">Titre de l'œuvre</label>
                
                {/* Switch Film / Série */}
                <div className="flex bg-stone-100 p-1 rounded-2xl mb-3 w-fit">
                    <button 
                        onClick={() => { haptics.soft(); setSearchType('movie'); }} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchType === 'movie' ? 'bg-charcoal text-white shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                        <Film size={12} /> Films
                    </button>
                    <button 
                        onClick={() => { haptics.soft(); setSearchType('tv'); }} 
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchType === 'tv' ? 'bg-charcoal text-white shadow-sm' : 'text-stone-400 hover:text-stone-600'}`}
                    >
                        <Tv size={12} /> Séries
                    </button>
                </div>

                <div className="relative">
                  <input 
                    type="text" 
                    className="w-full bg-white border-2 border-stone-100 focus:border-charcoal p-5 rounded-2xl font-black text-xl outline-none transition-all shadow-sm pr-12" 
                    placeholder={searchType === 'tv' ? "Nom de la série..." : "Titre du film..."} 
                    value={formData.title} 
                    onChange={e => { setFormData({...formData, title: e.target.value}); }} 
                  />
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 text-stone-300">
                    {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                  </div>
                </div>

                {showResults && (
                  <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-white border border-stone-100 rounded-3xl shadow-2xl overflow-hidden animate-[fadeIn_0.2s_ease-out]">
                    {searchResults.length > 0 ? (
                        searchResults.map(m => (
                            <button key={m.id} onClick={() => handleSelectTMDBMovie(m.id)} className="w-full flex items-center gap-4 p-4 hover:bg-stone-50 border-b border-stone-50 last:border-0 transition-colors text-left">
                                <div className="w-10 h-14 bg-stone-100 rounded-lg shrink-0 overflow-hidden">
                                {m.poster_path && <img src={`${TMDB_IMAGE_URL}${m.poster_path}`} className="w-full h-full object-cover" alt="" />}
                                </div>
                                <div className="flex-1 min-w-0">
                                <p className="font-black text-sm text-charcoal truncate">{m.title}</p>
                                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">{m.release_date?.split('-')[0] || 'N/A'}</p>
                                </div>
                            </button>
                        ))
                    ) : !isSearching && formData.title.trim().length >= 2 ? (
                        <div className="p-10 text-center text-stone-400 flex flex-col items-center gap-4 bg-stone-50/50">
                            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm">
                                <Info size={20} className="opacity-30" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-[10px] font-black uppercase tracking-widest text-charcoal">Aucun résultat</p>
                                <p className="text-[9px] font-medium opacity-60">Vérifiez l'orthographe ou essayez un autre titre.</p>
                            </div>
                        </div>
                    ) : null}
                  </div>
                )}
              </div>
           </div>

           {/* Affichage conditionnel des outils avancés (Masqué en mode Shared Space pour simplicité initialement, ou activé si nécessaire) */}
           {/* Pour l'instant on garde tout, mais l'analyse Bitter ne sera pas sauvegardée dans shared_movies pour simplifier */}
           {!sharedSpace && mode === 'watched' && (
              <div className="space-y-8">
                 <div onClick={() => { haptics.medium(); setIsBitterMode(!isBitterMode); }} className={`p-5 rounded-[2rem] border-2 transition-all cursor-pointer flex items-center justify-between ${isBitterMode ? 'bg-bitter-lime border-bitter-lime text-charcoal shadow-lg' : 'bg-white border-stone-100 text-stone-300'}`}>
                    <div className="flex items-center gap-4">
                        <FlaskConical size={20} strokeWidth={2.5} />
                        <div><p className="font-black text-xs uppercase tracking-tight">Analyse Bitter</p><p className="text-[8px] font-bold opacity-60 uppercase tracking-widest">Évaluation Multi-Critères</p></div>
                    </div>
                    {isBitterMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} className="opacity-30" />}
                 </div>

                 {isBitterMode ? (
                    <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <RatingStepper label="Écriture" value={formData.qualityMetrics?.scenario || 5} onChange={v => setFormData({...formData, qualityMetrics: {...formData.qualityMetrics!, scenario: v}})} isBitter={true} />
                            <RatingStepper label="Interprétation" value={formData.qualityMetrics?.acting || 5} onChange={v => setFormData({...formData, qualityMetrics: {...formData.qualityMetrics!, acting: v}})} isBitter={true} />
                            <RatingStepper label="Esthétique" value={formData.qualityMetrics?.visual || 5} onChange={v => setFormData({...formData, qualityMetrics: {...formData.qualityMetrics!, visual: v}})} isBitter={true} />
                            <RatingStepper label="Univers Sonore" value={formData.qualityMetrics?.sound || 5} onChange={v => setFormData({...formData, qualityMetrics: {...formData.qualityMetrics!, sound: v}})} isBitter={true} />
                        </div>
                        <div className="bg-charcoal text-white p-6 sm:p-8 rounded-[2rem] shadow-xl">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-3"><Smartphone size={20} className="text-bitter-lime" /><span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Indice de Distraction</span></div>
                                <span className="text-2xl font-black text-bitter-lime">{formData.smartphoneFactor || 0}%</span>
                            </div>
                            <p className="text-[9px] font-bold text-stone-500 uppercase tracking-widest mb-4">Temps passé sur votre écran pendant le film.</p>
                            <input type="range" min="0" max="100" step="10" value={formData.smartphoneFactor || 0} onChange={e => { haptics.soft(); setFormData({...formData, smartphoneFactor: Number(e.target.value)}); }} className="w-full" />
                        </div>
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <VibeBox icon={<Heart size={14} />} label="Émotion" value={formData.vibe?.emotion || 5} onChange={v => setFormData({...formData, vibe: {...formData.vibe!, emotion: v}})} />
                            <VibeBox icon={<Zap size={14} />} label="Tension" value={formData.vibe?.tension || 5} onChange={v => setFormData({...formData, vibe: {...formData.vibe!, tension: v}})} />
                            <VibeBox icon={<Smile size={14} />} label="Divertissement" value={formData.vibe?.fun || 5} onChange={v => setFormData({...formData, vibe: {...formData.vibe!, fun: v}})} />
                            <VibeBox icon={<BrainCircuit size={14} />} label="Cérébral" value={formData.vibe?.story || 5} onChange={v => setFormData({...formData, vibe: {...formData.vibe!, story: v}})} />
                        </div>
                    </div>
                 ) : (
                    <div className="py-4"><RatingStepper label="Note Globale" value={globalRating} onChange={setGlobalRating} isBitter={false} /></div>
                 )}

                 <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 block ml-1">Notes de l'Analyste</label>
                    <textarea className="w-full bg-white border border-stone-100 p-6 rounded-[2rem] font-medium text-sm outline-none focus:border-stone-200 transition-all min-h-[120px] resize-none shadow-sm leading-relaxed" placeholder="Qu'est-ce qui a retenu votre attention ?" value={formData.review} onChange={e => setFormData({...formData, review: e.target.value})} />
                 </div>
              </div>
           )}
           
           {/* Pas d'analyse Bitter avancée pour les espaces partagés dans un premier temps pour garder la cohérence des données */}
           {sharedSpace && mode === 'watched' && (
               <div className="bg-stone-50 p-6 rounded-[2rem] border border-stone-100 text-center">
                   <Info size={24} className="mx-auto text-stone-300 mb-2" />
                   <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest">
                       Notez ce film après l'ajout pour détailler votre verdict.
                   </p>
               </div>
           )}
        </div>

        <div className="p-8 border-t border-black/5 bg-white rounded-b-[3.5rem] shrink-0">
           <button 
                onClick={handleSubmit} 
                disabled={isSaving}
                className="w-full bg-charcoal text-white py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-70"
            >
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Confirmer'}
           </button>
        </div>
      </div>
    </div>
  );
};

const VibeBox: React.FC<{ icon: any, label: string, value: number, onChange: (v: number) => void }> = ({ icon, label, value, onChange }) => (
    <div className="bg-white p-4 rounded-[1.5rem] border border-stone-100 flex flex-col items-center gap-2 shadow-sm">
        <div className="text-stone-300">{icon}</div>
        <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 text-center leading-none truncate w-full">{label}</span>
        <div className="flex items-center justify-between gap-1 w-full mt-1">
            <button onClick={() => { haptics.soft(); onChange(Math.max(0, value - 1)); }} className="text-stone-300 hover:text-charcoal p-1 active:scale-90 shrink-0"><Minus size={10} strokeWidth={4}/></button>
            <div className="flex-1 text-center">
              <span className="text-base font-black text-charcoal leading-none inline-block">{value}</span>
            </div>
            <button onClick={() => { haptics.soft(); onChange(Math.min(10, value + 1)); }} className="text-stone-300 hover:text-charcoal p-1 active:scale-90 shrink-0"><Plus size={10} strokeWidth={4}/></button>
        </div>
    </div>
);

export default AddMovieModal;
