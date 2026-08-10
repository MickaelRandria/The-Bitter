import React, { useEffect, useMemo, useState } from 'react';
import { X, Star, Film, Users, ArrowLeftRight, TrendingUp, TrendingDown, ChevronDown, Copy, Check, Compass } from 'lucide-react';
import { SpaceMember, MemberFilm, getMemberFilms } from '../services/supabase';
import { Movie } from '../types';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { haptics } from '../utils/haptics';

interface Props {
  member: SpaceMember;
  /** Collection de celui qui regarde, pour la comparaison. */
  myMovies: Movie[];
  onClose: () => void;
}

/** Note d'un film personnel, dans la même unité que celle des membres. */
const myRatingOf = (movie: Movie): number => {
  const weighted = movie.adaptiveRating?.weightedRating;
  if (typeof weighted === 'number' && Number.isFinite(weighted)) return weighted;
  const r = movie.ratings;
  return (r.story + r.visuals + r.acting + r.sound) / 4;
};

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;

/**
 * Mes quatre critères, avec la même précaution que côté membre : en Bitter+, les
 * quatre champs de `ratings` portent tous la note pondérée, pas quatre critères.
 */
const myCriteriaOf = (movie: Movie) => {
  const byKey = new Map<string, number>(
    (movie.adaptiveRating?.criteria ?? []).map((c) => [c.key, Number(c.value)])
  );
  const qm = movie.qualityMetrics as any;

  const pick = (adaptiveKey: string, qualityKey: string, legacy: number) => {
    const fromAdaptive = byKey.get(adaptiveKey);
    if (Number.isFinite(fromAdaptive)) return fromAdaptive as number;
    const fromQuality = qm?.[qualityKey];
    if (Number.isFinite(fromQuality)) return Number(fromQuality);
    return legacy;
  };

  const r = movie.ratings;
  return {
    story: pick('scenario', 'scenario', r.story),
    visuals: pick('image', 'visual', r.visuals),
    acting: pick('interpretation', 'acting', r.acting),
    sound: pick('sound', 'sound', r.sound),
  };
};

