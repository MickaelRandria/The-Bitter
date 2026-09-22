import React, { useState } from 'react';
import { Ban, ChevronDown, Loader2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { BlockedPerson, listBlockedPeople, unblockUser } from '../services/moderation';

/**
 * Les personnes bloquées, et de quoi revenir sur chaque blocage.
 *
 * Un blocage qu'on ne peut plus annuler serait un piège : la liste reste
 * accessible même quand la personne n'a plus d'espace en commun avec nous.
 */
const BlockedPeopleSection: React.FC = () => {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const [people, setPeople] = useState<BlockedPerson[] | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const toggle = async () => {
    haptics.soft();
    const next = !open;
    setOpen(next);
    if (next) setPeople(await listBlockedPeople());
  };

  const unblock = async (id: string) => {
    setPending(id);
    const result = await unblockUser(id);
    setPending(null);
    if (result.ok) setPeople((list) => (list ?? []).filter((p) => p.id !== id));
  };

  return (
    <div>
      <button
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center gap-4 p-4 rounded-2xl hover:bg-stone-50 dark:hover:bg-[#161616] transition-colors group"
      >
        <div className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center text-charcoal dark:text-white group-hover:scale-110 transition-transform shrink-0">
          <Ban size={14} />
        </div>
        <span className="flex-1 text-left text-xs font-black uppercase tracking-wide text-charcoal dark:text-white">
          {t('moderation.blockedList')}
        </span>
        <ChevronDown size={14} className={`text-stone-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="px-4 pb-2 space-y-2">
          {people === null ? (
            <Loader2 size={16} className="animate-spin text-stone-400 mx-auto" />
          ) : people.length === 0 ? (
            <p className="text-[11px] text-stone-400 dark:text-stone-500 pl-12">{t('moderation.blockedEmpty')}</p>
          ) : (
            people.map((person) => (
              <div key={person.id} className="flex items-center justify-between gap-3 pl-12">
                <span className="text-sm font-bold text-charcoal dark:text-white truncate">{person.firstName}</span>
                <button
                  onClick={() => unblock(person.id)}
                  disabled={pending === person.id}
                  className="px-3 py-1.5 rounded-xl border border-stone-200 dark:border-white/15 text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-300 disabled:opacity-50"
                >
                  {pending === person.id ? <Loader2 size={12} className="animate-spin" /> : t('moderation.unblock')}
                </button>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
};

export default BlockedPeopleSection;
