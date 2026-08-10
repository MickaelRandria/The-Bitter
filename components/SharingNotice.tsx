import React from 'react';
import { Eye, Check } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * Ce que les autres membres voient.
 *
 * Un seul texte, affiché à quatre endroits : avant de créer un espace, avant d'en
 * rejoindre un, à la première ouverture, et en permanence dans les options. Le
 * dupliquer aurait garanti qu'une des copies finisse par mentir, alors que c'est
 * précisément l'énoncé qui ne doit jamais diverger de ce que l'app fait.
 *
 * Écrit en liste et non en paragraphe : un paragraphe se survole, et deux points
 * y passaient inaperçus alors qu'ils décident de tout. Que le partage porte sur la
 * collection ENTIÈRE et non sur les seuls films ajoutés à l'espace. Et qu'il vaut
 * rétroactivement, pour ce qui a été noté avant même de rejoindre.
 */
const SharingNotice: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  const { t } = useLanguage();

  const items = [
    t('spaces.noticeItemCollection'),
    t('spaces.noticeItemRating'),
    t('spaces.noticeItemReview'),
    t('spaces.noticeItemDate'),
  ];

  return (
    <div className="bg-orange-400/5 border border-orange-400/30 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-orange-400">
        <Eye size={13} />
        <p className="text-[10px] font-black uppercase tracking-widest">
          {t('spaces.noticeTitle')}
        </p>
      </div>

      <ul className="space-y-1.5">
        {items.map((item) => (
          <li key={item} className="flex items-start gap-2">
            <span className="w-1 h-1 rounded-full bg-orange-400 shrink-0 mt-[7px]" />
            <span className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
              {item}
            </span>
          </li>
        ))}
      </ul>

      <p className="text-[11px] font-bold text-charcoal dark:text-white leading-relaxed">
        {t('spaces.noticeRetro')}
      </p>

      {!compact && (
        <div className="flex items-start gap-2 pt-1 border-t border-orange-400/20">
          <Check size={12} className="text-forest dark:text-lime-400 shrink-0 mt-[3px]" />
          <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
            {t('spaces.noticeControl')}
          </p>
        </div>
      )}
    </div>
  );
};

export default SharingNotice;
