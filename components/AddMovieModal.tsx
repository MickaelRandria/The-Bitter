
import React, { useState, useEffect } from 'react';
import { X, Loader2, Film, Check } from 'lucide-react';
import { Movie, MovieFormData, MovieStatus } from '../types';
import { GENRES, TMDB_API_KEY, TMDB_BASE_URL, TMDB_IMAGE_URL } from '../constants';
import { addMovieToSpace, SharedSpace } from '../services/supabase';
import { haptics } from '../utils/haptics';

interface AddMovieModalProps {
    isOpen: boolean;
    onClose: () => void;
    onSave: (data: MovieFormData) => void;
    initialData?: Movie | null;
    tmdbIdToLoad?: number | null;
    initialMediaType?: 'movie' | 'tv';
    initialStatus?: MovieStatus;
    sharedSpace?: SharedSpace | null;
    currentUserId?: string;
    onSharedMovieAdded?: () => void;
}

const AddMovieModal: React.FC<AddMovieModalProps> = ({
    isOpen,
    onClose,
    onSave,
    initialData,
    tmdbIdToLoad,
    initialMediaType = 'movie',
    initialStatus = 'watched',
    sharedSpace,
    currentUserId,
    onSharedMovieAdded
}) => {
    const [isSaving, setIsSaving] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [mode, setMode] = useState<MovieStatus>(initialStatus);
    
    const [formData, setFormData] = useState<MovieFormData>({
        title: '',
        director: '',
        year: new Date().getFullYear(),
        genre: GENRES[0],
        ratings: { story: 5, visuals: 5, acting: 5, sound: 5 },
        review: '',
        theme: 'black',
        status: initialStatus,
        mediaType: initialMediaType,
        actors: '',
    });

    // Sync mode with initialStatus when it changes and there's no initial data
    useEffect(() => {
        if (!initialData) {
            setMode(initialStatus);
        }
    }, [initialStatus, initialData]);

    useEffect(() => {
        if (initialData) {
            setFormData({
                ...initialData,
                status: initialData.status || 'watched'
            });
            setMode(initialData.status || 'watched');
        } else if (tmdbIdToLoad) {
            loadTmdbData(tmdbIdToLoad, initialMediaType);
        }
    }, [initialData, tmdbIdToLoad, initialMediaType]);

    // Load data from TMDB API
    const loadTmdbData = async (id: number, type: 'movie' | 'tv') => {
        setIsLoading(true);
        try {
            const res = await fetch(`${TMDB_BASE_URL}/${type}/${id}?api_key=${TMDB_API_KEY}&append_to_response=credits&language=fr-FR`);
            const data = await res.json();
            
            const director = type === 'movie' 
                ? data.credits?.crew?.find((p: any) => p.job === 'Director')?.name 
                : data.created_by?.[0]?.name;

            setFormData(prev => ({
                ...prev,
                title: data.title || data.name,
                tmdbId: data.id,
                director: director || 'Inconnu',
                year: parseInt((data.release_date || data.first_air_date || '').split('-')[0]) || new Date().getFullYear(),
                genre: data.genres?.[0]?.name || GENRES[0],
                posterUrl: data.poster_path ? `${TMDB_IMAGE_URL}${data.poster_path}` : '',
                mediaType: type,
                numberOfSeasons: data.number_of_seasons,
                review: data.overview || '',
                tmdbRating: data.vote_average ? Number(data.vote_average.toFixed(1)) : 0
            }));
        } catch (error) {
            console.error("Error loading TMDB data:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleSave = async () => {
        if (!formData.title) return;
        setIsSaving(true);
        
        // If it's a shared space, use the snippet logic provided by the user
        if (sharedSpace && currentUserId) {
            try {
                // Fixed: Explicitly handle the addition to a shared space using the addMovieToSpace service
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
                    throw new Error("Opération refusée par le serveur. Vérifiez vos droits d'accès à cet espace.");
                }
            } catch (err: any) {
                console.error("Erreur addMovieToSpace détaillée:", err);
                haptics.error();
                // Affiche l'erreur réelle pour aider à diagnostiquer (ex: RLS policy violation)
                alert("Erreur lors de l'ajout : " + (err.message || "Erreur inconnue"));
            } finally {
                setIsSaving(false);
            }
            return;
        }

        // Default local save behavior
        onSave({ ...formData, status: mode });
        setIsSaving(false);
        onClose();
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
            <div className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm" onClick={onClose} />
            <div className="relative bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
                <div className="p-8 border-b border-sand flex justify-between items-center">
                    <h2 className="text-2xl font-black text-charcoal tracking-tight">
                        {initialData ? 'Modifier' : 'Ajouter'} {formData.mediaType === 'tv' ? 'une Série' : 'un Film'}
                    </h2>
                    <button onClick={onClose} className="p-2 bg-stone-100 rounded-full text-stone-500">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-8 space-y-6">
                    {isLoading ? (
                        <div className="flex flex-col items-center justify-center py-20 gap-4">
                            <Loader2 className="animate-spin text-forest" size={32} />
                            <p className="text-[10px] font-black uppercase text-stone-300 tracking-widest">Récupération des données...</p>
                        </div>
                    ) : (
                        <>
                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-stone-400 tracking-widest ml-1">Titre</label>
                                <input 
                                    type="text" 
                                    className="w-full p-5 bg-stone-50 border-2 border-transparent focus:border-sand rounded-2xl font-black text-base outline-none transition-all"
                                    value={formData.title}
                                    onChange={e => setFormData({...formData, title: e.target.value})}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-stone-400 tracking-widest ml-1">Réalisateur</label>
                                    <input 
                                        type="text" 
                                        className="w-full p-5 bg-stone-50 border-2 border-transparent focus:border-sand rounded-2xl font-black text-base outline-none transition-all"
                                        value={formData.director}
                                        onChange={e => setFormData({...formData, director: e.target.value})}
                                    />
                                </div>
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black uppercase text-stone-400 tracking-widest ml-1">Année</label>
                                    <input 
                                        type="number" 
                                        className="w-full p-5 bg-stone-50 border-2 border-transparent focus:border-sand rounded-2xl font-black text-base outline-none transition-all"
                                        value={formData.year}
                                        onChange={e => setFormData({...formData, year: parseInt(e.target.value)})}
                                    />
                                </div>
                            </div>
                            
                            <div className="space-y-4">
                                <label className="text-[10px] font-black uppercase text-stone-400 tracking-widest ml-1">Status</label>
                                <div className="flex bg-stone-100 p-1.5 rounded-2xl border border-sand">
                                    <button 
                                        onClick={() => { haptics.soft(); setMode('watched'); }}
                                        className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'watched' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400'}`}
                                    >
                                        Déjà Vu
                                    </button>
                                    <button 
                                        onClick={() => { haptics.soft(); setMode('watchlist'); }}
                                        className={`flex-1 py-4 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${mode === 'watchlist' ? 'bg-white text-charcoal shadow-md scale-[1.02]' : 'text-stone-400'}`}
                                    >
                                        À Voir
                                    </button>
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="text-[10px] font-black uppercase text-stone-400 tracking-widest ml-1">Genre</label>
                                <select 
                                    className="w-full p-5 bg-stone-50 border-2 border-transparent focus:border-sand rounded-2xl font-black text-base outline-none transition-all appearance-none"
                                    value={formData.genre}
                                    onChange={e => setFormData({...formData, genre: e.target.value})}
                                >
                                    {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
                                </select>
                            </div>
                        </>
                    )}
                </div>

                <div className="p-8 border-t border-sand bg-stone-50/50">
                    <button 
                        onClick={handleSave}
                        disabled={isSaving || isLoading || !formData.title}
                        className="w-full bg-charcoal text-white py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 disabled:opacity-50 active:scale-95 transition-all"
                    >
                        {isSaving ? <Loader2 className="animate-spin" size={20} /> : <Check size={20} strokeWidth={3} />}
                        {isSaving ? 'Enregistrement...' : 'Confirmer'}
                    </button>
                </div>
            </div>
        </div>
    );
};

export default AddMovieModal;
