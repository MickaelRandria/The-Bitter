import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  ArrowLeft,
  Plus,
  Users,
  Star,
  Loader2,
  Film,
  Trash2,
  X,
  Copy,
  Check,
  History,
  Bookmark,
  CheckCircle2,
  Ticket,
  UserCheck,
  UserMinus,
  AlertTriangle,
  BarChart3,
  ChevronRight,
  Settings,
  Flag,
  UserPlus,
} from 'lucide-react';
import {
  SharedSpace,
  SharedMovie,
  SpaceMember,
  MovieRating,
  getSpaceMovies,
  getSpaceMembers,
  getSpaceRatings,
  getSpaceMovieVotes,
  setMovieVote,
  markMovieAsWatched,
  deleteSharedMovie,
  leaveSharedSpace,
  subscribeToSpace,
  MovieVote,
  MemberFilm,
  addMovieToSpace,
} from '../services/supabase';
import { haptics } from '../utils/haptics';
import { resizeTmdbImage } from '../utils/tmdbImage';
import SpacePitchPanel, { MemberTaste } from './SpacePitchPanel';
import PlanPanel from './PlanPanel';
import { WatchPlan, acceptSlot, chosenSlotOf, currentPlanFor, getSpacePlans, subscribeToPlans } from '../services/plans';
import SpaceTodoStack from './SpaceTodoStack';
import SwipeRow from './SwipeRow';
import { backdropKey, useBackdrops } from '../services/backdrops';
import { monogramOf, tintOf } from '../utils/spaceLook';
import { TodoItem, buildTodo, personalVerdicts as personalWorks, readSkipped, skipTodo } from '../services/spaceTodo';
import { publishVerdictToSpaces } from '../services/spaceSync';
import { formatRating, formatSlot } from '../supabase/functions/notify/messages.ts';
import { getDisplayWeightedRating, hasVerdict } from '../utils/rating';
import { useLanguage } from '../contexts/LanguageContext';
import { FavoriteCinema, Movie } from '../types';
import { useResumeRefresh } from '../utils/useResumeRefresh';
import { avatarSrc } from '../utils/avatar';
import MemberProfileModal from './MemberProfileModal';
import SpaceSettingsModal from './SpaceSettingsModal';
import SharingNotice from './SharingNotice';
import PublicRatingBadge from './PublicRatingBadge';
import ReportSheet from './ReportSheet';
import { ReportTarget, useBlockedUsers } from '../services/moderation';
import { ImdbLookup, useImdbRatings } from '../services/imdb';
import { pickFromLookup, pickPublicRating } from '../utils/publicRating';
import VerdictSheet from './verdict/VerdictSheet';
import MonthlyRecap from './verdict/MonthlyRecap';
import SpaceStatsView from './verdict/SpaceStatsView';
import { Avatar, Poster, ProgressRing, VerdictPerson } from './verdict/VerdictBits';
import { VerdictExtras, emptyExtras, loadVerdictExtras, subscribeToVerdicts } from '../services/verdicts';
import { membersWithPush } from '../services/voteReminders';
import { SpaceSuggestion, getSpaceSuggestions, proposeSuggestion } from '../services/spaceSuggestions';
import { agreementOf, expectedRaters, fmt1, guessLeaderboard, mean, spreadOf, verdictState } from '../utils/verdict';

interface SharedSpaceViewProps {
  space: SharedSpace;
  currentUserId: string;
  onBack: () => void;
  onAddMovie: () => void;
  /**
   * Ouvre le formulaire de notation habituel sur un film déjà présent dans l'espace.
   * Il vit dans App, comme pour la collection personnelle : c'est ce qui garantit
   * que les deux chemins passent par la même grille.
   */
  onRateMovie: (movie: SharedMovie, existingRating: MovieRating | null) => void;
  /** Collection personnelle, pour comparer ses verdicts a ceux d'un membre. */
  myMovies: Movie[];
  refreshTrigger?: number;
  /** Cinéma favori, pour proposer les vraies séances d'un film. */
  favoriteCinema?: FavoriteCinema;
  /** Film à ouvrir d'emblée : celui d'une notification touchée. */
  focusMovieId?: string | null;
  onFocusHandled?: () => void;
  onToast?: (message: string) => void;
}

/** Teintes des membres, dans l'ordre de la liste ; la mienne est l'anthracite. */
const MEMBER_TINTS = ['#B45309', '#3E5238', '#3D405B', '#7F5539', '#2F3E46', '#6B705C'];

/** Avatar d'un membre : sa photo, sinon son initiale sur sa teinte. */
const MemberDot: React.FC<{ member: SpaceMember; color?: string; isMe: boolean; className?: string }> = ({
  member,
  color,
  isMe,
  className = '',
}) => {
  const src = avatarSrc(member.profile?.avatar_url);
  return (
    <span
      className={`rounded-full overflow-hidden flex items-center justify-center font-black shrink-0 ${isMe ? 'dark:!bg-bitter-lime dark:!text-charcoal' : ''} ${className}`}
      style={{ background: isMe ? '#1A1A1A' : color ?? '#78716C', color: isMe ? '#D9FF00' : '#FFFFFF' }}
    >
      {src ? (
        <img src={src} alt="" className="w-full h-full object-cover" />
      ) : (
        (member.profile?.first_name || '?')[0].toUpperCase()
      )}
    </span>
  );
};

/** Une affiche introuvable laisse voir le fond plutôt qu'une icône d'image cassée. */
const hideBroken = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = 'hidden';
};

/** Affiche d'une ligne de film. */
const MoviePoster: React.FC<{ url?: string }> = ({ url }) => (
  <span className="w-11 h-[66px] shrink-0 rounded-[10px] overflow-hidden bg-stone-200 dark:bg-[#161616] flex items-center justify-center">
    {url ? (
      <img src={resizeTmdbImage(url, 'w185')} alt="" className="w-full h-full object-cover" loading="lazy" decoding="async" onError={hideBroken} />
    ) : (
      <Film size={14} className="text-stone-400" />
    )}
  </span>
);

