import React, { useEffect, useMemo, useState } from 'react';
import { X, Film, Pencil, RotateCcw, Share2, Info, ChevronRight } from 'lucide-react';
import { Movie } from '../types';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { getDisplayWeightedRating } from '../utils/rating';
import { getPublicRating, ratingSourceLabel } from '../utils/publicRating';
import { currentCriterionLabel } from '../config/ratingProfiles';
import { fmt1 } from '../utils/verdict';
import { haptics } from '../utils/haptics';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { SpaceNote, getSpaceNotes } from '../services/spaceNotes';

/**
 * Ma note, en lecture.
 *
 * Toucher l'affiche d'un film que j'ai noté, ailleurs que dans la collection
 * (stats, calendrier, profil d'un membre…), ouvre cette feuille : la note telle
 * que je l'ai posée, et ce qui l'entoure. Rien ne change tant que je ne touche pas
 * « Modifier ma note » : revoir sa note ne passe plus par le formulaire, où l'on
 * pouvait la changer sans le vouloir.
 */
interface MyRatingSheetProps {
  movie: Movie;
  userId?: string;
  onClose: () => void;
  onEdit: (movie: Movie) => void;
  onRewatch?: (movie: Movie) => void;
  onShare?: (movie: Movie) => void;
  onDetails?: (tmdbId: number, mediaType: 'movie' | 'tv') => void;
  /** Ouvre l'espace sur ce film (sa fiche verdict). */
  onOpenSpace?: (spaceId: string, sharedMovieId: string) => void;
}

