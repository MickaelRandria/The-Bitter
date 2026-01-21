import React, { useMemo } from 'react';
import { Movie } from '../types';
import { CreditCard, Calendar, Activity, TrendingUp, Sparkles, User, Tag, PiggyBank, Radar, LineChart } from 'lucide-react';

interface AnalyticsViewProps {
  movies: Movie[];
}

// Internal Radar Chart Component
const RadarChart = ({ data }: { data: { label: string; value: number; color: string }[] }) => {
  const size = 240;
  const center = size / 2;
  const radius = 80;
  
  const getCoordinates = (value: number, index: number, total: number) => {
    const angle = (Math.PI * 2 * index) / total - Math.PI / 2;
    const r = (value / 10) * radius;
    const x = center + r * Math.cos(angle);
    const y = center + r * Math.sin(angle);
    return { x, y };
  };

  const points = data.map((d, i) => {
    const { x, y } = getCoordinates(d.value, i, data.length);
    return `${x},${y}`;
  }).join(' ');

  return (
    <div className="flex flex-col items-center justify-center py-2">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="overflow-visible">
            {[2.5, 5, 7.5, 10].map((level, idx) => (
                <polygon
                    key={idx}
                    points={data.map((_, i) => {
                        const { x, y } = getCoordinates(level, i, data.length);
                        return `${x},${y}`;
                    }).join(' ')}
                    fill="none" 
                    stroke="#E7E5E4"
                    strokeWidth="1.5"
                    strokeDasharray={idx === 3 ? "0" : "3 3"}
                />
            ))}
            {data.map((_, i) => {
                const { x, y } = getCoordinates(10, i, data.length);
                return <line key={i} x1={center} y1={center} x2={x} y2={y} stroke="#E7E5E4" strokeWidth="1.5" />;
            })}
            <polygon 
                points={points} 
                fill="rgba(62, 82, 56, 0.1)" 
                stroke="#3E5238" 
                strokeWidth="2.5" 
                strokeLinejoin="round"
                className="animate-[scaleIn_0.5s_ease-out] origin-center"
            />
            {data.map((d, i) => {
                const { x, y } = getCoordinates(d.value, i, data.length);
                return (
                    <circle 
                        key={i} cx={x} cy={y} r="6" fill={d.color} stroke="white" strokeWidth="3" 
                        className="animate-[scaleIn_0.6s_ease-out]"
                        style={{ animationDelay: `${i * 100}ms` }}
                    />
                );
            })}
            {data.map((d, i) => {
                const angle = (Math.PI * 2 * i) / data.length - Math.PI / 2;
                const labelRadius = radius + 28;
                const x = center + labelRadius * Math.cos(angle);
                const y = center + labelRadius * Math.sin(angle);
                return (
                    <g key={i} className="animate-[fadeIn_0.8s_ease-out]">
                        <text x={x} y={y - 8} textAnchor="middle" dominantBaseline="middle" className="text-[10px] font-bold uppercase fill-stone-400 tracking-wider">
                            {d.label}
                        </text>
                        <text x={x} y={y + 6} textAnchor="middle" dominantBaseline="middle" className="text-sm font-black fill-charcoal">
                            {d.value}
                        </text>
                    </g>
                );
            })}
        </svg>
    </div>
  );
};

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

    const now = new Date();
    const currentMonthMovies = movies.filter(m => {
        const dateToUse = m.dateWatched || m.dateAdded || Date.now();
        const d = new Date(dateToUse);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthlyCount = currentMonthMovies.length;
    
    const rawSavings = (monthlyCount * TICKET_PRICE) - SUBSCRIPTION_COST;
    const monthlySavings = rawSavings > 0 ? `+${rawSavings.toFixed(2)}` : rawSavings.toFixed(2);
    const isProfitable = rawSavings > 0;

    const days = ['D', 'L', 'M', 'M', 'J', 'V', 'S'];
    const dayCounts = [0, 0, 0, 0, 0, 0, 0];
    movies.forEach(m => {
        const dateToUse = m.dateWatched || m.dateAdded || Date.now();
        const d = new Date(dateToUse);
        const dayIdx = d.getDay();
        if (!isNaN(dayIdx)) {
            dayCounts[dayIdx]++;
        }
    });
    const maxDayCount = Math.max(...dayCounts, 1);

    const actorCounts: Record<string, { count: number, totalRating: number }> = {};
    movies.forEach(m => {
        if (!m.actors) return;
        const list = m.actors.split(',').map(s => s.trim());
        const avgRating = (m.ratings.story + m.ratings.visuals + m.ratings.acting + m.ratings.sound) / 4;
        list.forEach(actor => {
            if (!actor) return;
            if (!actorCounts[actor]) actorCounts[actor] = { count: 0, totalRating: 0 };
            actorCounts[actor].count++;
            actorCounts[actor].totalRating += avgRating;
        });
    });

    const sortedActors = Object.entries(actorCounts)
        .map(([name, data]) => ({ name, count: data.count, avg: (data.totalRating / data.count).toFixed(1) }))
        .sort((a, b) => b.count - a.count).slice(0, 3);

    const genreCounts: Record<string, number> = {};
    movies.forEach(m => { genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1; });
    const sortedGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => b - a)
        .map(([name, count]) => ({ name, count, percent: Math.round((count / totalWatched) * 100) }));

    return { totalWatched, ratingAvg, monthlyCount, monthlySavings, isProfitable, dayCounts, days, maxDayCount, sortedActors, sortedGenres };
  }, [movies]);

  if (movies.length === 0) {
      return (
          <div className="flex flex-col items-center justify-center py-24 px-8 text-center bg-white rounded-[2.5rem] border border-stone-100 shadow-sm mt-4">
              <div className="bg-sand p-4 rounded-full mb-4 animate-bounce"><Sparkles size={32} className="text-stone-400" /></div>
              <h3 className="text-xl font-extrabold text-charcoal mb-2">Pas encore de données</h3>
              <p className="text-stone-400 font-medium">Ajoutez des films pour générer votre profil.</p>
          </div>
      );
  }

  const radarData = [
    { label: 'Histoire', value: Number(stats.ratingAvg.story), color: '#1A1A1A' },
    { label: 'Visuel', value: Number(stats.ratingAvg.visuals), color: '#3E5238' },
    { label: 'Jeu', value: Number(stats.ratingAvg.acting), color: '#D97706' },
    { label: 'Son', value: Number(stats.ratingAvg.sound), color: '#57534E' }
  ];

  return (
    <div className="space-y-6 pb-24 animate-[fadeIn_0.4s_ease-out]">
      <div className="mt-2 mb-4">
         <h2 className="text-3xl font-black text-charcoal tracking-tight">Analyses</h2>
         <p className="text-xs font-bold text-stone-300 uppercase tracking-[0.15em]">VOS DONNÉES DÉCODÉES</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
          {/* ABO CINÉ - Large Card */}
          <div className="md:col-span-2 lg:col-span-2 bg-forest text-white p-7 rounded-[2.5rem] shadow-xl shadow-forest/10 relative overflow-hidden flex flex-col justify-between min-h-[220px]">
              <div className="relative z-10 flex justify-between items-start">
                  <div className="flex items-center gap-2 bg-white/15 backdrop-blur-md px-3 py-1.5 rounded-full">
                      <CreditCard size={14} className="text-white/80" />
                      <span className="text-[10px] font-bold uppercase tracking-[0.1em] text-white">Abo Ciné</span>
                  </div>
                  <PiggyBank size={24} className="text-white/20" />
              </div>
              
              <div className="relative z-10 mt-6">
                  <div className="flex items-baseline gap-1">
                    <span className="text-7xl font-black tracking-tighter">{stats.monthlySavings}</span>
                    <span className="text-2xl font-bold text-white/40">€</span>
                  </div>
                  <div className="mt-3">
                      <p className="text-[10px] font-black uppercase tracking-[0.1em] text-white/50 mb-1">Économies du mois</p>
                      <p className="text-sm font-bold text-white/80 leading-tight">
                          {stats.monthlyCount} films vus vs 11€ abo.
                      </p>
                      <p className="text-[10px] text-white/40 font-bold mt-1">(Calculé sur 8€/place)</p>
                  </div>
              </div>
              <div className="absolute bottom-[-10%] right-[-5%] w-40 h-40 bg-white/5 rounded-full blur-3xl"></div>
              <div className="absolute top-1/2 right-0 w-32 h-32 bg-[#2D3E28] rounded-full translate-x-12 -translate-y-8"></div>
          </div>

          {/* FILMS VUS - Small Card */}
          <div className="bg-sand p-7 rounded-[2.5rem] flex flex-col justify-between min-h-[220px]">
              <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-charcoal shadow-sm">
                 <TrendingUp size={20} strokeWidth={2.5} />
              </div>
              <div className="mt-auto">
                 <span className="text-6xl font-black text-charcoal tracking-tighter block leading-none">{stats.totalWatched}</span>
                 <span className="text-[10px] font-black uppercase text-stone-400 tracking-[0.1em] mt-2 block">Films Vus</span>
              </div>
          </div>

          {/* ACTIVITÉ - Medium Card */}
          <div className="md:col-span-1 lg:col-span-2 bg-white border border-stone-100 p-7 rounded-[2.5rem] flex flex-col min-h-[220px]">
              <div className="flex items-center gap-2 mb-6">
                 <Calendar size={18} className="text-stone-300" strokeWidth={2.5} />
                 <span className="text-[10px] font-black uppercase text-stone-300 tracking-[0.1em]">Activité</span>
              </div>
              <div className="flex justify-between items-end flex-1 gap-1 pb-1">
                 {stats.dayCounts.map((count, i) => (
                     <div key={i} className="flex flex-col items-center gap-3 flex-1 h-full">
                        <div className="flex-1 w-full flex items-end justify-center relative">
                            <div 
                              className="w-1.5 bg-charcoal rounded-full transition-all duration-700 ease-[cubic-bezier(0.23,1,0.32,1)]"
                              style={{ 
                                  height: `${count > 0 ? (count / stats.maxDayCount) * 100 : 8}%`,
                                  opacity: count > 0 ? 1 : 0.05
                              }}
                            ></div>
                        </div>
                        <span className="text-[9px] font-bold text-stone-400">{stats.days[i]}</span>
                     </div>
                 ))}
              </div>
          </div>
      </div>

      {/* --- Radar & DNA --- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-stone-100 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-4 relative z-10">
                  <div className="bg-sand p-2.5 rounded-2xl text-charcoal"><Radar size={22} strokeWidth={2.5} /></div>
                  <div>
                      <h3 className="text-lg font-black text-charcoal leading-none">Radar Moyen</h3>
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.1em]">PROFIL SPECTATEUR</span>
                  </div>
              </div>
              <RadarChart data={radarData} />
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-stone-100 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-8 relative z-10">
                  <div className="bg-stone-50 p-2.5 rounded-2xl text-charcoal"><Activity size={22} strokeWidth={2.5} /></div>
                  <div>
                      <h3 className="text-lg font-black text-charcoal leading-none">Détails des Notes</h3>
                      <span className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.1em]">RÉPARTITION LINÉAIRE</span>
                  </div>
              </div>
              <div className="space-y-6">
                  {[
                      { label: 'Histoire', key: 'story', val: stats.ratingAvg.story, color: 'bg-charcoal' },
                      { label: 'Visuel', key: 'visuals', val: stats.ratingAvg.visuals, color: 'bg-forest' },
                      { label: 'Jeu', key: 'acting', val: stats.ratingAvg.acting, color: 'bg-burnt' },
                      { label: 'Son', key: 'sound', val: stats.ratingAvg.sound, color: 'bg-stone-400' }
                  ].map((item) => (
                      <div key={item.key}>
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2.5">
                              <span className="text-stone-400">{item.label}</span>
                              <span className="text-charcoal">{item.val}</span>
                          </div>
                          <div className="h-1.5 w-full bg-stone-50 rounded-full overflow-hidden">
                              <div className={`h-full ${item.color} rounded-full transition-all duration-1000 ease-out`} style={{ width: `${(Number(item.val) / 10) * 100}%` }} />
                          </div>
                      </div>
                  ))}
              </div>
          </div>
      </div>
    </div>
  );
};

export default AnalyticsView;