
import React, { useState, useEffect } from 'react';
import { 
  ArrowLeft, 
  Plus, 
  Users, 
  Star, 
  Loader2,
  Film,
  ChevronDown,
  Trash2,
  Edit,
  X,
  Copy,
  Check
} from 'lucide-react';
import { 
  SharedSpace, 
  SharedMovie,
  SpaceMember,
  MovieRating,
  getSpaceMovies, 
  getSpaceMembers,
  getMovieRatings,
  addMovieToSpace,
  upsertMovieRating
} from '../services/supabase';
import { haptics } from '../utils/haptics';

interface SharedSpaceViewProps {
  space: SharedSpace;
  currentUserId: string;
  onBack: () => void;
  onAddMovie: () => void;
  refreshTrigger?: number;
}

const SharedSpaceView: React.FC<SharedSpaceViewProps> = ({ 
  space, 
  currentUserId,
  onBack,
  onAddMovie,
  refreshTrigger
}) => {
  const [movies, setMovies] = useState<SharedMovie[]>([]);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMovie, setExpandedMovie] = useState<string | null>(null);
  const [movieRatings, setMovieRatings] = useState<Record<string, MovieRating[]>>({});
  const [copiedCode, setCopiedCode] = useState(false);

  // Rating State
  const [ratingMovie, setRatingMovie] = useState<SharedMovie | null>(null);
  const [ratingStory, setRatingStory] = useState(5);
  const [ratingVisuals, setRatingVisuals] = useState(5);
  const [ratingActing, setRatingActing] = useState(5);
  const [ratingSound, setRatingSound] = useState(5);
  const [ratingReview, setRatingReview] = useState('');
  const [savingRating, setSavingRating] = useState(false);

  useEffect(() => {
    loadData();
  }, [space.id, refreshTrigger]);

  const loadData = async () => {
    setLoading(true);
    const [moviesData, membersData] = await Promise.all([
      getSpaceMovies(space.id),
      getSpaceMembers(space.id)
    ]);
    setMovies(moviesData);
    setMembers(membersData);
    setLoading(false);
  };

  const loadRatings = async (movieId: string) => {
    // Force reload to get fresh data
    const ratings = await getMovieRatings(movieId);
    setMovieRatings(prev => ({ ...prev, [movieId]: ratings }));
  };

  const handleExpandMovie = (movieId: string) => {
    if (expandedMovie === movieId) {
      setExpandedMovie(null);
    } else {
      setExpandedMovie(movieId);
      loadRatings(movieId);
    }
    haptics.soft();
  };

  const handleCopyCode = () => {
    if (space.invite_code) {
        navigator.clipboard.writeText(space.invite_code);
        setCopiedCode(true);
        haptics.success();
        setTimeout(() => setCopiedCode(false), 2000);
    }
  };

  const handleSubmitRating = async () => {
    if (!ratingMovie || !currentUserId) {
        alert("Erreur : Impossible d'identifier l'utilisateur ou le film.");
        return;
    }
    
    setSavingRating(true);
    
    try {
        const result = await upsertMovieRating(
        ratingMovie.id,
        currentUserId,
        {
            story: ratingStory,
            visuals: ratingVisuals,
            acting: ratingActing,
            sound: ratingSound,
            review: ratingReview.trim() || undefined
        }
        );
        
        if (result) {
            haptics.success();
            
            // Recharger les notes de ce film pour l'affichage immédiat
            await loadRatings(ratingMovie.id);
            
            // Fermer le modal
            setRatingMovie(null);
            // Reset form
            setRatingStory(5);
            setRatingVisuals(5);
            setRatingActing(5);
            setRatingSound(5);
            setRatingReview('');
        } else {
            throw new Error("Pas de réponse du serveur");
        }
    } catch (e) {
        console.error(e);
        haptics.error();
        alert("Erreur lors de la sauvegarde. Vérifiez votre connexion.");
    } finally {
        setSavingRating(false);
    }
  };

  const calculateAverageRating = (ratings: MovieRating[]) => {
    if (ratings.length === 0) return null;
    
    const total = ratings.reduce((acc, r) => {
      return acc + (r.story + r.visuals + r.acting + r.sound) / 4;
    }, 0);
    
    return (total / ratings.length).toFixed(1);
  };

  const calculateSpaceStats = () => {
    // Stats par membre
    const memberStats: Record<string, { totalRatings: number; avgRating: number; name: string }> = {};
    
    // Typage explicite pour éviter l'erreur TypeScript "unknown"
    const allRatingsGroups = Object.values(movieRatings) as MovieRating[][];
    
    allRatingsGroups.forEach((ratings) => {
      ratings.forEach(rating => {
        if (!memberStats[rating.profile_id]) {
          memberStats[rating.profile_id] = {
            totalRatings: 0,
            avgRating: 0,
            name: rating.profile?.first_name || 'Membre'
          };
        }
        
        const avg = (rating.story + rating.visuals + rating.acting + rating.sound) / 4;
        const currentStats = memberStats[rating.profile_id];
        
        // Moyenne cumulative glissante
        currentStats.avgRating = 
          (currentStats.avgRating * currentStats.totalRatings + avg) / 
          (currentStats.totalRatings + 1);
        currentStats.totalRatings++;
      });
    });
    
    return memberStats;
  };

  if (loading && movies.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader2 className="animate-spin text-forest" size={32} />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto w-full pb-32 animate-[fadeIn_0.3s_ease-out]">
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          background: #2D5016;
          border: 3px solid white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        .slider::-moz-range-thumb {
          width: 24px;
          height: 24px;
          background: #2D5016;
          border: 3px solid white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
      `}</style>

      {/* Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-4">
            <button
            onClick={onBack}
            className="flex items-center gap-2 text-stone-500 hover:text-charcoal transition-colors px-1"
            >
            <ArrowLeft size={16} strokeWidth={2.5} />
            <span className="text-[10px] font-black uppercase tracking-widest">Retour</span>
            </button>
            <button
                onClick={async () => {
                    if (confirm('Voulez-vous vraiment quitter cet espace ?')) {
                    // TODO: Implémenter la suppression du membre en DB
                    haptics.medium();
                    onBack();
                    }
                }}
                className="text-[10px] text-red-400 hover:text-red-600 font-bold uppercase tracking-widest"
            >
                Quitter
            </button>
        </div>

        <div className="bg-white border border-sand rounded-[2rem] p-6 shadow-sm">
          <div className="flex flex-col gap-4">
            <div className="flex items-start justify-between">
                <div className="flex items-center gap-4">
                    <div className="w-14 h-14 bg-forest rounded-2xl flex items-center justify-center shadow-lg shadow-forest/20">
                    <Users size={24} className="text-white" />
                    </div>
                    <div>
                    <h1 className="text-2xl font-black tracking-tight text-charcoal">{space.name}</h1>
                    {space.description && (
                        <p className="text-xs font-medium text-stone-500 mt-0.5">{space.description}</p>
                    )}
                    </div>
                </div>
            </div>

            {/* Invite Code Bar */}
            <div 
                onClick={handleCopyCode}
                className="flex items-center justify-between bg-stone-50 border border-dashed border-stone-300 rounded-xl p-3 cursor-pointer hover:bg-stone-100 transition-colors active:scale-[0.98]"
            >
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-stone-400 tracking-widest">Code d'invitation :</span>
                    <span className="text-sm font-black font-mono text-charcoal tracking-wider">{space.invite_code}</span>
                </div>
                <div className={`p-1.5 rounded-lg ${copiedCode ? 'bg-green-100 text-green-700' : 'bg-white text-stone-400 shadow-sm'}`}>
                    {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                </div>
            </div>
          </div>

          {/* Membres */}
          <div className="flex items-center gap-3 pt-4 border-t border-sand mt-4">
            <div className="flex -space-x-2">
              {members.slice(0, 5).map((member, idx) => (
                <div
                  key={member.id}
                  className="w-8 h-8 rounded-full bg-stone-100 text-charcoal flex items-center justify-center text-[10px] font-black border-2 border-white shadow-sm"
                  title={member.profile?.first_name || 'Membre'}
                >
                  {(member.profile?.first_name || 'M')[0].toUpperCase()}
                </div>
              ))}
              {members.length > 5 && (
                <div className="w-8 h-8 rounded-full bg-stone-800 text-white flex items-center justify-center text-[9px] font-bold border-2 border-white">
                  +{members.length - 5}
                </div>
              )}
            </div>
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 ml-2">
              {members.length} membre{members.length > 1 ? 's' : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Stats Comparatives */}
      {Object.keys(movieRatings).length > 0 && (
        <div className="bg-white border border-sand rounded-[2rem] p-6 mb-8 animate-[fadeIn_0.4s_ease-out]">
            <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 mb-4 ml-1">
            Stats du Groupe
            </h3>
            
            <div className="grid grid-cols-2 gap-4">
            {Object.entries(calculateSpaceStats()).map(([memberId, stats]) => {
                const isMe = memberId === currentUserId;
                
                return (
                <div 
                    key={memberId}
                    className={`p-4 rounded-xl border-2 ${
                    isMe ? 'bg-forest/5 border-forest' : 'bg-stone-50 border-sand'
                    }`}
                >
                    <div className="flex items-center gap-2 mb-2">
                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold text-white ${
                        isMe ? 'bg-forest' : 'bg-stone-400'
                    }`}>
                        {stats.name[0].toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                        <p className="font-bold text-xs truncate">
                        {stats.name}
                        {isMe && <span className="text-forest ml-1">(Toi)</span>}
                        </p>
                    </div>
                    </div>
                    
                    <div className="flex items-baseline gap-1">
                    <Star size={14} fill="currentColor" className="text-forest" />
                    <span className="text-2xl font-black text-charcoal">
                        {stats.avgRating.toFixed(1)}
                    </span>
                    <span className="text-[10px] text-stone-400 font-bold">/10</span>
                    </div>
                    
                    <p className="text-[9px] text-stone-500 font-medium mt-1">
                    {stats.totalRatings} film{stats.totalRatings > 1 ? 's' : ''} noté{stats.totalRatings > 1 ? 's' : ''}
                    </p>
                </div>
                );
            })}
            </div>
            
            {/* Match entre membres */}
            {Object.keys(calculateSpaceStats()).length === 2 && (
            <div className="mt-4 pt-4 border-t border-sand">
                <p className="text-center text-xs">
                <span className="font-bold text-stone-500">Match du groupe :</span>
                {' '}
                <span className="text-forest font-black uppercase tracking-wider ml-1">
                    {(() => {
                    const stats = Object.values(calculateSpaceStats());
                    const diff = Math.abs(stats[0].avgRating - stats[1].avgRating);
                    if (diff < 0.5) return "🔥 Presque identiques !";
                    if (diff < 1.5) return "✨ Très proches";
                    if (diff < 2.5) return "🎬 Complémentaires";
                    return "🌟 Goûts différents";
                    })()}
                </span>
                </p>
            </div>
            )}
        </div>
      )}

      {/* Films */}
      <div>
        <div className="flex items-center justify-between mb-6 px-1">
          <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">
            Collection ({movies.length})
          </h2>
          <button
            onClick={() => {
              haptics.medium();
              onAddMovie();
            }}
            className="bg-forest text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase tracking-widest flex items-center gap-2 active:scale-95 transition-transform shadow-lg shadow-forest/20"
          >
            <Plus size={14} strokeWidth={3} />
            Ajouter
          </button>
        </div>

        {movies.length === 0 ? (
          <div className="bg-stone-50/50 border border-stone-100 border-dashed rounded-[2rem] p-12 text-center flex flex-col items-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mb-4 shadow-sm text-stone-300">
                <Film size={24} />
            </div>
            <h3 className="font-black text-charcoal text-sm mb-2">C'est vide ici</h3>
            <p className="text-xs text-stone-400 mb-6 max-w-[200px] leading-relaxed">
              Lancez le mouvement en ajoutant le premier film à cet espace !
            </p>
            <button
              onClick={() => {
                haptics.medium();
                onAddMovie();
              }}
              className="bg-charcoal text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest active:scale-95 transition-transform shadow-lg"
            >
              Ajouter un film
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {movies.map((movie) => {
              const isExpanded = expandedMovie === movie.id;
              const ratings = movieRatings[movie.id] || [];
              const avgRating = calculateAverageRating(ratings);
              const myRating = ratings.find(r => r.profile_id === currentUserId);

              return (
                <div
                  key={movie.id}
                  className="bg-white border border-sand rounded-[2rem] overflow-hidden transition-all shadow-sm"
                >
                  {/* Card principale */}
                  <div
                    onClick={() => handleExpandMovie(movie.id)}
                    className="p-5 cursor-pointer hover:bg-stone-50 transition-colors relative"
                  >
                    {!myRating && (
                      <div className="absolute top-3 right-3 bg-orange-500 text-white text-[9px] font-black px-2 py-1 rounded-full shadow-sm z-10">
                        À noter
                      </div>
                    )}
                    
                    <div className="flex items-start gap-4">
                      {/* Poster */}
                      <div className="w-16 aspect-[2/3] bg-stone-200 rounded-xl overflow-hidden shadow-sm shrink-0">
                        {movie.poster_url ? (
                            <img
                            src={movie.poster_url}
                            alt={movie.title}
                            className="w-full h-full object-cover"
                            />
                        ) : (
                            <div className="w-full h-full flex items-center justify-center text-stone-400"><Film size={16} /></div>
                        )}
                      </div>

                      {/* Infos */}
                      <div className="flex-1 min-w-0 pt-1">
                        <h3 className="font-black text-base text-charcoal leading-tight mb-1 truncate pr-8">{movie.title}</h3>
                        <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wide mb-3">
                          {movie.director} • {movie.year}
                        </p>

                        <div className="flex items-center gap-3">
                          {/* Ajouté par */}
                          <div className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-stone-100 text-[8px] font-black flex items-center justify-center text-stone-500">
                                {(movie.added_by_profile?.first_name || '?')[0]}
                            </div>
                            <span className="text-[9px] font-bold text-stone-400">
                              {movie.added_by_profile?.first_name || 'Inconnu'}
                            </span>
                          </div>

                          <div className="w-px h-3 bg-stone-200" />

                          {/* Note moyenne */}
                          {avgRating ? (
                            <div className="flex items-center gap-1 text-forest">
                              <Star size={10} fill="currentColor" />
                              <span className="text-[10px] font-black">{avgRating}</span>
                            </div>
                          ) : (
                            <span className="text-[9px] font-bold text-stone-300">Non noté</span>
                          )}
                        </div>
                      </div>

                      {/* Chevron */}
                      <div className={`text-stone-300 transition-transform duration-300 self-center ${isExpanded ? 'rotate-180' : ''}`}>
                        <ChevronDown size={20} />
                      </div>
                    </div>
                  </div>

                  {/* Détails expandables */}
                  {isExpanded && (
                    <div className="border-t border-sand p-5 bg-stone-50/50 animate-[fadeIn_0.3s_ease-out]">
                      <h4 className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-300 mb-4 ml-1">
                        Verdicts ({ratings.length})
                      </h4>

                      {ratings.length === 0 ? (
                        <div className="text-center py-6 bg-white rounded-xl border border-dashed border-stone-200 mb-4">
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wide">
                            Aucune critique disponible
                          </p>
                        </div>
                      ) : (
                        <div className="space-y-3 mb-6">
                          {ratings.map((rating) => {
                            const avg = ((rating.story + rating.visuals + rating.acting + rating.sound) / 4).toFixed(1);
                            const isMyRating = rating.profile_id === currentUserId;

                            return (
                              <div
                                key={rating.id}
                                className={`bg-white rounded-2xl p-4 border shadow-sm ${
                                  isMyRating ? 'border-forest/30 ring-1 ring-forest/10' : 'border-stone-100'
                                }`}
                              >
                                <div className="flex items-center justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-black ${isMyRating ? 'bg-forest text-white' : 'bg-stone-100 text-charcoal'}`}>
                                      {(rating.profile?.first_name || 'M')[0].toUpperCase()}
                                    </div>
                                    <span className="font-bold text-xs text-charcoal">
                                      {rating.profile?.first_name || 'Membre'}
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-1 text-charcoal bg-bitter-lime px-2 py-0.5 rounded-md">
                                    <Star size={10} fill="currentColor" />
                                    <span className="text-[10px] font-black">{avg}</span>
                                  </div>
                                </div>

                                {/* Détail des notes */}
                                <div className="grid grid-cols-4 gap-1 text-[9px] mb-2 opacity-80">
                                  <div className="bg-stone-50 rounded p-1 text-center">
                                    <div className="font-black text-charcoal">{rating.story}</div>
                                    <div className="text-stone-400 uppercase tracking-tighter text-[7px]">Txt</div>
                                  </div>
                                  <div className="bg-stone-50 rounded p-1 text-center">
                                    <div className="font-black text-charcoal">{rating.visuals}</div>
                                    <div className="text-stone-400 uppercase tracking-tighter text-[7px]">Vis</div>
                                  </div>
                                  <div className="bg-stone-50 rounded p-1 text-center">
                                    <div className="font-black text-charcoal">{rating.acting}</div>
                                    <div className="text-stone-400 uppercase tracking-tighter text-[7px]">Jeu</div>
                                  </div>
                                  <div className="bg-stone-50 rounded p-1 text-center">
                                    <div className="font-black text-charcoal">{rating.sound}</div>
                                    <div className="text-stone-400 uppercase tracking-tighter text-[7px]">Son</div>
                                  </div>
                                </div>

                                {/* Review */}
                                {rating.review && (
                                  <div className="mt-2 pl-2 border-l-2 border-stone-200">
                                    <p className="text-[10px] font-medium text-stone-500 italic leading-relaxed">
                                        "{rating.review}"
                                    </p>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Bouton pour noter */}
                      <button
                        onClick={() => {
                          haptics.medium();
                          // Pré-remplir si l'utilisateur a déjà noté
                          if (myRating) {
                            setRatingStory(myRating.story);
                            setRatingVisuals(myRating.visuals);
                            setRatingActing(myRating.acting);
                            setRatingSound(myRating.sound);
                            setRatingReview(myRating.review || '');
                          }
                          setRatingMovie(movie);
                        }}
                        className={`w-full py-3.5 rounded-xl font-black text-[10px] uppercase tracking-[0.15em] active:scale-95 transition-transform flex items-center justify-center gap-2 ${myRating ? 'bg-stone-100 text-stone-500' : 'bg-charcoal text-white shadow-lg'}`}
                      >
                        {myRating ? <Edit size={12} /> : <Star size={12} />}
                        {myRating ? 'Modifier mon verdict' : 'Déposer mon verdict'}
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Modal de Notation */}
      {ratingMovie && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="relative bg-cream w-full sm:max-w-lg rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden">
            
            {/* Header */}
            <div className="p-6 border-b border-sand/60 flex items-center justify-between bg-white/50 backdrop-blur-xl">
                <div>
                <h3 className="text-lg font-black tracking-tight leading-none text-charcoal">{ratingMovie.title}</h3>
                <p className="text-xs font-bold text-stone-400 mt-1">{ratingMovie.director} • {ratingMovie.year}</p>
                </div>
                <button 
                onClick={() => {
                    setRatingMovie(null);
                    haptics.soft();
                }}
                className="w-10 h-10 rounded-full bg-stone-100 flex items-center justify-center active:scale-90 transition-transform"
                >
                <X size={20} />
                </button>
            </div>

            {/* Body */}
            <div className="flex-1 overflow-y-auto p-6 no-scrollbar">
                
                {/* Sliders de notation */}
                <div className="space-y-6 mb-8">
                {/* Story */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Histoire</label>
                    <span className="text-lg font-black text-forest">{ratingStory}/10</span>
                    </div>
                    <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={ratingStory}
                    onChange={(e) => {
                        setRatingStory(parseInt(e.target.value));
                        haptics.soft();
                    }}
                    className="w-full h-2 bg-stone-200 rounded-full appearance-none cursor-pointer slider"
                    style={{'--value': `${ratingStory*10}%`} as React.CSSProperties}
                    />
                </div>

                {/* Visuals */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Visuel</label>
                    <span className="text-lg font-black text-forest">{ratingVisuals}/10</span>
                    </div>
                    <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={ratingVisuals}
                    onChange={(e) => {
                        setRatingVisuals(parseInt(e.target.value));
                        haptics.soft();
                    }}
                    className="w-full h-2 bg-stone-200 rounded-full appearance-none cursor-pointer slider"
                    style={{'--value': `${ratingVisuals*10}%`} as React.CSSProperties}
                    />
                </div>

                {/* Acting */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Acting</label>
                    <span className="text-lg font-black text-forest">{ratingActing}/10</span>
                    </div>
                    <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={ratingActing}
                    onChange={(e) => {
                        setRatingActing(parseInt(e.target.value));
                        haptics.soft();
                    }}
                    className="w-full h-2 bg-stone-200 rounded-full appearance-none cursor-pointer slider"
                    style={{'--value': `${ratingActing*10}%`} as React.CSSProperties}
                    />
                </div>

                {/* Sound */}
                <div>
                    <div className="flex items-center justify-between mb-2">
                    <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Son</label>
                    <span className="text-lg font-black text-forest">{ratingSound}/10</span>
                    </div>
                    <input
                    type="range"
                    min="0"
                    max="10"
                    step="1"
                    value={ratingSound}
                    onChange={(e) => {
                        setRatingSound(parseInt(e.target.value));
                        haptics.soft();
                    }}
                    className="w-full h-2 bg-stone-200 rounded-full appearance-none cursor-pointer slider"
                    style={{'--value': `${ratingSound*10}%`} as React.CSSProperties}
                    />
                </div>
                </div>

                {/* Note moyenne preview */}
                <div className="bg-forest text-white rounded-2xl p-6 text-center mb-8 shadow-xl shadow-forest/20">
                    <p className="text-[9px] font-black uppercase tracking-[0.2em] opacity-80 mb-1">Moyenne Globale</p>
                    <p className="text-5xl font-black tracking-tighter">
                        {((ratingStory + ratingVisuals + ratingActing + ratingSound) / 4).toFixed(1)}
                    </p>
                </div>

                {/* Review */}
                <div className="mb-2">
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 mb-2 block ml-1">
                    Verdict (optionnel)
                </label>
                <textarea
                    value={ratingReview}
                    onChange={(e) => setRatingReview(e.target.value)}
                    placeholder="Ton avis en quelques mots..."
                    className="w-full p-5 rounded-2xl border-2 border-stone-100 bg-white text-sm font-medium focus:outline-none focus:border-forest resize-none transition-all"
                    rows={3}
                    maxLength={200}
                />
                <p className="text-[9px] font-bold text-stone-300 mt-2 text-right">{ratingReview.length}/200</p>
                </div>
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-sand bg-white shrink-0">
                <button
                onClick={handleSubmitRating}
                disabled={savingRating}
                className="w-full bg-charcoal text-white py-5 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-3 shadow-xl"
                >
                {savingRating ? (
                    <>
                    <Loader2 className="animate-spin" size={16} />
                    Enregistrement...
                    </>
                ) : (
                    <>
                    <Star size={16} />
                    Valider mon verdict
                    </>
                )}
                </button>
            </div>
            </div>
        </div>
        )}
    </div>
  );
};

export default SharedSpaceView;
