import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Sparkles, Palette, Wrench } from 'lucide-react';
import { RELEASE_HISTORY, ChangeEntry, ChangeType } from '../constants/changelog';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_CONFIG: Record<ChangeType, { label: string, icon: any, color: string, bgColor: string }> = {
  feature: { label: '✨ NOUVEAUTÉS', icon: Sparkles, color: 'text-forest', bgColor: 'bg-forest/5' },
  style: { label: '🎨 INTERFACE', icon: Palette, color: 'text-tz-blue', bgColor: 'bg-tz-blue/5' },
  fix: { label: '🛠️ CORRECTIFS', icon: Wrench, color: 'text-tz-orange', bgColor: 'bg-tz-orange/5' },
};

const CategorizedChanges = ({ changes }: { changes: ChangeEntry[] }) => {
  const grouped = changes.reduce((acc, change) => {
    if (!acc[change.type]) acc[change.type] = [];
    acc[change.type].push(change);
    return acc;
  }, {} as Record<ChangeType, ChangeEntry[]>);

  return (
    <div className="space-y-6 mt-6 animate-[fadeIn_0.3s_ease-out]">
      {(['feature', 'style', 'fix'] as ChangeType[]).map((type) => {
        const group = grouped[type];
        if (!group || group.length === 0) return null;

        const config = CATEGORY_CONFIG[type];
        const Icon = config.icon;

        return (
          <div key={type} className="space-y-3">
            <div className={`inline-flex items-center gap-2 px-3 py-1 rounded-full ${config.bgColor} ${config.color} text-[9px] font-black tracking-[0.15em]`}>
              <Icon size={12} strokeWidth={3} />
              {config.label}
            </div>
            <ul className="space-y-2.5 pl-4 border-l-2 border-stone-100 ml-2">
              {group.map((change, idx) => (
                <li key={idx} className="text-sm font-medium text-stone-600 leading-relaxed pl-3 relative">
                  <span className="absolute left-[-2px] top-[9px] w-1 h-1 rounded-full bg-stone-300" />
                  {change.text}
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
};

const ChangelogModal: React.FC<ChangelogModalProps> = ({ isOpen, onClose }) => {
  // Par défaut, la première version (la plus récente) est ouverte
  const [expandedVersion, setExpandedVersion] = useState<string | null>(RELEASE_HISTORY[0]?.version || null);

  if (!isOpen) return null;

  const toggleVersion = (version: string) => {
    setExpandedVersion(expandedVersion === version ? null : version);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/60 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      
      <div className="relative z-10 bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-[scaleIn_0.3s_ease-out]">
        {/* Header */}
        <div className="p-8 pb-6 flex justify-between items-center border-b border-sand">
          <div>
            <h3 className="text-3xl font-black text-charcoal tracking-tighter leading-none">Journal de bord</h3>
            <p className="text-[10px] font-black uppercase text-stone-400 tracking-[0.2em] mt-2">ÉVOLUTIONS DE L'APPLICATION</p>
          </div>
          <button onClick={onClose} className="p-3 bg-stone-50 rounded-full text-stone-500 hover:bg-stone-100 transition-all active:scale-90">
            <X size={20} strokeWidth={2.5} />
          </button>
        </div>

        {/* Versions List */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar space-y-4">
          {RELEASE_HISTORY.map((release, index) => {
            const isExpanded = expandedVersion === release.version;
            
            return (
              <div 
                key={release.version} 
                className={`rounded-[2rem] border transition-all duration-500 overflow-hidden ${
                  isExpanded 
                    ? 'bg-stone-50 border-sand shadow-sm' 
                    : 'bg-white border-transparent hover:bg-stone-50/50'
                }`}
              >
                <button 
                  onClick={() => toggleVersion(release.version)}
                  className={`w-full flex items-center justify-between text-left p-6 transition-colors ${isExpanded ? 'bg-white/50' : 'hover:bg-transparent'}`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col items-center">
                        <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg transition-all duration-300 ${
                            isExpanded ? 'bg-charcoal text-white scale-110' : 'bg-sand text-stone-400'
                        }`}>
                            {release.version}
                        </span>
                        {index === 0 && !isExpanded && (
                            <div className="w-1 h-1 bg-forest rounded-full mt-2 animate-pulse" />
                        )}
                    </div>
                    <div>
                      <h4 className={`font-black tracking-tight transition-colors duration-300 ${isExpanded ? 'text-charcoal text-xl' : 'text-stone-500'}`}>
                        {release.title}
                      </h4>
                      {!isExpanded && (
                        <p className="text-[10px] font-bold text-stone-300 uppercase tracking-widest mt-0.5">
                          {release.date}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className={`transition-all duration-300 ${isExpanded ? 'text-charcoal' : 'text-stone-300'}`}>
                    {isExpanded ? <ChevronUp size={20} strokeWidth={3} /> : <ChevronDown size={20} strokeWidth={3} />}
                  </div>
                </button>

                <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                  <div className="overflow-hidden">
                    <div className="px-6 pb-8 pt-2">
                        <div className="text-[10px] font-bold text-stone-400 uppercase tracking-[0.2em] mb-4">
                          Déployé le {release.date}
                        </div>
                        <CategorizedChanges changes={release.changes} />
                    </div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-6 bg-white border-t border-sand text-center">
          <p className="text-[9px] font-black text-stone-300 uppercase tracking-[0.4em]">The Bitter — Heritage Edition</p>
        </div>
      </div>
    </div>
  );
};

export default ChangelogModal;