const MyRatingSheet: React.FC<MyRatingSheetProps> = ({ movie, userId, onClose, onEdit, onRewatch, onShare, onDetails, onOpenSpace }) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, movie.title);
  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const score = getDisplayWeightedRating(movie);
  const adaptive = movie.adaptiveRating;
  /** Une note détaillée existe ; posée en Bitter à quatre critères, ce n'est pas du Bitter+. */
  const hasGrid = !!adaptive?.criteria?.length;
  const isPlus = hasGrid && adaptive?.mode !== 'simple';

  /** Les critères tels qu'ils ont été posés ; une note simple a la même valeur partout. */
  const criteria = useMemo(() => {
    if (hasGrid) {
      return adaptive!.criteria.map((c) => ({
        key: c.key,
        label: currentCriterionLabel(c.label, c.key),
        value: Number(c.value),
        weight: c.weight,
        weightLabel: c.weightLabel,
        specific: c.group === 'specific',
      }));
    }
    const r = movie.ratings;
    return [
      { key: 'scenario', label: t('criteria.story'), value: Number(r.story) },
      { key: 'image', label: t('criteria.visuals'), value: Number(r.visuals) },
      { key: 'interpretation', label: t('criteria.acting'), value: Number(r.acting) },
      { key: 'sound', label: t('criteria.sound'), value: Number(r.sound) },
    ].map((c) => ({ ...c, weight: 1, weightLabel: undefined, specific: false }));
  }, [movie, hasGrid, t]);
  const flat = !hasGrid && criteria.every((c) => c.value === criteria[0].value);

  /** Où et quand : la dernière séance connue, sinon la date de visionnage. */
  const lastWatch = [...(movie.watches ?? [])].sort((a, b) => (b.watched_at ?? '').localeCompare(a.watched_at ?? ''))[0];
  const watchedAt = lastWatch?.watched_at ? new Date(lastWatch.watched_at) : movie.dateWatched ? new Date(movie.dateWatched) : null;
  const ctx = lastWatch?.viewingContext;
  const place =
    ctx?.locationType === 'cinema'
      ? ctx.cinemaName || t('myRating.atCinema')
      : ctx?.locationType === 'home'
        ? t('myRating.atHome')
        : null;
  const watchCount = movie.watch_count ?? movie.watches?.length ?? 0;

  const publicRating = getPublicRating(movie);
  const history = [...(movie.ratingHistory ?? [])].sort((a, b) => b.replacedAt.localeCompare(a.replacedAt));

  const [spaces, setSpaces] = useState<SpaceNote[] | null>(null);
  useEffect(() => {
    if (!movie.tmdbId || !userId) {
      setSpaces([]);
      return;
    }
    let alive = true;
    getSpaceNotes(movie.tmdbId, movie.mediaType === 'tv' ? 'tv' : 'movie', userId).then((list) => alive && setSpaces(list));
    return () => {
      alive = false;
    };
  }, [movie.tmdbId, movie.mediaType, userId]);

  const day = (d: Date) => {
    const text = d.toLocaleDateString(locale, { day: 'numeric', month: 'long', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' });
    return language === 'en' ? text : text.replace(/^1 /, '1er ');
  };
  const sec = 'text-[9.5px] font-black uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400';
  const card = 'rounded-[1.25rem] bg-white dark:bg-[#161616] border border-sand dark:border-white/10 p-3.5 space-y-2.5';

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-charcoal/50 dark:bg-black/70 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
      onClick={onClose}
    >
      <div
        className="relative w-full sm:max-w-md max-h-[92dvh] flex flex-col bg-cream dark:bg-[#0c0c0c] rounded-t-[2rem] sm:rounded-[2rem] shadow-2xl animate-[slideUp_0.35s_cubic-bezier(0.16,1,0.3,1)]"
        onClick={(e) => e.stopPropagation()}
      >
        <span className="mx-auto mt-2 mb-1 h-[5px] w-10 shrink-0 rounded-full bg-sand dark:bg-white/10" aria-hidden />
        <button
          onClick={onClose}
          aria-label={t('common.close')}
          className="absolute top-3 right-3 w-9 h-9 rounded-full bg-sand dark:bg-[#1f1f1f] text-charcoal dark:text-white flex items-center justify-center active:scale-90 transition-transform z-10"
        >
          <X size={16} strokeWidth={2.5} />
        </button>

        <div className="flex-1 overflow-y-auto overscroll-contain px-4 pt-2 pb-3 space-y-3 no-scrollbar">
          <div className="flex gap-3.5 items-end pr-10">
            <span className="relative w-[92px] aspect-[2/3] shrink-0 rounded-[14px] overflow-hidden bg-stone-200 dark:bg-[#1a1a1a] shadow-[0_14px_24px_-14px_rgba(0,0,0,0.6)]">
              {movie.posterUrl ? (
                <img src={resizeTmdbImage(movie.posterUrl, 'w342')} alt="" className="w-full h-full object-cover" />
              ) : (
                <Film size={18} className="absolute inset-0 m-auto text-stone-400" />
              )}
            </span>
            <div className="min-w-0 pb-0.5">
              <p className={sec}>{t('myRating.kicker')}</p>
              <h2 className="mt-1 text-[22px] font-black tracking-[-0.045em] leading-none text-charcoal dark:text-white line-clamp-3">{movie.title}</h2>
              <p className="mt-1.5 text-[11px] font-bold text-stone-500 dark:text-stone-400 leading-snug">
                {[movie.year || null, movie.director && movie.director !== 'Inconnu' ? movie.director : null, movie.runtime ? `${Math.floor(movie.runtime / 60)} h ${String(movie.runtime % 60).padStart(2, '0')}` : null]
                  .filter(Boolean)
                  .join(' · ')}
                {movie.genre ? <><br />{movie.genre}</> : null}
              </p>
            </div>
          </div>

          <div className="flex items-end justify-between gap-3 rounded-[1.4rem] bg-charcoal dark:bg-white text-white dark:text-charcoal px-4 py-3.5">
            <div>
              <p className="text-[9.5px] font-black uppercase tracking-[0.16em] text-bitter-lime dark:text-forest mb-1.5">
                {isPlus ? t('myRating.yourScorePlus') : t('myRating.yourScore')}
              </p>
              <p className="text-[58px] font-black tracking-[-0.07em] leading-[0.85] tabular-nums">{fmt1(score)}</p>
            </div>
            <p className="text-right text-[11px] font-bold leading-snug opacity-75">
              {watchedAt ? t('myRating.seenOn', { date: day(watchedAt) }) : t('myRating.seen')}
              {place && (
                <>
                  <br />
                  {place}
                </>
              )}
              {watchCount > 1 && (
                <>
                  <br />
                  {t('myRating.seenTimes', { n: String(watchCount) })}
                </>
              )}
            </p>
          </div>

          <div className={card}>
            <div className={`${sec} flex justify-between items-baseline`}>
              <span>{t('myRating.criteriaTitle')}</span>
              <span className="normal-case tracking-normal text-[10.5px] font-bold">
                {isPlus ? adaptive?.profile?.label : t('myRating.simple')}
              </span>
            </div>
            {criteria.map((c) => (
              <div key={c.key} className="grid grid-cols-[minmax(0,1fr)_34px] gap-x-2.5 gap-y-1 items-center">
                <span className="min-w-0 flex items-baseline gap-1.5 text-[12px] font-extrabold text-charcoal dark:text-white">
                  <span className="truncate">{c.label}</span>
                  {isPlus && (c.weight !== 1 || c.specific) && (
                    <em className="not-italic shrink-0 text-[9.5px] font-extrabold text-stone-500 dark:text-stone-400">
                      {c.specific ? t('myRating.genreCriterion') : c.weightLabel?.toLowerCase()}
                      {c.weight !== 1 ? ` · ×${String(c.weight).replace('.', ',')}` : ''}
                    </em>
                  )}
                </span>
                <span className="text-right text-[13px] font-black tabular-nums text-charcoal dark:text-white">{fmt1(c.value)}</span>
                <span className="col-span-2 h-1.5 rounded-full bg-sand dark:bg-white/10 overflow-hidden">
                  <i
                    className={`block h-full rounded-full ${c.specific ? 'bg-[repeating-linear-gradient(135deg,#3E5238_0_5px,rgba(62,82,56,0.7)_5px_8px)] dark:bg-[repeating-linear-gradient(135deg,#D9FF00_0_5px,rgba(217,255,0,0.65)_5px_8px)]' : 'bg-forest dark:bg-bitter-lime'}`}
                    style={{ width: `${Math.max(0, Math.min(100, c.value * 10))}%` }}
                  />
                </span>
              </div>
            ))}
            {flat && <p className="text-[11.5px] font-semibold text-stone-500 dark:text-stone-400 leading-snug">{t('myRating.flatHint')}</p>}
          </div>

          {!!adaptive?.imprints?.length && (
            <div className={card}>
              <p className={sec}>{t('myRating.feltTitle')}</p>
              <div className="flex flex-wrap gap-1.5">
                {adaptive.imprints.map((k) => (
                  <span key={k} className="px-2.5 py-1.5 rounded-full bg-sand dark:bg-[#1f1f1f] text-[11px] font-extrabold text-charcoal dark:text-white">
                    {t(`addMovie.${k}`)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {movie.comment?.trim() && (
            <div className={card}>
              <p className={sec}>{t('myRating.reviewTitle')}</p>
              <p className="m-0 text-[13px] font-semibold leading-relaxed text-charcoal dark:text-stone-200 border-l-[3px] border-forest dark:border-bitter-lime pl-2.5">
                {movie.comment.trim()}
              </p>
            </div>
          )}

          {(publicRating || (spaces && spaces.length > 0)) && (
            <div className={card}>
              <p className={sec}>{t('myRating.othersTitle')}</p>
              <div className="grid grid-cols-2 gap-2">
                {publicRating && (
                  <div className="rounded-2xl bg-sand dark:bg-[#1f1f1f] px-3 py-2.5">
                    <b className="block text-[17px] font-black tracking-tight tabular-nums text-charcoal dark:text-white">
                      {score - publicRating.value >= 0 ? '+' : '−'}
                      {fmt1(Math.abs(score - publicRating.value))}
                    </b>
                    <small className="block mt-0.5 text-[10.5px] font-bold leading-snug text-stone-500 dark:text-stone-400">
                      {t('myRating.vsPublic', { source: ratingSourceLabel(publicRating.source), value: fmt1(publicRating.value) })}
                    </small>
                  </div>
                )}
                {spaces?.map((s) => (
                  <button
                    key={s.spaceId}
                    onClick={() => {
                      if (!onOpenSpace) return;
                      haptics.soft();
                      onOpenSpace(s.spaceId, s.sharedMovieId);
                    }}
                    disabled={!onOpenSpace}
                    className="text-left rounded-2xl bg-sand dark:bg-[#1f1f1f] px-3 py-2.5 active:scale-[0.98] transition-transform"
                  >
                    <b className="flex items-center gap-1 text-[14px] font-black tracking-tight text-charcoal dark:text-white">
                      <span className="truncate">{s.others.map((o) => `${o.name} ${fmt1(o.value)}`).join(' · ')}</span>
                      {onOpenSpace && <ChevronRight size={13} className="shrink-0 text-stone-400" />}
                    </b>
                    <small className="block mt-0.5 text-[10.5px] font-bold leading-snug text-stone-500 dark:text-stone-400 truncate">
                      {t('myRating.inSpace', { space: s.spaceName, avg: fmt1(s.average) })}
                    </small>
                  </button>
                ))}
              </div>
            </div>
          )}

          {history.length > 0 && (
            <div className={card}>
              <div className={`${sec} flex justify-between items-baseline`}>
                <span>{t('myRating.historyTitle')}</span>
                <span className="normal-case tracking-normal text-[10.5px] font-bold">
                  {t(history.length > 1 ? 'myRating.editsMany' : 'myRating.editsOne', { n: String(history.length) })}
                </span>
              </div>
              <div className="space-y-2">
                <div className="flex items-center gap-2.5 text-[12px] font-bold text-charcoal dark:text-white">
                  <span className="w-2.5 h-2.5 rounded-full bg-forest dark:bg-bitter-lime ring-[3px] ring-forest/15 dark:ring-bitter-lime/15 shrink-0" />
                  <b className="w-8 text-[14px] font-black tabular-nums">{fmt1(score)}</b>
                  {t('myRating.current')}
                </div>
                {history.map((h, i) => (
                  <div key={`${h.replacedAt}-${i}`} className="flex items-center gap-2.5 text-[12px] font-bold text-stone-500 dark:text-stone-400">
                    <span className="w-2.5 h-2.5 rounded-full bg-sand dark:bg-white/15 shrink-0" />
                    <b className="w-8 text-[14px] font-black tabular-nums text-charcoal dark:text-white">{fmt1(h.rating)}</b>
                    {t('myRating.replacedOn', { date: day(new Date(h.replacedAt)) })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        <div className="shrink-0 px-4 pt-2 pb-[calc(env(safe-area-inset-bottom,0px)+16px)] space-y-2 bg-cream dark:bg-[#0c0c0c] rounded-b-[2rem]">
          <button
            onClick={() => {
              haptics.medium();
              onEdit(movie);
            }}
            className="w-full h-[50px] rounded-2xl bg-bitter-lime text-charcoal font-black text-sm flex items-center justify-center gap-2 active:scale-95 transition-transform"
          >
            <Pencil size={15} strokeWidth={2.6} />
            {t('myRating.edit')}
          </button>
          <div className="grid grid-cols-3 gap-2">
            {[
              onRewatch && { key: 'rewatch', label: t('myRating.rewatch'), icon: <RotateCcw size={13} />, run: () => onRewatch(movie) },
              onShare && { key: 'share', label: t('myRating.share'), icon: <Share2 size={13} />, run: () => onShare(movie) },
              onDetails && movie.tmdbId && {
                key: 'details',
                label: t('myRating.details'),
                icon: <Info size={13} />,
                run: () => onDetails(movie.tmdbId!, movie.mediaType === 'tv' ? 'tv' : 'movie'),
              },
            ]
              .filter((a): a is { key: string; label: string; icon: React.ReactElement; run: () => void } => !!a)
              .map((a) => (
                <button
                  key={a.key}
                  onClick={() => {
                    haptics.soft();
                    a.run();
                  }}
                  className="h-11 rounded-2xl bg-sand dark:bg-[#1a1a1a] text-charcoal dark:text-white text-[12px] font-black flex items-center justify-center gap-1.5 active:scale-95 transition-transform"
                >
                  {a.icon}
                  {a.label}
                </button>
              ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default MyRatingSheet;
