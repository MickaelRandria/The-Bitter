import React from 'react';
import { Eye } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Ce que les autres membres voient.
 *
 * Un seul texte, affiché à quatre endroits : avant de créer un espace, avant d'en
 * rejoindre un, à la première ouverture, et en permanence dans les options. Le
 * dupliquer aurait garanti qu'une des copies finisse par mentir, alors que c'est
 * précisément l'énoncé qui ne doit jamais diverger de ce que l'app fait.
 */
const SharingNotice: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { t } = useLanguage();

  return (
    <div className="bg-orange-400/5 border border-orange-400/30 rounded-2xl p-4 space-y-2">
      <div className="flex items-center gap-2 text-orange-400">
        <Eye size={13} />
        <p className="text-[10px] font-black uppercase tracking-widest">
          {t('spaces.noticeTitle')}
        </p>
      </div>
      <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
        {t('spaces.noticeBody')}
      </p>
      {!compact && (
        <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
          {t('spaces.noticeControl')}
        </p>
      )}
    </div>
  );
};

export default SharingNotice;
