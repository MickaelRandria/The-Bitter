import React, { useEffect, useRef, useState } from 'react';
import { CalendarPlus, Check, CircleCheck, ImagePlus, Loader2, Ticket, TriangleAlert, X } from 'lucide-react';
import { CinemaScreening, CinemaScreeningInput, FavoriteCinema } from '../types';
import { confirmScreening, createScreening } from '../services/screenings';
import {
  MAX_TICKET_IMAGES,
  ScannedTicket,
  TicketFilm,
  TicketMatch,
  TicketShowing,
  findExistingScreening,
  findTicketFilm,
  localInstant,
  matchTickets,
  prepareTicketImage,
  scanTicketImages,
  ticketNotes,
} from '../services/ticketImport';
import { resizeTmdbImage } from '../utils/tmdbImage';
import TicketCaptureDemo from './TicketCaptureDemo';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';

interface TicketImportModalProps {
  profileId: string;
  /** Cinéma présumé d'un billet qui ne porte pas de nom de salle. */
  favoriteCinema?: FavoriteCinema;
  /** Les séances déjà au calendrier : un billet déjà planifié n'est pas recréé. */
  existingScreenings: CinemaScreening[];
  onClose: () => void;
  onImported: () => void;
  onAddToWatchlist?: (tmdbId: number) => void;
  /** Séance passée : la noter comme film vu ce jour-là. */
  onRateWatched?: (tmdbId: number, day: string) => void;
  onToast?: (message: string) => void;
}

interface TicketDraft {
  key: string;
  scanned: ScannedTicket;
  /** `null` : la vérification dans le programme n'a pas pu avoir lieu. */
  match: TicketMatch | null;
  film: TicketFilm | null;
  /** La séance UGC retenue : celle retrouvée, ou l'horaire choisi parmi les autres. */
  showing: TicketShowing | null;
  /** Jour et heure corrigés à la main, quand le programme n'a pas retrouvé la séance. */
  override: { date: string; time: string } | null;
  selected: boolean;
}

type Phase = 'pick' | 'reading' | 'checking' | 'review';

const DEFAULT_REMINDERS = [2_880, 30];
const REMINDER_CHOICES: [number, string][] = [[2_880, 'J-2'], [120, '2 h'], [30, '30 min']];

const dayFormatter = new Intl.DateTimeFormat('fr-FR', { weekday: 'short', day: 'numeric', month: 'short' });
const timeFormatter = new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', minute: '2-digit' });

/**
 * Ce qu'un billet deviendra, calculé à chaque rendu plutôt que stocké : choisir
 * un autre horaire change l'instant, donc les doublons et les séances passées.
 */
const describe = (draft: TicketDraft, existingScreenings: CinemaScreening[]) => {
  const startsAt =
    draft.showing?.startsAt ??
    localInstant(draft.override?.date ?? draft.scanned.date, draft.override?.time ?? draft.scanned.time);
  const title = draft.film?.title || draft.showing?.title || draft.scanned.title;
  const existing = findExistingScreening(existingScreenings, startsAt, title, draft.film?.tmdbId);
  const isPast = !Number.isFinite(startsAt) || startsAt <= Date.now();
  const alreadyPlanned = existing?.status === 'scheduled';
  return {
    startsAt,
    title,
    existing,
    isPast,
    alreadyPlanned,
    selectable: !isPast && !alreadyPlanned,
    cinemaName: draft.match?.cinema?.name || draft.scanned.cinema,
    cinemaCity: draft.match?.cinema?.city || '',
    posterUrl: draft.film?.posterUrl || draft.showing?.posterUrl,
    format: draft.showing?.version || draft.scanned.version,
  };
};

/**
 * Importer des billets UGC depuis une capture d'écran.
 *
 * Le parcours tient en un geste : choisir la capture de « Mes billets ». Tout
 * le reste — lire, retrouver chaque séance dans le vrai programme, trouver la
 * fiche du film — se fait pendant l'attente, et la personne n'a plus qu'à
 * valider une liste où chaque ligne dit d'où vient sa certitude.
 */
