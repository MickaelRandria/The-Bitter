import React, { useState } from 'react';
import { X, ChevronDown, ChevronUp, Sparkles, Palette, Wrench } from 'lucide-react';
import { RELEASE_HISTORY, ChangeEntry, ChangeType } from '../constants/changelog';

interface ChangelogModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const CATEGORY_CONFIG: Record<ChangeType, { label: string, icon: any, color: string, bgColor: string }> = {
  feature: { label: '✨ NOUVEAUTÉS', icon: Sparkles, color: 'text-forest dark:text-lime-500', bgColor: 'bg-forest/5 dark:bg-forest/20' },
  style: { label: '🎨 INTERFACE', icon: Palette, color: 'text-blue-600 dark:text-blue-400', bgColor: 'bg-blue-50 dark:bg-blue-500/10' },
  fix: { label: '🛠️ CORRECTIFS', icon: Wrench, color: 'text-orange-600 dark:text-orange-400', bgColor: 'bg-orange-50 dark:bg-orange-500/10' },
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
            <ul className="space-y-2.5 pl-4 border-l-2 border-stone-100 dark:border-white/5 ml-2">
              {group.map((change, idx) => (
                <li key={idx} className="text-sm font-medium text-stone-600 dark:text-stone-400 leading-relaxed pl-3 relative">
                  <span className="absolute left-[-2px] top-[9px] w-1 h-1 rounded-full bg-stone-300 dark:bg-stone-700" />
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
  const [expandedVersion, setExpandedVersion] = useState<string | null>(RELEASE_HISTORY[0]?.version || null);
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6">
      <div className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]" onClick={onClose} />
      
      <div className="relative z-10 bg-white dark:bg-[#1a1a1a] w-full max-w-lg rounded-[2.5rem] shadow-2xl dark:shadow-black/60 flex flex-col max-h-[85vh] overflow-hidden animate-[scaleIn_0.3s_ease-out] border border-sand dark:border-white/10 transition-all">
        <div className="p-8 pb-6 flex justify-between items-center border-b border-sand dark:border-white/10 transition-colors">
          <div>
            <h3 className="text-3xl font-black text-charcoal dark:text-white tracking-tighter leading-none">Journal de bord</h3>
            <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-[0.2em] mt-2">ÉVOLUTIONS DE L'APPLICATION</p>
          </div>
          <button onClick={onClose} className="p-3 bg-stone-50 dark:bg-[#161616] rounded-full text-stone-500 hover:bg-stone-100 dark:hover:bg-[#202020] transition-all"><X size={20} strokeWidth={2.5} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 sm:p-6 no-scrollbar space-y-4">
          {RELEASE_HISTORY.map((release, index) => {
            const isExpanded = expandedVersion === release.version;
            return (
              <div key={release.version} className={`rounded-[2rem] border transition-all duration-500 overflow-hidden ${isExpanded ? 'bg-stone-50 dark:bg-[#161616] border-sand dark:border-white/10 shadow-sm' : 'bg-white dark:bg-[#1a1a1a] border-transparent hover:bg-stone-50/50 dark:hover:bg-[#161616]/50'}`}>
                <button onClick={() => setExpandedVersion(isExpanded ? null : release.version)} className="w-full flex items-center justify-between text-left p-6 transition-colors">
                  <div className="flex items-center gap-4">
                    <span className={`text-[10px] font-black px-2.5 py-1 rounded-lg transition-all ${isExpanded ? 'bg-charcoal dark:bg-white text-white dark:text-charcoal' : 'bg-sand dark:bg-[#202020] text-stone-400 dark:text-stone-600'}`}>{release.version}</span>
                    <div>
                      <h4 className={`font-black tracking-tight transition-colors ${isExpanded ? 'text-charcoal dark:text-white text-xl' : 'text-stone-500 dark:text-stone-400'}`}>{release.title}</h4>
                      {!isExpanded && <p className="text-[10px] font-bold text-stone-300 dark:text-stone-500 uppercase mt-0.5">{release.date}</p>}
                    </div>
                  </div>
                  {isExpanded ? <ChevronUp size={20} strokeWidth={3} className="text-charcoal dark:text-white" /> : <ChevronDown size={20} strokeWidth={3} className="text-stone-300 dark:text-stone-700" />}
                </button>
                <div className={`grid transition-all duration-500 ease-in-out ${isExpanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}><div className="overflow-hidden"><div className="px-6 pb-8 pt-2"><div className="text-[10px] font-bold text-stone-400 dark:text-stone-400 uppercase tracking-[0.2em] mb-4">Le {release.date}</div><CategorizedChanges changes={release.changes} /></div></div></div>
              </div>
            );
          })}
        </div>
        <div className="p-6 bg-white dark:bg-[#1a1a1a] border-t border-sand dark:border-white/10 text-center transition-colors"><p className="text-[9px] font-black text-stone-300 dark:text-stone-600 uppercase tracking-[0.4em]">The Bitter</p></div>
      </div>
    </div>
  );
};

export default ChangelogModal;