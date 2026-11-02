import React, { useState } from 'react';
import ActionSheet from './ActionSheet';
import SeanceCard, { type SeanceChoice } from './SeanceCard';
import type { CinemaSubscription, FavoriteCinema } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';

/**
 * La séance demandée une fois, juste après l'enregistrement, quand la carte du
 * formulaire est restée sans réponse : « Tu l'as vu à l'UGC Rosny, hier à 20 h 45 ? »
 */
interface Props {
  film: { title: string; runtime?: number };
  initial: SeanceChoice;
  favoriteCinema?: FavoriteCinema;
  subscription?: CinemaSubscription;
  onConfirm: (choice: SeanceChoice) => void;
  onClose: () => void;
}

export default function SeancePrompt({ film, initial, favoriteCinema, subscription, onConfirm, onClose }: Props) {
  const { t, language } = useLanguage();
  const locale = language === 'fr' ? 'fr-FR' : 'en-GB';
  const [choice, setChoice] = useState<SeanceChoice>(initial);

  const change = (next: SeanceChoice) => {
    if (next.state === 'home') {
      haptics.soft();
      onClose();
      return;
    }
    if (next.state === 'confirmed') {
      haptics.success();
      onConfirm(next);
      return;
    }
    setChoice(next);
  };

  const when =
    choice.startsAt != null
      ? `${new Date(choice.startsAt).toDateString() === new Date().toDateString() ? t('seance.today') : t('seance.yesterdayLower')} ${
          choice.approximate ? '' : t('seance.at', { time: new Date(choice.startsAt).toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) })
        }`.trim()
      : '';

  return (
    <ActionSheet title={t('seance.promptTitle', { title: film.title })} subtitle={t('seance.promptSub')} onClose={onClose}>
      <div className="flex flex-col gap-3">
        {choice.state === 'ask' && choice.cinemaName && (
          <p className="text-[16px] font-black leading-snug text-charcoal dark:text-white">
            {t('seance.promptQuestion', { where: choice.cinemaName, when })}
          </p>
        )}
        <SeanceCard
          title={film.title}
          runtime={film.runtime}
          favoriteCinema={favoriteCinema}
          subscription={subscription}
          value={choice}
          onChange={change}
          compact
        />
        <button type="button" onClick={onClose} className="self-center py-2 text-[12px] font-extrabold text-stone-500 dark:text-stone-400">
          {t('seance.dontKnow')}
        </button>
      </div>
    </ActionSheet>
  );
}
