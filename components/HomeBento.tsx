import React, { useMemo } from 'react';
import { Movie, UserProfile } from '../types';
import {
  Play,
  Plus,
  LayoutGrid,
  PieChart,
  Search,
  User,
  Clapperboard,
  Zap,
  Calendar,
  ArrowUpRight,
  Sparkles,
} from 'lucide-react';
import { haptics } from '../utils/haptics';
import { AIUnlockWidget } from './AIUnlockWidget';
import { useLanguage } from '../contexts/LanguageContext';

const MIN_MOVIES_FOR_AI = 10;

interface HomeBentoProps {
  movies: Movie[];
  userProfile: UserProfile | null;
  userName: string;
  onNavigate: (page: string) => void;
  onOpenRecommendations?: () => void;
}

const HomeBento: React.FC<HomeBentoProps> = ({ movies, userProfile, userName, onNavigate, onOpenRecommendations }) => {
  const { t } = useLanguage();
  const watchedCount = movies.filter((m) => m.status === 'watched').length;
  const isAIUnlocked = watchedCount >= MIN_MOVIES_FOR_AI;

  const sortedMovies = useMemo(() => {
    return [...movies].sort((a, b) => {
      const dateA = a.dateWatched || a.dateAdded;
      const dateB = b.dateWatched || b.dateAdded;
      return dateB - dateA;
    });
  }, [movies]);

  const lastMovie = sortedMovies[0];
  const recentHistory = sortedMovies.slice(1, 4);
  const totalMinutes = movies.reduce((acc, m) => acc + (m.runtime || 0), 0);
  const hours = Math.floor(totalMinutes / 60);

  // --- EMPTY STATE ---
  if (movies.length === 0) {
    return (
      <div className="min-h-screen bg-[#0c0c0c] text-white p-6 pb-32 flex flex-col font-sans selection:bg-lime-400 selection:text-black">
        <header className="flex justify-between items-center py-6">
          <div className="flex flex-col">
            <span className="text-stone-500 dark:text-stone-400 text-xs font-bold uppercase tracking-[0.2em]">
              {t('bento.welcome')}
            </span>
            <span className="text-2xl font-black tracking-tight">{userName}</span>
          </div>
          <div className="w-12 h-12 rounded-full bg-[#141414] border border-white/5 flex items-center justify-center">
            <User size={20} className="text-stone-400" />
          </div>
        </header>

        <div className="grid grid-cols-2 gap-4 flex-1 content-start">
          <div className="col-span-2 h-[40vh] bg-[#141414] rounded-[2.5rem] relative overflow-hidden p-8 flex flex-col justify-end border border-white/5">
            <div className="absolute top-0 right-0 w-64 h-64 bg-lime-400/20 blur-[100px] rounded-full -translate-y-1/2 translate-x-1/2" />
            <h1 className="text-6xl font-black tracking-tighter leading-[0.9] mb-4">
              Start
              <br />
              <span className="text-lime-400">Tracking.</span>
            </h1>
            <p className="text-stone-400 dark:text-stone-500 font-medium max-w-xs leading-relaxed">
              {t('bento.emptyDesc')}
            </p>
          </div>

          <div className="aspect-square bg-[#141414] rounded-[2.5rem] flex flex-col items-center justify-center border border-white/5 relative overflow-hidden">
            <span className="text-[8rem] font-black text-white/5 leading-none absolute scale-150 select-none">
              0
            </span>
            <span className="text-6xl font-black text-lime-400 relative z-10">0</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 mt-2 relative z-10">
              {t('feed.filmsLabel')}
            </span>
          </div>

          <button
            onClick={() => onNavigate('Discover')}
            className="aspect-square bg-lime-400 rounded-[2.5rem] flex flex-col items-center justify-center gap-4 shadow-lg shadow-lime-400/20 active:scale-95 transition-transform"
          >
            <Plus size={40} className="text-black" strokeWidth={3} />
            <span className="text-xs font-black uppercase tracking-widest text-black">{t('bento.add')}</span>
          </button>
        </div>

        <DockNavigation onNavigate={onNavigate} />
      </div>
    );
  }

  // --- MAIN RENDER ---
  return (
    <div className="min-h-screen bg-[#0c0c0c] text-white p-4 sm:p-6 pb-32 flex flex-col font-sans selection:bg-lime-400 selection:text-black overflow-x-hidden">
      <header className="flex justify-between items-end py-6 px-2 animate-[fadeIn_0.5s_ease-out]">
        <div>
          <h1 className="text-[10px] font-black text-lime-400 uppercase tracking-[0.3em] mb-1">
            The Bitter
          </h1>
          <div className="text-3xl font-black tracking-tighter leading-none">
            {t('bento.hello', { name: userName })}
          </div>
        </div>
      </header>

      <div className="grid grid-cols-2 gap-4 animate-[slideUp_0.5s_cubic-bezier(0.16,1,0.3,1)]">
        {/* BLOCK A: HERO (Last Movie) */}
        <div
          onClick={() => onNavigate('Feed')}
          className="col-span-2 h-[45vh] bg-[#141414] rounded-[2.5rem] relative overflow-hidden group cursor-pointer border border-white/5"
        >
          {lastMovie.posterUrl ? (
            <>
              <img
                src={lastMovie.posterUrl.replace('w780', 'original')}
                alt={lastMovie.title}
                className="absolute inset-0 w-full h-full object-cover opacity-60 group-hover:opacity-40 group-hover:scale-105 transition-all duration-700 ease-out"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0c0c0c] via-[#0c0c0c]/40 to-transparent" />
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center bg-[#141414]">
              <Clapperboard size={64} className="text-white/10" />
            </div>
          )}

          <div className="absolute bottom-0 left-0 p-8 w-full z-10">
            <div className="flex items-center gap-3 mb-4">
              <div className="bg-lime-400 text-black px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 shadow-lg shadow-lime-400/20">
                <Play size={10} fill="currentColor" /> {t('bento.lastWatched')}
              </div>
              {(lastMovie.tmdbRating || 0) > 0 && (
                <div className="bg-white/10 backdrop-blur-md text-white px-3 py-1 rounded-full text-[10px] font-black uppercase border border-white/10">
                  {(lastMovie.tmdbRating || 0).toFixed(1)} / 10
                </div>
              )}
            </div>
            <h2 className="text-5xl sm:text-6xl font-black tracking-tighter leading-[0.9] text-white break-words line-clamp-3 mb-2">
              {lastMovie.title}
            </h2>
            <p className="text-stone-400 dark:text-stone-400 font-bold text-xs uppercase tracking-wider line-clamp-1">
              {lastMovie.director} • {lastMovie.year}
            </p>
          </div>
        </div>

        {/* BLOCK B: KPI */}
        <div className="aspect-square bg-[#141414] rounded-[2.5rem] flex flex-col justify-between p-6 border border-white/5 relative overflow-hidden group">
          <div className="absolute top-0 right-0 p-6 opacity-0 group-hover:opacity-100 transition-opacity">
            <ArrowUpRight className="text-lime-400" />
          </div>
          <div className="mt-auto">
            <span className="block text-7xl sm:text-8xl font-black text-lime-400 tracking-tighter leading-none -ml-1">
              {movies.length}
            </span>
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
              {t('bento.filmsWatched')}
            </span>
          </div>
        </div>

        {/* BLOCK C: IDENTITY */}
        <div
          onClick={() => onNavigate('Analytics')}
          className="aspect-square bg-[#141414] rounded-[2.5rem] p-6 border border-white/5 relative overflow-hidden flex flex-col justify-between cursor-pointer group hover:bg-[#1a1a1a] transition-colors"
        >
          <div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
            {userProfile?.role ? (
              <Zap size={20} className="text-white" />
            ) : (
              <PieChart size={20} className="text-white" />
            )}
          </div>
          <div>
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
              {userProfile?.role ? t('bento.archetype') : t('bento.totalTime')}
            </p>
            <p className="text-xl sm:text-2xl font-black leading-tight text-white">
              {userProfile?.role || `${hours} ${t('bento.hours')}`}
            </p>
          </div>
        </div>

        {/* BLOCK AI UNLOCK */}
        <div className="col-span-2">
          <AIUnlockWidget watchedCount={watchedCount} onAddMovie={() => onNavigate('Add')} />
        </div>

        {/* BLOCK D: COMPACT FEED */}
        <div className="col-span-2 bg-[#141414] rounded-[2.5rem] p-8 border border-white/5">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-black tracking-tight">{t('bento.recently')}</h3>
            <button
              onClick={() => onNavigate('Feed')}
              className="text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 hover:text-white transition-colors"
            >
              {t('bento.seeAll')}
            </button>
          </div>

          <div className="space-y-4">
            {recentHistory.map((movie) => (
              <div
                key={movie.id}
                className="flex items-center gap-4 group cursor-pointer"
                onClick={() => onNavigate('Feed')}
              >
                <div className="w-12 h-16 bg-stone-800 rounded-xl overflow-hidden shrink-0 relative">
                  {movie.posterUrl && (
                    <img
                      src={movie.posterUrl}
                      className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                      alt=""
                    />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <h4 className="font-bold text-white leading-tight truncate">{movie.title}</h4>
                  <p className="text-[10px] font-bold text-stone-500 dark:text-stone-400 uppercase tracking-wide mt-0.5">
                    {movie.director}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-sm font-black text-lime-400">
                    {(
                      (movie.ratings.story +
                        movie.ratings.visuals +
                        movie.ratings.acting +
                        movie.ratings.sound) /
                      4
                    ).toFixed(1)}
                  </span>
                </div>
              </div>
            ))}
            {recentHistory.length === 0 && (
              <div className="text-center py-4 text-stone-600 text-xs font-bold uppercase tracking-widest">
                {t('bento.nothingElse')}
              </div>
            )}
          </div>
        </div>

        {/* BLOCK RECOMMENDATIONS */}
        <button
          onClick={() => {
            haptics.medium();
            onOpenRecommendations ? onOpenRecommendations() : onNavigate('Recommendations');
          }}
          className={`col-span-2 bg-[#141414] rounded-[2.5rem] p-8 border flex items-center gap-5 text-left transition-all active:scale-[0.98] ${
            isAIUnlocked
              ? 'border-lime-400/30 shadow-[0_0_20px_rgba(217,255,0,0.25)] animate-pulse-glow'
              : 'border-white/5'
          }`}
        >
          <div
            className={`w-14 h-14 shrink-0 rounded-3xl flex items-center justify-center ${isAIUnlocked ? 'bg-lime-400/10 text-lime-400' : 'bg-white/5 text-stone-500'}`}
          >
            <Sparkles size={24} strokeWidth={2} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-black uppercase tracking-widest text-stone-500 mb-1">
              {isAIUnlocked ? t('bento.unlocked') : t('bento.lockedProgress', { count: String(watchedCount), max: String(MIN_MOVIES_FOR_AI) })}
            </p>
            <p className="text-lg font-black text-white leading-tight">{t('bento.personalRecos')}</p>
            <p className="text-xs text-stone-500 mt-0.5 truncate">
              {isAIUnlocked ? t('bento.recosUnlocked') : t('bento.recosLocked')}
            </p>
          </div>
          {isAIUnlocked && (
            <ArrowUpRight size={20} className="shrink-0 text-lime-400" />
          )}
        </button>
      </div>

      <DockNavigation onNavigate={onNavigate} />
    </div>
  );
};

// --- DOCK NAVIGATION COMPONENT ---

const DockNavigation: React.FC<{ onNavigate: (page: string) => void }> = ({ onNavigate }) => {
  return (
    <div className="fixed bottom-8 left-0 right-0 flex justify-center items-center z-50 pointer-events-none">
      <div className="flex items-center gap-4 pointer-events-auto">
        <div className="bg-black/60 backdrop-blur-xl border border-white/10 p-2 rounded-[2rem] flex items-center shadow-2xl">
          <NavButton
            icon={<LayoutGrid size={20} />}
            onClick={() => {
              haptics.soft();
              onNavigate('Feed');
            }}
          />
          <NavButton
            icon={<Search size={20} />}
            onClick={() => {
              haptics.soft();
              onNavigate('Discover');
            }}
          />
          <NavButton
            icon={<PieChart size={20} />}
            onClick={() => {
              haptics.soft();
              onNavigate('Analytics');
            }}
          />
          <NavButton
            icon={<Calendar size={20} />}
            onClick={() => {
              haptics.soft();
              onNavigate('Calendar');
            }}
          />
        </div>

        <button
          onClick={() => {
            haptics.medium();
            onNavigate('Add');
          }}
          className="w-14 h-14 bg-lime-400 rounded-full flex items-center justify-center text-black shadow-lg shadow-lime-400/20 active:scale-90 transition-transform hover:brightness-110"
        >
          <Plus size={24} strokeWidth={3} />
        </button>
      </div>
    </div>
  );
};

const NavButton: React.FC<{ icon: React.ReactNode; onClick: () => void }> = ({ icon, onClick }) => (
  <button
    onClick={onClick}
    className="w-12 h-12 rounded-full flex items-center justify-center text-stone-400 hover:text-white hover:bg-white/10 transition-all active:scale-90"
  >
    {icon}
  </button>
);

export default HomeBento;
