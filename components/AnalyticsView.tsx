import React, { useMemo } from 'react';
import { Movie } from '../types';
import { CreditCard, Calendar, Activity, TrendingUp, Sparkles, User, Tag, PiggyBank, Radar, LineChart, Repeat, Fingerprint, Clapperboard, Users, Film } from 'lucide-react';

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
                        <text x={x} y={y - 8} textAnchor="middle" dominantBaseline="middle" className="text-[10px] font-bold uppercase fill-stone-500 tracking-wider">
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
    
    // Ratings
    const ratingSums = movies.reduce((acc, m) => ({
        story: acc.story + Number(m.ratings.story),
        visuals: acc.visuals + Number(m.ratings.visuals),
        acting: acc.acting + Number(m.ratings.acting),
        sound: acc.sound + Number(m.ratings.sound),
    }), { story: 0, visuals: 0, acting: 0, sound: 0 });

    const ratingAvg = {
        story: totalWatched ? Number((ratingSums.story / totalWatched).toFixed(1)) : 0,
        visuals: totalWatched ? Number((ratingSums.visuals / totalWatched).toFixed(1)) : 0,
        acting: totalWatched ? Number((ratingSums.acting / totalWatched).toFixed(1)) : 0,
        sound: totalWatched ? Number((ratingSums.sound / totalWatched).toFixed(1)) : 0,
    };

    // Savings
    const now = new Date();
    const currentMonthMovies = movies.filter(m => {
        const dateToUse = m.dateWatched || m.dateAdded || Date.now();
        const d = new Date(dateToUse);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
    const monthlyCount = currentMonthMovies.length;
    const rawSavings = (monthlyCount * TICKET_PRICE) - SUBSCRIPTION_COST;
    const monthlySavings = rawSavings > 0 ? `+${rawSavings.toFixed(2)}` : rawSavings.toFixed(2);
    
    // Activity
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

    // Rewatch Stats
    const rewatchCount = movies.filter(m => m.rewatch).length;
    const rewatchRate = totalWatched ? Math.round((rewatchCount / totalWatched) * 100) : 0;

    // Tags Analysis
    const allTags = movies.flatMap(m => m.tags || []);
    const tagCounts = allTags.reduce((acc, tag) => {
        acc[tag] = (acc[tag] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    
    const sortedTags = Object.entries(tagCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 4)
        .map(([tag, count]) => ({
            tag,
            count,
            percent: Math.round(((count as number) / Math.max(totalWatched, 1)) * 100)
        }));

    // Top Réalisateurs
    const directorCounts = movies.reduce((acc, m) => {
        if (m.director) acc[m.director] = (acc[m.director] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const topDirectors = Object.entries(directorCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3);

    // Top Acteurs
    const actorCounts = movies.reduce((acc, m) => {
        if (m.actors) {
            m.actors.split(',').forEach(actor => {
                const name = actor.trim();
                if (name) acc[name] = (acc[name] || 0) + 1;
            });
        }
        return acc;
    }, {} as Record<string, number>);
    const topActors = Object.entries(actorCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 3);

    // Top Genres
    const genreCounts = movies.reduce((acc, m) => {
        if (m.genre) acc[m.genre] = (acc[m.genre] || 0) + 1;
        return acc;
    }, {} as Record<string, number>);
    const topGenres = Object.entries(genreCounts)
        .sort(([, a], [, b]) => (b as number) - (a as number))
        .slice(0, 4)
        .map(([genre, count]) => ({
            genre,
            count,
            percent: Math.round(((count as number) / Math.max(totalWatched, 1)) * 100)
        }));

    return { 
        totalWatched, ratingAvg, monthlyCount, monthlySavings, dayCounts, days, 
        maxDayCount, rewatchRate, sortedTags, topDirectors, topActors, topGenres 
    };
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
    { label: 'Histoire', value: stats.ratingAvg.story, color: '#1A1A1A' },
    { label: 'Visuel', value: stats.ratingAvg.visuals, color: '#3E5238' },
    { label: 'Jeu', value: stats.ratingAvg.acting, color: '#D97706' },
    { label: 'Son', value: stats.ratingAvg.sound, color: '#57534E' }
  ];

  return (
    <div className="space-y-6 pb-32 animate-[fadeIn_0.4s_ease-out]">
      <div className="mt-2 mb-4">
         <h2 className="text-3xl font-black text-charcoal tracking-tight">Analyses</h2>
         <p className="text-xs font-bold text-stone-500 uppercase tracking-[0.15em]">VOS DONNÉES DÉCODÉES</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
                  <div className="mt-3 text-sm font-bold text-white/80 leading-tight">
                      {stats.monthlyCount} films vus vs 11€ abo.
                  </div>
              </div>
          </div>

          <div className="bg-sand p-7 rounded-[2.5rem] flex flex-col justify-between min-h-[220px]">
              <div className="w-10 h-10 bg-white rounded-2xl flex items-center justify-center text-charcoal shadow-sm">
                 <TrendingUp size={20} strokeWidth={2.5} />
              </div>
              <div className="mt-auto">
                 <span className="text-6xl font-black text-charcoal tracking-tighter block leading-none">{stats.totalWatched}</span>
                 <span className="text-[10px] font-black uppercase text-stone-500 tracking-[0.1em] mt-2 block">Films Vus</span>
              </div>
          </div>

          <div className="bg-white border border-stone-100 p-7 rounded-[2.5rem] flex flex-col justify-between min-h-[220px] relative overflow-hidden">
              <div className="w-10 h-10 bg-stone-50 rounded-2xl flex items-center justify-center text-forest shadow-sm relative z-10">
                 <Repeat size={20} strokeWidth={2.5} />
              </div>
              <div className="mt-auto relative z-10">
                 <div className="flex items-start gap-1">
                    <span className="text-6xl font-black text-charcoal tracking-tighter block leading-none">{stats.rewatchRate}</span>
                    <span className="text-lg font-black text-stone-300 mt-1">%</span>
                 </div>
                 <span className="text-[10px] font-black uppercase text-stone-500 tracking-[0.1em] mt-2 block">Replay Value</span>
              </div>
          </div>
          
           <div className="md:col-span-4 lg:col-span-1 bg-white border border-stone-100 p-7 rounded-[2.5rem] flex flex-col min-h-[220px]">
              <div className="flex items-center gap-2 mb-6">
                 <Calendar size={18} className="text-stone-400" strokeWidth={2.5} />
                 <span className="text-[10px] font-black uppercase text-stone-500 tracking-[0.1em]">Activité</span>
              </div>
              <div className="flex justify-between items-end flex-1 gap-1 pb-1">
                 {stats.dayCounts.map((count, i) => (
                     <div key={i} className="flex-1 w-full flex items-end justify-center relative h-full">
                        <div className="w-1.5 bg-charcoal rounded-full" style={{ height: `${count > 0 ? (count / stats.maxDayCount) * 100 : 8}%`, opacity: count > 0 ? 1 : 0.05 }}></div>
                     </div>
                 ))}
              </div>
          </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-stone-100 relative overflow-hidden">
              <div className="flex items-center gap-3 mb-4 relative z-10">
                  <div className="bg-sand p-2.5 rounded-2xl text-charcoal"><Radar size={22} strokeWidth={2.5} /></div>
                  <div>
                      <h3 className="text-lg font-black text-charcoal leading-none">Radar Moyen</h3>
                      <span className="text-[10px] font-bold text-stone-500 uppercase tracking-[0.1em]">PROFIL SPECTATEUR</span>
                  </div>
              </div>
              <RadarChart data={radarData} />
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-stone-100 relative overflow-hidden flex flex-col">
              <div className="flex items-center gap-3 mb-8 relative z-10">
                  <div className="bg-stone-50 p-2.5 rounded-2xl text-charcoal"><Fingerprint size={22} strokeWidth={2.5} /></div>
                  <div>
                      <h3 className="text-lg font-black text-charcoal leading-none">ADN Cinéma</h3>
                      <span className="text-[10px] font-bold text-stone-500 uppercase tracking-[0.1em]">VOS CRITÈRES CLÉS</span>
                  </div>
              </div>
              {stats.sortedTags.length > 0 ? (
                  <div className="space-y-6 flex-1">
                      {stats.sortedTags.map((item, index) => (
                          <div key={item.tag}>
                              <div className="flex justify-between text-[11px] font-black uppercase tracking-widest mb-2.5">
                                  <span className="text-charcoal">{item.tag}</span>
                                  <span className="text-stone-500">{item.count} films</span>
                              </div>
                              <div className="h-2 w-full bg-stone-50 rounded-full overflow-hidden">
                                  <div className={`h-full rounded-full ${index === 0 ? 'bg-forest' : index === 1 ? 'bg-charcoal' : 'bg-stone-400'}`} style={{ width: `${item.percent}%` }} />
                              </div>
                          </div>
                      ))}
                  </div>
              ) : (
                  <div className="flex-1 flex flex-col items-center justify-center text-center opacity-40"><Tag size={40} className="mb-3 text-stone-300" /><p className="text-xs font-black uppercase text-stone-300 tracking-widest">Aucun tag</p></div>
              )}
          </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-stone-100">
              <div className="flex items-center gap-3 mb-8">
                  <div className="bg-stone-50 p-2.5 rounded-2xl text-charcoal"><Users size={22} strokeWidth={2.5} /></div>
                  <div>
                      <h3 className="text-lg font-black text-charcoal leading-none">Casting fétiche</h3>
                      <span className="text-[10px] font-bold text-stone-500 uppercase tracking-[0.1em]">ACTEURS RÉCURRENTS</span>
                  </div>
              </div>
              <div className="space-y-6">
                  {stats.topActors.length > 0 ? stats.topActors.map(([actor, count], i) => (
                      <div key={actor} className="flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                              <span className="text-2xl font-black text-stone-200 group-hover:text-forest transition-colors leading-none">0{i+1}</span>
                              <p className="font-black text-charcoal text-sm truncate max-w-[140px] tracking-tight">{actor}</p>
                          </div>
                          <span className="bg-stone-100 px-3 py-1.5 rounded-xl text-[10px] font-black text-stone-600 uppercase tracking-widest">{count} FILMS</span>
                      </div>
                  )) : <p className="text-[10px] font-bold text-stone-300 uppercase tracking-widest text-center py-10">Données insuffisantes</p>}
              </div>
          </div>

          <div className="bg-white p-8 rounded-[2.5rem] shadow-sm border border-stone-100">
              <div className="flex items-center gap-3 mb-8">
                  <div className="bg-stone-50 p-2.5 rounded-2xl text-charcoal"><Clapperboard size={22} strokeWidth={2.5} /></div>
                  <div>
                      <h3 className="text-lg font-black text-charcoal leading-none">Visionnaires</h3>
                      <span className="text-[10px] font-bold text-stone-500 uppercase tracking-[0.1em]">RÉALISATEURS PRÉFÉRÉS</span>
                  </div>
              </div>
              <div className="space-y-6">
                  {stats.topDirectors.length > 0 ? stats.topDirectors.map(([director, count], i) => (
                      <div key={director} className="flex items-center justify-between group">
                          <div className="flex items-center gap-4">
                              <span className="text-2xl font-black text-stone-200 group-hover:text-tz-orange transition-colors leading-none">0{i+1}</span>
                              <p className="font-black text-charcoal text-sm truncate max-w-[140px] tracking-tight">{director}</p>
                          </div>
                          <span className="bg-stone-100 px-3 py-1.5 rounded-xl text-[10px] font-black text-stone-600 uppercase tracking-widest">{count} FILMS</span>
                      </div>
                  )) : <p className="text-[10px] font-bold text-stone-300 uppercase tracking-widest text-center py-10">Données insuffisantes</p>}
              </div>
          </div>

          <div className="bg-charcoal text-white p-8 rounded-[2.5rem] shadow-xl">
              <div className="flex items-center gap-3 mb-8">
                  <div className="bg-white/10 p-2.5 rounded-2xl text-white"><Film size={22} strokeWidth={2.5} /></div>
                  <div>
                      <h3 className="text-lg font-black text-white leading-none">Panorama</h3>
                      <span className="text-[10px] font-bold text-white/60 uppercase tracking-[0.1em]">GENRES DOMINANTS</span>
                  </div>
              </div>
              <div className="space-y-5">
                  {stats.topGenres.length > 0 ? stats.topGenres.map((item, i) => (
                      <div key={item.genre}>
                          <div className="flex justify-between text-[10px] font-black uppercase tracking-widest mb-2 opacity-80">
                              <span>{item.genre}</span>
                              <span className="text-white/60">{item.count}</span>
                          </div>
                          <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all duration-1000 ${i === 0 ? 'bg-tz-yellow' : 'bg-white/40'}`} style={{ width: `${item.percent}%` }} />
                          </div>
                      </div>
                  )) : <p className="text-[10px] font-bold text-white/20 uppercase tracking-widest text-center py-10">Aucun genre noté</p>}
              </div>
          </div>
      </div>
    </div>
  );
};

export default AnalyticsView;