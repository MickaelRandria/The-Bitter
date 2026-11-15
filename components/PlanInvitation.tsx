import React from 'react';
import { ArrowUpRight, Clock3, Loader2, X } from 'lucide-react';
import type { PlanSlot } from '../services/plans';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { usePosterColors } from '../utils/posterTint';

interface Props {
  title: string;
  posterUrl?: string;
  proposerName: string;
  proposerColor?: string;
  slot: PlanSlot & { id: string };
  busy?: 'join' | 'ticket' | null;
  /** `hasTicket` : la personne a déjà sa place, on n'ouvre pas la réservation. */
  onJoin: (hasTicket: boolean) => void;
  onDecline: () => void;
  onClose: () => void;
}

const DAY_MS = 86_400_000;

/**
 * L'invitation reçue : quelqu'un a déjà sa place et propose de venir.
 *
 * Elle ne s'ouvre que sur invitation explicite — la notification, ou la carte
 * du film dans l'espace —, jamais parce qu'une séance est dans un calendrier.
 */
const PlanInvitation: React.FC<Props> = ({ title, posterUrl, proposerName, proposerColor, slot, busy, onJoin, onDecline, onClose }) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('invite.label', { name: proposerName }));
  const colors = usePosterColors(posterUrl);
  const ground = colors?.deep ?? '#17152C';
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const date = new Date(slot.starts_at);
  const weekday = new Intl.DateTimeFormat(locale, { weekday: 'long' }).format(date);
  const time = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date);
  const midnight = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const inDays = Math.round((midnight(date) - midnight(new Date())) / DAY_MS);
  const when =
    inDays <= 0 ? t('invite.today') : inDays === 1 ? t('invite.tomorrow') : t('invite.inDays', { n: String(inDays) });

  return (
    <div {...dialog.props} className="fixed inset-0 z-[120] flex items-end justify-center sm:items-center sm:p-4">
      <section
        className="relative flex h-full w-full max-w-lg flex-col overflow-hidden text-white sm:h-[min(860px,92vh)] sm:rounded-[2rem]"
        style={{ background: ground }}
      >
        {posterUrl && (
          <img src={posterUrl} alt="" className="absolute inset-0 h-full w-full object-cover" style={{ objectPosition: 'center 40%' }} />
        )}
        <div
          className="absolute inset-0"
          style={{
            background: `linear-gradient(180deg, rgba(0,0,0,0.5) 0%, rgba(0,0,0,0) 22%, rgba(0,0,0,0.05) 40%, color-mix(in srgb, ${ground} 93%, transparent) 62%, ${ground} 100%)`,
          }}
        />

        <header className="relative flex items-center gap-2.5 px-5 pt-[max(1.5rem,env(safe-area-inset-top))]">
          <span
            className="grid h-10 w-10 place-items-center rounded-full text-sm font-black text-charcoal"
            style={{ background: proposerColor ?? '#D9FF00' }}
          >
            {proposerName.charAt(0).toUpperCase()}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold">{t('invite.label', { name: proposerName })}</p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('showtimes.close')}
            className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/25 backdrop-blur-md"
          >
            <X size={18} />
          </button>
        </header>

        <div className="relative mt-auto space-y-4 px-5 pb-[max(2rem,env(safe-area-inset-bottom))]">
          <div>
            <p className="text-[10px] font-black uppercase tracking-[0.2em]" style={{ color: colors?.accent ?? '#F4C7A8' }}>
              {t('invite.hasPlace', { name: proposerName })}
            </p>
            <p className="mt-2.5 text-[40px] font-black capitalize leading-[0.95] tracking-[-0.06em]">
              {weekday}
              <br />
              {time}
            </p>
            <p className="mt-2.5 text-sm font-semibold text-white/80">
              {[title, slot.cinema_name, slot.version].filter(Boolean).join(' · ')}
            </p>
          </div>

          <p className="flex items-center gap-2.5 rounded-2xl border border-white/10 bg-white/[0.08] px-3.5 py-3 text-xs font-semibold text-white/85">
            <Clock3 size={16} className="shrink-0 text-bitter-lime" />
            {slot.booking_url ? t('invite.whenBook', { when }) : t('invite.whenNoLink', { when })}
          </p>

          <button
            onClick={() => onJoin(false)}
            disabled={!!busy}
            className="flex h-14 w-full items-center justify-center gap-2 rounded-full bg-bitter-lime text-[15px] font-black tracking-[-0.01em] text-charcoal transition active:scale-[0.98] disabled:opacity-60"
          >
            {busy === 'join' ? <Loader2 size={16} className="animate-spin" /> : null}
            {slot.booking_url ? t('invite.joinAndBook') : t('invite.join')}
            {slot.booking_url && busy !== 'join' && <ArrowUpRight size={16} strokeWidth={2.4} />}
          </button>
          <div className="grid grid-cols-2 gap-2.5">
            <button
              onClick={() => onJoin(true)}
              disabled={!!busy}
              className="flex h-12 items-center justify-center gap-1.5 rounded-full border border-white/35 bg-white/[0.06] text-[13px] font-extrabold disabled:opacity-60"
            >
              {busy === 'ticket' && <Loader2 size={14} className="animate-spin" />}
              {t('invite.haveTicket')}
            </button>
            <button
              onClick={onDecline}
              disabled={!!busy}
              className="h-12 rounded-full border border-white/20 text-[13px] font-bold text-white/75 disabled:opacity-60"
            >
              {t('invite.decline')}
            </button>
          </div>
        </div>
      </section>
    </div>
  );
};

export default PlanInvitation;
