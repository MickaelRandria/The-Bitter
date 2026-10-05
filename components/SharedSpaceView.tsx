import React, { useState, useEffect, useMemo } from 'react';
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
  PartyPopper,
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
} from '../services/supabase';
import { haptics } from '../utils/haptics';
import { resizeTmdbImage } from '../utils/tmdbImage';
import SpacePitchPanel, { MemberTaste } from './SpacePitchPanel';
import PlanPanel from './PlanPanel';
import { WatchPlan, acceptSlot, chosenSlotOf, currentPlanFor, getSpacePlans, subscribeToPlans } from '../services/plans';
import SpaceTodoStack from './SpaceTodoStack';
import SwipeRow from './SwipeRow';
import { monogramOf, tintOf } from './SpaceBubbles';
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

    return () => {
      if (pending) clearTimeout(pending);
      unsubscribe();
      unsubscribePlans();
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
  const activeMemberIds = new Set(members.map((m) => m.profile_id));

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
    /**
     * Tant que je n'ai pas noté un film qu'on attend de moi (vu ensemble, ou
     * noté seul), les notes des autres restent floutées : c'est ce qui donne
     * envie de noter, et ce qui garde ma note à moi.
     */
    const hideOthers =
      !myRating &&
      ((plan?.status === 'agreed' && plan.participant_ids.includes(currentUserId)) || rateTodoIds.has(movie.id));
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
    const average = activeRatings.length
      ? formatRating(activeRatings.reduce((sum, r) => sum + ratingValue(r), 0) / activeRatings.length)
      : null;
    return {
      ratings,
      activeRatings,
      myRating,
      mine: personalScoreOf(movie),
      hideOthers,
      scores,
      average,
      criteriaAvg: calculateCriteriaAverages(activeRatings),
      isConsensus: members.length > 1 && activeRatings.length >= members.length,
    };
  };

  /** Le carrousel « ce que dit le groupe », en tête de « Vus ensemble ». */
  const groupCards: {
    key: string;
    kicker: string;
    title: string;
    value: string;
    note: string;
    className: string;
    kickerClass: string;
    noteClass: string;
  }[] = [];
  if (groupStats) {
    if (groupStats.meaningful) {
      groupCards.push({
        key: 'consensus',
        kicker: t('group.consensus'),
        title: groupStats.consensus.movie?.title ?? '',
        value: formatRating(groupStats.consensus.average) ?? '',
        note: t('group.spread', { value: formatRating(groupStats.consensus.spread) ?? '0' }),
        className: 'bg-charcoal text-white dark:bg-white dark:text-charcoal',
        kickerClass: 'text-bitter-lime dark:text-forest',
        noteClass: 'text-stone-300 dark:text-stone-600',
      });
      groupCards.push({
        key: 'divisive',
        kicker: t('group.divisive'),
        title: groupStats.divisive.movie?.title ?? '',
        value: `${formatRating(groupStats.divisive.low)}→${formatRating(groupStats.divisive.high)}`,
        note: t('group.spread', { value: formatRating(groupStats.divisive.spread) ?? '0' }),
        className: 'bg-forest text-white',
        kickerClass: 'text-bitter-lime',
        noteClass: 'text-white/80',
      });
    } else {
      groupCards.push({
        key: 'average',
        kicker: t('group.groupAverage'),
        title: t('spaces.judgedCount', { count: String(groupStats.judged) }),
        value: formatRating(groupStats.average) ?? '',
        note: '',
        className: 'bg-charcoal text-white dark:bg-white dark:text-charcoal',
        kickerClass: 'text-bitter-lime dark:text-forest',
        noteClass: 'text-stone-300',
      });
    }
    if (groupStats.companion) {
      groupCards.push({
        key: 'companion',
        kicker: t('group.companion'),
        title: groupStats.companion.name,
        value: formatRating(groupStats.companion.gap) ?? '0',
        note: t('spaces.companionNote', { count: String(groupStats.companion.shared) }),
        className: 'bg-sand text-charcoal dark:bg-[#1a1a1a] dark:text-white',
        kickerClass: 'text-forest dark:text-lime-400',
        noteClass: 'text-stone-500 dark:text-stone-400',
      });
    }
  }

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
                Classé par envie : ce que tout le monde veut voir passe devant,
                avec la question suivante posée sur la ligne même. */}
            {watchlistMovies.length > 0 && (
              <section aria-label={t('spaces.toWatchTogether')} className="space-y-3">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-lg font-black tracking-tight text-charcoal dark:text-white">
                    {t('spaces.toWatchTogether')}
                  </h2>
                  <span className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">{t('spaces.byWish')}</span>
                </div>
                <p className="px-1 -mt-1.5 text-[11px] font-semibold text-stone-500 dark:text-stone-500">
                  {t('spaces.swipeRowHint')}
                </p>
                <div className="space-y-2.5">
                  {watchlistMovies.map((movie) => {
                    const ctx = watchContext(movie);
                    const isExpanded = expandedMovie === movie.id;
                    return (
                      <div
                        key={movie.id}
                        id={`space-movie-${movie.id}`}
                        className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-[1.4rem] overflow-hidden"
                      >
                        <SwipeRow
                          rightLabel={t('todo.keen')}
                          leftLabel={t('todo.notKeen')}
                          onSwipeRight={() => void swipeVote(movie.id, true)}
                          onSwipeLeft={() => void swipeVote(movie.id, false)}
                        >
                        <div className="flex items-center gap-3 p-3">
                          <button
                            onClick={() => handleExpandMovie(movie.id)}
                            aria-expanded={isExpanded}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left"
                          >
                            <MoviePoster url={movie.poster_url} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-black text-charcoal dark:text-white truncate">{movie.title}</span>
                              <span className="mt-1.5 flex items-center gap-1.5">
                                <span className="flex shrink-0">
                                  {members.map((member, i) => (
                                    <span
                                      key={member.id}
                                      className={`w-[18px] h-[18px] rounded-full border-2 border-white dark:border-[#1a1a1a] ${i ? '-ml-1.5' : ''} ${ctx.keenIds.includes(member.profile_id) ? (member.profile_id === currentUserId ? 'dark:!bg-bitter-lime' : '') : 'bg-stone-200 dark:bg-white/15'}`}
                                      style={ctx.keenIds.includes(member.profile_id) ? { background: memberColors[member.profile_id] } : undefined}
                                    />
                                  ))}
                                </span>
                                <span
                                  className={`truncate text-[11px] font-extrabold ${ctx.everyone || ctx.planSlot ? 'text-forest dark:text-lime-400' : 'text-stone-500 dark:text-stone-400'}`}
                                >
                                  {ctx.status}
                                </span>
                              </span>
                            </span>
                          </button>
                          {ctx.action}
                        </div>
                        </SwipeRow>

                        {isExpanded && (
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
                        )}
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {/* ─── Vus ensemble ────────────────────────────────────────────
                Ce que dit le groupe d'abord, puis les films, chacun avec la
                note de chaque membre. */}
            {feedMovies.length > 0 && (
              <section aria-label={t('spaces.seenTogether')} className="space-y-3">
                <div className="flex items-baseline justify-between px-1">
                  <h2 className="text-lg font-black tracking-tight text-charcoal dark:text-white">
                    {t('spaces.seenTogether')}
                  </h2>
                  <span className="text-[11px] font-extrabold text-stone-500 dark:text-stone-400">
                    {t('spaces.filmsCount', { count: String(feedMovies.length) })}
                  </span>
                </div>

                {groupCards.length > 0 && (
                  <div className="-mx-6 flex gap-3 overflow-x-auto no-scrollbar px-6 pb-1 snap-x snap-mandatory">
                    {groupCards.map((card) => (
                      <div
                        key={card.key}
                        className={`w-[232px] shrink-0 snap-start rounded-[1.6rem] p-[18px] ${card.className}`}
                      >
                        <p className={`text-[10px] font-black uppercase tracking-[0.16em] ${card.kickerClass}`}>{card.kicker}</p>
                        <p className="mt-2.5 text-[15px] font-black leading-tight truncate">{card.title}</p>
                        <p
                          className={`mt-1.5 font-black tracking-tighter leading-none tabular-nums whitespace-nowrap ${card.value.length > 5 ? 'text-[30px]' : 'text-[38px]'}`}
                        >
                          {card.value}
                        </p>
                        <p className={`mt-1.5 text-[11px] font-semibold ${card.noteClass}`}>{card.note}</p>
                      </div>
                    ))}
                  </div>
                )}

                <div className="space-y-2.5">
                  {feedMovies.map((movie) => {
                    const ctx = seenContext(movie);
                    const isExpanded = expandedMovie === movie.id;
                    return (
                      <div
                        key={movie.id}
                        id={`space-movie-${movie.id}`}
                        className="bg-white dark:bg-[#1a1a1a] border border-sand dark:border-white/10 rounded-[1.4rem] overflow-hidden"
                      >
                        <div className="flex items-center gap-3 p-3">
                          <button
                            onClick={() => handleExpandMovie(movie.id)}
                            aria-expanded={isExpanded}
                            className="flex-1 min-w-0 flex items-center gap-3 text-left"
                          >
                            <MoviePoster url={movie.poster_url} />
                            <span className="flex-1 min-w-0">
                              <span className="block text-sm font-black text-charcoal dark:text-white truncate">{movie.title}</span>
                              <span className="mt-1.5 block text-[11px] font-bold text-stone-500 dark:text-stone-400 truncate">
                                {ctx.scores.length === 0 && !ctx.myRating
                                  ? t('spaces.noVerdictYet')
                                  : ctx.scores.map((s, i) => (
                                      <React.Fragment key={s.id}>
                                        {i > 0 && ' · '}
                                        {s.name}{' '}
                                        <span
                                          className={s.hidden ? 'blur-[4px] select-none' : undefined}
                                          aria-label={s.hidden ? t('plan.hiddenScore') : undefined}
                                        >
                                          {s.hidden ? '0,0' : s.value}
                                        </span>
                                      </React.Fragment>
                                    ))}
                                {!ctx.myRating && ctx.scores.length > 0 && ` · ${t('spaces.you')} —`}
                              </span>
                            </span>
                          </button>
                          {!ctx.myRating ? (
                            <button
                              onClick={() => {
                                haptics.medium();
                                onRateMovie(movie, null);
                              }}
                              className="shrink-0 h-11 px-4 rounded-2xl bg-bitter-lime text-charcoal text-[11px] font-black active:scale-95 transition-transform"
                            >
                              {t('todo.rate')}
                            </button>
                          ) : (
                            <span
                              className="shrink-0 min-w-[52px] h-11 px-2 rounded-2xl bg-charcoal dark:bg-white text-bitter-lime dark:text-charcoal flex items-center justify-center text-[15px] font-black tabular-nums"
                              aria-label={t('spaces.groupScore')}
                            >
                              {ctx.average}
                            </span>
                          )}
                        </div>

                        {isExpanded && (
                          <div className="border-t border-sand dark:border-white/5 p-5 bg-stone-50/60 dark:bg-[#141414] animate-[fadeIn_0.3s_ease-out] space-y-5">
                            {(movie.synopsis || movie.runtime || (movie.genres && movie.genres.length > 0) || movie.actors || publicRatingOf(movie)) && (
                              <div className="space-y-2">
                                {movie.synopsis && (
                                  <p className="text-xs italic text-stone-500 dark:text-stone-400 leading-relaxed line-clamp-3">{movie.synopsis}</p>
                                )}
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-bold text-stone-500 dark:text-stone-500">
                                  {movie.runtime && <span>{movie.runtime} min</span>}
                                  {movie.genres && movie.genres.length > 0 && <span>{movie.genres.join(', ')}</span>}
                                  {publicRatingOf(movie) && (
                                    <PublicRatingBadge
                                      rating={publicRatingOf(movie)}
                                      className="bg-forest/10 dark:bg-forest/20 text-forest dark:text-lime-400 px-2 py-0.5 rounded-lg"
                                    />
                                  )}
                                </div>
                                {movie.actors && (
                                  <p className="text-[10px] text-stone-500 dark:text-stone-500">Avec {movie.actors}</p>
                                )}
                              </div>
                            )}

                            {ctx.isConsensus && (
                              <div
                                className="bg-bitter-lime p-4 rounded-2xl flex items-center justify-center gap-3 border-2 border-charcoal/5"
                                style={{ animation: 'celebrate 2s infinite ease-in-out' }}
                              >
                                <PartyPopper size={20} className="text-charcoal" strokeWidth={2.5} />
                                <span className="text-xs font-black uppercase tracking-widest text-charcoal">
                                  {t('shared.completeVerdict')}
                                </span>
                                <PartyPopper size={20} className="text-charcoal scale-x-[-1]" strokeWidth={2.5} />
                              </div>
                            )}

                            {ctx.criteriaAvg && !ctx.hideOthers && (
                              <div className="bg-white dark:bg-[#202020] p-5 rounded-2xl border border-stone-200 dark:border-white/10">
                                <div className="flex items-center gap-2 mb-4 text-forest dark:text-lime-500">
                                  <BarChart3 size={16} />
                                  <h4 className="text-[10px] font-black uppercase tracking-[0.2em]">{t('shared.groupAvg')}</h4>
                                </div>
                                <div className="grid grid-cols-2 gap-4">
                                  {[
                                    { l: t('criteria.story'), v: ctx.criteriaAvg.story },
                                    { l: t('criteria.visuals'), v: ctx.criteriaAvg.visuals },
                                    { l: t('criteria.acting'), v: ctx.criteriaAvg.acting },
                                    { l: t('criteria.sound'), v: ctx.criteriaAvg.sound },
                                  ].map((c) => (
                                    <div key={c.l} className="space-y-1">
                                      <div className="flex justify-between text-[9px] font-bold text-stone-500 dark:text-stone-500 uppercase">
                                        <span>{c.l}</span>
                                        <span>{c.v.toFixed(1)}</span>
                                      </div>
                                      <div className="h-1.5 bg-stone-100 dark:bg-white/5 rounded-full overflow-hidden">
                                        <div className="h-full bg-charcoal dark:bg-white" style={{ width: `${c.v * 10}%` }} />
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            <div className="flex items-center justify-between">
                              <h4 className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-500">
                                {t('shared.verdictDetail')} ({ctx.activeRatings.length}/{members.length})
                              </h4>
                              {movie.added_by === currentUserId && (
                                <button
                                  onClick={(e) => handleDeleteMovie(e, movie.id)}
                                  aria-label={t('shared.removeSuggestion')}
                                  className="w-9 h-9 flex items-center justify-center text-red-400 hover:text-red-600 transition-colors"
                                >
                                  <Trash2 size={16} />
                                </button>
                              )}
                            </div>

                            {ctx.hideOthers && ctx.ratings.length > 0 && (
                              <p className="text-xs font-bold text-forest dark:text-lime-400 bg-forest/5 dark:bg-lime-400/5 rounded-xl px-3 py-2">
                                {t('spaces.rateToReveal')}
                              </p>
                            )}
                            {ctx.ratings.length > 0 ? (
                              <div className="grid gap-3">
                                {ctx.ratings.map((rating) => {
                                  const isMe = rating.profile_id === currentUserId;
                                  const hidden = ctx.hideOthers && !isMe;
                                  return (
                                    <div
                                      key={rating.id}
                                      className={`bg-white dark:bg-[#252525] rounded-2xl p-4 border ${isMe ? 'border-forest/20 dark:border-forest/40 ring-2 ring-forest/5' : 'border-stone-100 dark:border-white/5'}`}
                                    >
                                      <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                          <span
                                            className={`w-7 h-7 rounded-full flex items-center justify-center text-[10px] font-black text-white ${isMe ? 'dark:!bg-bitter-lime dark:!text-charcoal' : ''}`}
                                            style={{ background: isMe ? '#1A1A1A' : memberColors[rating.profile_id] ?? '#78716C' }}
                                          >
                                            {(rating.profile?.first_name || '?')[0].toUpperCase()}
                                          </span>
                                          <span className="font-bold text-sm text-charcoal dark:text-white">
                                            {rating.profile?.first_name || t('shared.member')}
                                          </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                          {!isMe && (
                                            <button
                                              onClick={(e) => {
                                                e.stopPropagation();
                                                haptics.soft();
                                                setReporting({
                                                  contentType: 'review',
                                                  contentId: rating.id,
                                                  reportedUserId: rating.profile_id,
                                                  reportedName: rating.profile?.first_name || t('shared.member'),
                                                  snapshot: rating.review,
                                                });
                                              }}
                                              aria-label={t('moderation.report')}
                                              className="p-1.5 rounded-lg text-stone-400 dark:text-stone-600 hover:text-stone-600 dark:hover:text-stone-400"
                                            >
                                              <Flag size={12} />
                                            </button>
                                          )}
                                          <div
                                            className={`flex items-center gap-1.5 text-charcoal bg-bitter-lime px-3 py-1 rounded-lg ${hidden ? 'blur-[5px] select-none' : ''}`}
                                            aria-label={hidden ? t('plan.hiddenScore') : undefined}
                                          >
                                            <Star size={12} fill="currentColor" />
                                            <span className="text-xs font-black">{hidden ? '?.?' : ratingValue(rating).toFixed(1)}</span>
                                          </div>
                                        </div>
                                      </div>
                                      {hidden ? null : rating.review && blocked.has(rating.profile_id) ? (
                                        <p className="text-[11px] text-stone-500 dark:text-stone-500 italic">{t('moderation.hiddenReview')}</p>
                                      ) : rating.review ? (
                                        <p className="text-xs font-medium text-stone-500 dark:text-stone-400 italic leading-relaxed pl-3 border-l-2 border-stone-200 dark:border-stone-800">
                                          "{rating.review}"
                                        </p>
                                      ) : null}
                                    </div>
                                  );
                                })}
                              </div>
                            ) : (
                              <div className="text-center py-8 bg-white dark:bg-[#202020] rounded-2xl border border-dashed border-stone-200 dark:border-white/10">
                                <p className="text-[10px] font-bold text-stone-500 dark:text-stone-500 uppercase tracking-widest">
                                  {t('shared.beFirst')}
                                </p>
                              </div>
                            )}

                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                haptics.medium();
                                // Même formulaire qu'en solo, grille Bitter+ comprise.
                                onRateMovie(movie, ctx.myRating ?? null);
                              }}
                              className={`w-full h-12 rounded-2xl font-black text-xs transition-all active:scale-95 ${ctx.myRating ? 'bg-stone-100 dark:bg-[#252525] text-stone-600 dark:text-stone-300' : 'bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal'}`}
                            >
                              {rateLabel(ctx.myRating, ctx.mine, t('shared.submitVerdict'))}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
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
          onClose={() => setSelectedMember(null)}
        />
      )}

      {reporting && <ReportSheet target={reporting} onClose={() => setReporting(null)} />}

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
