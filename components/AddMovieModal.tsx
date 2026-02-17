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
  comment: '',
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
  tmdbRating: 0,
  runtime: 0
};

const RatingStepper: React.FC<{ label: string; value: number; onChange: (val: number) => void; isBitter?: boolean }> = ({ label, value, onChange, isBitter }) => {
  const isHigh = value >= 7;

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value.replace(',', '.'));
    if (!isNaN(val)) onChange(Math.min(10, Math.max(0, val)));
    else if (e.target.value === '') onChange(0);
  };

  return (
    <div className={`bg-white dark:bg-[#1a1a1a] rounded-[1.5rem] p-3 border transition-all hover:border-stone-200 dark:hover:border-white/20 flex flex-col h-full shadow-sm border-stone-100 dark:border-white/10`}>
      <div className="flex justify-between items-center mb-2">
        <span className="text-[8px] font-black text-stone-400 dark:text-stone-600 uppercase tracking-widest leading-none truncate pr-1">{label}</span>
        <div className={`w-1.5 h-1.5 rounded-full transition-all duration-500 shrink-0 ${isHigh ? (isBitter ? 'bg-bitter-lime' : 'bg-forest dark:bg-lime-500') : 'bg-stone-200 dark:bg-stone-800'}`} />
      </div>

      <div className="flex items-center justify-between gap-1 flex-1 min-h-[48px]">
        <button type="button" onClick={() => { haptics.soft(); onChange(Math.max(0, value - 0.5)); }} className="w-8 h-8 rounded-xl bg-stone-50 dark:bg-[#161616] border border-stone-200 dark:border-white/5 flex items-center justify-center active:scale-90 transition-all shadow-sm shrink-0">
          <Minus size={12} strokeWidth={3} className="text-charcoal dark:text-white" />
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
            className="w-full text-center text-2xl font-black tracking-tighter text-charcoal dark:text-white bg-transparent outline-none py-0 appearance-none border-none ring-0 focus:ring-0" 
          />
        </div>
        <button type="button" onClick={() => { haptics.soft(); onChange(Math.min(10, value + 0.5)); }} className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-all shadow-md shrink-0 ${isBitter ? 'bg-bitter-lime text-charcoal' : 'bg-forest dark:bg-lime-500 text-white'}`}>
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
  const isEditMode = !!initialData;
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [searchType, setSearchType] = useState<'movie' | 'tv'>('movie');
  const skipSearchRef = useRef(false);
  const searchTimeoutRef = useRef<number | null>(null);

  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        skipSearchRef.current = true;
        setFormData({ ...initialData, comment: initialData.comment || '' });
        setMode(initialData.status || 'watched');
        setGlobalRating((initialData.ratings.story + initialData.ratings.visuals + initialData.ratings.acting + initialData.ratings.sound) / 4);
        setIsBitterMode(!!initialData.vibe || !!initialData.qualityMetrics);
        setSearchType(initialData.mediaType === 'tv' ? 'tv' : 'movie');
        if (initialData.dateWatched) setSelectedDate(new Date(initialData.dateWatched).toISOString().split('T')[0]);
      } else if (tmdbIdToLoad) {
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

  useEffect(() => {
    if (!isOpen) return;
    if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current);
    if (skipSearchRef.current) { skipSearchRef.current = false; return; }
    if (formData.title.trim().length < 2) { setSearchResults([]); setShowResults(false); return; }
    searchTimeoutRef.current = window.setTimeout(() => { searchTMDB(formData.title); }, 300);
    return () => { if (searchTimeoutRef.current) window.clearTimeout(searchTimeoutRef.current); };
  }, [formData.title, searchType]);

  const searchTMDB = async (query: string) => {
    setIsSearching(true);
    setShowResults(true);
    try {
      const endpoint = searchType === 'tv' ? 'search/tv' : 'search/movie';
      const res = await fetch(`${TMDB_BASE_URL}/${endpoint}?api_key=${TMDB_API_KEY}&language=fr-FR&region=FR&query=${encodeURIComponent(query)}&page=1`);
      const data = await res.json();
      const normalizedResults = data.results.map((item: any) => {
        if (searchType === 'tv') return { ...item, title: item.name, release_date: item.first_air_date };
        return item;
      });
      setSearchResults(normalizedResults.slice(0, 5));
    } catch (e) { console.error(e); setSearchResults([]); } finally { setIsSearching(false); }
  };

  const handleSelectTMDBMovie = async (id: number, explicitType?: 'movie' | 'tv') => {
    haptics.medium();
    setIsSearching(true);
    setShowResults(false);
    setSearchResults([]);
    skipSearchRef.current = true;
    const typeToUse: 'movie' | 'tv' = explicitType || searchType;
    try {
      const endpoint = typeToUse === 'tv' ? 'tv' : 'movie';
      const res = await fetch(`${TMDB_BASE_URL}/${endpoint}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
      const data = await res.json();
      let director = 'Inconnu';
      if (typeToUse === 'tv') {
        if (data.created_by?.length > 0) director = data.created_by.map((c: any) => c.name).join(', ');
      } else {
        director = data.credits?.crew?.find((c: any) => c.job === 'Director')?.name || 'Inconnu';
      }
      const genre = data.genres?.[0]?.name || GENRES[0];
      const yearStr = typeToUse === 'tv' ? data.first_air_date : data.release_date;
      const year = yearStr ? parseInt(yearStr.split('-')[0]) : new Date().getFullYear();
      setFormData(prev => ({
        ...prev,
        title: typeToUse === 'tv' ? data.name : data.title,
        tmdbId: data.id,
        year,
        director,
        posterUrl: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '',
        review: data.overview || '',
        genre,
        mediaType: typeToUse,
        numberOfSeasons: typeToUse === 'tv' ? data.number_of_seasons : undefined,
        tmdbRating: data.vote_average ? Number(data.vote_average.toFixed(1)) : 0,
        runtime: data.runtime || 0
      }));
    } catch (e) { console.error(e); }
    setIsSearching(false);
    setShowResults(false);
  };

  const handleSubmit = async () => {
    if (isSaving || !formData.title.trim()) return;
    haptics.medium();
    setIsSaving(true);
    const isWatchlist = mode === 'watchlist';
    const finalRatings = isWatchlist
      ? { story: 0, visuals: 0, acting: 0, sound: 0 }
      : (isBitterMode 
          ? { story: formData.qualityMetrics?.scenario || 5, visuals: formData.qualityMetrics?.visual || 5, acting: formData.qualityMetrics?.acting || 5, sound: formData.qualityMetrics?.sound || 5 }
          : { story: globalRating, visuals: globalRating, acting: globalRating, sound: globalRating }
        );
    const finalDateWatched = isWatchlist ? undefined : new Date(selectedDate).getTime();
    if (sharedSpace && currentUserId) {
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
                onSharedMovieAdded?.();
                onClose(); 
            }
        } catch (err) { haptics.error(); } finally { setIsSaving(false); }
        return;
    }
    onSave({ ...formData, status: mode, ratings: finalRatings, dateWatched: finalDateWatched });
    haptics.success();
    setIsSaving(false);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center">
      <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm" onClick={onClose} />
      <div className="bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-md rounded-t-[3.5rem] sm:rounded-[3.5rem] shadow-2xl dark:shadow-black/60 relative z-10 max-h-[92vh] flex flex-col animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t dark:border-white/10 sm:border dark:border-white/10 transition-colors">
        
        <div className="flex justify-between items-center p-8 border-b border-black/5 dark:border-white/10 bg-white dark:bg-[#1a1a1a] shrink-0 transition-colors">
          <div className="min-w-0">
            {sharedSpace && <p className="text-[10px] font-black uppercase tracking-widest text-forest dark:text-lime-500 mb-1 truncate">{sharedSpace.name}</p>}
            <h2 className="text-2xl font-black tracking-tighter truncate text-charcoal dark:text-white">
                {isEditMode ? 'Modifier' : (formData.title || 'Nouveau Verdict')}
            </h2>
          </div>
          <button onClick={onClose} className="p-3 bg-stone-100 dark:bg-[#161616] text-stone-500 rounded-full active:scale-90 transition-all ml-4 shrink-0"><X size={20} /></button>
        </div>

        <div className="overflow-y-auto p-6 sm:p-8 space-y-8 no-scrollbar flex-1 pb-32">
           <div className="flex bg-stone-100 dark:bg-[#161616] p-1.5 rounded-full border border-stone-200/50 dark:border-white/5 transition-colors">
              <button onClick={() => { haptics.soft(); setMode('watched'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all ${mode === 'watched' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-sm' : 'text-stone-400 dark:text-stone-600'}`}><Eye size={16} strokeWidth={2.5} /> Vu</button>
              <button onClick={() => { haptics.soft(); setMode('watchlist'); }} className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-black uppercase tracking-[0.2em] transition-all ${mode === 'watchlist' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-sm' : 'text-stone-400 dark:text-stone-600'}`}><Clock size={16} strokeWidth={2.5} /> À voir</button>
           </div>

           {mode === 'watched' && (
             <div className="bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-3xl p-4 flex items-center justify-between transition-colors">
                <div className="flex items-center gap-3 text-stone-400 dark:text-stone-600">
                    <div className="p-2 bg-white dark:bg-[#202020] rounded-xl shadow-sm"><Calendar size={16} /></div>
                    <span className="text-[10px] font-black uppercase tracking-widest">Visionnage</span>
                </div>
                <input type="date" value={selectedDate} max={new Date().toISOString().split('T')[0]} onChange={(e) => { haptics.soft(); setSelectedDate(e.target.value); }} className="bg-transparent font-black text-sm text-charcoal dark:text-white text-right focus:outline-none uppercase tracking-wide cursor-pointer" />
             </div>
           )}

           {isEditMode && (
              <div className="flex gap-4 bg-white dark:bg-[#202020] rounded-[2rem] p-4 border border-stone-100 dark:border-white/10 shadow-sm transition-colors">
                {formData.posterUrl && <div className="w-20 h-28 rounded-2xl overflow-hidden shrink-0 shadow-md"><img src={formData.posterUrl} alt="" className="w-full h-full object-cover" /></div>}
                <div className="flex-1 min-w-0 flex flex-col justify-center">
                  <h3 className="font-black text-lg text-charcoal dark:text-white tracking-tight truncate leading-tight">{formData.title}</h3>
                  <p className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest mt-1">{formData.director} • {formData.year}</p>
                </div>
              </div>
           )}

           {!isEditMode && (
             <div className="space-y-6 relative">
                <div className="group">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-2 block ml-1">Type de recherche</label>
                  <div className="flex bg-stone-100 dark:bg-[#161616] p-1 rounded-2xl mb-4 w-fit transition-colors">
                      <button onClick={() => { haptics.soft(); setSearchType('movie'); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchType === 'movie' ? 'bg-charcoal dark:bg-[#202020] text-white shadow-sm' : 'text-stone-400 dark:text-stone-600 hover:text-stone-500'}`}><Film size={12} /> Films</button>
                      <button onClick={() => { haptics.soft(); setSearchType('tv'); }} className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${searchType === 'tv' ? 'bg-charcoal dark:bg-[#202020] text-white shadow-sm' : 'text-stone-400 dark:text-stone-600 hover:text-stone-500'}`}><Tv size={12} /> Séries</button>
                  </div>

                  <div className="relative">
                    <input type="text" className="w-full bg-white dark:bg-[#161616] border-2 border-stone-100 dark:border-white/5 focus:border-charcoal dark:focus:border-white/20 p-5 rounded-2xl font-black text-xl outline-none transition-all shadow-sm pr-12 text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700" placeholder={searchType === 'tv' ? "Nom de la série..." : "Titre du film..."} value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} />
                    <div className="absolute right-5 top-1/2 -translate-y-1/2 text-stone-300 dark:text-stone-700">
                      {isSearching ? <Loader2 size={20} className="animate-spin" /> : <Search size={20} />}
                    </div>
                  </div>

                  {showResults && (
                    <div className="absolute top-full left-0 right-0 z-50 mt-2 bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 rounded-3xl shadow-2xl dark:shadow-black/60 overflow-hidden transition-colors">
                      {searchResults.length > 0 ? (
                          searchResults.map(m => (
                              <button key={m.id} onClick={() => handleSelectTMDBMovie(m.id)} className="w-full flex items-center gap-4 p-4 hover:bg-stone-50 dark:hover:bg-[#252525] border-b border-stone-50 dark:border-white/5 last:border-0 transition-colors text-left">
                                  <div className="w-10 h-14 bg-stone-100 dark:bg-[#202020] rounded-lg shrink-0 overflow-hidden"><img src={`${TMDB_IMAGE_URL}${m.poster_path}`} className="w-full h-full object-cover" alt="" /></div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-black text-sm text-charcoal dark:text-white truncate">{m.title}</p>
                                    <p className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest">{m.release_date?.split('-')[0]}</p>
                                  </div>
                              </button>
                          ))
                      ) : !isSearching && formData.title.trim().length >= 2 && (
                          <div className="p-10 text-center bg-stone-50/50 dark:bg-[#161616]/50 transition-colors"><p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-700">Aucun résultat</p></div>
                      )}
                    </div>
                  )}
                </div>
             </div>
           )}

           {mode === 'watched' && !sharedSpace && (
              <div className="space-y-8 animate-[fadeIn_0.3s_ease-out]">
                 <div onClick={() => { haptics.medium(); setIsBitterMode(!isBitterMode); }} className={`p-5 rounded-[2rem] border-2 transition-all duration-300 cursor-pointer flex items-center justify-between shadow-lg ${isBitterMode ? 'bg-bitter-lime border-bitter-lime text-charcoal scale-[1.02]' : 'bg-[#0c0c0c] border-bitter-lime text-white'}`}>
                    <div className="flex items-center gap-4">
                        <FlaskConical size={24} strokeWidth={2.5} className={isBitterMode ? 'text-charcoal' : 'text-bitter-lime'} />
                        <div><p className="font-black text-xs uppercase tracking-tight">Analyse Bitter</p><p className={`text-[8px] font-bold uppercase tracking-widest ${isBitterMode ? 'text-charcoal/70' : 'text-stone-400'}`}>Évaluation Multi-Critères</p></div>
                    </div>
                    <div className={isBitterMode ? 'text-charcoal' : 'text-stone-600'}>{isBitterMode ? <ToggleRight size={32} /> : <ToggleLeft size={32} />}</div>
                 </div>

                 {isBitterMode ? (
                    <div className="space-y-8">
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            {['scenario', 'acting', 'visual', 'sound'].map(c => (
                                <RatingStepper key={c} label={c === 'scenario' ? 'Écriture' : c === 'acting' ? 'Jeu' : c === 'visual' ? 'Visuel' : 'Son'} value={formData.qualityMetrics?.[c as keyof QualityMetrics] || 5} onChange={v => setFormData({...formData, qualityMetrics: {...formData.qualityMetrics!, [c]: v}})} isBitter={true} />
                            ))}
                        </div>
                        <div className="bg-charcoal dark:bg-[#1a1a1a] text-white p-6 sm:p-8 rounded-[2rem] shadow-xl transition-all">
                            <div className="flex justify-between items-center mb-2">
                                <div className="flex items-center gap-3"><Smartphone size={20} className="text-bitter-lime" /><span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Distraction</span></div>
                                <span className="text-2xl font-black text-bitter-lime">{formData.smartphoneFactor || 0}%</span>
                            </div>
                            <input type="range" min="0" max="100" step="10" value={formData.smartphoneFactor || 0} onChange={e => { haptics.soft(); setFormData({...formData, smartphoneFactor: Number(e.target.value)}); }} className="w-full h-2 bg-white/10 rounded-full appearance-none slider mt-4" />
                        </div>
                        <div className="grid grid-cols-2 gap-3">
                            <VibeBox icon={<Heart size={14} />} label="Émotion" value={formData.vibe?.emotion || 5} onChange={v => setFormData({...formData, vibe: {...formData.vibe!, emotion: v}})} />
                            <VibeBox icon={<Zap size={14} />} label="Tension" value={formData.vibe?.tension || 5} onChange={v => setFormData({...formData, vibe: {...formData.vibe!, tension: v}})} />
                            <VibeBox icon={<Smile size={14} />} label="Fun" value={formData.vibe?.fun || 5} onChange={v => setFormData({...formData, vibe: {...formData.vibe!, fun: v}})} />
                            <VibeBox icon={<BrainCircuit size={14} />} label="Cérébral" value={formData.vibe?.story || 5} onChange={v => setFormData({...formData, vibe: {...formData.vibe!, story: v}})} />
                        </div>
                    </div>
                 ) : <div className="py-4"><RatingStepper label="Note Globale" value={globalRating} onChange={setGlobalRating} isBitter={false} /></div>}

                 <div className="space-y-4">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 block ml-1">Mon Avis</label>
                    <textarea className="w-full bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/10 p-6 rounded-[2rem] font-medium text-sm outline-none focus:border-stone-200 dark:focus:border-white/30 transition-all min-h-[120px] resize-none shadow-sm dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700" placeholder="Votre verdict personnel..." value={formData.comment || ''} onChange={e => setFormData({...formData, comment: e.target.value})} />
                 </div>
              </div>
           )}
        </div>

        <div className="p-8 border-t border-black/5 dark:border-white/10 bg-white dark:bg-[#1a1a1a] rounded-b-[3.5rem] shrink-0 transition-colors">
           <button onClick={handleSubmit} disabled={isSaving} className="w-full bg-charcoal dark:bg-forest text-white py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.3em] active:scale-95 transition-all flex items-center justify-center gap-3 shadow-xl disabled:opacity-50">{isSaving ? <Loader2 size={16} className="animate-spin" /> : 'Confirmer'}</button>
        </div>
      </div>
    </div>
  );
};

const VibeBox: React.FC<{ icon: any, label: string, value: number, onChange: (v: number) => void }> = ({ icon, label, value, onChange }) => (
    <div className="bg-white dark:bg-[#1a1a1a] p-4 rounded-[1.5rem] border border-stone-100 dark:border-white/10 flex flex-col items-center gap-2 shadow-sm transition-colors">
        <div className="text-stone-300 dark:text-stone-700">{icon}</div>
        <span className="text-[8px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 text-center leading-none truncate w-full">{label}</span>
        <div className="flex items-center justify-between gap-1 w-full mt-1">
            <button onClick={() => { haptics.soft(); onChange(Math.max(0, value - 1)); }} className="text-stone-300 dark:text-stone-700 hover:text-charcoal dark:hover:text-white p-1 active:scale-90 transition-colors"><Minus size={10} strokeWidth={4}/></button>
            <span className="text-base font-black text-charcoal dark:text-white leading-none">{value}</span>
            <button onClick={() => { haptics.soft(); onChange(Math.min(10, value + 1)); }} className="text-stone-300 dark:text-stone-700 hover:text-charcoal dark:hover:text-white p-1 active:scale-90 transition-colors"><Plus size={10} strokeWidth={4}/></button>
        </div>
    </div>
);

export default AddMovieModal;