const TicketImportModal: React.FC<TicketImportModalProps> = ({
  profileId,
  favoriteCinema,
  existingScreenings,
  onClose,
  onImported,
  onAddToWatchlist,
  onRateWatched,
  onToast,
}) => {
  const dialog = useDialog(onClose, 'Importer mes billets');
  const fileInput = useRef<HTMLInputElement>(null);
  const alive = useRef(true);
  const [phase, setPhase] = useState<Phase>('pick');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [drafts, setDrafts] = useState<TicketDraft[]>([]);
  const [reminders, setReminders] = useState<number[]>(DEFAULT_REMINDERS);
  const [alsoWatchlist, setAlsoWatchlist] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  /** Une séance passée à noter après l'ajout : la notation s'ouvre une fois l'import fermé. */
  const [rateKey, setRateKey] = useState<string | null>(null);
  const [imageCount, setImageCount] = useState(0);

  // Remis à vrai à chaque montage : en StrictMode, React démonte puis remonte
  // le composant une fois, et un simple nettoyage laisserait la fenêtre se
  // croire fermée — elle ignorerait alors la réponse de la lecture.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const readFiles = async (list: FileList | null) => {
    const images = Array.from(list ?? []).filter((file) => file.type.startsWith('image/'));
    if (fileInput.current) fileInput.current.value = '';
    if (images.length === 0) return;

    const files = images.slice(0, MAX_TICKET_IMAGES);
    setImageCount(files.length);
    setRateKey(null);
    setNotice(images.length > files.length ? `Seules les ${MAX_TICKET_IMAGES} premières images ont été lues.` : '');
    setError('');
    setSaveError('');
    setPhase('reading');
    haptics.soft();

    try {
      const prepared = await Promise.all(files.map(prepareTicketImage));
      const { tickets: scanned, failedImages } = await scanTicketImages(prepared);
      if (!alive.current) return;
      if (scanned.length === 0) {
        setPhase('pick');
        setError(
          failedImages > 0
            ? 'La lecture n’a pas abouti. Réessaie dans un instant, avec moins d’images.'
            : 'Aucune séance lue sur ces images. Vérifie qu’elles montrent bien une séance de « Mes résas », avec le titre, le jour et l’heure.'
        );
        return;
      }
      if (failedImages > 0) {
        setNotice(`${failedImages} image${failedImages > 1 ? 's n’ont' : ' n’a'} pas pu être lue${failedImages > 1 ? 's' : ''} : réessaie-les ensuite.`);
      }

      setPhase('checking');
      const matches = await matchTickets(scanned, favoriteCinema);
      const films = await Promise.all(
        scanned.map((ticket, index) => {
          const ugcTitle = matches?.[index]?.showing?.title || matches?.[index]?.alternatives[0]?.title || '';
          return findTicketFilm([ugcTitle, ticket.title]);
        })
      );
      if (!alive.current) return;

      const next = scanned.map((ticket, index): TicketDraft => {
        const match = matches?.[index] ?? null;
        const draft: TicketDraft = {
          key: `${index}-${ticket.date}-${ticket.time}-${ticket.title}`,
          scanned: ticket,
          match,
          film: films[index],
          showing: match?.status === 'matched' ? match.showing : null,
          override: null,
          selected: false,
        };
        // Un horaire à choisir ou un billet absent du programme attend la
        // personne : coché d'office, il serait ajouté à l'heure mal lue.
        const needsChoice = match?.status === 'time-mismatch' || match?.status === 'not-found';
        return { ...draft, selected: describe(draft, existingScreenings).selectable && !needsChoice };
      });
      setDrafts(next);
      setPhase('review');
      haptics.success();
    } catch (caught) {
      if (!alive.current) return;
      setPhase('pick');
      setError(caught instanceof Error ? caught.message : 'La lecture des billets a échoué.');
      haptics.error();
    }
  };

  const toggle = (key: string) =>
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, selected: !draft.selected } : draft)));

  const chooseShowing = (key: string, showing: TicketShowing) =>
    setDrafts((current) => current.map((draft) => (draft.key === key ? { ...draft, showing, selected: true } : draft)));

  /** Jour ou heure corrigés : la séance sera reprise telle que corrigée, et cochée. */
  const correct = (key: string, field: 'date' | 'time', value: string) =>
    setDrafts((current) =>
      current.map((draft) => {
        if (draft.key !== key || !value) return draft;
        const base = draft.override ?? { date: draft.scanned.date, time: draft.scanned.time };
        return { ...draft, override: { ...base, [field]: value }, selected: true };
      })
    );

  const rateDraft = drafts.find((draft) => draft.key === rateKey && draft.film);

  /** Ferme l'import, puis ouvre la notation de la séance passée choisie. */
  const finish = (message?: string) => {
    if (message) onToast?.(message);
    onClose();
    if (rateDraft?.film) onRateWatched?.(rateDraft.film.tmdbId, rateDraft.override?.date ?? rateDraft.scanned.date);
  };

  const toggleReminder = (offset: number) =>
    setReminders((current) =>
      current.includes(offset) ? current.filter((value) => value !== offset) : [...current, offset].sort((a, b) => b - a)
    );

  const chosen = drafts.filter((draft) => draft.selected && describe(draft, existingScreenings).selectable);

  const save = async () => {
    if (chosen.length === 0) {
      if (rateDraft) finish();
      return;
    }
    if (reminders.length === 0) {
      setSaveError('Choisis au moins un rappel.');
      return;
    }
    setSaveError('');
    setIsSaving(true);

    let created = 0;
    let confirmed = 0;
    const failed: string[] = [];
    const done = new Set<string>();

    // Une à une : une séance qui échoue ne doit pas emporter les autres, et
    // chacune déclenche côté base la programmation de ses propres rappels.
    for (const draft of chosen) {
      const view = describe(draft, existingScreenings);

      // Déjà là en attente (lien « Réserver sur UGC » suivi depuis The Bitter) :
      // le billet est la preuve de la réservation, on la confirme.
      if (view.existing?.status === 'pending') {
        const result = await confirmScreening(view.existing.id);
        if (result.ok) {
          confirmed += 1;
          done.add(draft.key);
        } else {
          failed.push(view.title);
        }
        continue;
      }

      const input: CinemaScreeningInput = {
        tmdbId: draft.film?.tmdbId,
        title: view.title,
        posterUrl: view.posterUrl,
        startsAt: view.startsAt,
        cinemaName: view.cinemaName || undefined,
        cinemaAddress: view.cinemaCity || undefined,
        format: view.format || undefined,
        notes: ticketNotes(draft.scanned) || undefined,
        reminderOffsetsMinutes: reminders,
        status: 'scheduled',
      };
      const result = await createScreening(profileId, input);
      if (result.ok) {
        created += 1;
        done.add(draft.key);
        if (alsoWatchlist && draft.film) onAddToWatchlist?.(draft.film.tmdbId);
      } else {
        failed.push(view.title);
      }
    }

    if (!alive.current) return;
    setIsSaving(false);
    if (created + confirmed > 0) onImported();

    if (failed.length > 0) {
      setDrafts((current) => current.filter((draft) => !done.has(draft.key)));
      setSaveError(`Pas pu ajouter : ${failed.join(', ')}. Réessaie dans un instant.`);
      haptics.error();
      return;
    }

    const parts = [
      created > 0 ? `${created} séance${created > 1 ? 's' : ''} ajoutée${created > 1 ? 's' : ''}` : '',
      confirmed > 0 ? `${confirmed} confirmée${confirmed > 1 ? 's' : ''}` : '',
    ].filter(Boolean);
    haptics.success();
    finish(`${parts.join(', ')}. Les rappels The Bitter sont prêts.`);
  };

  const busy = phase === 'reading' || phase === 'checking';

  return (
    <div {...dialog.props} className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      <button className="absolute inset-0 bg-charcoal/70 backdrop-blur-md" onClick={onClose} aria-label="Fermer" />
      <section className="relative z-10 flex max-h-[92vh] w-full max-w-lg flex-col overflow-hidden rounded-t-[2rem] border border-white/10 bg-[#f7f4ee] shadow-2xl dark:bg-[#111] sm:rounded-[2rem]">
        <header className="flex items-start justify-between gap-3 border-b border-stone-200/80 px-6 pb-5 pt-6 dark:border-white/10">
          <div className="min-w-0">
            <div className="mb-2 flex items-center gap-2 text-bitter-lime">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-bitter-lime/15"><Ticket size={14} /></span>
              <span className="text-[10px] font-black uppercase tracking-[0.18em]">The Bitter · cinéma</span>
            </div>
            <h2 className="text-2xl font-black tracking-tight text-charcoal dark:text-white">Importer mes billets</h2>
            <p className="mt-1 text-xs font-medium text-stone-500 dark:text-stone-400">
              {phase === 'review'
                ? 'Vérifie la liste, puis ajoute tout d’un coup.'
                : 'Une image par séance, depuis « Mes résas » dans l’app UGC.'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white text-stone-500 shadow-sm transition hover:text-charcoal dark:bg-white/10 dark:text-stone-400 dark:hover:text-white"
            aria-label="Fermer"
          >
            <X size={18} />
          </button>
        </header>

        <input
          ref={fileInput}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(event) => void readFiles(event.target.files)}
        />

        <div className="space-y-5 overflow-y-auto px-6 py-6">
          {phase === 'pick' && (
            <>
              <TicketCaptureDemo />

              <button
                onClick={() => fileInput.current?.click()}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-charcoal text-[11px] font-black uppercase tracking-[0.15em] text-white transition hover:scale-[1.01] active:scale-[0.99] dark:bg-bitter-lime dark:text-charcoal"
              >
                <ImagePlus size={17} /> Choisir mes images
              </button>

              {error && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {error}
                </p>
              )}

              <p className="text-[11px] font-medium leading-relaxed text-stone-400">
                Pas besoin d’ouvrir « Voir mon billet » : le QR code ne sert pas. Jusqu’à {MAX_TICKET_IMAGES} images à la
                fois ; elles ne sont pas conservées.
              </p>
            </>
          )}

          {busy && (
            <div className="flex flex-col items-center gap-4 py-10 text-center" role="status" aria-live="polite">
              <Loader2 size={28} className="animate-spin text-bitter-lime" />
              <div>
                <p className="text-sm font-black text-charcoal dark:text-white">
                  {phase === 'reading'
                    ? `Lecture de ${imageCount} image${imageCount > 1 ? 's' : ''}…`
                    : 'Vérification dans le programme UGC…'}
                </p>
                <p className="mt-1 text-xs font-medium text-stone-500 dark:text-stone-400">
                  {phase === 'reading' ? 'Quelques secondes.' : 'Chaque séance est cherchée dans la grille publiée.'}
                </p>
              </div>
            </div>
          )}

          {phase === 'review' && (
            <>
              {notice && <p className="text-xs font-semibold text-amber-700 dark:text-amber-300">{notice}</p>}
              {drafts.length > 0 && drafts.every((draft) => draft.match === null) && (
                <p className="rounded-xl bg-amber-50 px-3 py-2.5 text-xs font-bold text-amber-800 dark:bg-amber-500/10 dark:text-amber-200">
                  Le programme UGC ne répond pas : les séances sont reprises telles que lues, vérifie-les.
                </p>
              )}

              <ul className="space-y-3">
                {drafts.map((draft) => {
                  const view = describe(draft, existingScreenings);
                  const checked = draft.selected && view.selectable;
                  const status = view.isPast
                    ? { tone: 'muted', text: 'Séance déjà passée' }
                    : view.alreadyPlanned
                      ? { tone: 'muted', text: 'Déjà dans ton calendrier' }
                      : view.existing?.status === 'pending'
                        ? { tone: 'ok', text: 'En attente dans ton calendrier : sera confirmée' }
                        : draft.showing
                          ? { tone: 'ok', text: 'Retrouvée dans le programme UGC' }
                          : draft.match?.status === 'time-mismatch'
                            ? { tone: 'warn', text: `Pas de séance à ${draft.scanned.time} dans le programme. Laquelle ?` }
                            : draft.match?.status === 'cinema-unknown'
                              ? { tone: 'warn', text: 'Cinéma hors UGC : séance reprise telle que lue' }
                              : draft.match?.status === 'not-found'
                                ? { tone: 'warn', text: 'Absente du programme UGC : vérifie le jour et l’heure' }
                                : { tone: 'warn', text: 'Non vérifiée : reprise telle que lue' };

                  return (
                    <li
                      key={draft.key}
                      className={`rounded-2xl border bg-white p-3 transition dark:bg-white/5 ${
                        checked ? 'border-bitter-lime/60' : 'border-stone-200 dark:border-white/10'
                      } ${view.selectable ? '' : 'opacity-60'}`}
                    >
                      <div className="flex items-start gap-3">
                        <button
                          type="button"
                          role="checkbox"
                          aria-checked={checked}
                          aria-label={`Ajouter ${view.title}`}
                          disabled={!view.selectable}
                          onClick={() => toggle(draft.key)}
                          className={`mt-1 grid h-6 w-6 shrink-0 place-items-center rounded-lg border-2 transition ${
                            checked
                              ? 'border-bitter-lime bg-bitter-lime text-charcoal'
                              : 'border-stone-300 text-transparent dark:border-white/20'
                          }`}
                        >
                          <Check size={14} strokeWidth={3} />
                        </button>

                        <div className="h-16 w-11 shrink-0 overflow-hidden rounded-lg bg-stone-100 dark:bg-[#252525]">
                          {view.posterUrl && (
                            <img
                              src={resizeTmdbImage(view.posterUrl, 'w92')}
                              alt=""
                              className="h-full w-full object-cover"
                              loading="lazy"
                            />
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="line-clamp-2 text-sm font-black leading-tight text-charcoal dark:text-white">{view.title}</p>
                          <p className="mt-0.5 text-[11px] font-bold text-stone-500 dark:text-stone-400">
                            {Number.isFinite(view.startsAt)
                              ? `${dayFormatter.format(view.startsAt)} · ${timeFormatter.format(view.startsAt)}`
                              : `${draft.scanned.date} · ${draft.scanned.time}`}
                            {view.format ? ` · ${view.format}` : ''}
                          </p>
                          {view.cinemaName && (
                            <p className="truncate text-[11px] font-medium text-stone-400">{view.cinemaName}</p>
                          )}
                          <p
                            className={`mt-1.5 flex items-start gap-1 text-[11px] font-bold ${
                              status.tone === 'ok'
                                ? 'text-forest dark:text-lime-500'
                                : status.tone === 'warn'
                                  ? 'text-amber-700 dark:text-amber-300'
                                  : 'text-stone-400'
                            }`}
                          >
                            {status.tone === 'ok' ? (
                              <CircleCheck size={13} className="mt-px shrink-0" />
                            ) : status.tone === 'warn' ? (
                              <TriangleAlert size={13} className="mt-px shrink-0" />
                            ) : null}
                            {status.text}
                          </p>

                          {/* Ni retrouvée ni à choisir parmi d'autres horaires : la
                              personne corrige elle-même le jour et l'heure lus. */}
                          {!draft.showing && draft.match?.status !== 'time-mismatch' && !view.alreadyPlanned && !view.isPast && (
                            <div className="mt-2 grid grid-cols-2 gap-2">
                              <label className="flex flex-col gap-1 text-[9.5px] font-black uppercase tracking-[0.14em] text-stone-400">
                                Jour
                                <input
                                  type="date"
                                  value={draft.override?.date ?? draft.scanned.date}
                                  onChange={(event) => correct(draft.key, 'date', event.target.value)}
                                  className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-charcoal dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white"
                                />
                              </label>
                              <label className="flex flex-col gap-1 text-[9.5px] font-black uppercase tracking-[0.14em] text-stone-400">
                                Heure
                                <input
                                  type="time"
                                  value={draft.override?.time ?? draft.scanned.time}
                                  onChange={(event) => correct(draft.key, 'time', event.target.value)}
                                  className="h-9 rounded-lg border border-stone-200 bg-white px-2 text-xs font-bold normal-case tracking-normal text-charcoal dark:border-white/10 dark:bg-[#1a1a1a] dark:text-white"
                                />
                              </label>
                            </div>
                          )}

                          {view.isPast && draft.film && onRateWatched && (
                            <label className="mt-2 flex cursor-pointer items-center gap-2 text-[11px] font-bold text-charcoal dark:text-white">
                              <input
                                type="checkbox"
                                checked={rateKey === draft.key}
                                onChange={(event) => setRateKey(event.target.checked ? draft.key : null)}
                                className="h-4 w-4 accent-lime-500"
                              />
                              L’ajouter à mes films vus, pour la noter
                            </label>
                          )}

                          {draft.match?.status === 'time-mismatch' && draft.match.alternatives.length > 0 && !view.isPast && (
                            <div className="mt-2 flex flex-wrap gap-1.5">
                              {draft.match.alternatives.map((showing) => {
                                const active = draft.showing?.id === showing.id;
                                return (
                                  <button
                                    key={showing.id}
                                    type="button"
                                    onClick={() => chooseShowing(draft.key, showing)}
                                    className={`h-8 rounded-lg px-2.5 text-[11px] font-black transition ${
                                      active
                                        ? 'bg-charcoal text-white dark:bg-bitter-lime dark:text-charcoal'
                                        : 'bg-stone-100 text-stone-600 dark:bg-white/10 dark:text-stone-300'
                                    }`}
                                  >
                                    {timeFormatter.format(showing.startsAt)}
                                    {showing.version ? ` · ${showing.version}` : ''}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>

              <button
                onClick={() => {
                  setDrafts([]);
                  setPhase('pick');
                }}
                className="text-xs font-black text-stone-500 underline decoration-stone-300 underline-offset-4 dark:text-stone-400 dark:decoration-white/20"
              >
                Choisir d’autres images
              </button>

              <section className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-[#191919]">
                <p className="mb-3 text-xs font-black text-charcoal dark:text-white">Rappels pour ces séances</p>
                <div className="grid grid-cols-3 gap-2">
                  {REMINDER_CHOICES.map(([offset, label]) => {
                    const active = reminders.includes(offset);
                    return (
                      <button
                        key={offset}
                        type="button"
                        onClick={() => toggleReminder(offset)}
                        className={`h-10 rounded-xl text-[11px] font-black transition ${
                          active ? 'bg-bitter-lime text-charcoal' : 'bg-stone-100 text-stone-400 dark:bg-white/5 dark:text-stone-400'
                        }`}
                      >
                        {active && <Check size={13} className="mr-1 inline" />}
                        {label}
                      </button>
                    );
                  })}
                </div>
              </section>

              {onAddToWatchlist && chosen.some((draft) => draft.film) && (
                <label className="flex cursor-pointer items-center gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-white/10 dark:bg-[#191919]">
                  <input
                    type="checkbox"
                    checked={alsoWatchlist}
                    onChange={(event) => setAlsoWatchlist(event.target.checked)}
                    className="h-4 w-4 accent-lime-500"
                  />
                  <span className="text-xs font-bold text-charcoal dark:text-white">Ajouter aussi ces films à ma liste « À voir »</span>
                </label>
              )}

              {saveError && (
                <p role="alert" className="rounded-xl bg-red-50 px-3 py-2.5 text-xs font-bold text-red-700 dark:bg-red-500/10 dark:text-red-300">
                  {saveError}
                </p>
              )}

              <button
                onClick={() => void save()}
                disabled={isSaving || (chosen.length === 0 && !rateDraft)}
                className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl bg-charcoal text-[11px] font-black uppercase tracking-[0.15em] text-white transition hover:scale-[1.01] disabled:opacity-40 dark:bg-bitter-lime dark:text-charcoal"
              >
                {isSaving ? <Loader2 size={17} className="animate-spin" /> : <CalendarPlus size={17} />}
                {isSaving
                  ? 'Ajout…'
                  : chosen.length === 0
                    ? rateDraft
                      ? 'Noter ce film'
                      : 'Aucune séance à ajouter'
                    : `Ajouter ${chosen.length} séance${chosen.length > 1 ? 's' : ''}`}
              </button>
            </>
          )}
        </div>
      </section>
    </div>
  );
};

export default TicketImportModal;
