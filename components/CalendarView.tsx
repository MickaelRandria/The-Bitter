import React, { useState, useMemo } from 'react';
import { Movie } from '../types';
import { ChevronLeft, ChevronRight, Film, Star, X, LayoutGrid, CalendarDays, Flame } from 'lucide-react';

interface CalendarViewProps {
  movies: Movie[];
}

interface CalendarItem {
    movie: Movie;
    type: 'watched' | 'release';
}

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTHS_SHORT = ['Jan', 'Fév', 'Mar', 'Avr', 'Mai', 'Jun', 'Jul', 'Aoû', 'Sep', 'Oct', 'Nov', 'Déc'];

const DayDetailModal: React.FC<{ day: number, monthName: string, items: CalendarItem[], onClose: () => void }> = ({ day, monthName, items, onClose }) => {
    return (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4 transition-colors">
             <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm" onClick={onClose} />
             <div className="bg-white dark:bg-[#1a1a1a] w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl shadow-2xl dark:shadow-black/60 relative z-10 max-h-[80vh] flex flex-col animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] border border-sand dark:border-white/10 transition-all">
                 <div className="flex justify-between items-center p-6 border-b border-sand dark:border-white/10 transition-colors">
                     <div>
                         <h3 className="text-3xl font-black text-charcoal dark:text-white tracking-tight leading-none">{day} {monthName}</h3>
                         <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest mt-1">{items.length} films</p>
                     </div>
                     <button onClick={onClose} className="p-2.5 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 hover:bg-stone-200 transition-all active:scale-90"><X size={20} strokeWidth={2.5} /></button>
                 </div>

                 <div className="p-6 overflow-y-auto space-y-4 no-scrollbar">
                     {items.map((item, idx) => (
                         <div key={idx} className="flex gap-4 p-3 rounded-2xl bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 items-start transition-colors">
                             <div className="w-16 h-24 rounded-xl overflow-hidden shadow-sm shrink-0 bg-stone-200 dark:bg-[#252525] border dark:border-white/5 transition-colors">
                                 {item.movie.posterUrl ? <img src={item.movie.posterUrl} className="w-full h-full object-cover" alt="" /> : <div className="w-full h-full flex items-center justify-center"><Film size={20} className="text-stone-300 dark:text-stone-700" /></div>}
                             </div>
                             <div className="flex-1 min-w-0 py-1">
                                 <h4 className="font-black text-sm text-charcoal dark:text-white leading-tight mb-1">{item.movie.title}</h4>
                                 <p className="text-[10px] font-bold text-stone-400 dark:text-stone-400 mb-2 truncate">{item.movie.director}</p>
                                 <div className="flex items-center gap-2">
                                     <div className="bg-charcoal dark:bg-forest text-white px-2 py-1 rounded-lg flex items-center gap-1">
                                         <Star size={10} fill="currentColor" className="text-tz-yellow" />
                                         <span className="text-[10px] font-bold">{((item.movie.ratings.story + item.movie.ratings.visuals + item.movie.ratings.acting + item.movie.ratings.sound) / 4).toFixed(1)}</span>
                                     </div>
                                 </div>
                             </div>
                         </div>
                     ))}
                 </div>
             </div>
        </div>
    );
};

