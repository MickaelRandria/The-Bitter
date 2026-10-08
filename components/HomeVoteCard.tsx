import React, { useState } from 'react';
import { Flame, Loader2 } from 'lucide-react';
import { SharedMovie, SharedSpace } from '../services/supabase';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { avatarSrc } from '../utils/avatar';
import { resizeTmdbImage } from '../utils/tmdbImage';

/** Un film qu'on attend que je vote, avec ce qu'il faut pour le dire. */
export interface VoteRequest {
  movie: SharedMovie;
  space: SharedSpace;
  proposer: { first_name: string; avatar_url: string | null } | null;
  /** Prénoms des autres membres qui n'ont pas répondu non plus. */
  othersMissing: string[];
}

interface Props {
  requests: VoteRequest[];
  onVote: (request: VoteRequest, interested: boolean) => Promise<boolean>;
  onLater: (request: VoteRequest) => void;
}

/**
 * « X t'attend » : la carte de vote en tête de l'accueil.
 *
 * Avant, une proposition restait dans l'espace jusqu'à ce qu'on pense à
 * l'ouvrir ; le billet affichait un chiffre, sans dire quoi ni pour qui. Le vote
 * se fait ici, d'un geste, film après film : l'affiche en grand, qui attend,
 * depuis quand, et qui d'autre n'a pas répondu.
 */
const HomeVoteCard: React.FC<Props> = ({ requests, onVote, onLater }) => {
  const { t } = useLanguage();
  const [busy, setBusy] = useState<boolean | null>(null);
  const current = requests[0];
  if (!current) return null;

  const { movie, space, proposer, othersMissing } = current;
  const days = Math.max(0, Math.floor((Date.now() - new Date(movie.added_at).getTime()) / 86_400_000));
  const poster = resizeTmdbImage(movie.poster_url, 'w342');
  const name = proposer?.first_name || t('shared.member');
  const avatar = avatarSrc(proposer?.avatar_url ?? null);

  const vote = async (interested: boolean) => {
    if (busy !== null) return;
    haptics.soft();
    setBusy(interested);
    await onVote(current, interested);
    setBusy(null);
  };

  return (
    <section aria-label={t('votes.title')} className="space-y-3">
      <div className="flex items-baseline justify-between px-1">
        <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-charcoal dark:text-white">{t('votes.title')}</h3>
        <span className="text-[11px] font-bold text-[#B8732F] dark:text-[#F5B26B]">
          {requests.length > 1 ? t('votes.countMany', { count: String(requests.length) }) : t('votes.countOne')}
        </span>
      </div>

      <div className="relative isolate overflow-hidden rounded-[1.75rem] bg-charcoal text-[#F5F4F0] shadow-[0_18px_40px_-22px_rgba(0,0,0,.6)]">
        {poster && (
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 scale-125 bg-cover"
            style={{ backgroundImage: `url(${poster})`, backgroundPosition: 'center 20%', filter: 'blur(18px) brightness(.45) saturate(1.2)' }}
          />
        )}
        <div className="grid gap-3 p-4">
          <div className="flex items-center gap-2 text-[12.5px] font-bold text-white/85">
            <span className="flex h-[26px] w-[26px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-forest text-[10px] font-black text-white">
              {avatar ? <img src={avatar} alt="" className="h-full w-full object-cover" /> : name[0].toUpperCase()}
            </span>
            <span className="min-w-0 truncate">
              <b className="text-white">{t('votes.waitsForYou', { name })}</b> {t('votes.inSpace', { space: space.name })}
            </span>
          </div>

          <div className="grid grid-cols-[96px_minmax(0,1fr)] items-end gap-3.5">
            <div
              className="h-[144px] w-[96px] rounded-[14px] bg-white/10 bg-cover bg-center shadow-[0_14px_30px_rgba(0,0,0,.5)]"
              style={{ backgroundImage: poster ? `url(${poster})` : undefined }}
            />
            <div className="min-w-0">
              <h4 className="text-[22px] font-black leading-[1.05] tracking-tight text-balance">{movie.title}</h4>
              {movie.synopsis && <p className="mt-1.5 line-clamp-3 text-xs leading-snug text-white/75">{movie.synopsis}</p>}
              <p className="mt-2 text-[10.5px] font-extrabold leading-snug text-bitter-lime">
                {days >= 1 ? t('votes.proposedAgo', { days: String(days) }) : t('votes.proposedToday')}
                {othersMissing.length > 0 &&
                  ` · ${othersMissing.length > 1 ? t('votes.othersMissingMany', { names: othersMissing.join(', ') }) : t('votes.othersMissingOne', { name: othersMissing[0] })}`}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => vote(true)}
              disabled={busy !== null}
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-bitter-lime py-3.5 text-sm font-black text-charcoal transition-transform active:scale-95 disabled:opacity-70"
            >
              {busy === true ? <Loader2 size={16} className="animate-spin" /> : <Flame size={16} strokeWidth={2.5} />}
              {t('votes.yes')}
            </button>
            <button
              type="button"
              onClick={() => vote(false)}
              disabled={busy !== null}
              className="flex items-center justify-center gap-1.5 rounded-2xl bg-white/[0.14] py-3.5 text-sm font-black text-white transition-transform active:scale-95 disabled:opacity-70"
            >
              {busy === false && <Loader2 size={16} className="animate-spin" />}
              {t('votes.no')}
            </button>
          </div>

          <div className="flex items-center justify-between text-[11px] font-bold text-white/60">
            <span className="flex gap-1" aria-hidden="true">
              {requests.slice(0, 8).map((r, i) => (
                <i key={r.movie.id} className={`block h-1 w-[18px] rounded-sm ${i === 0 ? 'bg-bitter-lime' : 'bg-white/25'}`} />
              ))}
            </span>
            <button
              type="button"
              onClick={() => {
                haptics.soft();
                onLater(current);
              }}
              className="font-extrabold text-white/70 underline underline-offset-2"
            >
              {t('votes.later')}
            </button>
          </div>
        </div>
      </div>
    </section>
  );
};

export default HomeVoteCard;