const SharedSpaceView: React.FC<SharedSpaceViewProps> = ({
  space: initialSpace,
  currentUserId,
  onBack,
  onAddMovie,
  onRateMovie,
  myMovies,
  refreshTrigger,
  favoriteCinema,
  focusMovieId,
  onFocusHandled,
  onToast,
}) => {
  const { t } = useLanguage();
  /** La liste des membres, ouverte depuis la rangée d'avatars de l'en-tête. */
  const [showMembers, setShowMembers] = useState(false);
  const [movies, setMovies] = useState<SharedMovie[]>([]);
  const [members, setMembers] = useState<SpaceMember[]>([]);
  const [votes, setVotes] = useState<MovieVote[]>([]);
  /** Séances proposées ou calées, par film. */
  const [plans, setPlans] = useState<WatchPlan[]>([]);
  const reloadPlans = () => getSpacePlans(initialSpace.id).then(setPlans);
  // Notes IMDb des films de l'espace. Les saisons, qu'IMDb ne note pas, gardent TMDB.
  const imdbRatings = useImdbRatings(
    movies
      .filter((m) => m.tmdb_id && (m as { season_number?: number | null }).season_number == null)
      .map((m): ImdbLookup => ({ mediaType: m.media_type === 'tv' ? 'tv' : 'movie', tmdbId: m.tmdb_id! })),
    'high'
  );
  const [loading, setLoading] = useState(true);
  const [expandedMovie, setExpandedMovie] = useState<string | null>(null);
  const [isLeaving, setIsLeaving] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const [selectedMember, setSelectedMember] = useState<SpaceMember | null>(null);
  const [reporting, setReporting] = useState<ReportTarget | null>(null);
  const blocked = useBlockedUsers();

  /**
   * Ce qui manquait à tout l'écran : de quoi dire que ça a raté.
   *
   * `loadError` distingue un espace refusé d'un espace vide, les deux affichaient
   * jusqu'ici le même « c'est encore calme ici ». `actionError` porte l'échec d'une
   * écriture, qui passait totalement inaperçu.
   */
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  /** Vrai quand le chargement dépasse dix secondes. */
  const [slow, setSlow] = useState(false);
  /** Toutes les notes de l'espace, pour raisonner sur le groupe et non film par film. */
  const [allRatings, setAllRatings] = useState<MovieRating[]>([]);
  /** Ce qui entoure les verdicts : pas vus, paris, réactions, débat, relances. */
  const [extras, setExtras] = useState<VerdictExtras>(emptyExtras);
  const reloadExtras = () => loadVerdictExtras(initialSpace.id).then(setExtras);
  /** Fiche verdict ouverte, et vue « Nos stats ». */
  const [openVerdictId, setOpenVerdictId] = useState<string | null>(null);
  const [showStats, setShowStats] = useState(false);
  /** Co-membres qui reçoivent les notifications : les autres sont relancés par message. */
  const [pushIds, setPushIds] = useState<Set<string>>(new Set());
  useEffect(() => {
    void membersWithPush().then(setPushIds);
  }, []);
  /** L'espace peut être renommé pendant la session : on garde la version à jour. */
  const [space, setSpace] = useState(initialSpace);
  /**
   * Bandeau de première ouverture.
   *
   * Par espace ET par personne : quelqu'un peut être membre de plusieurs espaces,
   * et l'avertissement porte sur ce qu'il expose à CE groupe. Le stockage local
   * suffit, se tromper coûte un bandeau vu deux fois, pas une donnée exposée.
   */
  const noticeKey = `bitter_space_notice_${initialSpace.id}_${currentUserId}`;
  const [noticeSeen, setNoticeSeen] = useState(
    () => localStorage.getItem(noticeKey) === '1'
  );

  useEffect(() => {
    setSpace(initialSpace);
  }, [initialSpace]);

  useEffect(() => {
    loadData();
  }, [space.id, refreshTrigger]);

  /**
   * Temps réel. `subscribeToSpace` était écrit depuis le début et importé nulle part :
   * un membre ne voyait jamais l'action d'un autre sans quitter l'espace et y revenir,
   * ce qui vidait la fonctionnalité de sa raison d'être.
   *
   * Les canaux des notes et des votes ne peuvent pas être filtrés par espace, ces
   * tables n'ayant pas de `space_id`. On regroupe donc les rafales dans un court
   * délai plutôt que de relancer trois lectures à chaque évènement reçu.
   */
  /**
   * Compteur de reprise.
   *
   * Il sert de dépendance à l'abonnement temps réel : l'incrémenter démonte les
   * canaux et les rouvre. Un canal suspendu par iOS ne se réveille pas tout seul,
   * et rien ne le signale : sans cette reconstruction, l'écran restait branché sur
   * une connexion morte tout en paraissant à jour.
   */
  const [resumeTick, setResumeTick] = useState(0);

  useResumeRefresh(() => {
    setResumeTick((n) => n + 1);
    loadData(true);
  });

  useEffect(() => {
    let pending: ReturnType<typeof setTimeout> | null = null;

    const scheduleReload = () => {
      if (pending) clearTimeout(pending);
      pending = setTimeout(() => {
        pending = null;
        loadData(true);
      }, 400);
    };

    const unsubscribe = subscribeToSpace(space.id, scheduleReload, scheduleReload);
    const unsubscribePlans = subscribeToPlans(space.id, () => {
      reloadPlans();
    });
    const unsubscribeVerdicts = subscribeToVerdicts(space.id, scheduleReload);

    return () => {
      if (pending) clearTimeout(pending);
      unsubscribe();
      unsubscribePlans();
      unsubscribeVerdicts();
    };
  }, [space.id, resumeTick]);

  /**
   * `silent` sert aux rafraîchissements déclenchés par un autre membre : remettre
   * l'écran en chargement ferait clignoter la liste à chaque vote reçu.
   */
  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setSlow(false);
    setLoadError(null);
    const slowTimer = setTimeout(() => setSlow(true), 10000);

    // `finally` plutôt qu'une simple ligne en fin de fonction : une exception
    // laissée passer bloquerait l'indicateur pour de bon, et le bouton actualiser
    // tournerait dans le vide sans plus jamais s'arrêter.
    try {
      const [movies, members, votes, ratings] = await Promise.all([
        getSpaceMovies(space.id),
        getSpaceMembers(space.id),
        getSpaceMovieVotes(space.id),
        getSpaceRatings(space.id),
      ]);

      // La première erreur suffit : les trois lectures échouent pour la même raison
      // quand c'est le RLS ou le réseau qui refuse.
      const failure = movies.error || members.error || votes.error;
      if (failure) setLoadError(failure);

      // Deduplicate movies and members
      const uniqueMovies = Array.from(new Map(movies.data.map((m) => [m.id, m])).values());
      const uniqueMembers = Array.from(new Map(members.data.map((m) => [m.id, m])).values());

      setMovies(uniqueMovies);
      setMembers(uniqueMembers);
      setVotes(votes.data);
      setAllRatings(ratings.data);
      reloadPlans();
      void reloadExtras();
    } catch (e) {
      console.warn('[Espaces] Chargement interrompu :', e);
      setLoadError(t('shared.loadFailedTitle'));
    } finally {
      clearTimeout(slowTimer);
      setSlow(false);
      setLoading(false);
    }
  };

  const handleExpandMovie = (movieId: string) => {
    if (expandedMovie === movieId) {
      setExpandedMovie(null);
    } else {
      setExpandedMovie(movieId);
    }
    haptics.soft();
  };

  const handleLeaveSpace = () => {
    // Le fondateur qui partait laissait un espace sans propriétaire actif : plus
    // personne ne pouvait le renommer, le supprimer, ni même y rentrer. Deux des
    // cinq espaces de production sont morts exactement comme ça.
    if (isOwner && members.length > 1) {
      haptics.error();
      setActionError(t('shared.leaveOwnerBlocked'));
      setShowSettings(true);
      return;
    }

    setConfirmAction({
      message: t('shared.leaveConfirm', { name: space.name }),
      onConfirm: async () => {
        setIsLeaving(true);
        setActionError(null);
        haptics.medium();

        const result = await leaveSharedSpace(space.id, currentUserId);
        setIsLeaving(false);

        if (!result.ok) {
          haptics.error();
          setActionError(result.error ?? t('shared.leaveFailed'));
          return;
        }
        haptics.success();
        onBack();
      },
    });
  };

  const handleVote = async (e: React.MouseEvent, movieId: string, interested: boolean) => {
    e.stopPropagation();
    haptics.medium();
    setActionError(null);

    const result = await setMovieVote(movieId, currentUserId, interested);
    if (!result.ok) {
      haptics.error();
      setActionError(result.error ?? t('shared.voteFailed'));
      return;
    }

    const refreshed = await getSpaceMovieVotes(space.id);
    if (refreshed.error) setActionError(refreshed.error);
    setVotes(refreshed.data);
  };

  const handleMarkAsWatched = (e: React.MouseEvent, movieId: string) => {
    e.stopPropagation();
    setConfirmAction({
      message: t('shared.watchedConfirm'),
      onConfirm: async () => {
        setActionError(null);
        const result = await markMovieAsWatched(movieId);

        if (!result.ok) {
          haptics.error();
          setActionError(result.error ?? t('shared.watchedFailed'));
          return;
        }
        haptics.success();
        loadData();
      },
    });
  };

  const handleDeleteMovie = (e: React.MouseEvent, movieId: string) => {
    e.stopPropagation();
    setConfirmAction({
      message: t('shared.deleteConfirm'),
      onConfirm: async () => {
        setActionError(null);
        // Retrait optimiste : on remet la liste d'aplomb si le serveur refuse.
        setMovies((prev) => prev.filter((m) => m.id !== movieId));

        const result = await deleteSharedMovie(movieId);
        if (!result.ok) {
          haptics.error();
          setActionError(result.error ?? t('shared.deleteFailed'));
          loadData();
          return;
        }
        haptics.error();
      },
    });
  };

  /**
   * Les membres chargés sont uniquement les actifs, alors que les notes et les votes
   * sont lus sans filtre. Compter les uns contre les autres produisait des « 3 sur 2 »,
   * des barres au-delà de cent pour cent, et un consensus testé sur une égalité stricte
   * qu'un ancien membre rendait définitivement inatteignable.
   */
  const activeMemberIds = new Set<string>(members.map((m) => m.profile_id));

  const isOwner = members.some((m) => m.profile_id === currentUserId && m.role === 'owner');

  /**
   * Ce que le groupe dit, par opposition à ce que chacun dit.
   *
   * Un film ne compte que s'il a été noté par au moins deux membres actifs : à un
   * seul avis il n'y a ni consensus ni désaccord, seulement une opinion. L'écart
   * type serait plus juste qu'une amplitude, mais l'amplitude se lit sans
   * explication, et c'est elle qui fait discuter.
   */
  /**
   * Note d'un membre sur un film.
   *
   * La note pondérée de Bitter+ prime dès qu'elle existe : c'est celle que son
   * auteur a réellement vue à l'écran. On ne retombe sur la moyenne simple des
   * quatre critères que pour les notes posées avant l'unification, ou en mode
   * Bitter. Moyenner les deux formes sans distinction fausserait le verdict du
   * groupe, une note pondérée n'étant presque jamais égale à la moyenne brute.
   *
   * Déclarée AVANT `groupStats`, et cet ordre n'est pas cosmétique : le corps
   * d'un `useMemo` s'exécute au moment où on l'écrit, pas plus tard. Placée en
   * dessous, cette fonction était encore dans sa zone morte quand `groupStats`
   * l'appelait — « Cannot access uninitialized variable », et tout l'écran
   * disparaissait.
   *
   * Le défaut a dormi depuis le premier jour : `groupStats` n'atteint cet appel
   * qu'en parcourant les notes du groupe, et il n'y en avait aucune. La toute
   * première note posée dans l'espace l'a réveillé.
   */
  const ratingValue = (r: MovieRating): number => {
    const weighted = r.adaptive_rating?.weightedRating;
    if (typeof weighted === 'number' && Number.isFinite(weighted)) return weighted;
    return (Number(r.story) + Number(r.visuals) + Number(r.acting) + Number(r.sound)) / 4;
  };

  const groupStats = useMemo(() => {
    if (members.length < 2) return null;

    const byMovie = new Map<string, { value: number; profile: string }[]>();
    for (const r of allRatings) {
      if (!activeMemberIds.has(r.profile_id)) continue;
      const list = byMovie.get(r.movie_id) ?? [];
      list.push({ value: ratingValue(r), profile: r.profile_id });
      byMovie.set(r.movie_id, list);
    }

    const judged = [...byMovie.entries()]
      .filter(([, list]) => list.length >= 2)
      .map(([movieId, list]) => {
        const values = list.map((v) => v.value);
        const high = Math.max(...values);
        const low = Math.min(...values);
        return {
          movie: movies.find((m) => m.id === movieId),
          low,
          high,
          spread: high - low,
          average: values.reduce((a, b) => a + b, 0) / values.length,
          voters: list.length,
        };
      })
      .filter((entry) => entry.movie);

    if (judged.length === 0) return null;

    const bySpread = [...judged].sort((a, b) => a.spread - b.spread);

    // Le plus sévère et le plus généreux : moyenne personnelle sur les seuls films
    // que la personne a réellement notés dans cet espace.
    const byMember = new Map<string, number[]>();
    for (const r of allRatings) {
      if (!activeMemberIds.has(r.profile_id)) continue;
      const list = byMember.get(r.profile_id) ?? [];
      list.push(ratingValue(r));
      byMember.set(r.profile_id, list);
    }

    const averages = [...byMember.entries()]
      .filter(([, values]) => values.length > 0)
      .map(([profileId, values]) => ({
        name:
          members.find((m) => m.profile_id === profileId)?.profile?.first_name ??
          t('shared.member'),
        average: values.reduce((a, b) => a + b, 0) / values.length,
      }))
      .sort((a, b) => a.average - b.average);

    /**
     * À qui se fier quand il conseille un film.
     *
     * On compare, film par film, sa note à la mienne dans cet espace, et on retient
     * celui dont l'écart moyen est le plus faible. C'est la question qu'un groupe se
     * pose vraiment, et elle ne se lit sur aucune moyenne générale : deux personnes
     * peuvent noter pareil en moyenne et n'être jamais d'accord sur un film donné.
     */
    const myRatings = new Map<string, number>();
    for (const r of allRatings) {
      if (r.profile_id === currentUserId) myRatings.set(r.movie_id, ratingValue(r));
    }

    const affinity = [...byMember.keys()]
      .filter((profileId) => profileId !== currentUserId)
      .map((profileId) => {
        const gaps = allRatings
          .filter((r) => r.profile_id === profileId && myRatings.has(r.movie_id))
          .map((r) => Math.abs(ratingValue(r) - (myRatings.get(r.movie_id) as number)));
        return {
          name:
            members.find((m) => m.profile_id === profileId)?.profile?.first_name ??
            t('shared.member'),
          shared: gaps.length,
          gap: gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length : Infinity,
        };
      })
      // Un seul film en commun ne fait pas une affinité, c'est une coïncidence.
      .filter((entry) => entry.shared >= 2)
      .sort((a, b) => a.gap - b.gap);

    return {
      companion: affinity[0] ?? null,
      judged: judged.length,
      average: judged.reduce((sum, e) => sum + e.average, 0) / judged.length,
      consensus: bySpread[0],
      divisive: bySpread[bySpread.length - 1],
      harshest: averages[0],
      kindest: averages[averages.length - 1],
      /** Sans écart réel, désigner un film consensuel et un film clivant n'a pas de sens. */
      meaningful: bySpread[bySpread.length - 1].spread >= 1 && averages.length >= 2,
    };
  }, [allRatings, movies, members, activeMemberIds, currentUserId, t]);




  /**
   * Mes verdicts personnels, par œuvre entière. Le bouton de notation d'un film
   * que j'ai déjà noté seul propose de publier cette note, préremplie, plutôt
   * que de la redemander.
   */
  const personalVerdicts = useMemo(() => {
    const map = new Map<string, number>();
    for (const m of myMovies) {
      if (m.tmdbId == null || m.seasonNumber != null || m.status !== 'watched' || !hasVerdict(m)) continue;
      map.set(`${m.mediaType === 'tv' ? 'tv' : 'movie'}:${m.tmdbId}`, getDisplayWeightedRating(m));
    }
    return map;
  }, [myMovies]);

  const calculateAverageRating = (ratings: MovieRating[]) => {
    if (ratings.length === 0) return null;
    const total = ratings.reduce((acc, r) => acc + ratingValue(r), 0);
    return (total / ratings.length).toFixed(1);
  };

  /**
   * Postgres rend ses colonnes `numeric` sous forme de texte, pour ne pas perdre
   * de précision en route. Les notes arrivent donc en « 6.1 » et non en 6.1,
   * alors que le type TypeScript annonce un nombre — le compilateur ne peut rien
   * voir, et l'addition devient une concaténation.
   *
   * Toute valeur venue de la base passe donc par ici avant le moindre calcul.
   */
  const asNumber = (value: unknown): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  };

  const publicRatingOf = (movie: SharedMovie) =>
    movie.tmdb_id && (movie as { season_number?: number | null }).season_number == null
      ? pickFromLookup(imdbRatings, movie.media_type === 'tv' ? 'tv' : 'movie', movie.tmdb_id, asNumber(movie.tmdb_rating))
      : pickPublicRating(null, asNumber(movie.tmdb_rating));

  const calculateCriteriaAverages = (ratings: MovieRating[]) => {
    if (ratings.length === 0) return null;
    return {
      story: ratings.reduce((acc, r) => acc + asNumber(r.story), 0) / ratings.length,
      visuals: ratings.reduce((acc, r) => acc + asNumber(r.visuals), 0) / ratings.length,
      acting: ratings.reduce((acc, r) => acc + asNumber(r.acting), 0) / ratings.length,
      sound: ratings.reduce((acc, r) => acc + asNumber(r.sound), 0) / ratings.length,
    };
  };

  /**
   * Les membres à qui un film peut être proposé.
   *
   * Leur goût est laissé vide ici : il sera lu dans leur collection au moment
   * où quelqu'un demande l'argumentaire. Une première version le calculait à
   * partir des verdicts posés dans l'espace — élégant, aucune requête, données
   * déjà en mémoire — mais l'espace n'en contenait aucun, donc personne n'avait
   * de goût et le panneau se masquait lui-même. Or un espace qui démarre est
   * exactement celui où l'on a le plus besoin qu'on nous dise si un film nous
   * concerne.
   */
  const memberTastes = useMemo<MemberTaste[]>(
    () =>
      members
        .filter((member) => activeMemberIds.has(member.profile_id))
        .map((member) => ({
          profileId: member.profile_id,
          name: member.profile?.first_name || t('shared.unknown'),
          taste: '',
        })),
    [members, activeMemberIds, t]
  );

  const feedMovies = useMemo(() => movies.filter((m) => m.status === 'watched'), [movies]);

  /** Prénoms des membres, pour dire qui vient à la séance. */
  const memberNames = useMemo(
    () => Object.fromEntries(members.map((m) => [m.profile_id, m.profile?.first_name || ''])),
    [members]
  );

  /** Demandes écartées (« Pas vu », « Pas dispo ») : elles ne reviennent pas. */
  const [skipped, setSkipped] = useState<Set<string>>(() => readSkipped(currentUserId));
  const myWorks = useMemo(() => personalWorks(myMovies), [myMovies]);
  /** « À toi de jouer » : ce que le groupe attend de moi, une carte par demande. */
  const todo = useMemo(
    () =>
      buildTodo({
        movies,
        votes,
        ratings: allRatings,
        plans,
        userId: currentUserId,
        personal: myWorks,
        skipped,
        blocked,
      }),
    [movies, votes, allRatings, plans, currentUserId, myWorks, skipped, blocked]
  );

  const answerWatch = async (item: TodoItem, interested: boolean): Promise<boolean> => {
    setActionError(null);
    const result = await setMovieVote(item.movie.id, currentUserId, interested);
    if (!result.ok) {
      setActionError(result.error ?? t('shared.voteFailed'));
      return false;
    }
    onToast?.(interested ? t('todo.answeredYes') : t('social.answeredNo'));
    const refreshed = await getSpaceMovieVotes(space.id);
    if (!refreshed.error) setVotes(refreshed.data);
    return true;
  };

  const publishMine = async (item: TodoItem): Promise<boolean> => {
    if (!item.mine) return false;
    setActionError(null);
    const done = await publishVerdictToSpaces(item.mine, currentUserId, [
      {
        sharedMovieId: item.movie.id,
        spaceId: space.id,
        spaceName: space.name,
        status: item.movie.status,
        myRating: null,
      },
    ]);
    if (!done.length) {
      setActionError(t('spaceSync.failed'));
      return false;
    }
    onToast?.(t('todo.published'));
    void loadData(true);
    return true;
  };

  const acceptPlanSlot = async (_item: TodoItem, slotId: string): Promise<boolean> => {
    setActionError(null);
    const result = await acceptSlot(slotId);
    if (!result.ok) {
      setActionError(result.error ?? t('social.failed'));
      void reloadPlans();
      return false;
    }
    onToast?.(t('todo.planAgreed'));
    void reloadPlans();
    return true;
  };

  const skipItem = (item: TodoItem) => {
    skipTodo(currentUserId, item.key);
    setSkipped((prev) => new Set(prev).add(item.key));
  };

  /**
   * Notification touchée : on ouvre l'espace sur SON film, dans le bon onglet,
   * déplié. Sinon la personne arrive sur un espace et doit chercher de quoi il
   * s'agissait.
   */
  useEffect(() => {
    if (!focusMovieId || movies.length === 0) return;
    const target = movies.find((m) => m.id === focusMovieId);
    onFocusHandled?.();
    if (!target) return;
    if (target.status === 'watched') {
      setOpenVerdictId(target.id);
      return;
    }
    setExpandedMovie(target.id);
    window.setTimeout(() => {
      document.getElementById(`space-movie-${target.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 250);
  }, [focusMovieId, movies]);
  /**
   * « À voir ensemble », classé par envie : le nombre de partants d'abord, puis
   * le plus récent. Les « pas envie » comptaient jusqu'ici comme des voix.
   */
  const watchlistMovies = useMemo(() => {
    const keen = (id: string) =>
      votes.filter((v) => v.movie_id === id && v.interested && activeMemberIds.has(v.profile_id)).length;
    return movies
      .filter((m) => m.status === 'watchlist')
      .sort((a, b) => keen(b.id) - keen(a.id) || (b.added_at ?? '').localeCompare(a.added_at ?? ''));
  }, [movies, votes, members]);

  /**
   * Depuis la fiche d'un membre : un film que vous avez vu tous les deux entre
   * dans les « vus ensemble ». Vos deux notes perso suivent, posées par le
   * serveur (trigger `shared_movies_collect_verdicts`).
   */
  const addWatchedTogether = async (film: MemberFilm): Promise<boolean> => {
    if (!currentUserId || film.tmdbId == null) return false;
    const { movie, error } = await addMovieToSpace(
      space.id,
      {
        tmdb_id: film.tmdbId,
        title: film.title,
        director: film.director,
        year: film.year,
        genre: film.genre ?? '',
        poster_url: film.posterUrl,
        status: 'watched',
        media_type: film.mediaType,
      },
      currentUserId
    );
    if (!movie) {
      onToast?.(error ?? t('member.bothSeenFailed'));
      return false;
    }
    onToast?.(t('member.bothSeenToast', { title: film.title, space: space.name }));
    void loadData(true);
    return true;
  };

  /** Les notes de chaque film, déjà toutes chargées avec l'espace. */
  const ratingsByMovie = useMemo(() => {
    const map = new Map<string, MovieRating[]>();
    for (const r of allRatings) map.set(r.movie_id, [...(map.get(r.movie_id) ?? []), r]);
    return map;
  }, [allRatings]);

  /** Films qu'on attend que je note : leurs notes restent floutées pour moi. */
  const rateTodoIds = useMemo(
    () => new Set(todo.filter((i) => i.kind === 'rate').map((i) => i.movie.id)),
    [todo]
  );

  /** Images de fond TMDB des films de l'espace (voir `services/backdrops`). */
  const backdrops = useBackdrops(movies.map((m) => ({ tmdbId: m.tmdb_id, mediaType: m.media_type })));

  const memberColors = useMemo(() => {
    const colors: Record<string, string> = {};
    members
      .filter((m) => m.profile_id !== currentUserId)
      .forEach((m, i) => {
        colors[m.profile_id] = MEMBER_TINTS[i % MEMBER_TINTS.length];
      });
    colors[currentUserId] = '#1A1A1A';
    return colors;
  }, [members, currentUserId]);

  /**
   * Les membres tels que les verdicts et « Nos stats » les dessinent : moi
   * d'abord, puis les autres dans l'ordre de l'espace, chacun avec sa couleur de
   * la palette validée (index.css, --vd-c0 à --vd-c3).
   */
  const people = useMemo<VerdictPerson[]>(() => {
    const ordered = [...members.filter((m) => m.profile_id === currentUserId), ...members.filter((m) => m.profile_id !== currentUserId)];
    return ordered.map((m, i) => ({
      id: m.profile_id,
      name: m.profile?.first_name || t('shared.member'),
      avatarUrl: m.profile?.avatar_url,
      color: `var(--vd-c${i === 0 ? 0 : ((i - 1) % 3) + 1})`,
      isMe: m.profile_id === currentUserId,
    }));
  }, [members, currentUserId, t]);

  /**
   * « Et maintenant ? » : les trois suggestions, calculées une fois par visite.
   * Le goût de chacun, c'est son genre le mieux noté dans l'espace ; le goût
   * commun, le film dont la plus basse note du groupe est la plus haute.
   */
  const suggestionsRef = useRef<Promise<SpaceSuggestion[]> | null>(null);
  const loadSuggestions = () => {
    if (!suggestionsRef.current) {
      const tastes = people
        .map((person) => {
          const byGenre = new Map<string, number[]>();
          for (const r of allRatings) {
            if (r.profile_id !== person.id) continue;
            const film = movies.find((m) => m.id === r.movie_id);
            for (const g of film?.genres ?? []) byGenre.set(g, [...(byGenre.get(g) ?? []), ratingValue(r)]);
          }
          const best = [...byGenre.entries()].sort((a, b) => (mean(b[1]) ?? 0) - (mean(a[1]) ?? 0) || b[1].length - a[1].length)[0];
          return best ? { name: person.isMe ? t('spaces.you') : person.name, genre: best[0] } : null;
        })
        .filter((x): x is { name: string; genre: string } => !!x);
      const common = movies
        .filter((m) => m.status === 'watched' && m.tmdb_id && m.media_type !== 'tv')
        .map((m) => {
          const values = allRatings.filter((r) => r.movie_id === m.id && activeMemberIds.has(r.profile_id)).map(ratingValue);
          return { m, low: values.length >= 2 ? Math.min(...values) : -1 };
        })
        .filter((x) => x.low >= 7)
        .sort((a, b) => b.low - a.low)[0];
      suggestionsRef.current = getSpaceSuggestions({
        existing: new Set(movies.map((m) => m.tmdb_id).filter((id): id is number => typeof id === 'number')),
        tastes,
        common: common ? { tmdbId: common.m.tmdb_id!, title: common.m.title } : null,
      });
    }
    return suggestionsRef.current;
  };

  const proposeFromSuggestion = async (suggestion: SpaceSuggestion): Promise<boolean> => {
    const { movie, error } = await proposeSuggestion(space.id, currentUserId, suggestion);
    if (!movie) {
      haptics.error();
      onToast?.(error ?? t('verdict.proposeFailed'));
      return false;
    }
    haptics.success();
    onToast?.(t('verdict.proposedToast', { title: suggestion.title }));
    void loadData(true);
    return true;
  };

  if (loading && movies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="animate-spin text-forest" size={32} />
        <p className="text-[10px] font-black uppercase text-stone-300 dark:text-stone-700 tracking-[0.2em]">
          {t('shared.syncing')}
        </p>
        {/* Cet écran ne proposait aucune sortie : quand le serveur tardait, relancer
            l'application était le seul recours. */}
        {slow && (
          <div className="text-center space-y-3 px-8">
            <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 max-w-[240px] leading-relaxed mx-auto">
              {t('spaces.slow')}
            </p>
            <div className="flex items-center justify-center gap-2">
              <button
                onClick={() => {
                  haptics.soft();
                  loadData();
                }}
                className="px-5 py-2.5 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all"
              >
                {t('shared.retry')}
              </button>
              <button
                onClick={onBack}
                className="px-5 py-2.5 rounded-2xl text-stone-400 dark:text-stone-600 font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all"
              >
                {t('common.back')}
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const tint = tintOf(space);
  /** Les cinq dernières affiches de l'espace, pour le bandeau de l'en-tête. */
  const bandPosters: (string | null)[] = [
    ...[...movies]
      .filter((m) => m.poster_url)
      .sort((a, b) => (b.added_at ?? '').localeCompare(a.added_at ?? ''))
      .slice(0, 5)
      .map((m) => m.poster_url as string),
    null,
    null,
    null,
    null,
    null,
  ].slice(0, 5);

  /** « Léa, Tom et toi ». */
  const membersLabel = (() => {
    const others = members
      .filter((m) => m.profile_id !== currentUserId)
      .map((m) => m.profile?.first_name || t('shared.member'));
    if (!others.length) return t('spaces.youAlone');
    const names = [...others, t('spaces.you')];
    return `${names.slice(0, -1).join(', ')} ${t('spaceSync.and')} ${names[names.length - 1]}`;
  })();

  const personalScoreOf = (movie: SharedMovie) =>
    personalVerdicts.get(`${movie.media_type === 'tv' ? 'tv' : 'movie'}:${movie.tmdb_id}`);

  const rateLabel = (myRating: MovieRating | undefined, mine: number | undefined, fallback: string) =>
    myRating
      ? t('shared.editVerdict')
      : mine != null
        ? t('shared.publishMine', { rating: formatRating(mine) ?? '' })
        : fallback;

  /**
   * Glisser un film de la liste : répondre, ou changer d'avis. Redonner la même
   * réponse ne fait rien (`setMovieVote` l'annulerait). Le vote s'affiche tout
   * de suite, la relecture confirme.
   */
  const swipeVote = async (movieId: string, interested: boolean) => {
    const current = votes.find((v) => v.movie_id === movieId && v.profile_id === currentUserId);
    if (current?.interested === interested) return;
    haptics.medium();
    setActionError(null);
    setVotes((prev) => [
      ...prev.filter((v) => !(v.movie_id === movieId && v.profile_id === currentUserId)),
      {
        id: current?.id ?? `pending-${movieId}`,
        movie_id: movieId,
        profile_id: currentUserId,
        interested,
        created_at: new Date().toISOString(),
      },
    ]);
    const result = await setMovieVote(movieId, currentUserId, interested);
    if (!result.ok) {
      haptics.error();
      setActionError(result.error ?? t('shared.voteFailed'));
    } else {
      onToast?.(interested ? t('todo.answeredYes') : t('social.answeredNo'));
    }
    const refreshed = await getSpaceMovieVotes(space.id);
    if (!refreshed.error) setVotes(refreshed.data);
  };

  /** « On se le fait ? » : la séance se propose dans le panneau du film, qu'on ouvre. */
  const openPlan = (movieId: string) => {
    haptics.medium();
    setExpandedMovie(movieId);
    window.setTimeout(() => {
      document.getElementById(`space-plan-${movieId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 200);
  };

  const watchContext = (movie: SharedMovie) => {
    const movieVotes = votes.filter((v) => v.movie_id === movie.id && activeMemberIds.has(v.profile_id));
    const keenIds = movieVotes.filter((v) => v.interested).map((v) => v.profile_id);
    const myVote = movieVotes.find((v) => v.profile_id === currentUserId) ?? null;
    const everyone = members.length > 1 && keenIds.length >= members.length;
    const plan = currentPlanFor(plans, movie.id);
    const planSlot = plan?.status === 'agreed' ? chosenSlotOf(plan) : null;
    const myRating = (ratingsByMovie.get(movie.id) ?? []).find((r) => r.profile_id === currentUserId);
    const status = planSlot
      ? formatSlot(planSlot)
      : plan
        ? t('plan.pending', { count: String(plan.slots.length) })
        : everyone
          ? t('spaces.everyoneKeen')
          : myVote?.interested === false
            ? t('spaces.notForYou')
            : keenIds.length
              ? t(keenIds.length === 1 ? 'spaces.keenOne' : 'spaces.keenCount', {
                  count: String(keenIds.length),
                  total: String(members.length),
                })
              : t('spaces.noKeenYet');
    const action = planSlot ? null : everyone && !plan ? (
      <button
        onClick={() => openPlan(movie.id)}
        className="shrink-0 h-11 px-3.5 rounded-2xl bg-bitter-lime text-charcoal text-[11px] font-black whitespace-nowrap active:scale-95 transition-transform"
      >
        {t('spaces.letsGo')}
      </button>
    ) : !myVote ? (
      <button
        onClick={(e) => handleVote(e, movie.id, true)}
        className="shrink-0 h-11 px-3.5 rounded-2xl border-[1.5px] border-charcoal dark:border-white text-charcoal dark:text-white text-[11px] font-black whitespace-nowrap active:scale-95 transition-transform"
      >
        {t('spaces.keenQ')}
      </button>
    ) : null;
    return { keenIds, myVote, everyone, plan, planSlot, status, action, myRating, mine: personalScoreOf(movie) };
  };

  const seenContext = (movie: SharedMovie) => {
    const ratings = ratingsByMovie.get(movie.id) ?? [];
    const activeRatings = ratings.filter((r) => activeMemberIds.has(r.profile_id));
    const myRating = ratings.find((r) => r.profile_id === currentUserId);
    const plan = currentPlanFor(plans, movie.id);
    const skipIds = extras.skips.filter((sk) => sk.movie_id === movie.id && activeMemberIds.has(sk.profile_id)).map((sk) => sk.profile_id);
    const raterIds = activeRatings.map((r) => r.profile_id);
    // Même calcul que le serveur (private.expected_raters).
    const expected = expectedRaters({
      activeIds: Array.from(activeMemberIds),
      planParticipants: plan?.status === 'agreed' ? plan.participant_ids : null,
      raterIds,
      skipIds,
    });
    const state = verdictState({ me: currentUserId, expected, raterIds, skipIds });
    const verdictRaters = activeRatings.filter((r) => expected.includes(r.profile_id));
    const spread = spreadOf(verdictRaters.map(ratingValue));
    /**
     * Tant que je n'ai pas noté un film qu'on attend de moi, les notes des autres
     * restent scellées : c'est ce qui donne envie de noter, et ce qui garde ma
     * note à moi.
     */
    const hideOthers = state === 'turn' || (!myRating && rateTodoIds.has(movie.id));
    const scores = [...activeRatings]
      .sort((a, b) => Number(a.profile_id === currentUserId) - Number(b.profile_id === currentUserId))
      .map((r) => {
        const isMe = r.profile_id === currentUserId;
        return {
          id: r.id,
          name: isMe ? t('spaces.you') : r.profile?.first_name || t('shared.member'),
          value: formatRating(ratingValue(r)) ?? '',
          hidden: hideOthers && !isMe,
        };
      });
    const averageValue = verdictRaters.length
      ? verdictRaters.reduce((sum, r) => sum + ratingValue(r), 0) / verdictRaters.length
      : null;
    const average = averageValue == null ? null : fmt1(averageValue);
    return {
      ratings,
      activeRatings,
      myRating,
      mine: personalScoreOf(movie),
      hideOthers,
      scores,
      average,
      averageValue,
      plan,
      skipIds,
      expected,
      state,
      raterIds: verdictRaters.map((r) => r.profile_id),
      missing: expected.filter((id) => !raterIds.includes(id)),
      spread,
      agreement: agreementOf(spread),
    };
  };

  /** L'image d'un bandeau : le fond TMDB, sinon l'affiche recadrée. */
  const imageOf = (movie: SharedMovie): { src?: string; poster: boolean } => {
    const backdrop = backdrops.get(backdropKey({ tmdbId: movie.tmdb_id, mediaType: movie.media_type }));
    if (backdrop) return { src: backdrop, poster: false };
    return { src: resizeTmdbImage(movie.poster_url, 'w500'), poster: true };
  };

  /** Tête d'affiche : seulement si au moins deux membres le veulent, sinon « N°1 » ne veut rien dire. */
  const isHeadliner = (movie: SharedMovie) => {
    const ctx = watchContext(movie);
    return ctx.everyone || ctx.keenIds.length >= 2;
  };

  /** Un film de « À voir ensemble » : en tête d'affiche ou en bandeau, toujours à glisser. */
  const renderWatchItem = (movie: SharedMovie, headliner: boolean) => {
    const ctx = watchContext(movie);
    const isExpanded = expandedMovie === movie.id;
    const image = imageOf(movie);
    const proposer =
      movie.added_by === currentUserId
        ? t('spaces.proposedByYou')
        : t('todo.proposedBy', { name: memberNames[movie.added_by ?? ''] || t('shared.member') });
    // « tous partants » est déjà dit sous le titre : le surtitre n'a pas à le répéter.
    const kicker = headliner ? t('spaces.topWish') : proposer;
    const cta = ctx.planSlot ? null : ctx.everyone && !ctx.plan ? (
      <button
        onClick={() => openPlan(movie.id)}
        className="h-11 px-4 rounded-full bg-bitter-lime text-charcoal text-xs font-black whitespace-nowrap active:scale-95 transition-transform"
      >
        {t('spaces.letsGo')}
      </button>
    ) : !ctx.myVote ? (
      <button
        onClick={(e) => handleVote(e, movie.id, true)}
        className="h-11 px-4 rounded-full border-[1.5px] border-white/80 text-white text-xs font-black whitespace-nowrap active:scale-95 transition-transform"
      >
        {t('spaces.keenQ')}
      </button>
    ) : null;
    return (
      <div
        key={movie.id}
        id={`space-movie-${movie.id}`}
        className="rounded-[1.6rem] overflow-hidden bg-charcoal shadow-[0_18px_30px_-22px_rgba(26,26,26,0.7)]"
      >
        <SwipeRow
          rightLabel={t('todo.keen')}
          leftLabel={t('todo.notKeen')}
          onSwipeRight={() => void swipeVote(movie.id, true)}
          onSwipeLeft={() => void swipeVote(movie.id, false)}
          surfaceClassName="bg-charcoal"
        >
          <div className={`relative text-white ${headliner ? 'h-[280px]' : 'h-[136px]'}`}>
            {image.src && (
              <img
                src={image.src}
                alt=""
                draggable={false}
                className="absolute inset-0 w-full h-full object-cover"
                style={image.poster ? { objectPosition: 'center 22%' } : undefined}
                loading="lazy"
                decoding="async"
                onError={hideBroken}
              />
            )}
            <div
              className="absolute inset-0"
              style={{
                background: headliner
                  ? 'linear-gradient(180deg, rgba(12,12,12,0) 25%, rgba(12,12,12,0.92) 100%)'
                  : 'linear-gradient(90deg, rgba(12,12,12,0.9) 0%, rgba(12,12,12,0.55) 58%, rgba(12,12,12,0.15) 100%)',
              }}
            />
            {ctx.myVote?.interested && !headliner && (
              <span className="absolute left-0 top-[18px] bottom-[18px] w-1 rounded-r bg-bitter-lime" />
            )}
            <button
              onClick={() => handleExpandMovie(movie.id)}
              aria-expanded={isExpanded}
              aria-label={t('spaces.openFilm', { title: movie.title })}
              className="absolute inset-0"
            />
            <div
              className={`pointer-events-none absolute left-5 right-4 bottom-4 top-[18px] flex flex-col ${headliner ? 'justify-end' : 'justify-between'}`}
            >
              <div>
                <p
                  className={`text-[10px] font-black uppercase tracking-[0.18em] truncate ${headliner || ctx.everyone ? 'text-bitter-lime' : 'text-stone-200'}`}
                >
                  {kicker}
                </p>
                <p
                  className={`mt-1.5 font-black tracking-[-0.05em] leading-none line-clamp-2 ${headliner ? 'text-[34px]' : 'text-[24px]'}`}
                >
                  {movie.title}
                </p>
              </div>
              <div className={`flex items-center justify-between gap-3 ${headliner ? 'mt-3.5' : ''}`}>
                <span className="flex items-center gap-2 min-w-0">
                  {ctx.keenIds.length > 0 && (
                    <span className="flex shrink-0">
                      {members
                        .filter((m) => ctx.keenIds.includes(m.profile_id))
                        .map((member, i) => (
                          <MemberDot
                            key={member.id}
                            member={member}
                            color={memberColors[member.profile_id]}
                            isMe={member.profile_id === currentUserId}
                            className={`w-6 h-6 text-[10px] border-2 border-charcoal ${i ? '-ml-2' : ''} ${member.profile_id === currentUserId ? '!bg-bitter-lime !text-charcoal' : ''}`}
                          />
                        ))}
                    </span>
                  )}
                  <span className="truncate text-[11px] font-extrabold text-stone-200">{ctx.status}</span>
                </span>
                {cta && <span className="pointer-events-auto shrink-0">{cta}</span>}
              </div>
            </div>
          </div>
        </SwipeRow>
        {isExpanded && <div className="bg-cream dark:bg-[#0c0c0c]">{renderWatchDetail(movie, ctx)}</div>}
      </div>
    );
  };

  /** Un film vu, en bandeau : son rang ou rien, et à droite la note ou « Noter ». */
  const renderSeenBand = (
    movie: SharedMovie,
    ctx: ReturnType<typeof seenContext>,
    kicker: string | null,
    right: React.ReactNode
  ) => {
    const image = imageOf(movie);
    return (
      <div
        key={movie.id}
        id={`space-movie-${movie.id}`}
        className="rounded-[1.6rem] overflow-hidden bg-charcoal shadow-[0_18px_30px_-22px_rgba(26,26,26,0.7)]"
      >
        <div className="relative h-[124px] text-white">
          {image.src && (
            <img
              src={image.src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              style={image.poster ? { objectPosition: 'center 22%' } : undefined}
              loading="lazy"
              decoding="async"
              onError={hideBroken}
            />
          )}
          <div
            className="absolute inset-0"
            style={{ background: 'linear-gradient(90deg, rgba(12,12,12,0.92) 0%, rgba(12,12,12,0.62) 60%, rgba(12,12,12,0.35) 100%)' }}
          />
          <button
            onClick={() => openVerdict(movie.id)}
            aria-label={t('spaces.openFilm', { title: movie.title })}
            className="absolute inset-0"
          />
          <div className="pointer-events-none absolute inset-0 pl-5 pr-4 py-4 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              {kicker && (
                <p className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-300">{kicker}</p>
              )}
              <p className="mt-1 text-[20px] font-black tracking-[-0.04em] leading-[1.05] line-clamp-2">{movie.title}</p>
              <p className="mt-1.5 text-[11px] font-bold text-stone-200 truncate">
                {ctx.scores.length === 0
                  ? t('spaces.noVerdictYet')
                  : ctx.scores.map((sc, i) => (
                      <React.Fragment key={sc.id}>
                        {i > 0 && ' · '}
                        {sc.name}{' '}
                        <span className={sc.hidden ? 'blur-[4px] select-none' : undefined}>{sc.hidden ? '0,0' : sc.value}</span>
                      </React.Fragment>
                    ))}
              </p>
            </div>
            <span className="pointer-events-auto">{right}</span>
          </div>
        </div>
      </div>
    );
  };

  const renderWatchDetail = (movie: SharedMovie, ctx: ReturnType<typeof watchContext>) => (
      <div className="border-t border-sand dark:border-white/5 p-5 bg-stone-50/60 dark:bg-[#141414] animate-[fadeIn_0.3s_ease-out] space-y-4">
        <div id={`space-plan-${movie.id}`}>
          <PlanPanel
            plan={ctx.plan}
            sharedMovieId={movie.id}
            title={movie.title}
            currentUserId={currentUserId}
            names={memberNames}
            favoriteCinema={movie.media_type === 'tv' ? undefined : favoriteCinema}
            onChanged={() => {
              reloadPlans();
              loadData(true);
            }}
            onToast={onToast}
          />
        </div>
        {/* Avant de demander un avis, dire à qui le film
            s'adresse. Un titre posé sans un mot ne dit pas
            s'il nous concerne, et dans le doute on passe. */}
        <SpacePitchPanel
          film={{
            title: movie.title,
            year: movie.year ?? undefined,
            // `synopsis`, et non `review` : c'est le nom de la
            // colonne dans shared_movies.
            overview: movie.synopsis ?? undefined,
          }}
          members={memberTastes}
        />

        {/* Deux réponses possibles. Réappuyer sur son propre
            choix l'annule. */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={(e) => handleVote(e, movie.id, true)}
            aria-pressed={ctx.myVote?.interested === true}
            className={`flex items-center justify-center gap-2 h-12 rounded-2xl border-2 transition-all active:scale-95 ${
              ctx.myVote?.interested === true
                ? 'bg-forest border-forest text-white'
                : 'bg-white dark:bg-[#202020] border-stone-200 dark:border-white/10 text-stone-500 dark:text-stone-400'
            }`}
          >
            <UserCheck size={16} />
            <span className="font-black text-[11px]">{t('todo.keen')}</span>
          </button>
          <button
            onClick={(e) => handleVote(e, movie.id, false)}
            aria-pressed={ctx.myVote?.interested === false}
            className={`flex items-center justify-center gap-2 h-12 rounded-2xl border-2 transition-all active:scale-95 ${
              ctx.myVote?.interested === false
                ? 'bg-stone-500 border-stone-500 dark:bg-stone-700 dark:border-stone-700 text-white'
                : 'bg-white dark:bg-[#202020] border-stone-200 dark:border-white/10 text-stone-500 dark:text-stone-400'
            }`}
          >
            <UserMinus size={16} />
            <span className="font-black text-[11px]">{t('todo.notKeen')}</span>
          </button>
        </div>

        {/* Noter fait passer le film dans « Vus ensemble » : la
            bascule suit la note. */}
        <button
          onClick={(e) => {
            e.stopPropagation();
            haptics.medium();
            onRateMovie(movie, ctx.myRating ?? null);
          }}
          className="w-full h-12 bg-bitter-lime text-charcoal rounded-2xl font-black text-xs flex items-center justify-center gap-2 active:scale-95 transition-all"
        >
          <Star size={16} strokeWidth={2.5} fill="currentColor" />
          {rateLabel(ctx.myRating, ctx.mine, t('shared.seenAndRate'))}
        </button>

        {/* Pour un film vu ensemble et noté plus tard. */}
        <button
          onClick={(e) => handleMarkAsWatched(e, movie.id)}
          className="w-full h-11 rounded-2xl font-black text-[11px] text-stone-500 dark:text-stone-400 active:scale-95 transition-all flex items-center justify-center gap-2"
        >
          <Ticket size={13} strokeWidth={2.5} />
          {t('shared.markWatchedOnly')}
        </button>

        {movie.added_by === currentUserId && (
          <button
            onClick={(e) => handleDeleteMovie(e, movie.id)}
            className="w-full h-11 rounded-2xl text-stone-500 dark:text-stone-500 font-black text-[11px] flex items-center justify-center gap-2 active:scale-95 transition-all hover:text-orange-500"
          >
            <Trash2 size={13} />
            {t('shared.removeSuggestion')}
          </button>
        )}
      </div>
  );

  /**
   * « Vus ensemble », en trois temps : ce qu'on attend de moi, le palmarès des
   * verdicts complets, puis les verdicts qui attendent encore des notes. Une
   * moyenne partielle ne classe plus un film : une seule note n'est pas un verdict.
   */
  const seenList = feedMovies.map((movie) => ({ movie, ctx: seenContext(movie) }));
  const ranked = seenList
    .filter(({ ctx }) => ctx.state === 'done' && ctx.averageValue != null)
    .sort((a, b) => (b.ctx.averageValue ?? 0) - (a.ctx.averageValue ?? 0));
  const podium = ranked.slice(0, 3);
  const others = ranked.slice(3);
  const turnList = seenList.filter(({ ctx }) => ctx.state === 'turn');
  const waitList = seenList.filter(({ ctx }) => ctx.state === 'wait' || ctx.state === 'skip');
  const doneIds = new Set(ranked.map(({ movie }) => movie.id));
  const openVerdict = (movieId: string) => {
    haptics.soft();
    setOpenVerdictId(movieId);
  };
  const agreementChip = (ctx: ReturnType<typeof seenContext>) => (
    <span
      className={`inline-block mt-2 px-2 py-1 rounded-[10px] text-[10px] font-black uppercase tracking-wide ${
        ctx.agreement === 'split'
          ? 'bg-orange-100 text-orange-800 dark:bg-orange-400/15 dark:text-orange-300'
          : 'bg-forest/10 text-forest dark:bg-bitter-lime/10 dark:text-bitter-lime'
      }`}
    >
      {t(`verdict.agree.${ctx.agreement}`)}
    </span>
  );
  /** Qui connaît le mieux qui : l'erreur moyenne des paris résolus, par binôme. */
  const guessBoard = guessLeaderboard(extras.guesses, (movieId, profileId) => {
    if (!activeMemberIds.has(profileId)) return null;
    const r = allRatings.find((x) => x.movie_id === movieId && x.profile_id === profileId);
    return r ? ratingValue(r) : null;
  });
  const personOf = (id: string) => people.find((p) => p.id === id);
  /** Une ligne de film en attente : « à toi de noter » ou « en attente du verdict ». */
  const renderVerdictRow = (movie: SharedMovie, ctx: ReturnType<typeof seenContext>, kind: 'turn' | 'wait') => {
    const others = ctx.raterIds.filter((id) => id !== currentUserId);
    const names = (ids: string[]) => {
      const list = ids.map((id) => (id === currentUserId ? t('spaces.you') : personOf(id)?.name || t('shared.member')));
      return list.length <= 1 ? list[0] ?? '' : `${list.slice(0, -1).join(', ')} ${t('spaceSync.and')} ${list[list.length - 1]}`;
    };
    const line =
      kind === 'turn'
        ? others.length
          ? t(others.length > 1 ? 'verdict.rowTurnMany' : 'verdict.rowTurnOne', { names: names(others) })
          : t('verdict.rowTurnFirst')
        : ctx.state === 'skip'
          ? t('verdict.rowSkipped')
          : ctx.myRating
            ? t('verdict.rowWaitMine', { names: names(ctx.missing) })
            : t('verdict.rowWait', { names: names(ctx.missing) });
    return (
      <button
        key={movie.id}
        id={`space-movie-${movie.id}`}
        onClick={() => openVerdict(movie.id)}
        className="w-full flex items-center gap-3 rounded-[1.4rem] bg-white dark:bg-[#161616] border border-sand dark:border-white/10 p-2.5 pr-3.5 text-left active:scale-[0.99] transition-transform"
      >
        <Poster url={movie.poster_url} className="w-[46px] aspect-[2/3] rounded-[10px] shrink-0" />
        <span className="flex-1 min-w-0">
          <b className="block text-[14px] font-black leading-tight text-charcoal dark:text-white truncate">{movie.title}</b>
          <small className="block mt-0.5 text-[11px] font-semibold text-stone-500 dark:text-stone-400 leading-snug line-clamp-2">{line}</small>
          <span
            className={`inline-block mt-1.5 px-2 py-0.5 rounded-lg text-[9.5px] font-black uppercase tracking-wide ${
              kind === 'turn'
                ? 'bg-bitter-lime text-charcoal'
                : 'bg-sand text-stone-600 dark:bg-white/10 dark:text-stone-300'
            }`}
          >
            {kind === 'turn' ? t('verdict.chipTurn') : ctx.state === 'skip' ? t('verdict.chipSkipped') : t('verdict.chipWait')}
          </span>
        </span>
        {kind === 'turn' ? (
          <span className="flex shrink-0">
            {others.slice(0, 3).map((id, i) => {
              const person = personOf(id);
              return person ? <Avatar key={id} person={person} size={26} className={`border-2 border-white dark:border-[#161616] ${i ? '-ml-2' : ''}`} /> : null;
            })}
          </span>
        ) : (
          <ProgressRing done={ctx.raterIds.length} total={ctx.expected.length} />
        )}
      </button>
    );
  };

  /**
   * « Inviter » envoie un lien qui fait rejoindre l'espace d'un appui
   * (`?join=`), le code reste dans le texte pour qui l'ouvre ailleurs.
   */
  const handleInvite = async () => {
    haptics.medium();
    const { origin, protocol, hostname } = window.location;
    const base = protocol === 'https:' && hostname !== 'localhost' ? origin : 'https://thebitter.watch';
    const text = `${t('spaces.inviteText', { name: space.name, code: space.invite_code })} ${base}/?join=${encodeURIComponent(space.invite_code)}`;
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ text });
        return;
      } catch (e) {
        if ((e as { name?: string })?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(text);
      onToast?.(t('spaces.inviteCopied'));
    } catch {
      setActionError(t('shared.copyFailed', { code: space.invite_code }));
    }
  };

  return (
    <div className="max-w-2xl mx-auto w-full pb-48 animate-[fadeIn_0.3s_ease-out]">
      <style>{`
        .slider::-webkit-slider-thumb {
          appearance: none;
          width: 24px;
          height: 24px;
          background: #3E5238;
          border: 3px solid white;
          border-radius: 50%;
          cursor: pointer;
          box-shadow: 0 2px 8px rgba(0, 0, 0, 0.15);
        }
        @keyframes celebrate {
            0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(217, 255, 0, 0.7); }
            70% { transform: scale(1); box-shadow: 0 0 0 10px rgba(217, 255, 0, 0); }
            100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(217, 255, 0, 0); }
        }
      `}</style>

      {/* En-tête : le bandeau des dernières affiches, puis qui est là. Le code
          d'invitation n'occupe plus le haut de l'écran à chaque visite : il
          vit dans les réglages, « Inviter » envoie un lien. */}
      <header className="mb-8 animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)]">
        <div className="relative h-[150px] rounded-[2rem] overflow-hidden grid grid-cols-5 gap-[3px]" style={{ background: tint }}>
          {bandPosters.map((poster, i) =>
            poster ? (
              <img
                key={i}
                src={resizeTmdbImage(poster, 'w185')}
                alt=""
                className="w-full h-full object-cover"
                loading="lazy"
                decoding="async"
                onError={hideBroken}
              />
            ) : (
              <div key={i} style={{ background: tint }} className="opacity-80" />
            )
          )}
          <div className="absolute inset-x-0 top-0 p-4 flex justify-between">
            <button
              onClick={onBack}
              aria-label={t('common.back')}
              className="w-11 h-11 rounded-2xl bg-cream dark:bg-[#0c0c0c] flex items-center justify-center active:scale-90 transition-transform shadow-sm"
            >
              <ArrowLeft size={20} strokeWidth={3} className="text-charcoal dark:text-white" />
            </button>
            <span className="flex gap-2">
            {members.length > 1 && (
              <button
                onClick={() => {
                  haptics.soft();
                  setShowStats(true);
                }}
                aria-label={t('stats.title')}
                className="w-11 h-11 rounded-2xl bg-cream dark:bg-[#0c0c0c] flex items-center justify-center active:scale-90 transition-transform shadow-sm text-charcoal dark:text-white"
              >
                <BarChart3 size={18} />
              </button>
            )}
            <button
              onClick={() => {
                haptics.soft();
                setShowSettings(true);
              }}
              aria-label={t('spaceSettings.open')}
              className="w-11 h-11 rounded-2xl bg-cream dark:bg-[#0c0c0c] flex items-center justify-center active:scale-90 transition-transform shadow-sm text-charcoal dark:text-white"
            >
              {loading ? <Loader2 size={17} className="animate-spin" /> : <Settings size={18} />}
            </button>
            </span>
          </div>
        </div>

        <div className="px-1 -mt-9 relative">
          <span
            className="w-[72px] h-[72px] rounded-full border-4 border-cream dark:border-[#0c0c0c] flex items-center justify-center text-white text-[22px] font-black tracking-tight"
            style={{ background: tint }}
          >
            {monogramOf(space.name)}
          </span>
          <h1 className="mt-2.5 text-[30px] leading-tight font-black tracking-tighter text-charcoal dark:text-white break-words">
            {space.name}
          </h1>
          <div className="mt-2.5 flex items-center justify-between gap-3">
            <button
              onClick={() => {
                haptics.soft();
                setShowMembers(true);
              }}
              aria-label={t('spaces.seeMembers')}
              className="min-w-0 h-11 flex items-center gap-2.5 active:scale-[0.98] transition-transform"
            >
              <span className="flex shrink-0">
                {members.slice(0, 4).map((member, i) => (
                  <MemberDot
                    key={member.id}
                    member={member}
                    color={memberColors[member.profile_id]}
                    isMe={member.profile_id === currentUserId}
                    className={`w-[30px] h-[30px] text-xs border-2 border-cream dark:border-[#0c0c0c] ${i ? '-ml-2.5' : ''}`}
                  />
                ))}
              </span>
              <span className="truncate text-xs font-bold text-stone-500 dark:text-stone-400">{membersLabel}</span>
            </button>
            <button
              onClick={handleInvite}
              className="shrink-0 h-11 px-[18px] rounded-full bg-bitter-lime text-charcoal text-xs font-black flex items-center gap-2 active:scale-95 transition-transform"
            >
              <UserPlus size={15} strokeWidth={2.6} />
              {t('spaces.invite')}
            </button>
          </div>
        </div>
      </header>

      <div className="space-y-8">
        {!loadError && (
          <SpaceTodoStack
            items={todo}
            currentUserId={currentUserId}
            memberNames={memberNames}
            votes={votes}
            ratings={allRatings}
            onWatch={answerWatch}
            onPublish={publishMine}
            onRate={(item) => onRateMovie(item.movie, null)}
            onAcceptSlot={acceptPlanSlot}
            onSkip={skipItem}
          />
        )}

        {!loadError && members.length > 1 && (
          <MonthlyRecap
            spaceId={space.id}
            spaceName={space.name}
            monogram={monogramOf(space.name)}
            tint={tint}
            currentUserId={currentUserId}
            people={people}
            movies={movies}
            ratings={allRatings.filter((r) => activeMemberIds.has(r.profile_id))}
            plans={plans}
            messages={extras.messages}
            guesses={extras.guesses}
            doneIds={doneIds}
            watchlist={watchlistMovies}
            loadSuggestions={loadSuggestions}
            onPropose={proposeFromSuggestion}
            onOpenWatchlist={() => document.getElementById('space-watchlist')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
          />
        )}

        {!noticeSeen && (
          <div className="space-y-3">
            <SharingNotice />
            <button
              onClick={() => {
                haptics.soft();
                localStorage.setItem(noticeKey, '1');
                setNoticeSeen(true);
              }}
              className="w-full py-3 rounded-2xl bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all"
            >
              {t('spaces.noticeAck')}
            </button>
          </div>
        )}

        {/* Un espace refusé et un espace vide se ressemblaient trait pour trait.
            Ces deux bandeaux sont la seule chose qui les sépare. */}
        {loadError && (
          <div className="flex items-start gap-3 bg-orange-400/5 border border-orange-400/30 rounded-2xl p-4">
            <AlertTriangle size={15} className="text-orange-400 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">
                {t('shared.loadFailedTitle')}
              </p>
              <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed mt-1">
                {loadError}
              </p>
            </div>
            <button
              onClick={() => loadData()}
              className="shrink-0 text-[10px] font-black uppercase tracking-widest text-charcoal dark:text-white underline underline-offset-2"
            >
              {t('shared.retry')}
            </button>
          </div>
        )}

        {actionError && (
          <div className="flex items-start gap-3 bg-orange-400/5 border border-orange-400/30 rounded-2xl p-4">
            <AlertTriangle size={15} className="text-orange-400 shrink-0 mt-0.5" />
            <p className="flex-1 min-w-0 text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
              {actionError}
            </p>
            <button
              onClick={() => setActionError(null)}
              aria-label={t('common.close')}
              className="shrink-0 text-stone-400 hover:text-charcoal dark:hover:text-white transition-colors"
            >
              <X size={15} />
            </button>
          </div>
        )}

        {movies.length === 0 && !loadError ? (
          <div className="py-16 px-6 text-center bg-white dark:bg-[#1a1a1a] rounded-[2rem] border border-stone-100 dark:border-white/5 flex flex-col items-center">
            <div className="w-16 h-16 bg-stone-50 dark:bg-[#202020] rounded-full flex items-center justify-center text-stone-300 dark:text-stone-700 mb-6">
              <Film size={24} />
            </div>
            <h3 className="font-black text-charcoal dark:text-white text-base mb-1">{t('shared.emptyTitle')}</h3>
            <p className="text-xs text-stone-500 dark:text-stone-500 max-w-[220px] leading-relaxed">
              {t('spaces.emptyBody')}
            </p>
          </div>
        ) : (
          <>
            {/* ─── À voir ensemble ─────────────────────────────────────────
                Le film le plus attendu en tête d'affiche, les autres en
                bandeaux sur leur image de fond. Tous se glissent : à droite
                partant, à gauche pas envie. */}
            {watchlistMovies.length > 0 && (
              <section id="space-watchlist" aria-label={t('spaces.toWatchTogether')} className="space-y-3 scroll-mt-4">
                <div className="px-1">
                  <div className="flex items-baseline justify-between">
                    <h2 className="text-[22px] font-black tracking-tighter text-charcoal dark:text-white">
                      {t('spaces.toWatchTogether')}
                    </h2>
                    <span className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">{t('spaces.byWish')}</span>
                  </div>
                  <p className="mt-1 text-[11px] font-semibold text-stone-500 dark:text-stone-500">{t('spaces.swipeRowHint')}</p>
                </div>
                <div className="space-y-2.5">
                  {watchlistMovies.map((movie, index) => renderWatchItem(movie, index === 0 && isHeadliner(movie)))}
                </div>
              </section>
            )}

            {/* ─── Vus ensemble ────────────────────────────────────────────
                Le palmarès des films que j'ai notés, puis les autres, puis
                ceux qui attendent ma note. */}
            {feedMovies.length > 0 && (
              <section aria-label={t('spaces.seenTogether')} className="space-y-4">
                {turnList.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="px-1 text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                      {t('verdict.listTurn')}
                    </p>
                    {turnList.map(({ movie, ctx }) => renderVerdictRow(movie, ctx, 'turn'))}
                  </div>
                )}

                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-[22px] font-black tracking-tighter text-charcoal dark:text-white">
                    {podium.length ? t('spaces.palmares') : t('spaces.seenTogether')}
                  </h2>
                  <span className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">
                    {podium.length
                      ? t(ranked.length > 1 ? 'verdict.verdictCountMany' : 'verdict.verdictCountOne', { count: String(ranked.length) })
                      : t('spaces.seenCount', { count: String(feedMovies.length) })}
                  </span>
                </div>
                {podium.length === 0 && (
                  <p className="px-1 -mt-2 text-[12px] font-semibold text-stone-500 dark:text-stone-400">{t('verdict.noVerdictYet')}</p>
                )}

                {podium.length > 0 && (
                  <div className="space-y-4">
                    {podium.map(({ movie, ctx }, i) => {
                      return (
                        <div key={movie.id} id={`space-movie-${movie.id}`}>
                          <button
                            onClick={() => openVerdict(movie.id)}
                            aria-label={t('spaces.openFilm', { title: movie.title })}
                            className="w-full flex items-end gap-1 text-left active:scale-[0.99] transition-transform"
                          >
                            <span
                              aria-hidden
                              className="w-[58px] shrink-0 text-[84px] font-black leading-[0.8] tracking-[-0.08em] text-cream dark:text-[#0c0c0c] [-webkit-text-stroke:2px_#1A1A1A] dark:[-webkit-text-stroke:2px_#FFFFFF]"
                            >
                              {i + 1}
                            </span>
                            <span className="relative w-[104px] aspect-[2/3] shrink-0 rounded-2xl overflow-hidden bg-stone-200 dark:bg-[#1a1a1a] shadow-[0_14px_24px_-14px_rgba(26,26,26,0.6)]">
                              {(movie.poster_url || imageOf(movie).src) && (
                                <img
                                  src={movie.poster_url ? resizeTmdbImage(movie.poster_url, 'w342') : imageOf(movie).src}
                                  alt=""
                                  className="w-full h-full object-cover"
                                  loading="lazy"
                                  decoding="async"
                                  onError={hideBroken}
                                />
                              )}
                            </span>
                            <span className="flex-1 min-w-0 pl-3.5 pb-1">
                              <span className="block text-[44px] font-black tracking-[-0.06em] leading-[0.9] tabular-nums text-charcoal dark:text-white">
                                {ctx.average}
                              </span>
                              <span className="block mt-2 text-sm font-black leading-tight line-clamp-2 text-charcoal dark:text-white">
                                {movie.title}
                              </span>
                              <span className="block mt-1.5 text-[11px] font-bold text-stone-500 dark:text-stone-400 truncate">
                                {ctx.scores.map((s) => `${s.name} ${s.value}`).join(' · ')}
                              </span>
                              {agreementChip(ctx)}
                            </span>
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {groupStats?.companion && podium.length > 0 && (
                  <div className="rounded-[1.6rem] bg-charcoal dark:bg-[#1a1a1a] text-white p-[18px] flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-[10px] font-black uppercase tracking-[0.16em] text-bitter-lime">{t('group.companion')}</p>
                      <p className="mt-1.5 text-lg font-black truncate">{groupStats.companion.name}</p>
                      <p className="mt-0.5 text-[11px] font-semibold text-stone-300">
                        {formatRating(groupStats.companion.gap)} {t('spaces.companionNote', { count: String(groupStats.companion.shared) })}
                      </p>
                    </div>
                  </div>
                )}

                {others.length > 0 && (
                  <div className="space-y-2.5">
                    {others.map(({ movie, ctx }, i) =>
                      renderSeenBand(
                        movie,
                        ctx,
                        `${t('spaces.rankN', { n: String(i + 4) })} · ${t(`verdict.agree.${ctx.agreement}`)}`,
                        <span className="shrink-0 text-[44px] font-black tracking-[-0.07em] leading-none tabular-nums text-white">
                          {ctx.average}
                        </span>
                      )
                    )}
                  </div>
                )}

                {waitList.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="px-1 pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                      {t('verdict.listWait')}
                    </p>
                    {waitList.map(({ movie, ctx }) => renderVerdictRow(movie, ctx, 'wait'))}
                  </div>
                )}

                {guessBoard.length > 0 && (
                  <div className="space-y-2.5">
                    <p className="px-1 pt-2 text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-400">
                      {t('verdict.boardTitle')}
                    </p>
                    <div className="rounded-[1.4rem] bg-white dark:bg-[#161616] border border-sand dark:border-white/10 p-3.5 space-y-3">
                      {guessBoard.slice(0, 5).map((row, i) => {
                        const a = personOf(row.guesser);
                        const b = personOf(row.target);
                        const text =
                          row.guesser === currentUserId
                            ? t('verdict.boardYou', { name: b?.name ?? '' })
                            : row.target === currentUserId
                              ? t('verdict.boardOnYou', { name: a?.name ?? '' })
                              : t('verdict.boardOthers', { a: a?.name ?? '', b: b?.name ?? '' });
                        return (
                          <div key={`${row.guesser}-${row.target}`} className="flex items-center gap-3">
                            <span className="w-4 text-[13px] font-black text-charcoal dark:text-white">{i + 1}</span>
                            <span className="flex shrink-0">
                              {a && <Avatar person={a} size={26} />}
                              {b && <Avatar person={b} size={26} className="-ml-2 border-2 border-white dark:border-[#161616]" />}
                            </span>
                            <span className="flex-1 min-w-0">
                              <b className="block text-[12.5px] font-black leading-tight text-charcoal dark:text-white">{text}</b>
                              <small className="block text-[10.5px] font-semibold text-stone-500 dark:text-stone-400">
                                {t(row.count > 1 ? 'verdict.boardBetsMany' : 'verdict.boardBetsOne', { n: String(row.count) })}
                              </small>
                            </span>
                            <span className="text-[15px] font-black tabular-nums text-charcoal dark:text-white">±{fmt1(row.error)}</span>
                          </div>
                        );
                      })}
                      <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">{t('verdict.boardHint')}</p>
                    </div>
                  </div>
                )}

                {members.length > 1 && (
                  <button
                    onClick={() => {
                      haptics.soft();
                      setShowStats(true);
                    }}
                    className="mx-auto flex items-center gap-1.5 h-11 px-4 text-[12px] font-extrabold text-stone-500 dark:text-stone-400 underline underline-offset-4 decoration-stone-300 dark:decoration-stone-700"
                  >
                    <BarChart3 size={14} />
                    {t('stats.link')}
                  </button>
                )}
              </section>
            )}
          </>
        )}
      </div>

      {/* Un seul bouton pour ajouter : le formulaire demande ensuite « vu » ou
          « à voir ». Il y en avait deux, selon l'onglet ouvert. */}
      <button
        onClick={() => {
          haptics.medium();
          onAddMovie();
        }}
        className="fixed right-5 z-40 h-14 pl-5 pr-6 rounded-full bg-charcoal dark:bg-white text-white dark:text-charcoal text-[13px] font-black flex items-center gap-2.5 shadow-[0_14px_30px_-10px_rgba(26,26,26,0.5)] active:scale-95 transition-transform"
        style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 7.5rem)' }}
      >
        <Plus size={18} strokeWidth={3} className="text-bitter-lime dark:text-forest" />
        {t('spaces.addFilm')}
      </button>

      {/* Les membres : ouverts depuis la rangée d'avatars de l'en-tête. */}
      {showMembers && (
        <div
          className="fixed inset-0 z-[150] flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setShowMembers(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label={t('shared.tabMembers')}
            className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto bg-cream dark:bg-[#0c0c0c] rounded-t-[2rem] sm:rounded-[2rem] p-6 pb-[calc(env(safe-area-inset-bottom,0px)+1.5rem)] animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white">{t('shared.tabMembers')}</h2>
              <button
                onClick={() => setShowMembers(false)}
                aria-label={t('common.close')}
                className="w-10 h-10 rounded-full bg-sand dark:bg-[#1a1a1a] flex items-center justify-center text-charcoal dark:text-white"
              >
                <X size={16} />
              </button>
            </div>
            {groupStats?.meaningful && (
              <p className="mb-4 text-xs font-semibold text-stone-500 dark:text-stone-400 leading-relaxed">
                {t('group.harshestKindest', { harsh: groupStats.harshest.name, kind: groupStats.kindest.name })}
              </p>
            )}
            <div className="space-y-2.5">
              {members.map((member) => (
                <button
                  key={member.id}
                  onClick={() => {
                    haptics.medium();
                    setShowMembers(false);
                    setSelectedMember(member);
                  }}
                  className="w-full flex items-center gap-4 bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 p-3.5 rounded-[1.4rem] text-left active:scale-[0.98] transition-transform"
                >
                  <MemberDot
                    member={member}
                    color={memberColors[member.profile_id]}
                    isMe={member.profile_id === currentUserId}
                    className="w-11 h-11 text-sm"
                  />
                  <span className="flex-1 min-w-0">
                    <span className="flex items-center gap-2">
                      <span className="font-black text-charcoal dark:text-white truncate">{member.profile?.first_name}</span>
                      {member.role === 'owner' && (
                        <span className="text-[8px] bg-forest/10 dark:bg-forest/20 text-forest dark:text-lime-500 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                          {t('shared.founder')}
                        </span>
                      )}
                    </span>
                    <span className="text-[11px] font-medium text-stone-500 dark:text-stone-500">
                      {member.role === 'owner' ? t('shared.roleOwner') : t('shared.roleMember')}
                    </span>
                  </span>
                  <ChevronRight size={16} className="text-stone-400 dark:text-stone-600" />
                </button>
              ))}
            </div>
            <button
              onClick={handleInvite}
              className="mt-5 w-full h-12 rounded-2xl bg-bitter-lime text-charcoal text-xs font-black flex items-center justify-center gap-2 active:scale-95 transition-transform"
            >
              <UserPlus size={15} strokeWidth={2.6} />
              {t('spaces.invite')}
            </button>
          </div>
        </div>
      )}

      {/* Modal Fiche Profil */}
      {selectedMember && (
        <MemberProfileModal
          member={selectedMember}
          myMovies={myMovies}
          currentUserId={currentUserId}
          space={{ name: space.name, movies, ratings: allRatings }}
          onAddWatchedTogether={addWatchedTogether}
          onClose={() => setSelectedMember(null)}
        />
      )}

      {reporting && <ReportSheet target={reporting} onClose={() => setReporting(null)} />}

      {(() => {
        const movie = openVerdictId ? movies.find((m) => m.id === openVerdictId) : null;
        if (!movie || movie.status !== 'watched') return null;
        const ctx = seenContext(movie);
        return (
          <VerdictSheet
            movie={movie}
            image={imageOf(movie).src}
            currentUserId={currentUserId}
            spaceName={space.name}
            people={people}
            ratings={ctx.activeRatings}
            expected={ctx.expected}
            skipIds={ctx.skipIds}
            state={ctx.state}
            extras={extras}
            publicRating={publicRatingOf(movie)}
            blocked={blocked}
            pushIds={pushIds}
            canDelete={movie.added_by === currentUserId}
            loadSuggestions={loadSuggestions}
            onPropose={proposeFromSuggestion}
            onRate={() => {
              haptics.medium();
              onRateMovie(movie, ctx.myRating ?? null);
            }}
            onDelete={() => {
              setOpenVerdictId(null);
              handleDeleteMovie({ stopPropagation: () => {} } as React.MouseEvent, movie.id);
            }}
            onReport={setReporting}
            onChanged={() => void reloadExtras()}
            onToast={onToast}
            onClose={() => setOpenVerdictId(null)}
          />
        );
      })()}

      {showStats && (
        <SpaceStatsView
          spaceName={space.name}
          currentUserId={currentUserId}
          people={people}
          movies={movies}
          ratings={allRatings.filter((r) => activeMemberIds.has(r.profile_id))}
          votes={votes}
          plans={plans}
          onClose={() => setShowStats(false)}
        />
      )}

      {showSettings && (
        <SpaceSettingsModal
          space={space}
          members={members}
          currentUserId={currentUserId}
          isOwner={isOwner}
          isLeaving={isLeaving}
          onRefresh={() => loadData()}
          onLeave={() => {
            setShowSettings(false);
            handleLeaveSpace();
          }}
          onChanged={(updated) => {
            setSpace(updated);
            loadData();
          }}
          onDeleted={() => {
            setShowSettings(false);
            onBack();
          }}
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Modale de confirmation custom (remplace window.confirm) */}
      {confirmAction && (
        <div
          className="fixed inset-0 z-[200] flex items-end justify-center p-6 bg-black/40 backdrop-blur-sm"
          onClick={() => setConfirmAction(null)}
        >
          <div
            className="w-full max-w-sm bg-white dark:bg-[#1a1a1a] rounded-[2rem] p-6 shadow-2xl border border-stone-100 dark:border-white/10 animate-[slideUp_0.3s_cubic-bezier(0.16,1,0.3,1)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-4 mb-6">
              <div className="w-10 h-10 bg-red-50 dark:bg-red-900/20 rounded-xl flex items-center justify-center shrink-0">
                <AlertTriangle size={18} className="text-red-500" />
              </div>
              <p className="font-bold text-charcoal dark:text-white text-sm leading-relaxed pt-1">
                {confirmAction.message}
              </p>
            </div>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmAction(null)}
                className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-stone-100 dark:bg-[#202020] text-stone-500 dark:text-stone-400 active:scale-95 transition-all"
              >
                {t('common.cancel')}
              </button>
              <button
                onClick={() => {
                  confirmAction.onConfirm();
                  setConfirmAction(null);
                }}
                className="flex-1 py-3 rounded-2xl font-black text-xs uppercase tracking-widest bg-red-500 text-white shadow-lg active:scale-95 transition-all"
              >
                {t('common.confirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default SharedSpaceView;
