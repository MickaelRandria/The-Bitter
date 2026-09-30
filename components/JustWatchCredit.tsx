import React from 'react';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * TMDB tient ses plateformes de JustWatch et exige de le citer partout où on
 * les affiche : faute de quoi il révoque la clé API, celle de toute l'app.
 */
const JustWatchCredit: React.FC<{ className?: string }> = ({ className = '' }) => {
  const { t } = useLanguage();
  return (
    <p className={`text-[10px] font-medium text-stone-400 dark:text-stone-500 ${className}`}>
      {t('streaming.source')}{' '}
      <a
        href="https://www.justwatch.com/fr"
        target="_blank"
        rel="noopener noreferrer"
        className="font-bold underline decoration-current/30 underline-offset-2 hover:text-forest dark:hover:text-lime-500"
      >
        JustWatch
      </a>
    </p>
  );
};

export default JustWatchCredit;
