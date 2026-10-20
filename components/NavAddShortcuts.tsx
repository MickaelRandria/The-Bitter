import React, { useEffect, useState } from 'react';
import { Film, Mic, Plus, Ticket, Tv } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { readNavDiscovery, subscribeNavDiscovery } from '../utils/navDiscovery';

export type NavShortcut = 'movie' | 'series' | 'ticket' | 'dictate';

const SHORTCUTS = [
  { kind: 'movie', icon: Film },
  { kind: 'series', icon: Tv },
  { kind: 'ticket', icon: Ticket },
  { kind: 'dictate', icon: Mic },
] as const;

/** Le menu du + reste accessible sans appui long, depuis l'écran ouvert. */
export default function NavAddShortcuts({ onAction }: { onAction: (kind: NavShortcut) => void }) {
  const { t } = useLanguage();
  const [learned, setLearned] = useState(() => readNavDiscovery().learned);
  useEffect(() => subscribeNavDiscovery(() => setLearned(readNavDiscovery().learned)), []);
  return (
    <div className="space-y-3 border-t border-stone-200 pt-5 dark:border-white/10">
      <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">{t('nav.shortcuts.other')}</p>
      <div className="flex flex-wrap gap-2">
        {SHORTCUTS.map(({ kind, icon: Icon }) => (
          <button
            key={kind}
            type="button"
            onClick={() => { haptics.soft(); onAction(kind); }}
            className="flex items-center gap-1.5 rounded-full bg-stone-100 px-3.5 py-2 text-xs font-black text-charcoal transition-transform active:scale-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest dark:bg-[#191919] dark:text-stone-200 dark:focus-visible:ring-bitter-lime"
          >
            <Icon size={14} aria-hidden="true" />
            {t(`nav.add.${kind}`)}
          </button>
        ))}
      </div>
      {!learned && (
        <p className="flex items-center gap-2 text-[11px] font-medium leading-snug text-stone-500 dark:text-stone-400">
          <span aria-hidden="true" className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-forest text-white ring-2 ring-bitter-lime"><Plus size={12} strokeWidth={3} /></span>
          {t('nav.discovery.faster')}
        </p>
      )}
    </div>
  );
}
