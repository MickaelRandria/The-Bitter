import React, { useState, useMemo } from 'react';
import { Movie } from '../types';
import { ChevronLeft, ChevronRight, Film, Star, X, Ticket, Calendar } from 'lucide-react';

interface CalendarViewProps {
  movies: Movie[];
}

interface CalendarItem {
    movie: Movie;
    type: 'watched' | 'release';
}

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

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
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const monthData = useMemo(() => {
    const daysMap: Record<number, CalendarItem[]> = {};
    let watchedCount = 0;
    movies.filter(m => m.status === 'watched').forEach(m => {
        if (m.dateWatched) {
             const d = new Date(m.dateWatched);
             if (d.getMonth() === month && d.getFullYear() === year) {
                 const day = d.getDate();
                 if (!daysMap[day]) daysMap[day] = [];
                 daysMap[day].push({ movie: m, type: 'watched' });
                 watchedCount++;
             }
        }
    });
    return { daysMap, watchedCount };
  }, [movies, month, year]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startOffset = (new Date(year, month, 1).getDay() + 6) % 7;

  return (
    <div className="animate-[fadeIn_0.4s_ease-out] bg-transparent -mx-6 -mt-4">
       <div className="px-6 py-6">
          <div className="bg-white dark:bg-[#1a1a1a] rounded-full shadow-sm dark:shadow-black/20 border border-stone-100 dark:border-white/10 py-3 px-6 flex items-center justify-between mx-auto max-w-sm transition-all">
              <button onClick={() => setCurrentDate(new Date(year, month - 1, 1))} className="p-2 hover:bg-stone-50 dark:hover:bg-[#202020] rounded-full transition-colors text-charcoal dark:text-white active:scale-90"><ChevronLeft size={20} strokeWidth={2.5} /></button>
              <div className="text-center">
                  <h2 className="text-sm font-black text-charcoal dark:text-white tracking-widest uppercase leading-none">{MONTHS[month]} {year}</h2>
                  <div className="text-[9px] font-bold text-stone-300 dark:text-stone-500 mt-1 uppercase tracking-widest">{monthData.watchedCount} Séances</div>
              </div>
              <button onClick={() => setCurrentDate(new Date(year, month + 1, 1))} className="p-2 hover:bg-stone-50 dark:hover:bg-[#202020] rounded-full transition-colors text-charcoal dark:text-white active:scale-90"><ChevronRight size={20} strokeWidth={2.5} /></button>
          </div>
       </div>

       <div className="px-4">
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
       {selectedDay && <DayDetailModal day={selectedDay.day} monthName={MONTHS[month]} items={selectedDay.items} onClose={() => setSelectedDay(null)} />}
    </div>
  );
};

export default CalendarView;