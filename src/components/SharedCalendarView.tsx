import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, ArrowLeft, Loader2, Film, Star } from 'lucide-react';
import { SharedSpace, getSpaceMovies, SharedMovie } from '../services/supabase';
import { haptics } from '../utils/haptics';

interface SharedCalendarViewProps {
  space: SharedSpace;
  onBack: () => void;
}

const DAYS = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
const MONTHS = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];

const SharedCalendarView: React.FC<SharedCalendarViewProps> = ({ space, onBack }) => {
  const [movies, setMovies] = useState<SharedMovie[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedMonth, setSelectedMonth] = useState(new Date());

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const data = await getSpaceMovies(space.id);
        // On ne garde que les films vus qui ont une date (ou on utilise created_at par défaut si pas de date_watched spécifique, selon le modèle)
        // Pour shared_movies, on utilise added_at comme proxy si date_watched n'existe pas, 
        // ou on filtre ceux qui sont 'watched'.
        setMovies(data.filter(m => m.status === 'watched'));
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [space.id]);

  const year = selectedMonth.getFullYear();
  const month = selectedMonth.getMonth();

  // Group movies by date
  const moviesByDate = useMemo(() => {
    const map: Record<string, SharedMovie[]> = {};
    movies.forEach(m => {
        // Idéalement, il faudrait une colonne date_watched dans shared_movies.
        // Ici on utilise added_at comme fallback pour la démo.
        const dateStr = new Date(m.added_at).toISOString().split('T')[0];
        if (!map[dateStr]) map[dateStr] = [];
        map[dateStr].push(m);
    });
    return map;
  }, [movies]);

  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const firstDayOfMonth = new Date(year, month, 1).getDay();
  // Ajustement pour commencer par Lundi (0 = Dimanche dans JS Date)
  const startOffset = firstDayOfMonth === 0 ? 6 : firstDayOfMonth - 1;

  const handlePrevMonth = () => {
    haptics.soft();
    setSelectedMonth(new Date(year, month - 1, 1));
  };

  const handleNextMonth = () => {
    haptics.soft();
    setSelectedMonth(new Date(year, month + 1, 1));
  };

  if (loading) {
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
          onClick={() => { haptics.soft(); onBack(); }}
          className="flex items-center gap-2 mb-6 text-stone-500 hover:text-charcoal transition-colors"
        >
          <ArrowLeft size={16} strokeWidth={2.5} />
          <span className="text-[10px] font-black uppercase tracking-widest">Retour</span>
        </button>

        <div className="flex items-center gap-4 mb-6">
          <div className="w-14 h-14 bg-forest rounded-2xl flex items-center justify-center shadow-lg shadow-forest/20">
            <Calendar size={24} className="text-white" />
          </div>
          <div>
            <h1 className="text-2xl font-black tracking-tight text-charcoal">Calendrier</h1>
            <p className="text-xs font-medium text-stone-500">{space.name}</p>
          </div>
        </div>

        {/* Navigation Mois */}
        <div className="bg-white border border-sand rounded-2xl p-2 flex items-center justify-between shadow-sm">
          <button onClick={handlePrevMonth} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-stone-50 text-charcoal active:scale-90 transition-transform">
            ←
          </button>
          <span className="text-sm font-black uppercase tracking-widest text-charcoal">
            {MONTHS[month]} {year}
          </span>
          <button onClick={handleNextMonth} className="w-10 h-10 flex items-center justify-center rounded-xl hover:bg-stone-50 text-charcoal active:scale-90 transition-transform">
            →
          </button>
        </div>
      </div>

      {/* Grille Calendrier */}
      <div className="bg-white border border-sand rounded-[2rem] p-6 shadow-sm">
        {/* Jours Headers */}
        <div className="grid grid-cols-7 mb-4">
          {DAYS.map((day, i) => (
            <div key={i} className="text-center text-[10px] font-black text-stone-300">
              {day}
            </div>
          ))}
        </div>

        {/* Jours */}
        <div className="grid grid-cols-7 gap-2">
          {Array.from({ length: startOffset }).map((_, i) => (
            <div key={`empty-${i}`} className="aspect-square" />
          ))}

          {Array.from({ length: daysInMonth }).map((_, i) => {
            const day = i + 1;
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const dayMovies = moviesByDate[dateStr] || [];
            const hasMovies = dayMovies.length > 0;
            const isToday = new Date().toISOString().split('T')[0] === dateStr;

            return (
              <div
                key={day}
                onClick={() => {
                    if (hasMovies) {
                        haptics.soft();
                        alert(`Films vus le ${day} : \n${dayMovies.map(m => `- ${m.title}`).join('\n')}`);
                    }
                }}
                className={`
                    relative aspect-square rounded-xl flex flex-col items-center justify-center transition-all
                    ${hasMovies 
                        ? 'bg-forest text-white shadow-lg shadow-forest/20 cursor-pointer active:scale-90' 
                        : isToday 
                            ? 'bg-stone-100 text-forest border border-forest/30' 
                            : 'bg-white text-stone-400 hover:bg-stone-50'}
                `}
              >
                <span className={`text-xs font-bold ${hasMovies ? 'text-white' : ''}`}>{day}</span>
                {hasMovies && (
                    <div className="flex gap-0.5 mt-1">
                        {dayMovies.slice(0, 3).map((_, idx) => (
                            <div key={idx} className="w-1 h-1 rounded-full bg-bitter-lime" />
                        ))}
                    </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Liste Compacte du mois */}
      <div className="mt-8 space-y-4">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 ml-1">Dans ce mois</h3>
        {Object.entries(moviesByDate)
            .filter(([date]) => {
                const d = new Date(date);
                return d.getMonth() === month && d.getFullYear() === year;
            })
            .sort((a, b) => b[0].localeCompare(a[0]))
            .map(([date, dayMovies]) => (
                <div key={date} className="bg-white border border-sand rounded-2xl p-4 flex gap-4">
                    <div className="flex flex-col items-center justify-center px-2 border-r border-stone-100 pr-4">
                        <span className="text-xl font-black text-charcoal">{new Date(date).getDate()}</span>
                        <span className="text-[9px] font-bold text-stone-300 uppercase">{MONTHS[new Date(date).getMonth()].substring(0, 3)}</span>
                    </div>
                    <div className="flex-1 space-y-3">
                        {dayMovies.map(movie => (
                            <div key={movie.id} className="flex items-center gap-3">
                                <div className="w-8 h-10 bg-stone-200 rounded-md overflow-hidden shrink-0">
                                    {movie.poster_url ? <img src={movie.poster_url} className="w-full h-full object-cover" /> : <Film size={12} className="m-auto mt-3 text-stone-400" />}
                                </div>
                                <div>
                                    <p className="text-xs font-black text-charcoal line-clamp-1">{movie.title}</p>
                                    <p className="text-[9px] text-stone-400">{movie.director}</p>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ))
        }
        {Object.keys(moviesByDate).filter(([date]) => {
                const d = new Date(date);
                return d.getMonth() === month && d.getFullYear() === year;
        }).length === 0 && (
            <div className="text-center py-8 text-stone-400 text-xs font-medium">
                Aucun film visionné ce mois-ci.
            </div>
        )}
      </div>
    </div>
  );
};

export default SharedCalendarView;