const CalendarView: React.FC<CalendarViewProps> = ({ movies }) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDay, setSelectedDay] = useState<{ day: number; items: CalendarItem[] } | null>(null);
  const [viewMode, setViewMode] = useState<'month' | 'heatmap'>('month');
  const [selectedGenre, setSelectedGenre] = useState<string | null>(null);

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  // --- Streak calculation (weekly: at least 1 movie per week) ---
  const streakData = useMemo(() => {
    // Get Monday of a given date (week start)
    const getWeekStart = (d: Date): number => {
      const copy = new Date(d);
      const day = copy.getDay(); // 0=Sun
      const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
      copy.setHours(0, 0, 0, 0);
      copy.setDate(copy.getDate() + diff);
      return copy.getTime();
    };

    const watchedMovies = movies.filter(m => m.status === 'watched' && m.dateWatched);
    const weekSet = new Set(watchedMovies.map(m => getWeekStart(new Date(m.dateWatched!))));

    const today = new Date();
    const thisWeek = getWeekStart(today);
    const lastWeek = thisWeek - 7 * 24 * 60 * 60 * 1000;

    // Current streak: count consecutive weeks backward from this or last week
    let currentStreak = 0;
    const startWeek = weekSet.has(thisWeek) ? thisWeek : weekSet.has(lastWeek) ? lastWeek : null;
    if (startWeek !== null) {
      let cursor = startWeek;
      while (weekSet.has(cursor)) {
        currentStreak++;
        cursor -= 7 * 24 * 60 * 60 * 1000;
      }
    }

    // Best streak: sort all unique week starts and find longest consecutive run
    const sortedWeeks = (Array.from(weekSet) as number[]).sort((a, b) => a - b);
    let bestStreak = 0;
    let runStreak = sortedWeeks.length > 0 ? 1 : 0;
    for (let i = 1; i < sortedWeeks.length; i++) {
      const diff = (sortedWeeks[i] - sortedWeeks[i - 1]) / (1000 * 60 * 60 * 24 * 7);
      if (diff === 1) {
        runStreak++;
      } else {
        bestStreak = Math.max(bestStreak, runStreak);
        runStreak = 1;
      }
    }
    bestStreak = Math.max(bestStreak, runStreak);

    return { currentStreak, bestStreak };
  }, [movies]);

  // --- Year heatmap data ---
  const yearData = useMemo(() => {
    const counts: number[] = Array(12).fill(0);
    movies.filter(m => m.status === 'watched' && m.dateWatched).forEach(m => {
      const d = new Date(m.dateWatched!);
      if (d.getFullYear() === year) {
        counts[d.getMonth()]++;
      }
    });
    return counts;
  }, [movies, year]);

  // --- Monthly data with optional genre filter ---
  const monthData = useMemo(() => {
    const daysMap: Record<number, CalendarItem[]> = {};
    let watchedCount = 0;
    const genresInMonth = new Set<string>();

    movies.filter(m => m.status === 'watched').forEach(m => {
        if (m.dateWatched) {
             const d = new Date(m.dateWatched);
             if (d.getMonth() === month && d.getFullYear() === year) {
                 if (m.genre) genresInMonth.add(m.genre);
                 if (selectedGenre && m.genre !== selectedGenre) return;
                 const day = d.getDate();
                 if (!daysMap[day]) daysMap[day] = [];
                 daysMap[day].push({ movie: m, type: 'watched' });
                 watchedCount++;
             }
        }
    });
    return { daysMap, watchedCount, genres: Array.from(genresInMonth).sort() };
  }, [movies, month, year, selectedGenre]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;

  const heatmapColor = (count: number) => {
    if (count === 0) return 'bg-stone-100 dark:bg-stone-800 text-stone-400 dark:text-stone-600';
    if (count <= 2) return 'bg-lime-100 dark:bg-lime-950 text-lime-600 dark:text-lime-400';
    if (count <= 4) return 'bg-lime-300 dark:bg-lime-800 text-lime-800 dark:text-lime-200';
    return 'bg-forest dark:bg-bitter-lime text-white dark:text-charcoal';
  };

  const navigateToMonth = (m: number) => {
    setCurrentDate(new Date(year, m, 1));
    setViewMode('month');
  };

  return (
    <div className="animate-[fadeIn_0.4s_ease-out] bg-transparent -mx-6 -mt-4">

      {/* Streak widget */}
      {streakData.bestStreak > 0 && (
        <div className="px-6 pt-5 pb-1 flex justify-center">
          <div className="flex items-center gap-3 bg-white dark:bg-[#1a1a1a] border border-stone-100 dark:border-white/10 rounded-full px-4 py-2 shadow-sm">
            <Flame size={14} className={streakData.currentStreak > 0 ? 'text-orange-400' : 'text-stone-300 dark:text-stone-600'} />
            <span className="text-[11px] font-black text-charcoal dark:text-white">
              {streakData.currentStreak > 0 ? `${streakData.currentStreak} sem` : '0 sem'}
            </span>
            <span className="text-stone-200 dark:text-stone-700">·</span>
            <span className="text-[10px] font-bold text-stone-400 dark:text-stone-500">Record {streakData.bestStreak} sem</span>
          </div>
        </div>
      )}

      {/* Month nav + heatmap toggle */}
      <div className="px-6 py-4">
        <div className="bg-white dark:bg-[#1a1a1a] rounded-full shadow-sm dark:shadow-black/20 border border-stone-100 dark:border-white/10 py-3 px-4 flex items-center justify-between mx-auto max-w-sm transition-all">
          {viewMode === 'month' ? (
            <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-stone-50 dark:hover:bg-[#202020] rounded-full transition-colors text-charcoal dark:text-white active:scale-90"><ChevronLeft size={20} strokeWidth={2.5} /></button>
          ) : (
            <button onClick={() => setCurrentDate(new Date(year - 1, month, 1))} className="p-2 hover:bg-stone-50 dark:hover:bg-[#202020] rounded-full transition-colors text-charcoal dark:text-white active:scale-90"><ChevronLeft size={20} strokeWidth={2.5} /></button>
          )}
          <div className="text-center flex-1">
            {viewMode === 'month' ? (
              <>
                <h2 className="text-sm font-black text-charcoal dark:text-white tracking-widest uppercase leading-none">{MONTHS[month]} {year}</h2>
                <div className="text-[9px] font-bold text-stone-300 dark:text-stone-500 mt-1 uppercase tracking-widest">{monthData.watchedCount} Séances</div>
              </>
            ) : (
              <>
                <h2 className="text-sm font-black text-charcoal dark:text-white tracking-widest uppercase leading-none">{year}</h2>
                <div className="text-[9px] font-bold text-stone-300 dark:text-stone-500 mt-1 uppercase tracking-widest">{yearData.reduce((a, b) => a + b, 0)} Séances</div>
              </>
            )}
          </div>
          {viewMode === 'month' ? (
            <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-stone-50 dark:hover:bg-[#202020] rounded-full transition-colors text-charcoal dark:text-white active:scale-90"><ChevronRight size={20} strokeWidth={2.5} /></button>
          ) : (
            <button onClick={() => setCurrentDate(new Date(year + 1, month, 1))} className="p-2 hover:bg-stone-50 dark:hover:bg-[#202020] rounded-full transition-colors text-charcoal dark:text-white active:scale-90"><ChevronRight size={20} strokeWidth={2.5} /></button>
          )}
        </div>
        {/* Toggle button */}
        <div className="flex justify-center mt-2">
          <button
            onClick={() => setViewMode(v => v === 'month' ? 'heatmap' : 'month')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${viewMode === 'heatmap' ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal' : 'bg-stone-100 dark:bg-[#252525] text-stone-400 dark:text-stone-500'}`}
          >
            {viewMode === 'heatmap' ? <CalendarDays size={10} /> : <LayoutGrid size={10} />}
            {viewMode === 'heatmap' ? 'Vue mois' : 'Vue année'}
          </button>
        </div>
      </div>

      {viewMode === 'heatmap' ? (
        /* Annual heatmap: 4×3 grid */
        <div className="px-6 pb-6">
          <div className="grid grid-cols-4 gap-3">
            {MONTHS_SHORT.map((label, i) => {
              const count = yearData[i];
              const isCurrentMonth = i === new Date().getMonth() && year === new Date().getFullYear();
              return (
                <button
                  key={i}
                  onClick={() => navigateToMonth(i)}
                  className={`rounded-2xl p-3 flex flex-col items-center gap-1 transition-all active:scale-95 ${heatmapColor(count)} ${isCurrentMonth ? 'ring-2 ring-forest dark:ring-bitter-lime ring-offset-1 dark:ring-offset-[#161616]' : ''}`}
                >
                  <span className="text-[10px] font-black uppercase tracking-wider opacity-70">{label}</span>
                  <span className="text-lg font-black leading-none">{count}</span>
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* Monthly grid */
        <div className="px-4">
          {/* Genre filter chips */}
          {monthData.genres.length > 0 && (
            <div className="mb-4 flex gap-2 overflow-x-auto no-scrollbar pb-1">
              <button
                onClick={() => setSelectedGenre(null)}
                className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${selectedGenre === null ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal' : 'bg-stone-100 dark:bg-[#252525] text-stone-400 dark:text-stone-500'}`}
              >
                Tous
              </button>
              {monthData.genres.map(genre => (
                <button
                  key={genre}
                  onClick={() => setSelectedGenre(g => g === genre ? null : genre)}
                  className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wider transition-all ${selectedGenre === genre ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal' : 'bg-stone-100 dark:bg-[#252525] text-stone-400 dark:text-stone-500'}`}
                >
                  {genre}
                </button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-7 mb-4">
            {DAYS.map(day => <div key={day} className="text-center text-[10px] font-black text-stone-300 dark:text-stone-600 opacity-50 dark:opacity-100">{day}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: startOffset }).map((_, i) => <div key={`empty-${i}`} className="aspect-square" />)}
            {Array.from({ length: daysInMonth }).map((_, i) => {
                const day = i + 1;
                const items = monthData.daysMap[day] || [];
                const hasItems = items.length > 0;
                const isToday = new Date().getDate() === day && new Date().getMonth() === month && new Date().getFullYear() === year;
                return (
                    <button key={day} onClick={() => hasItems && setSelectedDay({ day, items })} disabled={!hasItems} className={`relative aspect-square flex flex-col items-center justify-center transition-all rounded-xl ${hasItems ? 'active:scale-95' : ''}`}>
                       {hasItems ? (
                           <div className="w-full h-full p-0.5 relative">
                               {items.length > 1 && <div className="absolute inset-0 bg-white dark:bg-[#1a1a1a] rounded-xl border border-stone-200 dark:border-white/5 shadow-sm dark:shadow-black/20 translate-x-[2px] translate-y-[2px] -z-10" />}
                               {items[0].movie.posterUrl ? <img src={items[0].movie.posterUrl} className="w-full h-full object-cover rounded-xl shadow-md transition-shadow" alt="" /> : <div className="w-full h-full flex items-center justify-center bg-charcoal dark:bg-forest text-white rounded-xl shadow-md transition-colors"><Film size={16} className="opacity-20" /></div>}
                               {items.length > 1 && <div className="absolute top-1 right-1 bg-charcoal dark:bg-forest text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full z-20 shadow-sm border border-white/20 dark:border-white/5">+{items.length - 1}</div>}
                           </div>
                       ) : <span className={`text-sm font-semibold transition-colors ${isToday ? 'text-forest dark:text-lime-500 bg-forest/10 dark:bg-lime-500/10 w-8 h-8 flex items-center justify-center rounded-full' : 'text-stone-300 dark:text-stone-600'}`}>{day}</span>}
                    </button>
                );
            })}
          </div>
        </div>
      )}

      {selectedDay && <DayDetailModal day={selectedDay.day} monthName={MONTHS[month]} items={selectedDay.items} onClose={() => setSelectedDay(null)} />}
    </div>
  );
};

export default CalendarView;
