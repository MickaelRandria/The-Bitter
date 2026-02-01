
import React, { useState, useMemo, useRef } from 'react';
import { Movie, UserProfile } from '../types';
import { 
  ScanFace, 
  Smartphone, 
  Brain, 
  Zap, 
  Heart, 
  Aperture, 
  Smile, 
  TrendingUp, 
  PiggyBank, 
  Film, 
  ChevronRight,
  Activity,
  Target,
  Settings2,
  History,
  Clapperboard,
  User,
  Tags,
  Calculator,
  X,
  Star,
  Share,
  Instagram,
  Download,
  Loader2
} from 'lucide-react';
import { haptics } from '../utils/haptics';
import html2canvas from 'html2canvas';

interface AnalyticsViewProps {
  movies: Movie[];
  userProfile: UserProfile | null;
  onNavigateToCalendar?: () => void;
  onRecalibrate?: () => void;
}

type TabMode = 'miroir' | 'audit';
type FilterType = 'actor' | 'director' | 'genre';

const AnalyticsView: React.FC<AnalyticsViewProps> = ({ movies, userProfile, onNavigateToCalendar, onRecalibrate }) => {
  const [activeTab, setActiveTab] = useState<TabMode>('miroir');
  const [activeFilter, setActiveFilter] = useState<{ type: FilterType, value: string } | null>(null);
  const [isSharing, setIsSharing] = useState(false);
  const storyRef = useRef<HTMLDivElement>(null);

  // --- LOGIQUE DE CALCUL DES STATS ---
  const stats = useMemo(() => {
    const watched = movies.filter(m => m.status === 'watched');
    const count = watched.length;

    if (count === 0) return null;

    // 1. Calcul des moyennes (Miroir)
    const sums = watched.reduce((acc, m) => {
      acc.cerebral += m.vibe?.story || 5;
      acc.emotion += m.vibe?.emotion || 5;
      acc.fun += m.vibe?.fun || 5;
      acc.visuel += m.vibe?.visual || 5;
      acc.tension += m.vibe?.tension || 5;
      acc.smartphone += m.smartphoneFactor || 0;
      return acc;
    }, { cerebral: 0, emotion: 0, fun: 0, visuel: 0, tension: 0, smartphone: 0 });

    const averages = {
      cerebral: Number((sums.cerebral / count).toFixed(1)),
      emotion: Number((sums.emotion / count).toFixed(1)),
      fun: Number((sums.fun / count).toFixed(1)),
      visuel: Number((sums.visuel / count).toFixed(1)),
      tension: Number((sums.tension / count).toFixed(1)),
      smartphone: Math.round(sums.smartphone / count)
    };

    // 2. Calcul des Tops (Audit)
    const actorCounts: Record<string, number> = {};
    const directorCounts: Record<string, number> = {};
    const genreCounts: Record<string, number> = {};

    watched.forEach(m => {
      if (m.actorIds && m.actorIds.length > 0) {
        m.actorIds.forEach(a => { actorCounts[a.name] = (actorCounts[a.name] || 0) + 1; });
      } else if (m.actors) {
        m.actors.split(',').forEach(a => { 
            const name = a.trim(); 
            if(name) actorCounts[name] = (actorCounts[name] || 0) + 1; 
        });
      }
      if (m.director) directorCounts[m.director] = (directorCounts[m.director] || 0) + 1;
      if (m.genre) genreCounts[m.genre] = (genreCounts[m.genre] || 0) + 1;
    });

    const getTop = (counts: Record<string, number>) => 
      Object.entries(counts).sort(([, a], [, b]) => b - a).slice(0, 3);

    const vibeInsight = averages.cerebral > averages.fun + 2 
      ? { label: "L'Intello", desc: "Cinéma = Énigme", tag: "CÉRÉBRAL", icon: <Brain size={24} /> }
      : averages.fun > averages.cerebral + 2 
        ? { label: "Popcorn", desc: "Plaisir immédiat", tag: "FUN", icon: <Smile size={24} /> }
        : { label: "L'Équilibré", desc: "Le meilleur des deux", tag: "VERSATILE", icon: <History size={24} /> };

    const ticketPrice = 8.5;
    const monthlyCost = 11.0; 
    const savings = (count * ticketPrice) - monthlyCost;

    return { 
      averages, count, savings, vibeInsight,
      tops: {
        actors: getTop(actorCounts),
        directors: getTop(directorCounts),
        genres: getTop(genreCounts)
      }
    };
  }, [movies]);

  // --- LOGIQUE DU DRILL-DOWN (MODALE) ---
  const drillDownData = useMemo(() => {
    if (!activeFilter) return [];
    
    return movies
      .filter(m => m.status === 'watched')
      .filter(m => {
        const val = activeFilter.value;
        if (activeFilter.type === 'director') return m.director === val;
        if (activeFilter.type === 'genre') return m.genre === val;
        if (activeFilter.type === 'actor') {
           if (m.actorIds) return m.actorIds.some(a => a.name === val);
           return m.actors.split(',').map(s => s.trim()).includes(val);
        }
        return false;
      })
      .sort((a, b) => {
        const ra = (a.ratings.story + a.ratings.visuals + a.ratings.acting + a.ratings.sound) / 4;
        const rb = (b.ratings.story + b.ratings.visuals + b.ratings.acting + b.ratings.sound) / 4;
        return rb - ra; // Du meilleur au moins bon
      });
  }, [movies, activeFilter]);

  const handleShareStory = async () => {
    if (!storyRef.current || isSharing) return;
    
    setIsSharing(true);
    haptics.medium();

    try {
      // 1. Délai pour s'assurer que le rendu est prêt
      await new Promise(resolve => setTimeout(resolve, 500));

      const canvas = await html2canvas(storyRef.current, {
        scale: 2, // Retina quality
        backgroundColor: '#0c0c0c',
        useCORS: true,
        allowTaint: true,
        logging: false,
        onclone: (clonedDoc) => {
            // S'assurer que les éléments sont visibles dans le clone
            const element = clonedDoc.getElementById('story-container');
            if (element) {
                element.style.display = 'block';
                element.style.visibility = 'visible';
            }
        }
      });

      canvas.toBlob(async (blob) => {
        if (!blob) {
            console.error("Blob generation failed");
            setIsSharing(false);
            return;
        }

        const file = new File([blob], 'the-bitter-story.png', { type: 'image/png' });

        if (navigator.share && navigator.canShare && navigator.canShare({ files: [file] })) {
            try {
                await navigator.share({
                    files: [file],
                    // Pas de titre/texte pour Instagram Stories, juste le fichier
                });
                haptics.success();
            } catch (err) {
                console.log("Share cancelled or failed", err);
            }
        } else {
            // Fallback : Téléchargement direct
            const link = document.createElement('a');
            link.download = 'the-bitter-story.png';
            link.href = canvas.toDataURL();
            link.click();
            alert("Image enregistrée ! Ouvrez Instagram pour la publier en Story.");
            haptics.success();
        }
        setIsSharing(false);
      }, 'image/png');
    } catch (error) {
        console.error("Generation failed", error);
        setIsSharing(false);
        haptics.error();
    }
  };

  if (!stats) {
    return (
      <div className="flex flex-col items-center justify-center py-32 px-10 text-center">
        <div className="w-20 h-20 bg-stone-100 rounded-full flex items-center justify-center mb-6">
          <ScanFace size={40} className="text-stone-300" />
        </div>
        <h3 className="text-2xl font-black text-charcoal mb-2">Pas encore d'ADN</h3>
        <p className="text-stone-400 font-medium">Notez quelques films pour que votre analyste puisse travailler.</p>
      </div>
    );
  }

  const ADNBar = ({ label, value, icon, percentage = false }: { label: string, value: number, icon: React.ReactNode, percentage?: boolean }) => (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <div className="flex items-center gap-2">
          <span className="text-charcoal">{icon}</span>
          <span className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal">{label}</span>
        </div>
        <span className="text-xl font-black text-charcoal tracking-tighter">
          {value}{percentage ? <span className="text-[10px] ml-0.5">%</span> : <span className="text-[10px] text-stone-300 ml-0.5">/10</span>}
        </span>
      </div>
      <div className="h-4 bg-stone-100 rounded-full p-[2px] border border-stone-200/50 overflow-hidden">
        <div 
          className="h-full bg-lime-400 rounded-full transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)]" 
          style={{ width: percentage ? `${value}%` : `${value * 10}%` }} 
        />
      </div>
    </div>
  );

  return (
    <div className="space-y-10 animate-[fadeIn_0.4s_ease-out] pb-24 relative">
      
      {/* HEADER AVEC BOUTON DE PARTAGE */}
      <div className="flex items-center justify-between pt-2">
        <div className="bg-stone-100 p-1.5 rounded-full flex flex-1 max-w-[280px] shadow-inner border border-stone-200/50 mx-auto">
          <button 
            onClick={() => { haptics.soft(); setActiveTab('miroir'); }} 
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'miroir' ? 'bg-charcoal text-lime-400 shadow-lg' : 'text-stone-400'}`}
          >
            <ScanFace size={14} /> Miroir
          </button>
          <button 
            onClick={() => { haptics.soft(); setActiveTab('audit'); }} 
            className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'audit' ? 'bg-charcoal text-lime-400 shadow-lg' : 'text-stone-400'}`}
          >
            <Calculator size={14} /> Audit
          </button>
        </div>

        {/* Bouton Partage */}
        <button 
            onClick={handleShareStory}
            disabled={isSharing}
            className="absolute right-0 top-3 p-3 bg-gradient-to-tr from-purple-600 to-orange-500 text-white rounded-full shadow-lg active:scale-90 transition-transform disabled:opacity-50 disabled:cursor-not-allowed"
        >
            {isSharing ? <Loader2 size={20} className="animate-spin" /> : <Instagram size={20} />}
        </button>
      </div>
      
      {/* Feedback de génération */}
      {isSharing && (
          <div className="fixed inset-0 z-[200] flex flex-col items-center justify-center bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
             <div className="bg-white p-6 rounded-3xl flex items-center gap-4 shadow-2xl">
                <Loader2 size={24} className="animate-spin text-charcoal" />
                <span className="text-xs font-black uppercase tracking-widest text-charcoal">Génération de la Story...</span>
             </div>
          </div>
      )}

      {/* CONTENU DYNAMIQUE */}
      {activeTab === 'miroir' ? (
        <div className="space-y-12 animate-[slideUp_0.4s_ease-out]">
          <div>
            <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Analyse<br/><span className="text-stone-300">Psychologique</span></h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-3">Qui êtes-vous vraiment ?</p>
          </div>
          <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 space-y-8 shadow-sm">
            <ADNBar label="Smartphone" value={stats.averages.smartphone} icon={<Smartphone size={16} />} percentage={true} />
            <ADNBar label="Cérébral" value={stats.averages.cerebral} icon={<Brain size={16} />} />
            <ADNBar label="Émotion" value={stats.averages.emotion} icon={<Heart size={16} />} />
            <ADNBar label="Fun" value={stats.averages.fun} icon={<Smile size={16} />} />
            <ADNBar label="Visuel" value={stats.averages.visuel} icon={<Aperture size={16} />} />
            <ADNBar label="Tension" value={stats.averages.tension} icon={<Zap size={16} />} />
          </div>
          <div className="bg-white border border-stone-100 p-6 rounded-[2rem] flex items-center gap-6 shadow-sm">
            <div className="w-14 h-14 bg-charcoal text-lime-400 rounded-2xl flex items-center justify-center shrink-0">
              {stats.vibeInsight.icon}
            </div>
            <div>
              <div className="flex items-center gap-2 mb-1">
                <span className="text-lg font-black text-charcoal leading-none">{stats.vibeInsight.label}</span>
                <span className="text-[8px] font-black bg-stone-100 px-2 py-0.5 rounded text-stone-400 uppercase tracking-widest">{stats.vibeInsight.tag}</span>
              </div>
              <p className="text-xs font-medium text-stone-500">{stats.vibeInsight.desc}</p>
            </div>
          </div>
        </div>
      ) : (
        <div className="space-y-8 animate-[slideUp_0.4s_ease-out]">
          <div>
            <h2 className="text-4xl font-black text-charcoal tracking-tighter leading-none">Statistiques<br/><span className="text-stone-300">Comptables</span></h2>
            <p className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mt-3">Données brutes & Rentabilité</p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="bg-charcoal text-white p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[160px] shadow-xl">
              <Film size={24} className="text-white/20" />
              <div>
                <span className="text-6xl font-black tracking-tighter block leading-none">{stats.count}</span>
                <span className="text-[10px] font-bold text-white/40 uppercase tracking-widest mt-2 block">Films Vus</span>
              </div>
            </div>
            <div className="bg-lime-400 text-charcoal p-8 rounded-[2.5rem] flex flex-col justify-between min-h-[160px] shadow-lg">
              <PiggyBank size={24} className="text-charcoal/20" />
              <div>
                <div className="flex items-baseline gap-1">
                  <span className="text-5xl font-black tracking-tighter">{Math.round(stats.savings)}</span>
                  <span className="text-xl font-bold">€</span>
                </div>
                <span className="text-[10px] font-bold text-charcoal/60 uppercase tracking-widest mt-2 block">Économies / Mois</span>
              </div>
            </div>
          </div>

          <div className="bg-white border border-stone-200 rounded-[2.5rem] p-8 space-y-10 shadow-sm">
            {/* Top Réalisateurs */}
            <div>
              <div className="flex items-center gap-2 mb-6 opacity-30">
                <Clapperboard size={14} />
                <h4 className="text-[10px] font-black uppercase tracking-widest">Top Réalisateurs</h4>
              </div>
              <div className="space-y-4">
                {stats.tops.directors.map(([name, count], i) => (
                  <button 
                    key={name} 
                    onClick={() => { haptics.medium(); setActiveFilter({ type: 'director', value: name }); }}
                    className="flex justify-between items-center group w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-stone-200 w-4">{i + 1}</span>
                      <span className="text-sm font-bold text-charcoal group-hover:text-forest transition-colors">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-stone-300">{count} films</span>
                        <ChevronRight size={14} className="text-stone-200 group-hover:text-charcoal group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-stone-100" />

            {/* Top Casting */}
            <div>
              <div className="flex items-center gap-2 mb-6 opacity-30">
                <User size={14} />
                <h4 className="text-[10px] font-black uppercase tracking-widest">Top Casting</h4>
              </div>
              <div className="space-y-4">
                {stats.tops.actors.map(([name, count], i) => (
                  <button 
                    key={name} 
                    onClick={() => { haptics.medium(); setActiveFilter({ type: 'actor', value: name }); }}
                    className="flex justify-between items-center group w-full text-left"
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-[10px] font-black text-stone-200 w-4">{i + 1}</span>
                      <span className="text-sm font-bold text-charcoal group-hover:text-forest transition-colors">{name}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-black text-stone-300">{count} films</span>
                        <ChevronRight size={14} className="text-stone-200 group-hover:text-charcoal group-hover:translate-x-1 transition-all" />
                    </div>
                  </button>
                ))}
              </div>
            </div>

            <div className="h-px bg-stone-100" />

            {/* Top Genres */}
            <div>
              <div className="flex items-center gap-2 mb-6 opacity-30">
                <Tags size={14} />
                <h4 className="text-[10px] font-black uppercase tracking-widest">Genres Favoris</h4>
              </div>
              <div className="flex flex-wrap gap-2">
                {stats.tops.genres.map(([name, count]) => (
                  <button 
                    key={name} 
                    onClick={() => { haptics.medium(); setActiveFilter({ type: 'genre', value: name }); }}
                    className="bg-stone-50 border border-stone-100 px-4 py-2 rounded-xl flex items-center gap-3 hover:border-lime-400 hover:bg-white transition-all active:scale-95"
                  >
                    <span className="text-xs font-bold text-charcoal">{name}</span>
                    <span className="bg-charcoal text-white px-2 py-0.5 rounded text-[8px] font-black">{count}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* --- HIDDEN SWISS MODERN STORY TEMPLATE (9:16) --- */}
      {/* 
          IMPORTANT: Pour que html2canvas fonctionne, l'élément ne doit PAS être en display:none ou visibility:hidden.
          On utilise une position fixed hors écran mais avec opacity:1 au moment du clone, ou z-index négatif.
          Ici, on le place derrière tout le contenu.
      */}
      <div 
        id="story-wrapper"
        style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            width: '1px', 
            height: '1px', 
            overflow: 'hidden', 
            zIndex: -9999,
            pointerEvents: 'none'
        }}
      >
          <div 
            ref={storyRef}
            id="story-container"
            className="w-[1080px] h-[1920px] bg-[#0c0c0c] text-white p-[100px] flex flex-col font-sans"
            style={{ 
                fontFamily: 'Inter, sans-serif',
                transformOrigin: 'top left',
            }}
          >
            {/* Story Header */}
            <div className="flex justify-between items-center mb-[120px]">
                <span className="text-lime-400 text-3xl font-black uppercase tracking-[0.4em]">The Bitter</span>
                <span className="text-stone-500 text-3xl font-bold uppercase tracking-[0.2em]">Recap 2026</span>
            </div>

            {/* Main Stat: COUNT */}
            <div className="mb-[140px]">
                <span className="block text-[480px] font-black leading-[0.8] text-white tracking-tighter -ml-6">
                    {stats.count}
                </span>
                <span className="block text-5xl font-bold text-stone-500 uppercase tracking-[0.3em] mt-10 ml-4">
                    Films Analysés
                </span>
            </div>

            {/* BENTO GRID VISUAL */}
            <div className="flex-1 grid grid-cols-2 gap-8 content-start">
                {/* Archetype Box */}
                <div className="bg-[#141414] rounded-[60px] p-[60px] flex flex-col justify-between border border-white/10 aspect-square">
                    <div className="w-24 h-24 bg-lime-400 rounded-full flex items-center justify-center text-black">
                        {React.cloneElement(stats.vibeInsight.icon as React.ReactElement<any>, { size: 50 })}
                    </div>
                    <div>
                        <span className="block text-2xl font-black text-stone-500 uppercase tracking-widest mb-4">Profil</span>
                        <span className="block text-5xl font-black text-white leading-tight">{userProfile?.role || stats.vibeInsight.label}</span>
                    </div>
                </div>

                {/* Top Genre Box */}
                <div className="bg-lime-400 rounded-[60px] p-[60px] flex flex-col justify-between aspect-square">
                    <div className="w-24 h-24 bg-black rounded-full flex items-center justify-center text-lime-400">
                        <Tags size={50} />
                    </div>
                    <div>
                        <span className="block text-2xl font-black text-black/60 uppercase tracking-widest mb-4">Obsession</span>
                        <span className="block text-5xl font-black text-black leading-tight break-words">
                            {stats.tops.genres[0]?.[0] || 'Cinéma'}
                        </span>
                    </div>
                </div>

                {/* Wide Stat Box */}
                <div className="col-span-2 bg-[#141414] rounded-[60px] p-[60px] border border-white/10 flex items-center justify-between">
                    <div>
                        <span className="block text-2xl font-black text-stone-500 uppercase tracking-widest mb-2">Smartphone Factor</span>
                        <span className="block text-6xl font-black text-white">{stats.averages.smartphone}%</span>
                    </div>
                    <div className="h-full w-[200px] bg-stone-800 rounded-3xl overflow-hidden relative">
                        <div 
                            className="absolute bottom-0 left-0 right-0 bg-lime-400" 
                            style={{ height: `${stats.averages.smartphone}%` }} 
                        />
                    </div>
                </div>
            </div>
            
            {/* Footer */}
            <div className="mt-auto pt-[80px] flex justify-between items-center opacity-60">
                <span className="text-3xl font-bold text-stone-500">Généré par The Bitter App</span>
                <div className="w-20 h-20 bg-white rounded-2xl" />
            </div>
          </div>
      </div>

      {/* MODALE DE DRILL-DOWN */}
      {activeFilter && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 sm:p-10">
          <div 
            className="absolute inset-0 bg-charcoal/80 backdrop-blur-md animate-[fadeIn_0.3s_ease-out]" 
            onClick={() => setActiveFilter(null)} 
          />
          <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl relative z-10 flex flex-col max-h-[80vh] overflow-hidden animate-[scaleIn_0.3s_cubic-bezier(0.16,1,0.3,1)]">
             <div className="p-8 pb-6 flex justify-between items-center border-b border-sand">
                <div className="flex items-center gap-3">
                    <div className="bg-lime-400 p-3 rounded-2xl text-charcoal">
                        {activeFilter.type === 'actor' ? <User size={20} /> : activeFilter.type === 'director' ? <Clapperboard size={20} /> : <Tags size={20} />}
                    </div>
                    <div>
                        <h3 className="text-2xl font-black text-charcoal tracking-tight leading-none mb-1">
                            {activeFilter.type === 'actor' ? 'Acteur' : activeFilter.type === 'director' ? 'Réalisateur' : 'Genre'}
                        </h3>
                        <p className="text-xs font-bold text-stone-400 uppercase tracking-widest">{activeFilter.value}</p>
                    </div>
                </div>
                <button onClick={() => setActiveFilter(null)} className="p-2.5 bg-stone-100 rounded-full text-stone-500 hover:bg-stone-200 transition-all">
                    <X size={20} strokeWidth={2.5} />
                </button>
             </div>

             <div className="flex-1 overflow-y-auto p-6 space-y-4 no-scrollbar">
                <p className="text-[10px] font-black text-stone-300 uppercase tracking-widest px-2 mb-2">Films vus — Classés par note</p>
                {drillDownData.map((movie) => {
                  const rating = ((movie.ratings.story + movie.ratings.visuals + movie.ratings.acting + movie.ratings.sound) / 4).toFixed(1);
                  const score = parseFloat(rating);
                  const ratingColor = score >= 8 ? 'bg-emerald-500' : score >= 5 ? 'bg-yellow-400' : 'bg-red-500';
                  
                  return (
                    <div key={movie.id} className="bg-stone-50 p-4 rounded-2xl border border-stone-100 flex gap-4 group">
                       <div className="w-16 h-24 rounded-xl overflow-hidden bg-stone-200 shrink-0 shadow-sm border border-white">
                          {movie.posterUrl ? <img src={movie.posterUrl} className="w-full h-full object-cover" alt="" /> : <Film size={20} className="m-auto mt-8 opacity-20" />}
                       </div>
                       <div className="flex-1 min-w-0 py-1">
                          <h4 className="font-black text-charcoal leading-tight mb-1 truncate">{movie.title}</h4>
                          <p className="text-[10px] font-bold text-stone-400 uppercase tracking-wider mb-3">Sortie {movie.year}</p>
                          <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-white shadow-sm ${ratingColor}`}>
                             <Star size={10} fill="currentColor" />
                             <span className="text-xs font-black">{rating}</span>
                          </div>
                       </div>
                    </div>
                  );
                })}
             </div>
          </div>
        </div>
      )}

      {/* FOOTER ACTION */}
      <div className="px-6 pt-4">
        <button 
          onClick={() => { haptics.medium(); onRecalibrate?.(); }}
          className="w-full py-4 rounded-2xl border-2 border-dashed border-stone-200 text-[9px] font-black uppercase tracking-[0.2em] text-stone-300 hover:text-charcoal hover:border-stone-300 transition-all flex items-center justify-center gap-2"
        >
          <Settings2 size={12} /> Refaire ma calibration psychologique
        </button>
      </div>

    </div>
  );
};

export default AnalyticsView;
