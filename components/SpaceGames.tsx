import React, { useEffect, useMemo, useState } from 'react';
import { Music2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import type { MovieRating, SharedMovie } from '../services/supabase';
import { BlindScore, MIN_FILMS, getBlindLeaderboard, playableFilms } from '../services/blindTest';
import { WHO_MIN_QUESTIONS, getWhoLeaderboard, whoCandidates } from '../services/whoRated';
import { SpaceChallenge, getLastSpaceChallenge } from '../services/spacePing';
import { BlindTestGame } from './BlindTest';
import { WhoRatedGame, useWhoBoard } from './WhoRated';
import { Avatar, VerdictPerson } from './verdict/VerdictBits';

/**
 * « Jeux de l'espace » : une seule carte pour le blind test BO et « Qui a mis
 * cette note ? », en deux tuiles. Qui mène, ton record dans chaque jeu, et le
 * dernier défi reçu dans l'espace.
 *
 * Un jeu sans assez de matière (films avec BO, notes des autres) n'a pas de
 * tuile ; aucun des deux : pas de carte.
 */

/** Un défi plus vieux que ça ne vaut plus la peine d'être rappelé. */
const CHALLENGE_DAYS = 14;

const SpaceGames: React.FC<{
  spaceId: string;
  spaceName: string;
  currentUserId: string;
  movies: SharedMovie[];
  ratings: MovieRating[];
  people: VerdictPerson[];
}> = ({ spaceId, spaceName, currentUserId, movies, ratings, people }) => {
  const { t } = useLanguage();
  const [open, setOpen] = useState<'blind' | 'who' | null>(null);
  const [blindBoard, setBlindBoard] = useState<BlindScore[]>([]);
  const [challenge, setChallenge] = useState<SpaceChallenge | null>(null);

  const blindOk = useMemo(() => playableFilms(movies).length >= MIN_FILMS, [movies]);
  const whoOk = useMemo(
    () => people.length >= 2 && whoCandidates(movies, ratings, people, currentUserId).length >= WHO_MIN_QUESTIONS,
    [movies, ratings, people, currentUserId]
  );
  const [whoBoard, setWhoBoard] = useWhoBoard(spaceId, whoOk);

  useEffect(() => {
    if (!blindOk) return;
    let alive = true;
    getBlindLeaderboard(spaceId).then((list) => alive && setBlindBoard(list));
    return () => {
      alive = false;
    };
  }, [spaceId, blindOk]);

  useEffect(() => {
    if (!blindOk && !whoOk) return;
    let alive = true;
    getLastSpaceChallenge(spaceId, currentUserId).then((found) => {
      if (!alive || !found) return;
      if (Date.now() - new Date(found.createdAt).getTime() < CHALLENGE_DAYS * 86_400_000) setChallenge(found);
    });
    return () => {
      alive = false;
    };
  }, [spaceId, currentUserId, blindOk, whoOk]);

  if (!blindOk && !whoOk) return null;

  const personOf = (id: string) => people.find((p) => p.id === id);
  const leaderScore = blindBoard[0] ?? whoBoard[0];
  const leader = leaderScore ? personOf(leaderScore.profileId) : undefined;
  const myBlind = blindBoard.find((s) => s.profileId === currentUserId);
  const myWho = whoBoard.find((s) => s.profileId === currentUserId);
  const challenger = challenge ? personOf(challenge.actorId) : undefined;
  const both = blindOk && whoOk;

  const start = (game: 'blind' | 'who') => {
    haptics.medium();
    setOpen(game);
  };

  return (
    <section aria-label={t('games.kicker')} className="flex flex-col gap-3 rounded-[28px] bg-[#111] p-[18px] text-white">
      <div className="flex items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('games.kicker')}</p>
          <h2 className="mt-1 text-[22px] font-black leading-none tracking-[-0.05em]">{t('games.title')}</h2>
        </div>
        {leader && (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-white/[0.08] py-1.5 pl-1.5 pr-2.5">
            <Avatar person={leader} size={22} />
            <span className="text-[11px] font-extrabold">{leader.isMe ? t('games.youLead') : t('games.leads', { name: leader.name })}</span>
          </span>
        )}
      </div>

      <div className={`grid gap-2 ${both ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {blindOk && (
          <button
            type="button"
            onClick={() => start('blind')}
            className={`flex flex-col justify-between rounded-[22px] bg-bitter-lime p-3.5 text-left text-[#111] transition active:scale-[0.98] ${both ? 'h-[150px]' : 'h-[110px]'}`}
          >
            <Music2 size={26} strokeWidth={2.2} aria-hidden="true" />
            <span className="flex flex-col gap-1">
              <span className="text-[17px] font-black leading-none tracking-[-0.04em]">{t('blind.title')}</span>
              <span className="text-[11px] font-bold opacity-70">
                {myBlind ? t('games.record', { score: myBlind.score, total: myBlind.total }) : t('games.blindNew')}
              </span>
            </span>
          </button>
        )}
        {whoOk && (
          <button
            type="button"
            onClick={() => start('who')}
            className={`flex flex-col justify-between rounded-[22px] border border-white/[0.14] bg-white/[0.06] p-3.5 text-left transition active:scale-[0.98] ${both ? 'h-[150px]' : 'h-[110px]'}`}
          >
            <span aria-hidden="true" className="flex">
              {people.slice(0, 3).map((person, i) => (
                <span key={person.id} className={`rounded-full ring-2 ring-[#111] ${i ? '-ml-2' : ''}`}>
                  <Avatar person={person} size={26} />
                </span>
              ))}
            </span>
            <span className="flex flex-col gap-1">
              <span className="text-[17px] font-black leading-none tracking-[-0.04em]">{t('whoRated.title')}</span>
              <span className="text-[11px] font-bold text-stone-400">
                {myWho ? t('games.record', { score: myWho.score, total: myWho.total }) : t('games.whoNew')}
              </span>
            </span>
          </button>
        )}
      </div>

      {challenge && challenger && (
        <p className="text-[11px] font-semibold text-stone-400">
          {t(challenge.what === 'who' ? 'games.challengeWho' : 'games.challengeBlind', {
            name: challenger.name,
            score: challenge.score ?? '?',
            total: challenge.total ?? '?',
          })}
        </p>
      )}

      {open === 'blind' && (
        <BlindTestGame
          spaceId={spaceId}
          spaceName={spaceName}
          currentUserId={currentUserId}
          movies={movies}
          people={people}
          onClose={(saved) => {
            setOpen(null);
            if (saved) getBlindLeaderboard(spaceId).then(setBlindBoard);
          }}
        />
      )}
      {open === 'who' && (
        <WhoRatedGame
          spaceId={spaceId}
          spaceName={spaceName}
          currentUserId={currentUserId}
          movies={movies}
          ratings={ratings}
          people={people}
          onClose={(saved) => {
            setOpen(null);
            if (saved) getWhoLeaderboard(spaceId).then(setWhoBoard);
          }}
        />
      )}
    </section>
  );
};

export default SpaceGames;
