import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Loader2, Music2, Pause, Play, Timer, Trophy, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';
import { stopPreview, togglePreview, usePreviewPlayer } from '../utils/previewPlayer';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { btnPrimary, btnSecondary, sectionLabel } from '../utils/ui';
import type { SharedMovie } from '../services/supabase';
import {
  BlindQuestion,
  BlindScore,
  HINT_SECONDS,
  MAX_POINTS,
  QUESTION_COUNT,
  QUESTION_SECONDS,
  buildQuestions,
  getBlindLeaderboard,
  pointsFor,
  saveBlindScore,
} from '../services/blindTest';
import { Avatar, VerdictPerson } from './verdict/VerdictBits';
import PingMembers from './PingMembers';

/**
 * Blind test BO, en plein écran, sombre comme une salle. On y entre depuis la
 * carte « Jeux de l'espace » (SpaceGames).
 *
 * Chaque extrait part d'un geste (« C'est parti », « Suivant ») : iOS refuse
 * de lancer un son sans toucher, et la préparation est asynchrone.
 *
 * Pendant l'écoute, les indices arrivent : réalisateur et année, puis deux
 * mauvaises réponses écartées. Chaque indice retire un point à la question.
 */

type Phase = 'loading' | 'ready' | 'question' | 'answered' | 'done' | 'empty';

const seconds = (ms: number) => `${(ms / 1000).toFixed(1).replace('.', ',')} s`;
const clock = (s: number) => `0:${String(Math.max(0, s)).padStart(2, '0')}`;

/** La pastille « Vaut n pts » : lime, jaune, puis orange à mesure que les points fondent. */
const WORTH_TONE: Record<number, string> = { 3: 'bg-bitter-lime', 2: 'bg-[#FFE27A]', 1: 'bg-[#F08A24]' };
/** Les trois zones de la frise, à la largeur de leur durée. */
const zoneColumns = `${HINT_SECONDS[0]}fr ${HINT_SECONDS[1] - HINT_SECONDS[0]}fr ${QUESTION_SECONDS - HINT_SECONDS[1]}fr`;

/** Le classement : avatar, prénom, score. */
const Board: React.FC<{ scores: BlindScore[]; people: VerdictPerson[]; limit?: number }> = ({ scores, people, limit = 5 }) => {
  const { t } = useLanguage();
  const rows = scores
    .map((score) => ({ score, person: people.find((p) => p.id === score.profileId) }))
    .filter((row): row is { score: BlindScore; person: VerdictPerson } => !!row.person)
    .slice(0, limit);
  if (!rows.length) return null;
  return (
    <ol className="space-y-2">
      {rows.map(({ score, person }, i) => (
        <li key={person.id} className="flex items-center gap-2.5">
          <span className="w-4 text-xs font-black tabular-nums text-stone-400">{i + 1}</span>
          <Avatar person={person} size={28} />
          <span className={`min-w-0 flex-1 truncate text-[13px] ${person.isMe ? 'font-black' : 'font-semibold'}`}>
            {person.isMe ? t('blind.me') : person.name}
          </span>
          <span className="text-[11px] font-semibold tabular-nums text-stone-400">{seconds(score.durationMs)}</span>
          <span className="w-12 text-right text-[13px] font-black tabular-nums">
            {score.score}/{score.total}
          </span>
        </li>
      ))}
    </ol>
  );
};

