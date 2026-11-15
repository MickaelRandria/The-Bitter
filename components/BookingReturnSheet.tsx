import React, { useEffect, useState } from 'react';
import { ArrowLeft, Bell, Check, ChevronRight, Clock, ExternalLink, Loader2, QrCode, Send, Ticket, Users, X } from 'lucide-react';
import type { CinemaScreening } from '../types';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { usePosterColors } from '../utils/posterTint';
import { avatarSrc } from '../utils/avatar';
import { confirmScreening, deleteScreening, linkScreeningToPlan } from '../services/screenings';
import { getSpaceMembers, getSpaceMovies, SharedSpace, SpaceMember } from '../services/supabase';
import { proposePlan } from '../services/plans';
import { proposeSuggestion } from '../services/spaceSuggestions';
import { asShareable, proposeToPeople } from '../services/social';
import { getMovieDetailsForAdd } from '../services/tmdb';
import { slotFromScreening } from '../utils/myPlace';
import { placeWhen } from './MyPlacePill';
import type { BookingReturnStep } from '../services/bookingReturn';

/** Où se trouvent les billets dans le compte UGC. */
export const UGC_RESERVATIONS_URL = 'https://www.ugc.fr/profil.html';

type Step = BookingReturnStep | 'done' | 'invite';

interface Props {
  screening: CinemaScreening;
  initialStep?: BookingReturnStep;
  profileId: string;
  spaces: SharedSpace[];
  /** « Importer mon billet » : l'import habituel, qui confirme la séance et y attache le QR code. */
  onImportTicket: () => void;
  /** « Choisir une autre séance » : le programme du film dans mes cinémas. */
  onPickAnother: (film: { tmdbId: number; title: string; posterUrl?: string }) => void;
  onOpenCalendar: () => void;
  onClose: () => void;
  onToast?: (message: string) => void;
}

/**
 * « Alors, tu as tes places ? » — au retour d'UGC, depuis la carte du calendrier
 * ou depuis la notification de la veille.
 *
 * Rien n'est tenu pour acquis : la séance reste « à confirmer » tant que la
 * personne n'a pas dit oui (billet importé ou confirmation à la main). « Non »
 * la retire. Une fois confirmée, on propose d'inviter : un espace d'abord,
 * puis, pour préciser, les personnes de cet espace.
 */
