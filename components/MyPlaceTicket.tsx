import React from 'react';
import { Loader2 } from 'lucide-react';
import { CinemaScreening } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { usePosterColors } from '../utils/posterTint';

export interface PlacePerson {
  id: string;
  name: string;
  /** Rond plein de l'avatar ; le mien est toujours citron. */
  color?: string;
  avatarUrl?: string;
  /** me : ma place ; coming : vient (même séance ou invitation acceptée) ; invited : invitation en attente. */
  state: 'me' | 'coming' | 'invited' | 'none';
}

interface Props {
  title: string;
  posterUrl?: string;
  screening: CinemaScreening;
  people: PlacePerson[];
  /** « Inviter Marie », « Inviter l'espace »… Absent : personne à inviter. */
  inviteLabel?: string;
  inviting?: boolean;
  onInvite?: () => void;
  /** Une ligne sous les avatars : « Invitation envoyée à Marie », « Vous y allez ensemble ». */
  note?: string;
}

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';

/**
 * Ma place pour ce film, telle qu'elle est dans mon calendrier : un vrai billet,
 * posé sur l'affiche floutée, et qui vient avec moi.
 *
 * Personne d'autre ne voit ce billet : l'espace ne sait que ce que j'en partage
 * en invitant.
 */
const MyPlaceTicket: React.FC<Props> = ({ title, posterUrl, screening, people, inviteLabel, inviting, onInvite, note }) => {
  const { t, language } = useLanguage();
  const colors = usePosterColors(posterUrl);
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const date = new Date(screening.startsAt);
  const day = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric' }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  const ground = colors?.deep ?? '#17152C';

  return (
    <div className="relative overflow-hidden rounded-[26px] text-white" style={{ background: ground }}>
      {posterUrl && (
        <img
          src={posterUrl}
          alt=""
          aria-hidden="true"
          className="pointer-events-none absolute -left-12 -right-12 -top-16 h-[120%] w-[calc(100%+6rem)] object-cover opacity-50 blur-[40px] saturate-[1.3]"
        />
      )}
      <div
        className="pointer-events-none absolute inset-0"
        style={{ background: `linear-gradient(180deg, transparent 0%, ${ground} 85%)` }}
      />

      <div className="relative space-y-4 p-4">
        <div className="flex items-center justify-between px-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/70">{t('place.kicker')}</p>
          <p className="text-[11px] font-bold text-bitter-lime">{t('place.inCalendar')}</p>
        </div>

        {/* Le billet */}
        <div className="relative rounded-[22px] bg-cream text-charcoal shadow-[0_30px_50px_-30px_rgba(0,0,0,0.8)]">
          <div className="flex gap-3.5 p-3">
            {posterUrl ? (
              <img src={posterUrl} alt="" className="h-[120px] w-[84px] shrink-0 rounded-[14px] object-cover" />
            ) : (
              <span className="h-[120px] w-[84px] shrink-0 rounded-[14px]" style={{ background: ground }} />
            )}
            <div className="flex min-w-0 flex-col justify-between py-1">
              <div>
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-forest">{t('place.yours')}</p>
                <p className="mt-1.5 line-clamp-2 text-xl font-black leading-none tracking-[-0.05em]">{title}</p>
              </div>
              <p className="truncate text-xs font-semibold text-stone-600">{screening.cinemaName || t('place.noCinema')}</p>
            </div>
          </div>

          <div className="relative h-5" aria-hidden="true">
            <span className="absolute -left-2.5 top-0 h-5 w-5 rounded-full" style={{ background: ground }} />
            <span className="absolute -right-2.5 top-0 h-5 w-5 rounded-full" style={{ background: ground }} />
            <span className="absolute left-5 right-5 top-[9px] border-t-2 border-dashed border-stone-200" />
          </div>

          <dl className="grid grid-cols-3 gap-3 px-4 pb-4 pt-1">
            <div>
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-stone-500">{t('place.day')}</dt>
              <dd className="mt-1 text-lg font-black capitalize tracking-[-0.04em]">{day}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-stone-500">{t('place.time')}</dt>
              <dd className="mt-1 text-lg font-black tracking-[-0.04em]">{time}</dd>
            </div>
            <div>
              <dt className="text-[9px] font-black uppercase tracking-[0.16em] text-stone-500">{t('place.version')}</dt>
              <dd className="mt-1 text-lg font-black tracking-[-0.04em]">{screening.format || '—'}</dd>
            </div>
          </dl>
        </div>

        {/* Qui vient */}
        <div className="space-y-3 px-1">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-white/60">{t('place.whoComes')}</p>
          <div className="flex items-center gap-3.5">
            <div className="-m-1.5 flex min-w-0 flex-1 gap-3 overflow-x-auto p-1.5 [scrollbar-width:none]">
              {people.map((person) => {
                const filled = person.state === 'me' || person.state === 'coming';
                return (
                  <div key={person.id} className="flex w-12 shrink-0 flex-col items-center gap-1.5">
                    <span
                      className={`grid h-11 w-11 place-items-center overflow-hidden rounded-full text-sm font-black ${
                        filled ? '' : 'border-[1.5px] border-dashed border-white/50 text-white/85'
                      }`}
                      style={
                        person.state === 'me'
                          ? { background: '#D9FF00', color: '#1A1A1A', boxShadow: `0 0 0 3px ${ground}, 0 0 0 5px #D9FF00` }
                          : filled
                            ? { background: person.color ?? '#F4C7A8', color: '#1A1A1A' }
                            : undefined
                      }
                    >
                      {person.avatarUrl && filled ? (
                        <img src={person.avatarUrl} alt="" className="h-full w-full object-cover" />
                      ) : (
                        initials(person.name)
                      )}
                    </span>
                    <span className={`w-full truncate text-center text-[11px] font-bold ${filled ? 'text-white/85' : 'text-white/55'}`}>
                      {person.state === 'me' ? t('place.you') : person.state === 'invited' ? `${person.name} ?` : person.name}
                    </span>
                  </div>
                );
              })}
            </div>
            {inviteLabel && onInvite && (
              <button
                onClick={onInvite}
                disabled={inviting}
                className="flex h-12 shrink-0 items-center gap-2 rounded-full bg-bitter-lime px-5 text-[13px] font-black tracking-[-0.01em] text-charcoal transition active:scale-95 disabled:opacity-60"
              >
                {inviting && <Loader2 size={14} className="animate-spin" />}
                {inviteLabel}
              </button>
            )}
          </div>
          {note && <p className="text-xs font-semibold text-white/75">{note}</p>}
        </div>
      </div>
    </div>
  );
};

export default MyPlaceTicket;
