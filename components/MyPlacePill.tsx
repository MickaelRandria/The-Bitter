import React from 'react';
import { QrCode, Ticket } from 'lucide-react';
import type { CinemaScreening } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { openBookingReturn } from '../services/bookingReturn';

/** « sam. 22 · 20:15 » : de quoi reconnaître sa séance d'un coup d'œil. */
export function placeWhen(screening: Pick<CinemaScreening, 'startsAt'>, locale: string): string {
  const date = new Date(screening.startsAt);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', timeZone: 'Europe/Paris' }).format(date);
  const hour = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' }).format(date);
  return `${day} · ${hour}`;
}

/**
 * La même pastille partout où un film apparaît alors que j'ai déjà ma place :
 * carte « À voir », frise des sorties, Découvrir. Elle remplace « Séances » et
 * « Je veux voir » : il n'y a plus rien à chercher.
 */
const MyPlacePill: React.FC<{
  screening: CinemaScreening;
  onClick?: () => void;
  /** Le toucher ouvre le billet (QR code) : l'icône le dit. */
  ticket?: boolean;
  className?: string;
}> = ({ screening, onClick: onTap, ticket: hasTicket, className = '' }) => {
  let onClick = onTap;
  let ticket = hasTicket;
  const { t } = useLanguage();
  // Passé par UGC sans confirmer : rien n'est tenu pour acquis. Pointillés, et le
  // toucher repose la question plutôt que d'ouvrir un billet qui n'existe peut-être pas.
  const pending = screening.status === 'pending';
  if (pending) {
    onClick = () => openBookingReturn(screening.id);
    ticket = false;
  }
  const label = `${t(pending ? 'booking.pendingPill' : 'place.yours')} · ${placeWhen(screening, t('place.locale'))}`;
  const look = `inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-xs font-black shadow-sm ${
    pending
      ? 'border-[1.5px] border-dashed border-stone-400 bg-white text-charcoal dark:border-white/30 dark:bg-transparent dark:text-white'
      : 'bg-charcoal text-white dark:bg-white dark:text-charcoal'
  } ${className}`;
  const content = (
    <>
      {ticket ? (
        <QrCode size={14} strokeWidth={2.4} className="text-bitter-lime dark:text-forest" />
      ) : (
        <Ticket size={14} strokeWidth={2.4} className={pending ? 'text-stone-500 dark:text-stone-300' : 'text-bitter-lime dark:text-forest'} />
      )}
      <span className="truncate">{label}</span>
    </>
  );
  if (!onClick) return <span className={look}>{content}</span>;
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        haptics.soft();
        onClick();
      }}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
      className={`${look} transition active:scale-95`}
    >
      {content}
    </button>
  );
};

export default MyPlacePill;