export const BlindTestGame: React.FC<{
  spaceId: string;
  spaceName: string;
  currentUserId: string;
  movies: SharedMovie[];
  people: VerdictPerson[];
  onClose: (saved: boolean) => void;
}> = ({ spaceId, spaceName, currentUserId, movies, people, onClose }) => {
  const { t } = useLanguage();
  const [phase, setPhase] = useState<Phase>('loading');
  const [prepared, setPrepared] = useState(0);
  const [questions, setQuestions] = useState<BlindQuestion[]>([]);
  const [index, setIndex] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [points, setPoints] = useState<number[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [totalMs, setTotalMs] = useState(0);
  const [scores, setScores] = useState<BlindScore[] | null>(null);
  const [saved, setSaved] = useState<boolean | null>(null);
  const startedAt = useRef(0);
  const player = usePreviewPlayer();
  const close = () => onClose(saved === true);
  const dialog = useDialog(close, t('blind.title'));

  useEffect(() => {
    let alive = true;
    buildQuestions(movies, (n) => alive && setPrepared(n))
      .then((built) => {
        if (!alive) return;
        setQuestions(built);
        setPhase(built.length ? 'ready' : 'empty');
      })
      .catch(() => alive && setPhase('empty'));
    return () => {
      alive = false;
    };
  }, [movies]);

  useEffect(() => () => stopPreview(), []);

  const question = questions[index];
  const score = points.reduce((sum, n) => sum + n, 0);
  const total = questions.length * MAX_POINTS;
  const remaining = Math.max(0, QUESTION_SECONDS - Math.floor(elapsed / 1000));
  // Indices déjà donnés ; la réponse affichée, ils le sont tous.
  const hints = phase === 'answered' ? HINT_SECONDS.length : HINT_SECONDS.filter((s) => elapsed >= s * 1000).length;
  const worth = MAX_POINTS - hints;
  const untilNext = hints < HINT_SECONDS.length ? Math.max(1, Math.ceil((HINT_SECONDS[hints] * 1000 - elapsed) / 1000)) : 0;

  const answer = (choice: number | null) => {
    if (phase !== 'question' || !question) return;
    const spent = Math.min(QUESTION_SECONDS * 1000, Date.now() - startedAt.current);
    const right = choice != null && question.options[choice].tmdb_id === question.answer.tmdb_id;
    right ? haptics.success() : haptics.error();
    setPicked(choice);
    setAnswers((list) => [...list, right]);
    setPoints((list) => [...list, right ? pointsFor(spent) : 0]);
    setTotalMs((ms) => ms + spent);
    setPhase('answered');
  };

  // Le chrono de la question ; à zéro, la réponse compte comme fausse.
  useEffect(() => {
    if (phase !== 'question') return;
    const timer = window.setInterval(() => {
      const spent = Date.now() - startedAt.current;
      setElapsed(spent);
      if (spent >= QUESTION_SECONDS * 1000) answer(null);
    }, 200);
    return () => window.clearInterval(timer);
    // `answer` lit l'état courant à chaque rendu ; le relancer ici n'apporte rien.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [phase, index]);

  const start = (at: number) => {
    const next = questions[at];
    if (!next) return;
    setIndex(at);
    setPicked(null);
    setElapsed(0);
    startedAt.current = Date.now();
    setPhase('question');
    togglePreview(next.track);
  };

  const finish = async () => {
    stopPreview();
    setPhase('done');
    const ok = await saveBlindScore(spaceId, currentUserId, score, total, totalMs);
    setSaved(ok);
    setScores(await getBlindLeaderboard(spaceId));
  };

  const playing = !!question && player.trackId === question.track.id && player.playing;
  const last = index >= questions.length - 1;

  return createPortal(
    <div
      {...dialog.props}
      className="fixed inset-0 z-[200] flex justify-center overflow-y-auto bg-[#111] text-white"
    >
      <div className="flex min-h-full w-full max-w-md flex-col gap-5 px-4 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-[calc(env(safe-area-inset-top,0px)+16px)]">
        <header className="flex items-center gap-3">
          <button
            type="button"
            onClick={close}
            aria-label={t('common.close')}
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-white/15 transition active:scale-95"
          >
            <X size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('blind.title')}</p>
            <p className="truncate text-sm font-extrabold tracking-tight">{spaceName}</p>
          </div>
          {questions.length > 0 && (
            <span className="rounded-full bg-white/10 px-3 py-2 text-[13px] font-black tabular-nums">
              {t('blind.points', { n: score })}
            </span>
          )}
        </header>

        {questions.length > 0 && phase !== 'done' && (
          <div
            className="grid gap-1"
            style={{ gridTemplateColumns: `repeat(${questions.length}, minmax(0, 1fr))` }}
            aria-label={t('blind.progress', { n: index + 1, total: questions.length })}
          >
            {questions.map((_, i) => (
              <span
                key={i}
                className={`h-1 rounded-full ${
                  i < answers.length ? (answers[i] ? 'bg-bitter-lime' : 'bg-[#F08A24]') : i === index ? 'bg-white' : 'bg-white/15'
                }`}
              />
            ))}
          </div>
        )}

        {phase === 'loading' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
            <Loader2 className="animate-spin text-bitter-lime" />
            <p className="text-sm font-bold text-stone-300">{t('blind.preparing', { n: prepared, total: QUESTION_COUNT })}</p>
          </div>
        )}

        {phase === 'empty' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-4 text-center">
            <Music2 size={28} className="text-stone-500" />
            <p className="max-w-[260px] text-sm leading-relaxed text-stone-300">{t('blind.notEnough')}</p>
            <button type="button" onClick={close} className={btnSecondary + ' !border-white/20 !text-white'}>
              {t('common.close')}
            </button>
          </div>
        )}

        {phase === 'ready' && (
          <div className="flex flex-1 flex-col items-center justify-center gap-5 text-center">
            <div className="flex h-24 w-24 items-center justify-center rounded-full bg-bitter-lime text-[#111]">
              <Music2 size={36} />
            </div>
            <div>
              <h2 className="text-[30px] font-black leading-[0.95] tracking-[-0.055em]">{t('blind.readyTitle')}</h2>
              <p className="mx-auto mt-2 max-w-[280px] text-sm leading-relaxed text-stone-300">
                {t('blind.readyBody', { n: questions.length, s: QUESTION_SECONDS })}
              </p>
              <p className="mx-auto mt-2 max-w-[280px] text-xs leading-relaxed text-stone-400">
                {t('blind.readyHints', { a: HINT_SECONDS[0], b: HINT_SECONDS[1], max: MAX_POINTS })}
              </p>
            </div>
            <button type="button" onClick={() => start(0)} className={`${btnPrimary} w-full`}>
              {t('blind.go')}
            </button>
          </div>
        )}

        {(phase === 'question' || phase === 'answered') && question && (
          <>
            <div className="flex items-center gap-4 pt-1">
              <button
                type="button"
                onClick={() => togglePreview(question.track)}
                aria-label={t(playing ? 'blind.pause' : 'blind.replay')}
                className="flex h-24 w-24 shrink-0 items-center justify-center rounded-full bg-bitter-lime text-[#111] transition active:scale-95"
              >
                {playing ? <Pause size={30} fill="currentColor" /> : <Play size={30} fill="currentColor" />}
              </button>
              <div className="min-w-0 flex-1">
                {phase === 'question' ? (
                  <>
                    <p className="text-[46px] font-black leading-none tracking-[-0.06em] tabular-nums" aria-live="off">
                      {clock(remaining)}
                    </p>
                    <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[13px]">
                      <span className={`rounded-full px-2.5 py-1 font-black text-[#111] ${WORTH_TONE[worth] ?? WORTH_TONE[1]}`}>
                        {t(worth > 1 ? 'blind.worthMany' : 'blind.worthOne', { n: worth })}
                      </span>
                      <span className="font-semibold text-stone-400">{t('blind.ifNow')}</span>
                    </p>
                  </>
                ) : (
                  <div role="status">
                    <p className={`text-xl font-black tracking-tight ${answers[index] ? 'text-bitter-lime' : 'text-[#F08A24]'}`}>
                      {answers[index] ? t('blind.right') : picked == null ? t('blind.timeout') : t('blind.wrong')}
                      {answers[index] ? ` · ${t('blind.earned', { n: points[index] ?? 0 })}` : ''}
                    </p>
                    <p className="mt-1 text-xs font-semibold leading-snug text-stone-300">
                      {t('blind.reveal', { title: question.answer.title, track: question.track.title })}
                    </p>
                  </div>
                )}
              </div>
            </div>

            {phase === 'question' && (
              <div aria-hidden="true">
                <div className="relative">
                  <div className="grid gap-[3px]" style={{ gridTemplateColumns: zoneColumns }}>
                    {[3, 2, 1].map((n) => (
                      <div
                        key={n}
                        className={`flex h-[26px] items-center justify-center rounded-lg text-[11px] font-black ${
                          n === worth ? 'bg-bitter-lime text-[#111]' : n > worth ? 'bg-white/5 text-stone-500 line-through' : 'bg-white/[0.12] text-stone-200'
                        }`}
                      >
                        {t(n > 1 ? 'blind.ptsMany' : 'blind.ptsOne', { n })}
                      </div>
                    ))}
                  </div>
                  <div
                    className="absolute -top-1 h-[34px] w-1 rounded bg-white shadow-[0_0_0_3px_#111] transition-[left] duration-200 ease-linear"
                    style={{ left: `calc(${Math.min(100, elapsed / (QUESTION_SECONDS * 10))}% - 2px)` }}
                  />
                </div>
                <div className="mt-2 grid gap-[3px] text-[10px] font-bold text-stone-400" style={{ gridTemplateColumns: zoneColumns }}>
                  <span>{t('blind.zoneMusic')}</span>
                  <span className={hints >= 1 ? 'text-white' : ''}>{t('blind.zoneHint', { time: clock(QUESTION_SECONDS - HINT_SECONDS[0]) })}</span>
                  <span className={hints >= 2 ? 'text-white' : ''}>{t('blind.zoneDrop', { time: clock(QUESTION_SECONDS - HINT_SECONDS[1]) })}</span>
                </div>
              </div>
            )}

            {phase === 'question' && (
              <p
                className={`flex items-center gap-2 rounded-[14px] px-3 py-2.5 text-xs font-extrabold ${
                  hints >= HINT_SECONDS.length ? 'bg-[#F08A24]/15 text-[#F7B271]' : 'bg-bitter-lime/10 text-[#E6FF66]'
                }`}
              >
                <Timer size={16} aria-hidden="true" className="shrink-0" />
                {hints === 0
                  ? t('blind.nextHint', { s: untilNext })
                  : hints === 1
                    ? t('blind.nextDrop', { s: untilNext })
                    : t('blind.lastPoint')}
              </p>
            )}

            {phase === 'question' && hints > 0 && (question.answer.director || question.answer.year) && (
              <p className="flex items-center gap-2.5 rounded-[18px] bg-white/[0.08] px-3 py-2.5 text-[13px] font-extrabold" role="status">
                <span className="rounded-full bg-bitter-lime px-2 py-1 text-[10px] font-black uppercase tracking-[0.1em] text-[#111]">{t('blind.hint')}</span>
                {[question.answer.director, question.answer.year].filter(Boolean).join(' · ')}
              </p>
            )}

            {player.failed && player.trackId === question.track.id && (
              <p className="text-xs font-bold text-[#F08A24]">{t('soundtrack.failed')}</p>
            )}

            <div className="mt-auto grid grid-cols-2 gap-2">
              {question.options.map((option, i) => {
                const right = option.tmdb_id === question.answer.tmdb_id;
                const dropped = phase === 'question' && hints >= 2 && question.dropped.includes(i);
                const state =
                  dropped
                    ? 'border-dashed border-white/15 bg-transparent opacity-35'
                    : phase === 'answered'
                    ? right
                      ? 'border-bitter-lime bg-bitter-lime/15'
                      : i === picked
                        ? 'border-[#F08A24] bg-[#F08A24]/15'
                        : 'border-white/10 bg-white/[0.04] opacity-50'
                    : 'border-white/10 bg-white/[0.07]';
                return (
                  <button
                    key={option.id}
                    type="button"
                    disabled={phase !== 'question' || dropped}
                    onClick={() => answer(i)}
                    className={`relative isolate flex h-24 flex-col justify-end overflow-hidden rounded-[20px] border p-3 text-left transition active:scale-[0.98] ${state}`}
                  >
                    {option.poster_url && (
                      <img
                        src={resizeTmdbImage(option.poster_url, 'w185')}
                        alt=""
                        aria-hidden="true"
                        className="pointer-events-none absolute -right-3 -top-3 -z-10 h-[86px] w-[58px] rotate-[8deg] rounded-[10px] object-cover opacity-70"
                      />
                    )}
                    <span className="line-clamp-2 pr-10 text-[15px] font-black leading-[1.05] tracking-[-0.03em]">{option.title}</span>
                    {dropped && <span className="mt-0.5 text-[10px] font-bold text-stone-400">{t('blind.dropped')}</span>}
                    {phase === 'answered' && right && (
                      <span className="absolute bottom-2.5 right-2.5 flex h-6 w-6 items-center justify-center rounded-full bg-bitter-lime text-[#111]">
                        <Check size={14} strokeWidth={3} />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {phase === 'answered' && (
              <button type="button" onClick={() => (last ? finish() : start(index + 1))} className={`${btnPrimary} mt-auto w-full`}>
                {last ? t('blind.seeScore') : t('blind.next')}
              </button>
            )}
          </>
        )}

        {phase === 'done' && (
          <div className="flex flex-1 flex-col gap-6 pt-6">
            <div className="text-center">
              <Trophy size={30} className="mx-auto text-bitter-lime" />
              <p className="mt-3 text-[64px] font-black leading-none tracking-[-0.06em] tabular-nums">
                {score}
                <span className="text-2xl text-stone-400">/{total}</span>
              </p>
              <p className="mt-1 text-xs font-bold text-stone-400">
                {t('blind.rightCount', { n: answers.filter(Boolean).length, total: questions.length })}
              </p>
              <p className="mt-2 text-sm font-semibold text-stone-300">
                {saved === false ? t('blind.saveFailed') : t('blind.doneBody', { time: seconds(totalMs) })}
              </p>
            </div>
            <div className="rounded-[24px] bg-white/[0.06] p-4">
              <p className={`${sectionLabel} !text-stone-400`}>{t('blind.board')}</p>
              <div className="mt-3">
                {scores === null ? <Loader2 size={16} className="animate-spin text-stone-400" /> : <Board scores={scores} people={people} limit={8} />}
              </div>
            </div>
            <div className="rounded-[24px] bg-white/[0.06] p-4">
              <p className={`${sectionLabel} mb-3 !text-stone-400`}>{t('blind.challenge')}</p>
              <PingMembers
                spaceId={spaceId}
                what="blind"
                people={people}
                score={score}
                total={total}
                shareText={t('blind.shareText', { score, total, space: spaceName })}
              />
            </div>
            <div className="mt-auto flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setAnswers([]);
                  setPoints([]);
                  setTotalMs(0);
                  setSaved(null);
                  setScores(null);
                  setPrepared(0);
                  setPhase('loading');
                  buildQuestions(movies, setPrepared)
                    .then((built) => {
                      setQuestions(built);
                      setPhase(built.length ? 'ready' : 'empty');
                    })
                    .catch(() => setPhase('empty'));
                }}
                className={`${btnPrimary} w-full`}
              >
                {t('blind.again')}
              </button>
              <button type="button" onClick={close} className={`${btnSecondary} w-full !border-white/20 !text-white`}>
                {t('common.close')}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};
