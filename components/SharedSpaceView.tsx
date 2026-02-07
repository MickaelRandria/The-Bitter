
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
  Edit
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
  refreshTrigger?: number; // Prop pour forcer le rafraîchissement depuis le parent
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
    if (movieRatings[movieId]) return; // Déjà chargé
    
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

  const calculateAverageRating = (ratings: MovieRating[]) => {
    if (ratings.length === 0) return null;
    
    const total = ratings.reduce((acc, r) => {
      return acc + (r.story + r.visuals + r.acting + r.sound) / 4;
    }, 0);
    
    return (total / ratings.length).toFixed(1);
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
      {/* Header */}
      <div className="mb-8">
        <button
          onClick={onBack}
          className="flex items-center gap-2 mb-4 text-stone-500 hover:text-charcoal transition-colors px-1"
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
          <span className="text-[10px] font-black uppercase tracking-widest">Retour</span>
        </button>

        <div className="bg-white border border-sand rounded-[2rem] p-6 shadow-sm">
          <div className="flex items-start justify-between mb-4">
            <div className="flex-1">
              <div className="flex items-center gap-4 mb-2">
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
          </div>

          {/* Membres */}
          <div className="flex items-center gap-3 pt-4 border-t border-sand">
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
                    className="p-5 cursor-pointer hover:bg-stone-50 transition-colors"
                  >
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
                        <h3 className="font-black text-base text-charcoal leading-tight mb-1 truncate">{movie.title}</h3>
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
                      <div className={`text-stone-300 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`}>
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
                          alert('Fonctionnalité de notation collaborative à venir dans la v0.72');
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
    </div>
  );
};

export default SharedSpaceView;