export default function MemberProfileModal({ member, myMovies, onClose }: Props) {
  const dialog = useDialog(onClose);
  const { t } = useLanguage();
  const [films, setFilms] = useState<MemberFilm[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  /** Film du top déplié, pour comparer les deux verdicts sans quitter la fiche. */
  const [openFilm, setOpenFilm] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const result = await getMemberFilms(member.profile_id);
      if (cancelled) return;
      if (result.error) setLoadError(result.error);
      setFilms(result.data);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [member.profile_id]);

  const stats = useMemo(() => {
    if (films.length === 0) return null;

    const ratings = films.map((f) => f.rating);
    const average = mean(ratings);

    // Genre de prédilection : le plus fréquent parmi les films notés. `genre` porte
    // un libellé unique côté user_movies, pas une liste, d'où le comptage direct.
    const byGenre = new Map<string, number>();
    for (const f of films) {
      if (!f.genre) continue;
      byGenre.set(f.genre, (byGenre.get(f.genre) ?? 0) + 1);
    }
    const favouriteGenre = [...byGenre.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

    return {
      count: films.length,
      average,
      favouriteGenre,
      top: [...films].sort((a, b) => b.rating - a.rating).slice(0, 5),
    };
  }, [films]);

  /**
   * La comparaison, qui est le vrai intérêt de la fiche.
   *
   * Elle ne porte que sur les films vus par les deux, rapprochés par leur identifiant
   * TMDB : comparer deux moyennes générales n'apprendrait rien, chacun ayant vu des
   * films différents. Un écart moyen faible veut dire des goûts proches, et le film
   * le plus divergent est souvent le plus intéressant à se raconter.
   */
  const comparison = useMemo(() => {
    if (films.length === 0) return null;

    const mine = new Map<number, Movie>();
    for (const m of myMovies) {
      if (m.status === 'watched' && m.tmdbId != null) mine.set(m.tmdbId, m);
    }
    if (mine.size === 0) return null;

    const pairs = films
      .filter((f) => f.tmdbId != null && mine.has(f.tmdbId))
      .map((f) => {
        const own = mine.get(f.tmdbId as number) as Movie;
        const ownRating = myRatingOf(own);
        return { film: f, ownRating, gap: f.rating - ownRating };
      });

    if (pairs.length === 0) return null;

    const sorted = [...pairs].sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap));

    return {
      /** Triés par ma note : ma courbe monte, la sienne s'en écarte. */
      pairs: [...pairs].sort((a, b) => a.ownRating - b.ownRating),
      shared: pairs.length,
      meanGap: mean(pairs.map((p) => Math.abs(p.gap))),
      /** Signé : positif quand l'autre note plus haut que vous en moyenne. */
      bias: mean(pairs.map((p) => p.gap)),
      widest: sorted[0],
      closest: sorted[sorted.length - 1],
    };
  }, [films, myMovies]);

  /**
   * Où vos regards divergent, critère par critère.
   *
   * Un écart moyen global dit si vous êtes proches ; il ne dit pas sur quoi. La
   * grille stocke déjà les quatre critères des deux côtés, il n'y a rien à
   * collecter, seulement à croiser. Un accord sur le scénario doublé d'un
   * désaccord sur l'image est une information que la moyenne écrase.
   */
  /**
   * Ce qu'il a vu et pas toi, ses mieux notés d'abord.
   *
   * C'est la recommandation la plus naturelle de tout l'écran : elle vient de
   * quelqu'un dont tu connais désormais l'écart de goût avec toi, ce qui permet
   * de corriger sa note dans ta tête avant même de lancer le film.
   */
  const toDiscover = useMemo(() => {
    if (films.length === 0) return [];
    const seen = new Set<number>();
    for (const m of myMovies) {
      if (m.tmdbId != null) seen.add(m.tmdbId);
    }
    return films
      .filter((f) => f.tmdbId != null && !seen.has(f.tmdbId) && f.rating >= 7)
      .sort((a, b) => b.rating - a.rating)
      .slice(0, 4);
  }, [films, myMovies]);

  const [copied, setCopied] = useState(false);

  /** Une statistique ne fait rien ; une phrase prête à coller lance une conversation. */
  const shareGap = async () => {
    if (!comparison) return;
    const line = t('member.shareLine', {
      title: comparison.widest.film.title,
      you: comparison.widest.ownRating.toFixed(1),
      name,
      theirs: comparison.widest.film.rating.toFixed(1),
    });
    try {
      await navigator.clipboard.writeText(line);
      setCopied(true);
      haptics.success();
      setTimeout(() => setCopied(false), 2000);
    } catch {
      haptics.error();
    }
  };

  /** Mes films vus, indexés par TMDB : la comparaison se fait film par film. */
  const myByTmdb = useMemo(() => {
    const map = new Map<number, Movie>();
    for (const m of myMovies) {
      if (m.status === 'watched' && m.tmdbId != null) map.set(m.tmdbId, m);
    }
    return map;
  }, [myMovies]);

  const isOwner = member.role === 'owner';
  const name = member.profile?.first_name || t('shared.member');

  const tile =
    'bg-stone-50 dark:bg-[#161616] rounded-2xl p-4 border border-stone-100 dark:border-white/5 text-center';
  const tileValue = 'text-2xl font-black text-charcoal dark:text-white tabular-nums';
  const tileLabel =
    'text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 mt-1';
  const sectionTitle =
    'text-[10px] font-black uppercase text-stone-400 dark:text-stone-600 tracking-widest flex items-center gap-2';

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]"
    >
      <div className="relative bg-white dark:bg-[#1a1a1a] w-full sm:max-w-md rounded-t-[3rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)] overflow-hidden border border-sand dark:border-white/10">
        <div className="p-8 border-b border-sand dark:border-white/10 flex items-center justify-between shrink-0">
          <div>
            <h3 className="text-xl font-black tracking-tight text-charcoal dark:text-white">
              {t('shared.memberProfile')}
            </h3>
            <p className="text-[10px] font-black uppercase text-stone-400 dark:text-stone-500 tracking-widest mt-1">
              {t('shared.publicProfile')}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="p-3 bg-stone-100 dark:bg-[#252525] rounded-full text-stone-500 hover:text-charcoal dark:hover:text-white transition-all"
          >
            <X size={20} />
          </button>
        </div>

        <div className="p-8 overflow-y-auto no-scrollbar space-y-8">
          <div className="flex flex-col items-center">
            <div className="w-24 h-24 rounded-full bg-stone-100 dark:bg-[#252525] border-4 border-white dark:border-white/10 shadow-lg mb-4 flex items-center justify-center overflow-hidden">
              {member.profile?.avatar_url ? (
                <img src={member.profile.avatar_url} alt="" className="w-full h-full object-cover" />
              ) : (
                <span className="text-3xl font-black text-stone-300 dark:text-stone-700">
                  {name[0].toUpperCase()}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-black text-charcoal dark:text-white tracking-tight">
                {name}
              </h2>
              {isOwner && (
                <span className="text-[9px] font-black uppercase tracking-widest bg-bitter-lime text-charcoal px-2 py-0.5 rounded-lg">
                  {t('shared.founder')}
                </span>
              )}
            </div>
          </div>

          {loadError && (
            <p className="text-[11px] font-medium text-orange-400 leading-relaxed text-center">
              {loadError}
            </p>
          )}

          {/* La comparaison passe avant les statistiques brutes : c'est la seule
              chose qu'on ne peut pas lire ailleurs, et la raison d'ouvrir la fiche. */}
          {comparison && (
            <div className="space-y-3">
              <h4 className={sectionTitle}>
                <ArrowLeftRight size={12} />
                {t('member.together')}
              </h4>

              <div className="grid grid-cols-3 gap-3">
                <div className={tile}>
                  <p className={tileValue}>{comparison.shared}</p>
                  <p className={tileLabel}>{t('member.inCommon')}</p>
                </div>
                <div className={tile}>
                  <p className={tileValue}>{comparison.meanGap.toFixed(1)}</p>
                  <p className={tileLabel}>{t('member.meanGap')}</p>
                </div>
                <div className={tile}>
                  <p className={`${tileValue} flex items-center justify-center gap-1`}>
                    {comparison.bias >= 0 ? (
                      <TrendingUp size={18} className="text-forest dark:text-lime-400" />
                    ) : (
                      <TrendingDown size={18} className="text-orange-400" />
                    )}
                    {Math.abs(comparison.bias).toFixed(1)}
                  </p>
                  <p className={tileLabel}>
                    {comparison.bias >= 0 ? t('member.moreGenerous') : t('member.moreSevere')}
                  </p>
                </div>
              </div>

              <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                {comparison.meanGap < 1
                  ? t('member.tastesClose', { name })
                  : comparison.meanGap < 2.5
                    ? t('member.tastesMixed', { name })
                    : t('member.tastesFar', { name })}
              </p>

              <div className="bg-stone-50 dark:bg-[#161616] rounded-2xl p-4 border border-stone-100 dark:border-white/5 space-y-3">
                <p className="text-[9px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                  {t('member.widestGap')}
                </p>
                <div className="flex items-center gap-3">
                  {comparison.widest.film.posterUrl ? (
                    <img
                      src={resizeTmdbImage(comparison.widest.film.posterUrl, 'w154')}
                      alt=""
                      className="w-10 rounded-md object-cover aspect-[2/3] shrink-0"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <div className="w-10 aspect-[2/3] bg-stone-200 dark:bg-[#252525] rounded-md shrink-0 flex items-center justify-center">
                      <Film size={12} className="text-stone-400" />
                    </div>
                  )}
                  <p className="flex-1 min-w-0 text-xs font-bold text-charcoal dark:text-white truncate">
                    {comparison.widest.film.title}
                  </p>
                  <div className="flex items-center gap-2 shrink-0 tabular-nums">
                    <span className="text-[10px] font-black text-stone-400 dark:text-stone-600">
                      {t('member.you')} {comparison.widest.ownRating.toFixed(1)}
                    </span>
                    <span className="text-stone-300 dark:text-stone-700">·</span>
                    <span className="text-[10px] font-black text-charcoal dark:text-white">
                      {name} {comparison.widest.film.rating.toFixed(1)}
                    </span>
                  </div>
                </div>
                <button
                  onClick={shareGap}
                  className="w-full py-2.5 rounded-xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all flex items-center justify-center gap-2"
                >
                  {copied ? <Check size={13} strokeWidth={3} /> : <Copy size={13} />}
                  {copied ? t('member.copied') : t('member.share')}
                </button>
              </div>
            </div>
          )}

          {!loading && films.length > 0 && !comparison && (
            <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed text-center">
              {t('member.noCommonFilm', { name })}
            </p>
          )}

          {comparison && comparison.pairs.length >= 3 && (
            <div className="space-y-3">
              <h4 className={sectionTitle}>
                <ArrowLeftRight size={12} />
                {t('member.curves', { name })}
              </h4>

              <div className="bg-stone-50 dark:bg-[#161616] rounded-2xl p-4 border border-stone-100 dark:border-white/5 space-y-3">
                {/* Deux courbes sur les seuls films vus par les deux, rangés par ma
                    note croissante. La mienne devient une pente régulière, la sienne
                    s'en écarte : l'accord se lit à la distance entre les traits,
                    sans qu'aucun chiffre n'ait à être interprété. */}
                <svg
                  viewBox="0 0 100 40"
                  preserveAspectRatio="none"
                  className="w-full h-24"
                  role="img"
                  aria-label={t('member.curves', { name })}
                >
                  {[0, 20, 40].map((y) => (
                    <line
                      key={y}
                      x1="0"
                      y1={y}
                      x2="100"
                      y2={y}
                      className="stroke-stone-200 dark:stroke-white/10"
                      strokeWidth="0.3"
                    />
                  ))}

                  {(() => {
                    const n = comparison.pairs.length;
                    const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);
                    const y = (v: number) => 40 - Math.max(0, Math.min(10, v)) * 4;
                    const mineLine = comparison.pairs
                      .map((p, i) => `${x(i)},${y(p.ownRating)}`)
                      .join(' ');
                    const theirLine = comparison.pairs
                      .map((p, i) => `${x(i)},${y(p.film.rating)}`)
                      .join(' ');

                    return (
                      <>
                        <polyline
                          points={mineLine}
                          fill="none"
                          className="stroke-stone-400 dark:stroke-stone-500"
                          strokeWidth="1.2"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                        <polyline
                          points={theirLine}
                          fill="none"
                          className="stroke-forest dark:stroke-lime-500"
                          strokeWidth="1.6"
                          strokeLinejoin="round"
                          vectorEffect="non-scaling-stroke"
                        />
                      </>
                    );
                  })()}
                </svg>

                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                      <span className="w-4 h-0.5 bg-stone-400 dark:bg-stone-500 rounded-full" />
                      {t('member.you')}
                    </span>
                    <span className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-forest dark:text-lime-400">
                      <span className="w-4 h-0.5 bg-forest dark:bg-lime-500 rounded-full" />
                      {name}
                    </span>
                  </div>
                  <span className="text-[10px] font-black text-stone-300 dark:text-stone-700 tabular-nums">
                    {comparison.pairs.length} {t('member.filmsShort')}
                  </span>
                </div>

                <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                  {t('member.curvesHint')}
                </p>
              </div>
            </div>
          )}

          {toDiscover.length > 0 && (
            <div className="space-y-3">
              <h4 className={sectionTitle}>
                <Compass size={12} />
                {t('member.toDiscover', { name })}
              </h4>
              <div className="space-y-2">
                {toDiscover.map((film) => (
                  <div
                    key={film.id}
                    className="flex items-center gap-3 bg-stone-50 dark:bg-[#161616] rounded-2xl p-3 border border-stone-100 dark:border-white/5"
                  >
                    {film.posterUrl ? (
                      <img
                        src={resizeTmdbImage(film.posterUrl, 'w154')}
                        alt=""
                        className="w-8 rounded-md object-cover aspect-[2/3] shrink-0"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-8 aspect-[2/3] bg-stone-200 dark:bg-[#252525] rounded-md shrink-0 flex items-center justify-center">
                        <Film size={12} className="text-stone-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-charcoal dark:text-white truncate">
                        {film.title}
                      </p>
                      <p className="text-[10px] text-stone-400 dark:text-stone-600 truncate">
                        {film.director} · {film.year}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-charcoal bg-bitter-lime px-2.5 py-1 rounded-lg shrink-0">
                      <Star size={10} fill="currentColor" />
                      <span className="text-[10px] font-black tabular-nums">
                        {film.rating.toFixed(1)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
              {comparison && Math.abs(comparison.bias) >= 0.8 && (
                <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                  {comparison.bias > 0
                    ? t('member.adjustDown', { gap: Math.abs(comparison.bias).toFixed(1) })
                    : t('member.adjustUp', { gap: Math.abs(comparison.bias).toFixed(1) })}
                </p>
              )}
            </div>
          )}

          {stats && (
            <div className="space-y-3">
              <h4 className={sectionTitle}>
                <Users size={12} />
                {t('member.theirProfile', { name })}
              </h4>
              <div className="grid grid-cols-3 gap-3">
                <div className={tile}>
                  <p className={tileValue}>{stats.count}</p>
                  <p className={tileLabel}>{t('member.rated')}</p>
                </div>
                <div className={tile}>
                  <p className={tileValue}>{stats.average.toFixed(1)}</p>
                  <p className={tileLabel}>{t('member.average')}</p>
                </div>
                <div className={tile}>
                  <p className="text-sm font-black text-charcoal dark:text-white truncate mt-1.5">
                    {stats.favouriteGenre ?? '-'}
                  </p>
                  <p className={tileLabel}>{t('member.favouriteGenre')}</p>
                </div>
              </div>
            </div>
          )}

          {member.profile?.bio && (
            <div className="space-y-2">
              <h4 className={sectionTitle}>{t('member.bio')}</h4>
              <p className="text-sm font-medium text-charcoal dark:text-stone-300 leading-relaxed p-4 bg-stone-50 dark:bg-[#161616] rounded-2xl border border-stone-100 dark:border-white/5">
                {member.profile.bio}
              </p>
            </div>
          )}

          <div className="space-y-3">
            <h4 className={sectionTitle}>
              <Film size={12} />
              {t('member.topFilms')}
            </h4>
            {loading ? (
              <div className="space-y-2">
                {[...Array(3)].map((_, i) => (
                  <div
                    key={i}
                    className="h-14 bg-stone-100 dark:bg-[#252525] rounded-2xl animate-pulse"
                  />
                ))}
              </div>
            ) : !stats ? (
              <div className="text-center py-8 bg-stone-50 dark:bg-[#161616] rounded-2xl border border-dashed border-stone-200 dark:border-white/10">
                <p className="text-[10px] font-bold text-stone-400 dark:text-stone-600 uppercase tracking-widest">
                  {t('member.noFilm')}
                </p>
                {/* Un membre qui n'a jamais sauvegardé ses films en ligne n'a rien
                    à montrer, et ce n'est pas une erreur : on le dit plutôt que de
                    laisser croire à une fiche vide. */}
                <p className="text-[10px] font-medium text-stone-400 dark:text-stone-600 mt-2 px-6 leading-relaxed">
                  {t('member.noFilmHint')}
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {stats.top.map((film, i) => {
                  const own = film.tmdbId != null ? myByTmdb.get(film.tmdbId) : undefined;
                  const ownRating = own ? myRatingOf(own) : null;
                  const isOpen = openFilm === film.id;
                  const gap = ownRating != null ? film.rating - ownRating : null;

                  return (
                  <div
                    key={film.id}
                    className="bg-stone-50 dark:bg-[#161616] rounded-2xl border border-stone-100 dark:border-white/5 overflow-hidden"
                  >
                  <button
                    onClick={() => {
                      haptics.soft();
                      setOpenFilm(isOpen ? null : film.id);
                    }}
                    aria-expanded={isOpen}
                    className="w-full flex items-center gap-3 p-3 text-left active:scale-[0.99] transition-transform"
                  >
                    <span className="text-[10px] font-black text-stone-300 dark:text-stone-700 w-4 text-center shrink-0">
                      {i + 1}
                    </span>
                    {film.posterUrl ? (
                      <img
                        src={resizeTmdbImage(film.posterUrl, 'w154')}
                        alt=""
                        className="w-8 rounded-md object-cover aspect-[2/3] shrink-0"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      <div className="w-8 aspect-[2/3] bg-stone-200 dark:bg-[#252525] rounded-md shrink-0 flex items-center justify-center">
                        <Film size={12} className="text-stone-400" />
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-charcoal dark:text-white truncate">
                        {film.title}
                      </p>
                      <p className="text-[10px] text-stone-400 dark:text-stone-600 truncate">
                        {film.director} · {film.year}
                      </p>
                    </div>
                    <div className="flex items-center gap-1 text-charcoal bg-bitter-lime px-2.5 py-1 rounded-lg shrink-0">
                      <Star size={10} fill="currentColor" />
                      <span className="text-[10px] font-black tabular-nums">
                        {film.rating.toFixed(1)}
                      </span>
                    </div>
                    <ChevronDown
                      size={14}
                      className={`shrink-0 text-stone-300 dark:text-stone-700 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                    />
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 animate-[fadeIn_0.2s_ease-out]">
                      {ownRating == null ? (
                        /* Ne pas avoir vu le film est une information en soi, et
                           c'est le moment le plus naturel pour le mettre de côté. */
                        <div className="bg-white dark:bg-[#202020] rounded-xl p-3 border border-stone-100 dark:border-white/5">
                          <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                            {t('member.notSeen', { name })}
                          </p>
                        </div>
                      ) : (
                        <div className="bg-white dark:bg-[#202020] rounded-xl p-3 border border-stone-100 dark:border-white/5 space-y-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600">
                              {t('member.you')}
                            </span>
                            <div className="flex-1 h-1.5 bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-stone-400 dark:bg-stone-600 transition-all duration-500"
                                style={{ width: `${Math.max(0, Math.min(100, ownRating * 10))}%` }}
                              />
                            </div>
                            <span className="text-xs font-black text-charcoal dark:text-white tabular-nums w-8 text-right">
                              {ownRating.toFixed(1)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <span className="text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-600 truncate max-w-[70px]">
                              {name}
                            </span>
                            <div className="flex-1 h-1.5 bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-forest dark:bg-lime-500 transition-all duration-500"
                                style={{ width: `${Math.max(0, Math.min(100, film.rating * 10))}%` }}
                              />
                            </div>
                            <span className="text-xs font-black text-charcoal dark:text-white tabular-nums w-8 text-right">
                              {film.rating.toFixed(1)}
                            </span>
                          </div>
                          <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed pt-1">
                            {Math.abs(gap as number) < 0.5
                              ? t('member.sameVerdict')
                              : (gap as number) > 0
                                ? t('member.theyLiked', { name, gap: Math.abs(gap as number).toFixed(1) })
                                : t('member.youLiked', { name, gap: Math.abs(gap as number).toFixed(1) })}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                  </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
