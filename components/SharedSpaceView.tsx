import React, { useState, useEffect, useMemo } from 'react';
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
  Check,
  History,
  Bookmark,
  CheckCircle2,
  Ticket,
  UserCheck,
  LogOut,
  AlertTriangle,
  PartyPopper,
  BarChart3,
  MapPin,
  Link,
  Shield,
  Calendar,
  Globe,
  ChevronRight
} from 'lucide-react';
import { 
  SharedSpace, 
  SharedMovie,
  SpaceMember,
  MovieRating,
  getSpaceMovies, 
  getSpaceMembers,
  getMovieRatings,
  getSpaceMovieVotes,
  upsertMovieRating,
  toggleMovieVote,
  markMovieAsWatched,
  deleteSharedMovie,
  leaveSharedSpace,
  MovieVote
} from '../services/supabase';
import { haptics } from '../utils/haptics';

interface SharedSpaceViewProps {
  space: SharedSpace;
  currentUserId: string;
  onBack: () => void;
  onAddMovie: () => void;
  refreshTrigger?: number;
}

type SpaceTab = 'feed' | 'watchlist' | 'members';

const SharedSpaceView: React.FC<SharedSpaceViewProps> = ({ 
  space, 
  currentUserId,
  onBack,
  onAddMovie,
  refreshTrigger
}) => {
  const [activeTab, setActiveTab] = useState<SpaceTab>('feed');
  const [movies, setMovies] = useState<SharedMovie[]>([]);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [votes, setVotes] = useState<MovieVote[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedMovie, setExpandedMovie] = useState<string | null>(null);
  const [movieRatings, setMovieRatings] = useState<Record<string, MovieRating[]>>({});
  const [copiedCode, setCopiedCode] = useState(false);
  const [isLeaving, setIsLeaving] = useState(false);
  
  const [selectedMember, setSelectedMember] = useState<SpaceMember | null>(null);

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
    const [moviesData, membersData, votesData] = await Promise.all([
      getSpaceMovies(space.id),
      getSpaceMembers(space.id),
      getSpaceMovieVotes(space.id)
    ]);
    setMovies(moviesData);
    setMembers(membersData);
    setVotes(votesData);
    setLoading(false);
  };

  const loadRatings = async (movieId: string) => {
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

  const handleLeaveSpace = async () => {
    if (confirm(`Voulez-vous vraiment quitter l'espace "${space.name}" ?`)) {
        setIsLeaving(true);
        haptics.medium();
        try {
            const success = await leaveSharedSpace(space.id, currentUserId);
            if (success) {
                haptics.success();
                onBack();
            } else {
                throw new Error("Erreur lors de la sortie");
            }
        } catch (e) {
            console.error(e);
            haptics.error();
            alert("Impossible de quitter l'espace — réessayez.");
        } finally {
            setIsLeaving(false);
        }
    }
  };

  const handleToggleVote = async (e: React.MouseEvent, movieId: string) => {
      e.stopPropagation();
      haptics.medium();
      await toggleMovieVote(movieId, currentUserId);
      const newVotes = await getSpaceMovieVotes(space.id);
      setVotes(newVotes);
  };

  const handleMarkAsWatched = async (e: React.MouseEvent, movieId: string) => {
      e.stopPropagation();
      if (confirm('Marquer ce film comme regardé par le groupe ?')) {
          haptics.success();
          await markMovieAsWatched(movieId);
          loadData();
          setActiveTab('feed');
      }
  };

  const handleDeleteMovie = async (e: React.MouseEvent, movieId: string) => {
      e.stopPropagation();
      if (confirm('Supprimer définitivement ce film ?')) {
          haptics.error();
          setMovies(prev => prev.filter(m => m.id !== movieId));
          const success = await deleteSharedMovie(movieId);
          if (!success) loadData();
      }
  };

  const handleSubmitRating = async () => {
    if (!ratingMovie || !currentUserId) return;
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
            await loadRatings(ratingMovie.id);
            setRatingMovie(null);
            setRatingStory(5);
            setRatingVisuals(5);
            setRatingActing(5);
            setRatingSound(5);
            setRatingReview('');
        }
    } catch (e) {
        console.error(e);
        haptics.error();
    } finally {
        setSavingRating(false);
    }
  };

  const calculateAverageRating = (ratings: MovieRating[]) => {
    if (ratings.length === 0) return null;
    const total = ratings.reduce((acc, r) => acc + (r.story + r.visuals + r.acting + r.sound) / 4, 0);
    return (total / ratings.length).toFixed(1);
  };

  const calculateCriteriaAverages = (ratings: MovieRating[]) => {
    if (ratings.length === 0) return null;
    return {
        story: ratings.reduce((acc, r) => acc + r.story, 0) / ratings.length,
        visuals: ratings.reduce((acc, r) => acc + r.visuals, 0) / ratings.length,
        acting: ratings.reduce((acc, r) => acc + r.acting, 0) / ratings.length,
        sound: ratings.reduce((acc, r) => acc + r.sound, 0) / ratings.length
    };
  };

  const feedMovies = useMemo(() => movies.filter(m => m.status === 'watched'), [movies]);
  const watchlistMovies = useMemo(() => {
    const list = movies.filter(m => m.status === 'watchlist');
    return list.sort((a, b) => {
        const vA = votes.filter(v => v.movie_id === a.id).length;
        const vB = votes.filter(v => v.movie_id === b.id).length;
        return vB - vA;
    });
  }, [movies, votes]);

  if (loading && movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-forest" size={32} />
        <p className="text-[10px] font-black uppercase text-stone-300 dark:text-stone-700 tracking-[0.2em]">Synchronisation...</p>
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
          background: #3E5238;
          border: 3px solid white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        @keyframes celebrate {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(217, 255, 0, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(217, 255, 0, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(217, 255, 0, 0); }
        }
      `}</style>

      {/* Header Capsule */}
      <div className="mb-10 animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="flex justify-between items-center mb-6">
            <button onClick={onBack} className="w-10 h-10 bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-2xl flex items-center justify-center shadow-soft dark:shadow-none active:scale-90 transition-all">
                <ArrowLeft size={20} strokeWidth={3} className="text-charcoal dark:text-white" />
            </button>
            <div className="flex bg-stone-100 dark:bg-[#161616] p-1 rounded-full border border-stone-200/50 dark:border-white/5 shadow-inner w-full max-w-[280px] mx-4 transition-colors">
                <button 
                  onClick={() => { haptics.soft(); setActiveTab('feed'); }} 
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'feed' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-md dark:shadow-black/30' : 'text-stone-400 dark:text-stone-600'}`}
                >
                    <History size={14} /> Chrono
                </button>
                <button 
                  onClick={() => { haptics.soft(); setActiveTab('watchlist'); }} 
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'watchlist' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-md dark:shadow-black/30' : 'text-stone-400 dark:text-stone-600'}`}
                >
                    <Bookmark size={14} /> À voir
                    {watchlistMovies.length > 0 && <span className="w-1.5 h-1.5 bg-forest rounded-full"></span>}
                </button>
                <button 
                  onClick={() => { haptics.soft(); setActiveTab('members'); }} 
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${activeTab === 'members' ? 'bg-white dark:bg-[#202020] text-charcoal dark:text-white shadow-md dark:shadow-black/30' : 'text-stone-400 dark:text-stone-600'}`}
                >
                    <Users size={14} /> Membres
                </button>
            </div>
            <button 
                onClick={handleLeaveSpace}
                disabled={isLeaving}
                className="w-10 h-10 bg-stone-50 dark:bg-[#161616] border border-sand dark:border-white/10 rounded-2xl flex items-center justify-center text-stone-400 dark:text-stone-500 active:scale-90 transition-all hover:text-red-500"
            >
                {isLeaving ? <Loader2 size={18} className="animate-spin" /> : <LogOut size={18} />}
            </button>
        </div>

        <div className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-[2.5rem] p-6 shadow-sm dark:shadow-black/20 transition-all">
          <div className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
                <div className="w-14 h-14 bg-forest rounded-2xl flex items-center justify-center shadow-lg shadow-forest/20">
                    <Users size={24} className="text-white" />
                </div>
                <div className="min-w-0">
                    <h1 className="text-2xl font-black tracking-tight text-charcoal dark:text-white truncate">{space.name}</h1>
                    <div className="flex items-center gap-2 mt-0.5">
                        <span className="text-[9px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest">{members.length} MEMBRES</span>
                        <div className="w-1 h-1 bg-stone-200 dark:bg-stone-800 rounded-full" />
                        <span className="text-[9px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest">{movies.length} FILMS</span>
                    </div>
                </div>
            </div>

            <div 
                onClick={handleCopyCode}
                className="flex items-center justify-between bg-stone-50 dark:bg-[#161616] border border-dashed border-stone-300 dark:border-white/10 rounded-xl p-3 cursor-pointer hover:bg-stone-100 dark:hover:bg-[#202020] transition-colors"
            >
                <div className="flex items-center gap-2">
                    <span className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest">Code :</span>
                    <span className="text-sm font-black font-mono text-charcoal dark:text-white tracking-widest">{space.invite_code}</span>
                </div>
                <div className={`p-1.5 rounded-lg transition-colors ${copiedCode ? 'bg-green-100 dark:bg-green-500/20 text-green-700 dark:text-green-400' : 'bg-white dark:bg-[#202020] text-stone-400 dark:text-stone-500 shadow-sm'}`}>
                    {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                </div>
            </div>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="space-y-6">
          <div className="flex items-center justify-between px-1">
              <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
                  {activeTab === 'feed' ? 'Derniers Verdicts' : activeTab === 'watchlist' ? 'Watchlist Collective' : 'Liste des Membres'} 
              </h2>
              {activeTab !== 'members' && (
                <button
                    onClick={() => { haptics.medium(); onAddMovie(); }}
                    className="bg-charcoal dark:bg-forest text-white px-5 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest flex items-center gap-2 active:scale-95 transition-transform shadow-lg"
                >
                    <Plus size={14} strokeWidth={3} /> {activeTab === 'feed' ? 'Ajouter' : 'Suggérer'}
                </button>
              )}
          </div>

          {activeTab === 'members' ? (
            <div className="space-y-3 animate-[fadeIn_0.3s_ease-out]">
                {members.map(member => (
                    <div 
                        key={member.id} 
                        onClick={() => { haptics.medium(); setSelectedMember(member); }}
                        className="flex items-center gap-4 bg-white dark:bg-[#202020] border border-sand dark:border-white/10 p-4 rounded-[1.8rem] cursor-pointer hover:border-forest dark:hover:border-forest/50 hover:shadow-sm transition-all"
                    >
                        <div className="w-12 h-12 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white font-black text-sm shrink-0 border-2 border-white dark:border-white/10 shadow-sm overflow-hidden">
                            {member.profile?.avatar_url ? (
                                <img src={member.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span>{(member.profile?.first_name || '?')[0].toUpperCase()}</span>
                            )}
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-0.5">
                                <span className="font-black text-charcoal dark:text-white truncate">{member.profile?.first_name}</span>
                                {member.role === 'owner' && <span className="text-[8px] bg-forest/10 dark:bg-forest/20 text-forest dark:text-lime-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">Fondateur</span>}
                            </div>
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${member.is_active ? 'bg-green-400' : 'bg-stone-300 dark:bg-stone-700'}`} />
                                <span className="text-[10px] font-medium text-stone-400 dark:text-stone-600">
                                    {member.is_active ? 'Actif' : 'Inactif'}
                                </span>
                            </div>
                        </div>
                        <ChevronRight size={16} className="text-stone-300 dark:text-stone-700" />
                    </div>
                ))}
            </div>
          ) : (
            (activeTab === 'feed' ? feedMovies : watchlistMovies).length === 0 ? (
                <div className="py-24 text-center bg-white dark:bg-[#1a1a1a] rounded-[2.5rem] border border-stone-100 dark:border-white/5 shadow-sm dark:shadow-none flex flex-col items-center">
                    <div className="w-16 h-16 bg-stone-50 dark:bg-[#202020] rounded-full flex items-center justify-center text-stone-300 dark:text-stone-700 mb-6">
                        {activeTab === 'feed' ? <History size={24} /> : <Bookmark size={24} />}
                    </div>
                    <h3 className="font-black text-charcoal dark:text-white text-base mb-1">C'est encore calme ici</h3>
                    <p className="text-xs text-stone-500 dark:text-stone-600 max-w-[200px] leading-relaxed">
                        {activeTab === 'feed' ? "Ajoutez les films que vous avez vus ensemble." : "Suggérez les prochains films à voir !"}
                    </p>
                </div>
            ) : (
                <div className="space-y-4">
                {(activeTab === 'feed' ? feedMovies : watchlistMovies).map((movie) => {
                    const isExpanded = expandedMovie === movie.id;
                    const ratings = movieRatings[movie.id] || [];
                    const avgRating = calculateAverageRating(ratings);
                    const myRating = ratings.find(r => r.profile_id === currentUserId);
                    const criteriaAvg = calculateCriteriaAverages(ratings);
                    const isConsensus = members.length > 1 && ratings.length === members.length;
                    const participationRate = (ratings.length / members.length) * 100;
                    const movieVotes = votes.filter(v => v.movie_id === movie.id);
                    const hasIVoted = movieVotes.some(v => v.profile_id === currentUserId);
                    const voteCount = movieVotes.length;
                    const votePercentage = (voteCount / members.length) * 100;

                    return (
                    <div key={movie.id} className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-[2.5rem] overflow-hidden transition-all shadow-soft dark:shadow-black/20 animate-[fadeIn_0.3s_ease-out]">
                        <div onClick={() => handleExpandMovie(movie.id)} className="p-6 cursor-pointer hover:bg-stone-50 dark:hover:bg-[#252525] transition-colors">
                        <div className="flex gap-5">
                            <div className="w-16 aspect-[2/3] bg-stone-200 dark:bg-[#161616] rounded-2xl overflow-hidden shadow-md shrink-0 border border-white dark:border-white/10">
                            {movie.poster_url ? <img src={movie.poster_url} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center text-stone-400 dark:text-stone-700"><Film size={16} /></div>}
                            </div>

                            <div className="flex-1 min-w-0 pt-1">
                            <h3 className="font-black text-lg text-charcoal dark:text-white leading-tight mb-1 truncate">{movie.title}</h3>
                            <p className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-wide mb-3">{movie.director} • {movie.year}</p>

                            {activeTab === 'feed' ? (
                                <div className="flex flex-col gap-2">
                                    <div className="flex items-center gap-3">
                                        <div className="flex items-center gap-1.5">
                                            <div className="w-5 h-5 rounded-full bg-stone-100 dark:bg-[#252525] text-[9px] font-black flex items-center justify-center text-stone-500 dark:text-stone-400">{(movie.added_by_profile?.first_name || '?')[0].toUpperCase()}</div>
                                            <span className="text-[10px] font-bold text-stone-400 dark:text-stone-600">{movie.added_by_profile?.first_name || 'Inconnu'}</span>
                                        </div>
                                        <div className="w-px h-3 bg-stone-200 dark:bg-stone-800" />
                                        {avgRating ? (
                                            <div className="flex items-center gap-1.5 text-forest dark:text-lime-500">
                                            <Star size={12} fill="currentColor" />
                                            <span className="text-xs font-black">{avgRating}</span>
                                            </div>
                                        ) : <span className="text-[10px] font-bold text-stone-300 dark:text-stone-800">Non noté</span>}
                                    </div>
                                    {ratings.length > 0 && ratings.length < members.length && (
                                        <div className="flex items-center gap-2">
                                            <div className="h-1.5 flex-1 bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden max-w-[80px]">
                                                <div className="h-full bg-stone-300 dark:bg-stone-700" style={{ width: `${participationRate}%` }} />
                                            </div>
                                            <span className="text-[9px] font-bold text-stone-300 dark:text-stone-700">{ratings.length}/{members.length}</span>
                                        </div>
                                    )}
                                </div>
                            ) : (
                                <div className="space-y-2">
                                    <div className="flex items-center justify-between">
                                        <div className="flex items-center gap-1.5 text-[10px] font-black text-forest dark:text-lime-500">
                                            <Users size={12} />
                                            <span>{voteCount} / {members.length} INTÉRESSÉS</span>
                                        </div>
                                        <span className="text-[10px] font-bold text-stone-400 dark:text-stone-600">{Math.round(votePercentage)}%</span>
                                    </div>
                                    <div className="h-2 bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden border border-sand dark:border-white/5 transition-colors">
                                        <div className="h-full bg-forest dark:bg-lime-500 transition-all duration-700" style={{ width: `${votePercentage}%` }} />
                                    </div>
                                </div>
                            )}
                            </div>
                        </div>
                        </div>

                        {isExpanded && (
                        <div className="border-t border-sand dark:border-white/5 p-6 bg-stone-50/50 dark:bg-[#1a1a1a]/50 animate-[fadeIn_0.3s_ease-out] space-y-6">
                            {activeTab === 'feed' ? (
                            <>
                                {isConsensus && (
                                    <div className="bg-bitter-lime p-4 rounded-2xl flex items-center justify-center gap-3 shadow-lg shadow-bitter-lime/20 border-2 border-charcoal/5" style={{ animation: 'celebrate 2s infinite ease-in-out' }}>
                                        <PartyPopper size={20} className="text-charcoal" strokeWidth={2.5} />
                                        <span className="text-xs font-black uppercase tracking-widest text-charcoal">Verdict Complet !</span>
                                        <PartyPopper size={20} className="text-charcoal scale-x-[-1]" strokeWidth={2.5} />
                                    </div>
                                )}

                                {criteriaAvg && (
                                    <div className="bg-white dark:bg-[#202020] p-5 rounded-2xl border border-stone-200 dark:border-white/10 shadow-sm transition-colors">
                                        <div className="flex items-center gap-2 mb-4 text-forest dark:text-lime-500">
                                            <BarChart3 size={16} />
                                            <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">Moyennes du Groupe</h4>
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            {[
                                                {l:'Script', v:criteriaAvg.story},
                                                {l:'Visuel', v:criteriaAvg.visuals},
                                                {l:'Jeu', v:criteriaAvg.acting},
                                                {l:'Son', v:criteriaAvg.sound}
                                            ].map(c => (
                                                <div key={c.l} className="space-y-1">
                                                    <div className="flex justify-between text-[9px] font-bold text-stone-400 dark:text-stone-600 uppercase"><span>{c.l}</span><span>{c.v.toFixed(1)}</span></div>
                                                    <div className="h-1.5 bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden transition-colors"><div className="h-full bg-charcoal dark:bg-white" style={{ width: `${c.v * 10}%` }} /></div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                <div className="flex items-center justify-between mt-2">
                                    <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-300 dark:text-stone-700">Détail des Verdicts ({ratings.length}/{members.length})</h4>
                                    {movie.added_by === currentUserId && (
                                        <button onClick={(e) => handleDeleteMovie(e, movie.id)} className="text-red-400 hover:text-red-600 transition-colors"><Trash2 size={16} /></button>
                                    )}
                                </div>

                                {ratings.length > 0 ? (
                                <div className="grid gap-3">
                                    {ratings.map((rating) => {
                                    const avg = ((rating.story + rating.visuals + rating.acting + rating.sound) / 4).toFixed(1);
                                    const isMe = rating.profile_id === currentUserId;
                                    return (
                                        <div key={rating.id} className={`bg-white dark:bg-[#252525] rounded-2xl p-4 border transition-all ${isMe ? 'border-forest/20 dark:border-forest/40 ring-2 ring-forest/5 shadow-sm' : 'border-stone-100 dark:border-white/5'}`}>
                                            <div className="flex items-center justify-between mb-3">
                                                <div className="flex items-center gap-2">
                                                    <div className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black ${isMe ? 'bg-forest text-white' : 'bg-stone-100 dark:bg-[#202020] dark:text-stone-400'}`}>{(rating.profile?.first_name || '?')[0].toUpperCase()}</div>
                                                    <span className="font-bold text-sm text-charcoal dark:text-white">{rating.profile?.first_name || 'Membre'}</span>
                                                </div>
                                                <div className="flex items-center gap-1.5 text-charcoal bg-bitter-lime px-3 py-1 rounded-lg shadow-sm">
                                                    <Star size={12} fill="currentColor" />
                                                    <span className="text-xs font-black">{avg}</span>
                                                </div>
                                            </div>
                                            {rating.review && <p className="text-xs font-medium text-stone-500 dark:text-stone-400 italic leading-relaxed pl-3 border-l-2 border-stone-200 dark:border-stone-800">"{rating.review}"</p>}
                                        </div>
                                    );
                                    })}
                                </div>
                                ) : <div className="text-center py-8 bg-white dark:bg-[#202020] rounded-2xl border border-dashed border-stone-200 dark:border-white/10"><p className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest">Soyez le premier à noter !</p></div>}

                                <button onClick={(e) => { e.stopPropagation(); haptics.medium(); if (myRating) { setRatingStory(myRating.story); setRatingVisuals(myRating.visuals); setRatingActing(myRating.acting); setRatingSound(myRating.sound); setRatingReview(myRating.review || ''); } setRatingMovie(movie); }} className={`w-full py-4 rounded-2xl font-black text-[10px] uppercase tracking-widest transition-all ${myRating ? 'bg-stone-100 dark:bg-[#252525] text-stone-500 dark:text-stone-400' : 'bg-charcoal dark:bg-forest text-white shadow-xl dark:shadow-none'}`}>
                                {myRating ? 'Éditer mon verdict' : 'Déposer mon verdict'}
                                </button>
                            </>
                            ) : (
                            <>
                                <div className="grid gap-4">
                                    <button 
                                        onClick={(e) => handleToggleVote(e, movie.id)}
                                        className={`w-full flex items-center justify-between p-5 rounded-2xl border-2 transition-all ${hasIVoted ? 'bg-forest border-forest text-white shadow-lg' : 'bg-white dark:bg-[#202020] border-stone-200 dark:border-white/10 text-stone-400 dark:text-stone-600'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`p-2 rounded-lg ${hasIVoted ? 'bg-white/20' : 'bg-stone-50 dark:bg-[#161616]'}`}>
                                                <UserCheck size={18} />
                                            </div>
                                            <span className="font-black text-xs uppercase tracking-widest">{hasIVoted ? 'JE VEUX LE VOIR' : 'JE SUIS CHAUD'}</span>
                                        </div>
                                        {hasIVoted && <CheckCircle2 size={20} strokeWidth={3} />}
                                    </button>

                                    <button 
                                        onClick={(e) => handleMarkAsWatched(e, movie.id)}
                                        className="w-full bg-bitter-lime text-charcoal py-5 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl"
                                    >
                                        <Ticket size={18} strokeWidth={2.5} />
                                        MARQUER COMME VU
                                    </button>
                                </div>
                            </>
                            )}
                        </div>
                        )}
                    </div>
                    );
                })}
                </div>
            )
          )}
      </div>

      {/* Modal Fiche Profil */}
      {selectedMember && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="relative bg-white dark:bg-[#1a1a1a] w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden border border-sand dark:border-white/10">
                <div className="p-8 border-b border-sand dark:border-white/10 bg-white dark:bg-[#1a1a1a] flex items-center justify-between">
                    <div>
                        <h3 className="text-xl font-black tracking-tight text-charcoal dark:text-white">Fiche Membre</h3>
                        <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest mt-1">PROFIL PUBLIC</p>
                    </div>
                    <button onClick={() => setSelectedMember(null)} className="p-3 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 hover:text-charcoal dark:hover:text-white transition-all"><X size={20} /></button>
                </div>
                
                <div className="p-8 overflow-y-auto no-scrollbar space-y-8">
                    <div className="flex flex-col items-center">
                        <div className="w-24 h-24 rounded-full bg-stone-100 dark:bg-[#252525] border-4 border-white dark:border-white/10 shadow-lg mb-4 flex items-center justify-center overflow-hidden relative">
                            {selectedMember.profile?.avatar_url ? (
                                <img src={selectedMember.profile.avatar_url} alt="" className="w-full h-full object-cover" />
                            ) : (
                                <span className="text-3xl font-black text-stone-300 dark:text-stone-700">{(selectedMember.profile?.first_name || '?')[0].toUpperCase()}</span>
                            )}
                        </div>
                        <h2 className="text-2xl font-black text-charcoal dark:text-white tracking-tight">{selectedMember.profile?.first_name}</h2>
                    </div>

                    <div className="space-y-6">
                        <div className="space-y-2">
                            <h4 className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest">Bio</h4>
                            <p className="text-sm font-medium text-charcoal dark:text-stone-300 leading-relaxed p-4 bg-stone-50 dark:bg-[#161616] rounded-2xl border border-stone-100 dark:border-white/5">
                                {selectedMember.profile?.bio || "Ce membre n'a pas encore rédigé sa biographie."}
                            </p>
                        </div>
                    </div>
                </div>
            </div>
        </div>
      )}

      {/* Modal Notation Shared */}
      {ratingMovie && (
        <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="relative bg-cream dark:bg-[#0c0c0c] w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden border border-sand dark:border-white/10">
                <div className="p-8 border-b border-sand dark:border-white/10 bg-white/50 dark:bg-[#1a1a1a]/50 backdrop-blur-xl flex items-center justify-between">
                    <div><h3 className="text-xl font-black tracking-tight text-charcoal dark:text-white truncate max-w-[200px]">{ratingMovie.title}</h3><p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest mt-1">Verdict Shared</p></div>
                    <button onClick={() => setRatingMovie(null)} className="p-3 bg-stone-100 dark:bg-[#202020] rounded-full text-stone-500"><X size={20} /></button>
                </div>
                <div className="flex-1 overflow-y-auto p-8 space-y-8 no-scrollbar">
                    {[{l:'ÉCRITURE',v:ratingStory,s:setRatingStory},{l:'ESTHÉTIQUE',v:ratingVisuals,s:setRatingVisuals},{l:'INTERPRÉTATION',v:ratingActing,s:setRatingActing},{l:'SON',v:ratingSound,s:setRatingSound}].map(x=>(
                        <div key={x.l} className="space-y-4">
                            <div className="flex justify-between items-end"><label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">{x.l}</label><span className="text-3xl font-black text-forest dark:text-lime-500 leading-none">{x.v}<span className="text-xs text-stone-200 dark:text-stone-800">/10</span></span></div>
                            <input type="range" min="0" max="10" step="0.5" value={x.v} onChange={(e) => { x.s(parseFloat(e.target.value)); haptics.soft(); }} className="w-full h-2 bg-stone-200 dark:bg-white/10 rounded-full appearance-none slider" />
                        </div>
                    ))}
                    <div className="space-y-3">
                        <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 ml-1">Notes de l'Analyste</label>
                        <textarea value={ratingReview} onChange={(e) => setRatingReview(e.target.value)} placeholder="Qu'est-ce qui a retenu votre attention ?" className="w-full p-6 bg-white dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-[2rem] text-sm font-medium dark:text-white outline-none focus:border-forest dark:focus:border-forest/50 transition-all min-h-[140px] resize-none placeholder:text-stone-300 dark:placeholder:text-stone-700" />
                    </div>
                </div>
                <div className="p-8 border-t border-sand dark:border-white/10 bg-white dark:bg-[#1a1a1a] shrink-0">
                    <button onClick={handleSubmitRating} disabled={savingRating} className="w-full bg-charcoal dark:bg-forest text-white py-6 rounded-[2rem] font-black text-xs uppercase tracking-[0.2em] shadow-xl flex items-center justify-center gap-3 disabled:opacity-50">
                        {savingRating ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={18} />}
                        {savingRating ? 'Synchronisation...' : 'Valider mon verdict'}
                    </button>
                </div>
            </div>
        </div>
      )}
    </div>
  );
};

export default SharedSpaceView;