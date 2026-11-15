import React, { useEffect, useState } from 'react';
import { ExternalLink, Loader2, Sun, WifiOff, X } from 'lucide-react';
import { CinemaScreening } from '../types';
import { cachedTicketCode, decodeTicketCode } from '../utils/ticketCode';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { usePosterColors } from '../utils/posterTint';

interface Props {
  screening: CinemaScreening;
  title: string;
  posterUrl?: string;
  onClose: () => void;
}

type WakeLockSentinelLike = { release: () => Promise<void> };

/**
 * Le billet à présenter à l'entrée : le QR code redessiné à partir des octets
 * lus sur la capture, en grand, sur fond blanc.
 *
 * Il se lit aussi hors ligne (copie gardée sur l'appareil), et l'écran reste
 * allumé tant que le billet est ouvert. La luminosité, elle, ne se règle pas
 * depuis une page web : on le rappelle.
 */
const TicketQrSheet: React.FC<Props> = ({ screening, title, posterUrl, onClose }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('ticket.label', { title }));
  const colors = usePosterColors(posterUrl);
  const ground = colors?.deep ?? '#17152C';
  const [image, setImage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const locale = t('place.locale');
  const day = new Intl.DateTimeFormat(locale, { weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(screening.startsAt));
  const hour = new Intl.DateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(new Date(screening.startsAt));
  const when = `${day.charAt(0).toUpperCase()}${day.slice(1)} · ${hour}`;

  useEffect(() => {
    const bytes = decodeTicketCode(screening.ticketCode ?? cachedTicketCode(screening.id));
    if (!bytes) {
      setFailed(true);
      return;
    }
    let alive = true;
    void import('qrcode')
      .then(({ default: QRCode }) =>
        QRCode.toDataURL([{ data: bytes, mode: 'byte' }], {
          errorCorrectionLevel: 'M',
          margin: 2,
          width: 720,
          color: { dark: '#000000', light: '#FFFFFF' },
        })
      )
      .then((url) => {
        if (alive) setImage(url);
      })
      .catch(() => {
        if (alive) setFailed(true);
      });
    return () => {
      alive = false;
    };
  }, [screening.id, screening.ticketCode]);

  // L'écran ne s'éteint pas pendant qu'on fait la queue devant la borne.
  useEffect(() => {
    let lock: WakeLockSentinelLike | null = null;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<WakeLockSentinelLike> } };
    void nav.wakeLock
      ?.request('screen')
      .then((sentinel) => {
        lock = sentinel;
      })
      .catch(() => undefined);
    return () => {
      void lock?.release().catch(() => undefined);
    };
  }, []);

  return (
    <div {...dialog.props} className="fixed inset-0 z-[220] flex items-end justify-center sm:items-center sm:p-4">
      <section
        className="relative flex h-full w-full max-w-lg flex-col overflow-y-auto text-white sm:h-auto sm:max-h-[92vh] sm:rounded-[2rem]"
        style={{ background: ground }}
      >
        {posterUrl && (
          <img
            src={posterUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -left-16 -top-20 h-[560px] w-[calc(100%+8rem)] object-cover opacity-50 blur-[50px] saturate-[1.3]"
          />
        )}
        <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${ground} 70%)` }} />

        <div className="relative flex flex-col gap-4 px-5 pb-[max(1.75rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">{t('ticket.kicker')}</p>
            <button
              onClick={onClose}
              aria-label={t('showtimes.close')}
              className="grid h-11 w-11 place-items-center rounded-full border border-white/25 bg-black/25 backdrop-blur-md"
            >
              <X size={18} />
            </button>
          </div>

          <div className="relative rounded-[26px] bg-white text-charcoal shadow-[0_40px_60px_-30px_rgba(0,0,0,0.85)]">
            <div className="flex items-center gap-3 p-3">
              {posterUrl && <img src={posterUrl} alt="" className="h-20 w-14 shrink-0 rounded-xl object-cover" />}
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-forest">{t('place.yours')}</p>
                <p className="mt-1 line-clamp-2 text-lg font-black leading-tight tracking-[-0.04em]">{title}</p>
                <p className="mt-0.5 truncate text-xs font-semibold text-stone-600">
                  {[when, screening.cinemaName, screening.format].filter(Boolean).join(' · ')}
                </p>
              </div>
            </div>
            <div className="relative h-5" aria-hidden="true">
              <span className="absolute -left-2.5 top-0 h-5 w-5 rounded-full" style={{ background: ground }} />
              <span className="absolute -right-2.5 top-0 h-5 w-5 rounded-full" style={{ background: ground }} />
              <span className="absolute left-5 right-5 top-[9px] border-t-2 border-dashed border-stone-200" />
            </div>
            <div className="flex flex-col items-center gap-3 px-6 pb-5 pt-2">
              {image ? (
                <img src={image} alt={t('ticket.qrAlt', { title })} className="aspect-square w-full max-w-[280px] [image-rendering:pixelated]" />
              ) : failed ? (
                <p className="py-10 text-center text-sm font-bold text-stone-600">{t('ticket.unreadable')}</p>
              ) : (
                <div className="grid aspect-square w-full max-w-[280px] place-items-center">
                  <Loader2 size={24} className="animate-spin text-stone-400" />
                </div>
              )}
              <p className="text-[11px] font-bold text-stone-500">{t('ticket.showAtGate')}</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <span className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] text-[11px] font-bold text-white/85">
              <Sun size={14} className="text-bitter-lime" /> {t('ticket.brightness')}
            </span>
            <span className="flex h-10 items-center justify-center gap-1.5 rounded-full border border-white/10 bg-white/[0.08] text-[11px] font-bold text-white/85">
              <WifiOff size={14} className="text-bitter-lime" /> {t('ticket.offline')}
            </span>
          </div>

          <a
            href={screening.bookingUrl || 'https://www.ugc.fr/'}
            target="_blank"
            rel="noopener noreferrer"
            className="flex h-12 items-center justify-center gap-2 rounded-full border border-white/25 text-[13px] font-extrabold"
          >
            <ExternalLink size={14} /> {t('ticket.fallback')}
          </a>
        </div>
      </section>
    </div>
  );
};

export default TicketQrSheet;