const BookingReturnSheet: React.FC<Props> = ({
  screening,
  initialStep = 'ask',
  profileId,
  spaces,
  onImportTicket,
  onPickAnother,
  onOpenCalendar,
  onClose,
  onToast,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('booking.title', { title: screening.title }));
  const colors = usePosterColors(screening.posterUrl);
  const ground = colors?.deep ?? '#15182A';
  const [step, setStep] = useState<Step>(screening.status === 'scheduled' ? 'done' : initialStep);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [space, setSpace] = useState<SharedSpace | null>(null);
  const [members, setMembers] = useState<SpaceMember[] | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const when = placeWhen(screening, t('place.locale'));

  useEffect(() => {
    if (!space) return;
    let alive = true;
    setMembers(null);
    void getSpaceMembers(space.id).then((result) => {
      if (!alive) return;
      const others = (result.data ?? []).filter((m) => m.profile_id !== profileId);
      setMembers(others);
      setPicked(others.map((m) => m.profile_id));
    });
    return () => {
      alive = false;
    };
  }, [space, profileId]);

  /** `true` si c'est fait ; sinon `false` (message générique) ou le message du serveur. */
  const run = async (key: string, action: () => Promise<boolean | string>) => {
    if (busy) return;
    setBusy(key);
    setError('');
    const outcome = await action();
    setBusy(null);
    if (outcome !== true) {
      haptics.error();
      setError(typeof outcome === 'string' ? outcome : t('booking.failed'));
    }
  };

  const confirm = () =>
    run('confirm', async () => {
      const result = await confirmScreening(screening.id);
      if (!result.ok) return false;
      haptics.success();
      setStep('done');
      return true;
    });

  const release = (another: boolean) =>
    run(another ? 'another' : 'remove', async () => {
      const result = await deleteScreening(screening.id);
      if (!result.ok) return false;
      haptics.soft();
      onClose();
      if (another && screening.tmdbId) {
        onPickAnother({ tmdbId: screening.tmdbId, title: screening.title, posterUrl: screening.posterUrl });
      } else {
        onToast?.(t('booking.released', { title: screening.title }));
      }
      return true;
    });

  /**
   * Tout l'espace : le film y entre s'il n'y est pas, et la séance y est proposée.
   * Quelques personnes seulement : le serveur choisit le plus petit espace qui
   * les réunit (ou en crée un à deux). Dans les deux cas, ma séance est rattachée
   * à l'invitation : quand l'autre accepte, rien ne s'ajoute en double à mon calendrier.
   */
  const invite = () =>
    run('invite', async () => {
      if (!space || !members || !picked.length || !screening.tmdbId) return false;
      const slot = slotFromScreening(screening);
      let planId: string | undefined;
      if (picked.length === members.length) {
        const films = await getSpaceMovies(space.id);
        let sharedId = (films.data ?? []).find((m) => m.tmdb_id === screening.tmdbId)?.id;
        if (!sharedId) {
          const added = await proposeSuggestion(space.id, profileId, { tmdbId: screening.tmdbId });
          sharedId = added.movie?.id;
        }
        if (!sharedId) return false;
        const result = await proposePlan(sharedId, [slot]);
        if (!result.ok) return result.error ?? false;
        planId = result.planId;
      } else {
        const details = await getMovieDetailsForAdd(screening.tmdbId);
        if (!details) return false;
        const result = await proposeToPeople('watch', asShareable(details), picked, [slot]);
        if (result.error || !result.data) return result.error ?? false;
        planId = (result.data as { plan_id?: string }).plan_id;
      }
      if (planId) await linkScreeningToPlan(screening.id, planId);
      haptics.success();
      const names = (members ?? []).filter((m) => picked.includes(m.profile_id)).map((m) => m.profile?.first_name).filter(Boolean);
      onToast?.(
        picked.length === members.length
          ? t('booking.invitedSpace', { space: space.name })
          : t('booking.invitedPeople', { names: names.join(', ') })
      );
      onClose();
      return true;
    });

  const cardTicket = (
    <div className="mt-4 flex items-center gap-3 rounded-[18px] bg-cream p-2.5 text-charcoal">
      {screening.posterUrl && <img src={screening.posterUrl} alt="" className="h-[69px] w-[46px] shrink-0 rounded-[9px] object-cover" />}
      <div className="min-w-0">
        <p className="truncate text-[15px] font-black tracking-[-0.03em]">{screening.title}</p>
        <p className="mt-0.5 truncate text-[11px] font-bold text-stone-500">{[when, screening.format].filter(Boolean).join(' · ')}</p>
        {screening.cinemaName && <p className="truncate text-[11px] font-bold text-stone-500">{screening.cinemaName}</p>}
        <span
          className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-[9.5px] font-black ${
            step === 'done' ? 'bg-bitter-lime text-charcoal' : 'border-[1.5px] border-dashed border-stone-400 text-stone-500'
          }`}
        >
          {t(step === 'done' ? 'place.yours' : 'booking.pendingPill')}
        </span>
      </div>
    </div>
  );

  const bigButton = 'flex h-[50px] w-full items-center justify-center gap-2 rounded-full text-[13.5px] font-black transition active:scale-[0.98] disabled:opacity-60';
  const choice = (main: boolean) =>
    `mt-2.5 flex w-full items-start gap-3 rounded-[20px] p-3.5 text-left transition active:scale-[0.99] disabled:opacity-60 ${
      main ? 'bg-bitter-lime text-charcoal' : 'border border-white/10 bg-white/[0.07] text-white'
    }`;
  const spinner = (key: string) => (busy === key ? <Loader2 size={16} className="animate-spin" /> : null);

  return (
    <div {...dialog.props} className="fixed inset-0 z-[230] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-black/55 backdrop-blur-[2px]" onClick={onClose} aria-label={t('showtimes.close')} tabIndex={-1} />
      <section
        className="relative max-h-[94vh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-[28px] text-white sm:rounded-[28px]"
        style={{ background: ground }}
      >
        {screening.posterUrl && (
          <img
            src={screening.posterUrl}
            alt=""
            aria-hidden="true"
            className="pointer-events-none absolute -left-10 -top-16 h-[340px] w-[calc(100%+5rem)] object-cover opacity-55 blur-[40px] saturate-[1.3]"
          />
        )}
        <div className="pointer-events-none absolute inset-0" style={{ background: `linear-gradient(180deg, transparent 0%, ${ground} 52%)` }} />

        <div className="relative px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
          <div className="mx-auto mb-3 h-[5px] w-10 rounded-full bg-white/25" aria-hidden="true" />
          <div className="flex items-start justify-between gap-3">
            {step === 'yes' || step === 'no' || step === 'invite' ? (
              <button
                onClick={() => {
                  if (step === 'invite' && space) setSpace(null);
                  else setStep(step === 'invite' ? 'done' : 'ask');
                }}
                aria-label={t('booking.back')}
                className="grid h-10 w-10 place-items-center rounded-full bg-white/10"
              >
                <ArrowLeft size={17} />
              </button>
            ) : (
              <span />
            )}
            <button onClick={onClose} aria-label={t('showtimes.close')} className="grid h-10 w-10 place-items-center rounded-full bg-white/10">
              <X size={17} />
            </button>
          </div>

          {step === 'ask' && (
            <>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">{t('booking.kicker')}</p>
              <h2 className="mt-1.5 text-[27px] font-black leading-none tracking-[-0.05em]">{t('booking.askTitle')}</h2>
              {cardTicket}
              <div className="mt-4 grid gap-2">
                <button onClick={() => setStep('yes')} className={`${bigButton} bg-bitter-lime text-charcoal`}>
                  <Check size={17} strokeWidth={2.8} /> {t('booking.haveTickets')}
                </button>
                <button
                  onClick={() => {
                    onToast?.(t('booking.later'));
                    onClose();
                  }}
                  className={`${bigButton} border-[1.5px] border-white/25`}
                >
                  <Clock size={16} /> {t('booking.notYet')}
                </button>
                <button onClick={() => setStep('no')} className="h-10 text-[12.5px] font-extrabold text-white/75">
                  {t('booking.notBooked')}
                </button>
              </div>
              {screening.bookingUrl && (
                <a
                  href={screening.bookingUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 flex items-center justify-center gap-1.5 text-[12px] font-extrabold text-bitter-lime underline underline-offset-4"
                >
                  <ExternalLink size={13} /> {t('booking.backToBooking')}
                </a>
              )}
            </>
          )}

          {step === 'yes' && (
            <>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">
                {screening.title} · {when}
              </p>
              <h2 className="mt-1.5 text-[27px] font-black leading-none tracking-[-0.05em]">{t('booking.yesTitle')}</h2>
              <p className="mt-2 text-[12.5px] font-semibold leading-snug text-white/70">{t('booking.yesBody')}</p>

              <button
                onClick={() => {
                  onClose();
                  onImportTicket();
                }}
                className={choice(true)}
              >
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-charcoal text-bitter-lime">
                  <QrCode size={18} />
                </span>
                <span>
                  <b className="block text-[14px] font-black tracking-[-0.02em]">{t('booking.import')}</b>
                  <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug opacity-75">{t('booking.importBody')}</span>
                </span>
              </button>
              <ol className="mt-3 space-y-1.5 text-[11.5px] font-bold text-white/85">
                {[t('booking.step1'), t('booking.step2', { title: screening.title }), t('booking.step3')].map((label, index) => (
                  <li key={index} className="flex items-center gap-2">
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-bitter-lime/15 text-[10px] font-black text-bitter-lime">{index + 1}</span>
                    {label}
                  </li>
                ))}
              </ol>
              <a
                href={UGC_RESERVATIONS_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-2.5 flex items-center justify-center gap-1.5 text-[12px] font-extrabold text-bitter-lime underline underline-offset-4"
              >
                <ExternalLink size={13} /> {t('booking.openReservations')}
              </a>

              <button onClick={() => void confirm()} disabled={!!busy} className={choice(false)}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10">
                  {spinner('confirm') ?? <Check size={18} />}
                </span>
                <span>
                  <b className="block text-[14px] font-black tracking-[-0.02em]">{t('booking.confirmNoTicket')}</b>
                  <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug opacity-75">{t('booking.confirmNoTicketBody')}</span>
                </span>
              </button>
            </>
          )}

          {step === 'done' && (
            <>
              <div className="mx-auto mt-3 grid h-16 w-16 place-items-center rounded-full bg-bitter-lime text-charcoal">
                <Check size={30} strokeWidth={3} />
              </div>
              <p className="mt-3 text-center text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">{t('booking.doneKicker')}</p>
              <h2 className="mt-1.5 text-center text-[26px] font-black leading-none tracking-[-0.05em]">
                {t('booking.doneTitle', { title: screening.title })}
              </h2>
              <p className="mt-2 text-center text-[12.5px] font-semibold text-white/70">
                {[when, screening.cinemaName].filter(Boolean).join(' · ')}
              </p>
              <div className="mt-4 grid gap-2">
                <p className="flex items-center gap-2.5 rounded-2xl bg-white/[0.07] px-3 py-2.5 text-[12.5px] font-bold">
                  {screening.ticketCode ? <QrCode size={15} className="text-bitter-lime" /> : <Ticket size={15} className="text-bitter-lime" />}
                  {t(screening.ticketCode ? 'booking.doneQr' : 'booking.doneNoQr')}
                </p>
                <p className="flex items-center gap-2.5 rounded-2xl bg-white/[0.07] px-3 py-2.5 text-[12.5px] font-bold">
                  <Bell size={15} className="text-bitter-lime" /> {t('booking.doneReminders')}
                </p>
              </div>
              <div className="mt-4 grid gap-2">
                {screening.tmdbId && spaces.length > 0 && (
                  <button onClick={() => setStep('invite')} className={`${bigButton} bg-bitter-lime text-charcoal`}>
                    <Users size={16} /> {t('booking.invite')}
                  </button>
                )}
                <button
                  onClick={() => {
                    onClose();
                    onOpenCalendar();
                  }}
                  className={`${bigButton} border-[1.5px] border-white/25`}
                >
                  {t('booking.seeSession')}
                </button>
              </div>
            </>
          )}

          {step === 'invite' && !space && (
            <>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">{screening.title} · {when}</p>
              <h2 className="mt-1.5 text-[27px] font-black leading-none tracking-[-0.05em]">{t('booking.inviteTitle')}</h2>
              <p className="mt-2 text-[12.5px] font-semibold text-white/70">{t('booking.inviteSpaces')}</p>
              <div className="mt-3 grid gap-2">
                {spaces.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => {
                      haptics.soft();
                      setSpace(s);
                    }}
                    className="flex min-h-[56px] w-full items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.07] px-3.5 text-left transition active:scale-[0.99]"
                  >
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-base" style={{ background: s.color || 'rgba(255,255,255,0.12)' }}>
                      {s.icon || '🎬'}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[14px] font-black tracking-[-0.02em]">{s.name}</span>
                    <ChevronRight size={17} className="text-white/50" />
                  </button>
                ))}
              </div>
            </>
          )}

          {step === 'invite' && space && (
            <>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">{space.name}</p>
              <h2 className="mt-1.5 text-[27px] font-black leading-none tracking-[-0.05em]">{t('booking.invitePeopleTitle')}</h2>
              <p className="mt-2 text-[12.5px] font-semibold text-white/70">{t('booking.invitePeopleBody')}</p>
              {members === null ? (
                <div className="flex justify-center py-8">
                  <Loader2 size={20} className="animate-spin text-white/60" />
                </div>
              ) : members.length === 0 ? (
                <p className="py-6 text-[12.5px] font-semibold text-white/70">{t('booking.inviteNobody')}</p>
              ) : (
                <div className="mt-3 grid grid-cols-4 gap-3">
                  {members.map((m) => {
                    const on = picked.includes(m.profile_id);
                    const src = avatarSrc(m.profile?.avatar_url ?? null);
                    return (
                      <button
                        key={m.profile_id}
                        aria-pressed={on}
                        onClick={() => {
                          haptics.soft();
                          setPicked((list) => (on ? list.filter((id) => id !== m.profile_id) : [...list, m.profile_id]));
                        }}
                        className="flex flex-col items-center gap-1.5"
                      >
                        <span
                          className={`relative grid h-14 w-14 place-items-center overflow-hidden rounded-full text-lg font-black ring-2 ${
                            on ? 'ring-bitter-lime' : 'bg-white/10 opacity-50 ring-transparent'
                          }`}
                        >
                          {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (m.profile?.first_name || '?').charAt(0).toUpperCase()}
                          {on && (
                            <span className="absolute bottom-0 right-0 grid h-5 w-5 place-items-center rounded-full bg-bitter-lime text-charcoal">
                              <Check size={12} strokeWidth={3} />
                            </span>
                          )}
                        </span>
                        <span className="max-w-full truncate text-[11px] font-bold">{m.profile?.first_name}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {members && members.length > 0 && (
                <button
                  onClick={() => void invite()}
                  disabled={!picked.length || !!busy}
                  className={`${bigButton} mt-5 bg-bitter-lime text-charcoal`}
                >
                  {spinner('invite') ?? <Send size={15} />}
                  {picked.length === members.length
                    ? t('booking.inviteAll', { space: space.name })
                    : picked.length
                      ? t('booking.invitePicked', {
                          names: members.filter((m) => picked.includes(m.profile_id)).map((m) => m.profile?.first_name).join(', '),
                        })
                      : t('booking.invitePick')}
                </button>
              )}
            </>
          )}

          {step === 'no' && (
            <>
              <p className="mt-2 text-[10px] font-black uppercase tracking-[0.2em] text-bitter-lime">{t('booking.noKicker')}</p>
              <h2 className="mt-1.5 text-[27px] font-black leading-none tracking-[-0.05em]">{t('booking.noTitle')}</h2>
              <p className="mt-2 text-[12.5px] font-semibold leading-snug text-white/70">{t('booking.noBody', { title: screening.title })}</p>
              {screening.tmdbId && (
                <button onClick={() => void release(true)} disabled={!!busy} className={choice(true)}>
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-charcoal text-bitter-lime">
                    {spinner('another') ?? <Clock size={18} />}
                  </span>
                  <span>
                    <b className="block text-[14px] font-black tracking-[-0.02em]">{t('booking.another')}</b>
                    <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug opacity-75">{t('booking.anotherBody')}</span>
                  </span>
                </button>
              )}
              <button onClick={() => void release(false)} disabled={!!busy} className={choice(false)}>
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10">{spinner('remove') ?? <X size={18} />}</span>
                <span>
                  <b className="block text-[14px] font-black tracking-[-0.02em]">{t('booking.remove')}</b>
                  <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug opacity-75">{t('booking.removeBody')}</span>
                </span>
              </button>
            </>
          )}

          {error && <p className="mt-3 text-center text-[12px] font-bold text-orange-300">{error}</p>}
        </div>
      </section>
    </div>
  );
};

export default BookingReturnSheet;
