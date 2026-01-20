import React, { useMemo } from 'react';
import { Movie } from '../types';
import { CreditCard, Calendar, Users, Activity, TrendingUp, Sparkles, User, Tag, PiggyBank } from 'lucide-react';

interface AnalyticsViewProps {
  movies: Movie[];
}

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ movies }) => {
  const SUBSCRIPTION_COST = 11.00;
  const TICKET_PRICE = 8.00;

  const stats = useMemo(() => {
    const totalWatched = movies.length;
    
    const ratingSums = movies.reduce((acc, m) => ({
        story: acc.story + m.ratings.story,
        visuals: acc.visuals + m.ratings.visuals,
        acting: acc.acting + m.ratings.acting,
        sound: acc.sound + m.ratings.sound,
    }), { story: 0, visuals: 0, acting: 0, sound: 0 });

    const ratingAvg = {
        story: totalWatched ? (ratingSums.story / totalWatched).toFixed(1) : "0",
        visuals: totalWatched ? (ratingSums.visuals / totalWatched).toFixed(1) : "0",
        acting: totalWatched ? (ratingSums.acting / totalWatched).toFixed(1) : "0",
        sound: totalWatched ? (ratingSums.sound / totalWatched).toFixed(1) : "0",
    };

    // Savings Logic
    const now = new Date();
    const currentMonthMovies = movies.filter(m => {
        const d = new Date(m.dateAdded);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthlyCount = currentMonthMovies.length;
    
    // Calculation: (Movies * 8€) - 11€ Subscription
    const rawSavings = (monthlyCount * TICKET_PRICE) - SUBSCRIPTION_COST;
    const monthlySavings = rawSavings > 0 ? `+${rawSavings.toFixed(2)}` : rawSavings.toFixed(2);
    const isProfitable = rawSavings > 0;

    const days = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const dayCounts = new Array(7).fill(0);
    movies.forEach(m => {
        const day = new Date(m.dateAdded).getDay();
        dayCounts[day]++;
    });
    const maxDayCount = Math.max(...dayCounts, 1);

    const actorCounts: Record<string, { count: number, totalRating: number }> = {};
    movies.forEach(m => {
        if (!m.actors) return;
        const list = m.actors.split(',').map(s => s.trim());
        const avgRating = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
        
        list.forEach(actor => {
            if (!actor) return;
            if (!actorCounts[actor]) {
                actorCounts[actor] = { count: 0, totalRating: 0 };
            }
            actorCounts[actor].count++;
            actorCounts[actor].totalRating += avgRating;
        });
    });

    const sortedActors = Object.entries(actorCounts)
        .map(([name, data]) => ({
            name,
            count: data.count,
            avg: (data.totalRating / data.count).toFixed(1)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 3);

    const genreCounts: Record<string, number> = {};
    movies.forEach(m => {
        genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1;
    });
    const sortedGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => ({ name, count, percent: Math.round((count / totalWatched) * 100) }));

    return {
        totalWatched,
        ratingAvg,
        monthlyCount,
        monthlySavings,
        isProfitable,
        dayCounts,
        days,
        maxDayCount,
        sortedActors,
        sortedGenres
    };
  }, [movies]);

  if (movies.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center bg-white rounded-[2.5rem] border border-stone-100 shadow-sm mt-4">
              <div className="bg-sand p-4 rounded-full mb-4 animate-bounce">
                <Sparkles size={32} className="text-stone-400" />
              </div>
              <h3 className="text-xl font-extrabold text-charcoal mb-2">Pas encore de données</h3>
              <p className="text-stone-400 font-medium">Ajoutez des films pour générer votre profil.</p>
          </div>
      );
  }

  return (
    <div className="space-y-6 pb-24 animate-[fadeIn_0.4s_ease-out]">
      
      {/* --- Title Section --- */}
      <div className="mt-2 mb-4">
         <h2 className="text-3xl font-black text-charcoal tracking-tight">Analyses</h2>
         <p className="text-sm font-bold text-stone-400 uppercase tracking-wider">Vos données décodées</p>
      </div>

      {/* --- Top Row: UGC Card & Mini Stats --- */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          
          {/* UGC Membership Card (Savings Focus) */}
          <div className="bg-forest text-white p-7 rounded-[2rem] shadow-xl shadow-forest/20 relative overflow-hidden flex flex-col justify-between min-h-[200px] group transition-transform hover:scale-[1.01]">
              <div className="relative z-10 flex justify-between items-start">
                  <div className="flex items-center gap-2 bg-white/10 backdrop-blur-md px-3 py-1 rounded-full">
                      <CreditCard size={14} className="text-white/80" />
                      <span className="text-[10px] font-bold uppercase tracking-widest text-white/90">Abo Ciné</span>
                  </div>
                  {stats.isProfitable ? (
                      <PiggyBank size={24} className="text-white/20" />
                  ) : (
                      <CreditCard size={24} className="text-white/20" />
                  )}
              </div>
              
              <div className="relative z-10 mt-4">
                  <div className="flex items-baseline gap-1">
                    <span className="text-6xl font-black tracking-tighter">{stats.monthlySavings}</span>
                    <span className="text-lg font-bold text-white/60">€</span>
                  </div>
                  <div className="flex flex-col mt-2">
                      <p className="text-xs font-bold uppercase tracking-wider text-white/50 mb-1">
                          Économies du mois
                      </p>
                      <p className="text-sm font-medium text-white/80">
                          {stats.monthlyCount} films vus vs 11€ abo.
                          <br/>
                          <span className="opacity-60 text-xs">(Calculé sur 8€/place)</span>
                      </p>
                  </div>
              </div>

              {/* Decorative Card Texture */}
              <div className="absolute inset-0 opacity-10" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, white 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
              <div className={`absolute -bottom-10 -right-10 w-48 h-48 rounded-full blur-3xl transition-colors ${stats.isProfitable ? 'bg-emerald-500/30' : 'bg-red-500/20'}`}></div>
          </div>

          <div className="grid grid-cols-2 gap-4">
             {/* Total Watched */}
             <div className="bg-sand p-6 rounded-[2rem] flex flex-col justify-between relative overflow-hidden">
                 <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center text-charcoal mb-2 shadow-sm">
                    <TrendingUp size={20} strokeWidth={2.5} />
                 </div>
                 <div>
                    <span className="text-4xl font-black text-charcoal tracking-tighter block">{stats.totalWatched}</span>
                    <span className="text-[10px] font-bold uppercase text-stone-500 tracking-wider">Films Vus</span>
                 </div>
             </div>

             {/* Heatmap Mini */}
             <div className="bg-white border border-stone-100 p-6 rounded-[2rem] flex flex-col justify-between">
                 <div className="flex items-center gap-2 mb-2">
                    <Calendar size={16} className="text-charcoal" strokeWidth={2.5} />
                    <span className="text-[10px] font-bold uppercase text-stone-400 tracking-wider">Activité</span>
                 </div>
                 <div className="flex justify-between items-end h-16 gap-1">
                    {stats.dayCounts.map((count, i) => (
                        <div key={i} className="flex flex-col items-center gap-2 w-full group">
                           <div className="relative w-full flex-1 flex items-end justify-center">
                               <div 
                                 className="w-1.5 bg-charcoal rounded-full transition-all duration-500 group-hover:bg-forest"
                                 style={{ 
                                     height: `${count > 0 ? (count / stats.maxDayCount) * 100 : 10}%`,
                                     opacity: count > 0 ? 1 : 0.1
                                 }}
                               ></div>
                           </div>
                           <span className="text-[8px] font-bold text-stone-400">{stats.days[i]}</span>
                        </div>
                    ))}
                 </div>
             </div>
          </div>
      </div>

      {/* --- DNA Section --- */}
      <div className="bg-white p-8 rounded-[2rem] shadow-sm border border-stone-100 relative overflow-hidden">
          <div className="flex items-center gap-3 mb-8 relative z-10">
              <div className="bg-orange-100 p-2 rounded-xl text-burnt">
                  <Activity size={20} strokeWidth={3} />
              </div>
              <div>
                  <h3 className="text-lg font-extrabold text-charcoal leading-none">ADN Cinéphile</h3>
                  <span className="text-xs font-bold text-stone-400 uppercase tracking-wider">Notes Moyennes</span>
              </div>
          </div>
          
          <div className="space-y-5 relative z-10">
              {[
                  { label: 'Histoire', key: 'story', val: stats.ratingAvg.story, color: 'bg-charcoal' },
                  { label: 'Visuel', key: 'visuals', val: stats.ratingAvg.visuals, color: 'bg-forest' },
                  { label: 'Jeu', key: 'acting', val: stats.ratingAvg.acting, color: 'bg-burnt' },
                  { label: 'Son', key: 'sound', val: stats.ratingAvg.sound, color: 'bg-stone-400' }
              ].map((item) => (
                  <div key={item.key} className="group">
                      <div className="flex justify-between text-xs font-bold uppercase tracking-wider mb-2">
                          <span className="text-stone-500 group-hover:text-charcoal transition-colors">{item.label}</span>
                          <span className="text-charcoal bg-stone-100 px-2 py-0.5 rounded-md">{item.val}</span>
                      </div>
                      <div className="h-3 w-full bg-stone-100 rounded-full overflow-hidden">
                          <div 
                             className={`h-full ${item.color} rounded-full transition-all duration-1000 ease-out relative`}
                             style={{ width: `${(Number(item.val) / 10) * 100}%` }}
                          >
                             <div className="absolute right-0 top-0 bottom-0 w-32 bg-gradient-to-l from-white/20 to-transparent"></div>
                          </div>
                      </div>
                  </div>
              ))}
          </div>
          {/* Background decoration */}
          <div className="absolute -top-20 -right-20 w-64 h-64 bg-stone-50 rounded-full blur-3xl pointer-events-none opacity-50"></div>
      </div>

      {/* --- Bottom Grid: Actors & Genres --- */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          
          {/* Top Actors */}
          {stats.sortedActors.length > 0 && (
              <div className="bg-white border border-stone-100 p-6 rounded-[2rem]">
                  <div className="flex items-center gap-2 mb-6">
                      <User size={18} className="text-stone-400" strokeWidth={2.5} />
                      <h3 className="text-lg font-extrabold text-charcoal">Top Acteurs</h3>
                  </div>
                  <div className="space-y-4">
                      {stats.sortedActors.map((actor, idx) => (
                          <div key={idx} className="flex items-center justify-between group">
                              <div className="flex items-center gap-4">
                                  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-stone-100 text-xs font-bold text-stone-500 group-hover:bg-forest group-hover:text-white transition-colors">
                                    {idx + 1}
                                  </span>
                                  <span className="font-bold text-sm text-charcoal line-clamp-1">{actor.name}</span>
                              </div>
                              <div className="text-xs font-bold text-stone-400 bg-stone-50 px-2 py-1 rounded-lg group-hover:bg-white group-hover:shadow-sm transition-all">
                                  {actor.count} films
                              </div>
                          </div>
                      ))}
                  </div>
              </div>
          )}

          {/* Genre Mix */}
          <div className="bg-white border border-stone-100 p-6 rounded-[2rem]">
              <div className="flex items-center gap-2 mb-6">
                  <Tag size={18} className="text-stone-400" strokeWidth={2.5} />
                  <h3 className="text-lg font-extrabold text-charcoal">Genres</h3>
              </div>
              <div className="space-y-3">
                  {stats.sortedGenres.slice(0, 4).map((g, i) => (
                      <div key={i} className="flex items-center gap-3">
                           <div className="flex-1 h-10 bg-sand rounded-xl overflow-hidden flex items-center px-3 relative">
                               <div 
                                 className="absolute inset-y-0 left-0 bg-stone-200" 
                                 style={{ width: `${g.percent}%` }}
                               ></div>
                               <span className="relative z-10 text-xs font-bold text-charcoal uppercase tracking-wide">{g.name}</span>
                           </div>
                           <span className="text-xs font-extrabold text-stone-400 w-8 text-right">{g.percent}%</span>
                      </div>
                  ))}
              </div>
          </div>
      </div>

    </div>
  );
};

export default AnalyticsView;