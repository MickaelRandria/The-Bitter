import React, { memo, useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  Bookmark,
  BookmarkPlus,
  CalendarDays,
  CalendarPlus,
  Clapperboard,
  Eye,
  Film,
  LayoutGrid,
  Mic,
  PieChart,
  Plus,
  Send,
  Share2,
  Star,
  Ticket,
  Tv,
  Users,
  X,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { trackEvent } from '../utils/analytics';
import {
  LONG_PRESS_MOVE_TOLERANCE,
  LONG_PRESS_MS,
  addMenuLabelKey,
  primaryLabelKey,
  recordTap,
  shouldOfferHoldTip,
  shouldRunFan,
} from '../utils/navActions';
import type { AddMenuKind, PrimaryKind, SelectedWork, SelectionAction } from '../utils/navActions';
import { readNavDiscovery, updateNavDiscovery } from '../utils/navDiscovery';
import { DIALOG_CLOSED_EVENT } from '../utils/useDialog';

export type NavViewMode = 'Feed' | 'Analytics' | 'Discover' | 'Calendar' | 'Deck' | 'SharedSpace';
export type NavTab = 'Feed' | 'Discover' | 'Analytics' | 'Calendar';

export interface ContextualNavProps {
  viewMode: NavViewMode;
  mediaMode: 'movie' | 'tv';
  primary: PrimaryKind;
  contextLabel?: string;
  contextKey?: string;
  globalAddRequest?: number;
  paletteOpen?: boolean;
  onNavigate: (page: NavTab) => void;
  onPrimary: () => void;
  addMenu: AddMenuKind[];
  onAddMenu: (kind: AddMenuKind) => void;
  /** Collection presque vide : le + pulse doucement (motion-safe), comme avant. */
  emphasize: boolean;
  /** Visite guidée en cours ou prévue, ou bulle d'intro affichée : ni éventail ni astuce. */
  discoveryBlocked: boolean;
  selection: SelectedWork[];
  selectionActions: Record<SelectionAction, boolean>;
  onSelectionAction: (action: SelectionAction) => void;
  onClearSelection: () => void;
}

// L'ordre Feed, Discover, +, Analytics, Calendar et les data-tour sont lus par la
// visite guidée (constants/tour.ts) : ne pas les changer.
const TABS_LEFT: { id: NavTab; icon: LucideIcon; tour: string }[] = [
  { id: 'Feed', icon: LayoutGrid, tour: 'nav-feed' },
  { id: 'Discover', icon: Clapperboard, tour: 'nav-discover' },
];
const TABS_RIGHT: { id: NavTab; icon: LucideIcon; tour: string }[] = [
  { id: 'Analytics', icon: PieChart, tour: 'nav-analytics' },
  { id: 'Calendar', icon: CalendarDays, tour: 'nav-calendar' },
];
const TAB_IDS: NavTab[] = ['Feed', 'Discover', 'Analytics', 'Calendar'];

const PRIMARY_ICONS: Record<PrimaryKind, LucideIcon> = {
  addWatched: Plus,
  addWatchlist: BookmarkPlus,
  startSeries: Plus,
  plan: CalendarPlus,
  shareCard: Share2,
  propose: Send,
};

const ADD_ICONS: Record<AddMenuKind, LucideIcon> = {
  watched: Eye,
  watchlist: Bookmark,
  series: Tv,
  movie: Film,
  ticket: Ticket,
  dictate: Mic,
};

const SELECTION_BUTTONS: { action: SelectionAction; icon: LucideIcon; labelKey: string }[] = [
  { action: 'rate', icon: Star, labelKey: 'nav.selection.rate' },
  { action: 'watchlist', icon: Bookmark, labelKey: 'nav.selection.watchlist' },
  { action: 'watchWith', icon: Users, labelKey: 'nav.selection.watchWith' },
  { action: 'share', icon: Share2, labelKey: 'nav.selection.share' },
];

/** Positions des pastilles de l'éventail, depuis le centre du +. */
const FAN_POSITIONS: [number, number][] = [
  [-80, -54],
  [-29, -84],
  [29, -84],
  [80, -54],
];

/** Anneau d'appui long : cercle de rayon 33 dans une boîte de 70, autour du + de 58. */
const RING_R = 33;
const RING_C = 2 * Math.PI * RING_R;
const RING_EMPTY = RING_C;

/** Repliée : bouton 58 + marges 8 + padding 24 + bordures 2, pour garder le + centré. */
const PILL_MAX = 384;
const PILL_COLLAPSED = 92;

const SCROLL_TOP_ZONE = 80;
const SCROLL_STEP = 6;

const FAN_DELAY_MS = 1400;
const FAN_RETRY_MS = 500;
const FAN_GIVE_UP_MS = 10000;
const FAN_ANIM_MS = 2000;
const FAN_TEXT_MS = 2500;
const PAGE_LABEL_MS = 1300;
const BLOB_STEP_MS = 170;
const COLLAPSE_MS = 380;

const prefersReducedMotion = (): boolean => {
  try {
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  } catch {
    return false;
  }
};

/** Une modale verrouille le défilement en fixant le body (utils/useDialog.ts). */
const scrollLocked = (): boolean => document.body.style.position === 'fixed';

interface BlobBox {
  left: number;
  width: number;
  top: number;
  height: number;
  visible: boolean;
  /** Placement sans glissement : premier affichage, retour du repli, redimensionnement. */
  instant: boolean;
}

const HIDDEN_BLOB: BlobBox = { left: 0, width: 0, top: 0, height: 0, visible: false, instant: true };

const measureTab = (el: HTMLElement | null | undefined) =>
  el ? { left: el.offsetLeft, width: el.offsetWidth, top: el.offsetTop, height: el.offsetHeight } : null;

function ContextualNav(props: ContextualNavProps) {
  const {
    viewMode,
    mediaMode,
    primary,
    addMenu,
    emphasize,
    discoveryBlocked,
    selection,
    selectionActions,
  } = props;
  const { t } = useLanguage();

  // App re-rend souvent et ses callbacks ne sont pas toujours stables : les
  // minuteurs et écouteurs lisent toujours les dernières props par cette ref.
  const latest = useRef(props);
  latest.current = props;

  const navRef = useRef<HTMLElement>(null);
  const plusRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<NavTab, HTMLButtonElement | null>>>({});
  const menuId = useId();

  const [menuOpen, setMenuOpen] = useState(false);
  const [pressing, setPressing] = useState(false);
  const [popping, setPopping] = useState(false);
  const [fan, setFan] = useState<null | 'anim' | 'text'>(null);
  const [tipPending, setTipPending] = useState(false);
  const [tipVisible, setTipVisible] = useState(false);
  const [pageLabel, setPageLabel] = useState<string | null>(null);
  const [scrollCollapsed, setScrollCollapsed] = useState(false);
  const [blob, setBlob] = useState<BlobBox>(HIDDEN_BLOB);

  // L'icône ne se transforme qu'à un vrai changement d'action, pas au montage.
  const [iconPrimary, setIconPrimary] = useState(primary);
  const [morph, setMorph] = useState(false);
  if (iconPrimary !== primary) {
    setIconPrimary(primary);
    setMorph(true);
  }

  const selecting = selection.length > 0;
  // La sélection garde son dernier contenu affiché pendant le fondu de sortie.
  const shownSelection = useRef(selection);
  if (selecting) shownSelection.current = selection;

  const overlay = menuOpen || tipVisible || fan !== null;
  const collapsed = scrollCollapsed && !overlay && !selecting;
  const activeTab: NavTab | null = (TAB_IDS as string[]).includes(viewMode) ? (viewMode as NavTab) : null;

  const live = useRef({ menuOpen, tipVisible, fan, activeTab, collapsed });
  live.current = { menuOpen, tipVisible, fan, activeTab, collapsed };

  // ── Minuteurs : tous suivis, tous annulés au démontage ──────────────────
  const timers = useRef(new Set<number>());
  const later = useCallback((fn: () => void, ms: number): number => {
    const id = window.setTimeout(() => {
      timers.current.delete(id);
      fn();
    }, ms);
    timers.current.add(id);
    return id;
  }, []);
  const cancel = useCallback((id: number | null | undefined) => {
    if (id == null) return;
    window.clearTimeout(id);
    timers.current.delete(id);
  }, []);
  useEffect(() => {
    const set = timers.current;
    return () => {
      set.forEach((id) => window.clearTimeout(id));
      set.clear();
    };
  }, []);

  /** Le + est à l'écran et rien ne le recouvre (modale, fenêtre d'ajout, feuille). */
  const isPlusClear = useCallback((): boolean => {
    const btn = plusRef.current;
    const nav = navRef.current;
    if (!btn || !nav || document.hidden) return false;
    const r = btn.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) return false;
    const x = r.left + r.width / 2;
    const y = r.top + r.height / 2;
    if (x < 0 || y < 0 || x > window.innerWidth || y > window.innerHeight) return false;
    const hit = document.elementFromPoint(x, y);
    return !!hit && nav.contains(hit);
  }, []);

  // ── Menu d'ajout ─────────────────────────────────────────────────────────
  const openMenu = useCallback(() => {
    updateNavDiscovery((s) => ({ ...s, learned: true }));
    setTipVisible(false);
    setTipPending(false);
    setPageLabel(null);
    setFan(null);
    setMenuOpen(true);
    trackEvent('Nav', 'add_menu_open');
  }, []);

  const closeMenu = useCallback((refocus: boolean) => {
    setMenuOpen(false);
    setScrollCollapsed(false);
    scrollBase.current = null;
    if (refocus) plusRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const raf = requestAnimationFrame(() => {
      menuRef.current?.querySelector<HTMLElement>('[role="menuitem"]')?.focus();
    });
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      closeMenu(true);
    };
    window.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuOpen, closeMenu]);

  const onMenuKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      const items: HTMLElement[] = Array.from<HTMLElement>(
        menuRef.current?.querySelectorAll<HTMLElement>('[role="menuitem"]') ?? []
      );
      if (!items.length) return;
      const index = items.indexOf(document.activeElement as HTMLElement);
      let next = -1;
      if (e.key === 'ArrowDown') next = (index + 1) % items.length;
      else if (e.key === 'ArrowUp') next = (index - 1 + items.length) % items.length;
      else if (e.key === 'Home') next = 0;
      else if (e.key === 'End') next = items.length - 1;
      else if (e.key === 'Tab') {
        // Le menu est éphémère : quitter au clavier le referme.
        closeMenu(false);
        return;
      }
      if (next < 0) return;
      e.preventDefault();
      items[next].focus();
    },
    [closeMenu]
  );

  // ── Le + : appui court, appui long, clavier ─────────────────────────────
  const press = useRef<{ timer: number | null; x: number; y: number; suppressClick: boolean }>({
    timer: null,
    x: 0,
    y: 0,
    suppressClick: false,
  });

  const pop = useCallback(() => {
    if (prefersReducedMotion()) return;
    setPopping(true);
    later(() => setPopping(false), 360);
  }, [later]);

  const handleTap = useCallback(() => {
    // Le + rouvert pendant que le menu est affiché le referme simplement.
    if (live.current.menuOpen) {
      closeMenu(false);
      return;
    }
    haptics.medium();
    latest.current.onPrimary();
    const state = updateNavDiscovery(recordTap);
    if (shouldOfferHoldTip(state)) setTipPending(true);
  }, [closeMenu]);

  // Les gestionnaires ci-dessous sont créés une fois : ils passent par ces refs.
  const laterRef = useRef(later);
  laterRef.current = later;
  const cancelRef = useRef(cancel);
  cancelRef.current = cancel;
  const popRef = useRef(pop);
  popRef.current = pop;
  const openMenuRef = useRef(openMenu);
  openMenuRef.current = openMenu;

  const plusHandlers = useRef({
    onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
      if (!e.isPrimary || e.button !== 0) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      const p = press.current;
      p.suppressClick = false;
      cancelRef.current(p.timer);
      p.x = e.clientX;
      p.y = e.clientY;
      setPressing(true);
      p.timer = laterRef.current(() => {
        p.timer = null;
        p.suppressClick = true;
        setPressing(false);
        haptics.medium();
        popRef.current();
        openMenuRef.current();
      }, LONG_PRESS_MS);
    },
    onPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => {
      const p = press.current;
      if (p.timer == null) return;
      if (Math.hypot(e.clientX - p.x, e.clientY - p.y) > LONG_PRESS_MOVE_TOLERANCE) {
        cancelRef.current(p.timer);
        p.timer = null;
        // Le doigt a glissé : ni appui long ni appui court.
        p.suppressClick = true;
        setPressing(false);
      }
    },
    onPointerEnd: () => {
      const p = press.current;
      if (p.timer != null) {
        cancelRef.current(p.timer);
        p.timer = null;
      }
      setPressing(false);
    },
    onPointerCancel: () => {
      const p = press.current;
      cancelRef.current(p.timer);
      p.timer = null;
      p.suppressClick = true;
      setPressing(false);
    },
  }).current;

  useEffect(() => {
    const cancelPress = () => plusHandlers.onPointerCancel();
    const onVisibility = () => { if (document.hidden) cancelPress(); };
    window.addEventListener('blur', cancelPress);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('blur', cancelPress);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [plusHandlers]);

  const onPlusClick = useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const p = press.current;
      // detail === 0 : clic synthétique du clavier (Entrée, Espace), toujours un appui court.
      if (e.detail !== 0 && p.suppressClick) {
        p.suppressClick = false;
        return;
      }
      handleTap();
    },
    [handleTap]
  );

  const onPlusKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLButtonElement>) => {
      if (e.key === 'ArrowUp' || (e.key === 'F10' && e.shiftKey) || e.key === 'ContextMenu') {
        e.preventDefault();
        if (!live.current.menuOpen) {
          haptics.medium();
          openMenu();
        }
      }
    },
    [openMenu]
  );

  const preventContextMenu = useCallback((e: React.MouseEvent) => e.preventDefault(), []);

  const chooseAdd = useCallback(
    (kind: AddMenuKind) => {
      haptics.soft();
      closeMenu(false);
      latest.current.onAddMenu(kind);
    },
    [closeMenu]
  );

  // ── Onglets et bulle d'onglet actif ─────────────────────────────────────
  const navigate = useCallback((page: NavTab) => {
    haptics.soft();
    latest.current.onNavigate(page);
  }, []);

  const blobStep = useRef<{ timer: number | null; wasCollapsed: boolean }>({ timer: null, wasCollapsed: collapsed });

  useLayoutEffect(() => {
    const st = blobStep.current;
    const wasCollapsed = st.wasCollapsed;
    st.wasCollapsed = collapsed;
    cancel(st.timer);
    st.timer = null;
    if (!activeTab || collapsed) {
      setBlob((b) => (b.visible ? { ...b, visible: false } : b));
      return;
    }
    const placeNow = () => {
      const box = measureTab(tabRefs.current[activeTab]);
      if (box) setBlob({ ...box, visible: true, instant: true });
    };
    // Au dépliage, les onglets reprennent leur largeur pendant la transition :
    // on mesure une fois qu'ils sont en place.
    if (wasCollapsed) {
      st.timer = later(placeNow, COLLAPSE_MS + 20);
      return;
    }
    const target = measureTab(tabRefs.current[activeTab]);
    if (!target) return;
    if (prefersReducedMotion()) {
      setBlob({ ...target, visible: true, instant: true });
      return;
    }
    // Premier temps : la bulle s'étire de l'ancien onglet jusqu'au nouveau.
    setBlob((prev) => {
      if (!prev.visible) return { ...target, visible: true, instant: true };
      const left = Math.min(prev.left, target.left);
      const right = Math.max(prev.left + prev.width, target.left + target.width);
      return { ...target, left, width: right - left, visible: true, instant: false };
    });
    // Second temps : elle se resserre sur le nouvel onglet.
    st.timer = later(() => {
      st.timer = null;
      setBlob({ ...target, visible: true, instant: false });
    }, BLOB_STEP_MS);
  }, [activeTab, collapsed, cancel, later]);

  useEffect(() => {
    const onResize = () => {
      const { activeTab: tab, collapsed: isCollapsed } = live.current;
      if (!tab || isCollapsed) return;
      const box = measureTab(tabRefs.current[tab]);
      if (box) setBlob({ ...box, visible: true, instant: true });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  // ── Repli au défilement ─────────────────────────────────────────────────
  const scrollBase = useRef<number | null>(null);
  useEffect(() => {
    const onScroll = () => {
      // Une modale fige le body et fait sauter scrollY : on repart d'une nouvelle référence ensuite.
      if (scrollLocked()) {
        scrollBase.current = null;
        return;
      }
      const y = window.scrollY;
      if (y < SCROLL_TOP_ZONE) {
        scrollBase.current = y;
        setScrollCollapsed(false);
        return;
      }
      const base = scrollBase.current;
      if (base == null) {
        scrollBase.current = y;
        return;
      }
      const dy = y - base;
      if (dy > SCROLL_STEP) {
        scrollBase.current = y;
        setScrollCollapsed(true);
      } else if (dy < -SCROLL_STEP) {
        scrollBase.current = y;
        setScrollCollapsed(false);
      }
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // ── Éventail : une fois, au premier changement de page qui le permet ───
  const startFan = useCallback(() => {
    updateNavDiscovery((s) => ({ ...s, fanSeen: true }));
    setPageLabel(null);
    setScrollCollapsed(false);
    const reduced = prefersReducedMotion();
    setFan(reduced ? 'text' : 'anim');
    later(() => setFan(null), reduced ? FAN_TEXT_MS : FAN_ANIM_MS);
  }, [later]);

  const prevView = useRef(viewMode);
  const fanScheduled = useRef(false);
  useEffect(() => {
    // Comparaison de valeur plutôt qu'un drapeau de montage : le double montage
    // du mode strict ne doit pas passer pour un changement de page.
    if (prevView.current === viewMode) return;
    prevView.current = viewMode;
    setScrollCollapsed(false);
    scrollBase.current = null;

    if (fanScheduled.current) return;
    if (!shouldRunFan(readNavDiscovery(), latest.current.discoveryBlocked)) return;
    fanScheduled.current = true;
    let startedAt = 0;
    const attempt = () => {
      const p = latest.current;
      // Visite guidée, sélection ou geste déjà appris entre-temps : on abandonne,
      // un prochain changement de page pourra retenter.
      if (p.discoveryBlocked || p.selection.length > 0 || !shouldRunFan(readNavDiscovery(), false)) {
        fanScheduled.current = false;
        return;
      }
      const l = live.current;
      if (!l.menuOpen && !l.tipVisible && isPlusClear()) {
        startFan();
        return;
      }
      if (!startedAt) startedAt = Date.now();
      if (Date.now() - startedAt > FAN_GIVE_UP_MS) {
        fanScheduled.current = false;
        return;
      }
      later(attempt, FAN_RETRY_MS);
    };
    later(attempt, FAN_DELAY_MS);
  }, [viewMode, isPlusClear, later, startFan]);

  // ── Bulle d'action quand le + change de sens ────────────────────────────
  const contextKey = props.contextKey ?? primary;
  const prevPrimary = useRef(contextKey);
  const labelTimer = useRef<number | null>(null);
  useEffect(() => {
    if (prevPrimary.current === contextKey) return;
    prevPrimary.current = contextKey;
    const l = live.current;
    const p = latest.current;
    if (l.menuOpen || l.tipVisible || l.fan || p.selection.length > 0 || p.discoveryBlocked) return;
    cancel(labelTimer.current);
    setPageLabel(latest.current.contextLabel ?? t(primaryLabelKey(primary)));
    labelTimer.current = later(() => {
      labelTimer.current = null;
      setPageLabel(null);
      updateNavDiscovery((s) => ({ ...s, labelShows: s.labelShows + 1 }));
    }, PAGE_LABEL_MS);
  }, [contextKey, primary, cancel, later, t]);

  // ── Astuce du 3e appui court ────────────────────────────────────────────
  useEffect(() => {
    if (!tipPending) return;
    // Deux sondages favorables d'affilée : la fenêtre ouverte par le + (parfois
    // chargée à la demande) a le temps d'apparaître, puis de finir de se fermer.
    let clearOnce = false;
    const id = window.setInterval(() => {
      const state = readNavDiscovery();
      if (state.learned || state.tipSeen) {
        setTipPending(false);
        return;
      }
      const p = latest.current;
      const l = live.current;
      if (p.discoveryBlocked || p.selection.length > 0 || l.menuOpen || l.fan || !isPlusClear()) {
        clearOnce = false;
        return;
      }
      if (!clearOnce) {
        clearOnce = true;
        return;
      }
      updateNavDiscovery((s) => ({ ...s, tipSeen: true }));
      setTipPending(false);
      setPageLabel(null);
      setTipVisible(true);
    }, 500);
    return () => window.clearInterval(id);
  }, [tipPending, isPlusClear]);

  // Visite guidée qui démarre : on retire l'astuce et l'éventail.
  useEffect(() => {
    if (!discoveryBlocked) return;
    setTipVisible(false);
    setFan(null);
  }, [discoveryBlocked]);

  const lastGlobalRequest = useRef(0);
  useEffect(() => {
    if (!props.globalAddRequest || props.globalAddRequest === lastGlobalRequest.current) return;
    lastGlobalRequest.current = props.globalAddRequest;
    openMenu();
  }, [props.globalAddRequest, openMenu]);
  const wasSelecting = useRef(false);
  useEffect(() => {
    if (wasSelecting.current && !selecting) { setScrollCollapsed(false); scrollBase.current = null; }
    wasSelecting.current = selecting;
  }, [selecting]);
  useEffect(() => {
    const restore = () => { setScrollCollapsed(false); scrollBase.current = null; };
    window.addEventListener(DIALOG_CLOSED_EVENT, restore);
    return () => window.removeEventListener(DIALOG_CLOSED_EVENT, restore);
  }, []);

  // ── Mode sélection ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!selecting) return;
    setMenuOpen(false);
    setTipVisible(false);
    setPageLabel(null);
    setFan(null);
    const onKey = (e: KeyboardEvent) => {
      // Une modale ouverte par-dessus gère son propre Échap.
      if (e.key !== 'Escape' || scrollLocked()) return;
      latest.current.onClearSelection();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selecting]);

  const onToolbarKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    const buttons: HTMLButtonElement[] = Array.from<HTMLButtonElement>(e.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (index < 0) return;
    e.preventDefault();
    const step = e.key === 'ArrowRight' ? 1 : -1;
    buttons[(index + step + buttons.length) % buttons.length].focus();
  }, []);

  // ── Rendu ────────────────────────────────────────────────────────────────
  const PrimaryIcon = PRIMARY_ICONS[primary];
  const primaryLabel = props.contextLabel ?? t(primaryLabelKey(primary));
  const shown = shownSelection.current;
  const fanKinds = addMenu.slice(0, FAN_POSITIONS.length);

  const renderTab = ({ id, icon: Icon, tour }: { id: NavTab; icon: LucideIcon; tour: string }) => {
    const active = activeTab === id;
    const label = id === 'Feed' ? t(mediaMode === 'tv' ? 'tv.mySeries' : 'nav.feed') : t(`nav.${id.toLowerCase()}`);
    const tone = collapsed
      ? 'w-0 opacity-0 pointer-events-none'
      : `w-[46px] ${active ? 'text-charcoal dark:text-white' : 'text-stone-300 dark:text-stone-600 opacity-50 hover:opacity-100'}`;
    return (
      <button
        key={id}
        ref={(el) => {
          tabRefs.current[id] = el;
        }}
        type="button"
        data-tour={tour}
        onClick={() => navigate(id)}
        aria-label={label}
        aria-current={active ? 'page' : undefined}
        tabIndex={collapsed ? -1 : undefined}
        inert={collapsed}
        className={`nav-tab relative z-[1] flex-none h-[46px] grid place-items-center rounded-full overflow-hidden focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-forest ${tone}`}
      >
        <Icon size={22} />
      </button>
    );
  };

  return (
    <nav
      ref={navRef}
      className="fixed left-6 right-6 z-50 max-w-sm mx-auto"
      style={{ bottom: 'calc(env(safe-area-inset-bottom, 0px) + 2rem)' }}
    >
      {menuOpen && (
        <div
          aria-hidden="true"
          onClick={() => closeMenu(false)}
          className="nav-fade fixed inset-0 bg-charcoal/40 dark:bg-black/60"
        />
      )}

      <div className="relative">
        {/* Pilule : onglets et + */}
        <div
          data-testid="nav-pill"
          inert={selecting}
          aria-hidden={selecting || undefined}
          className={`nav-pill relative mx-auto w-full flex justify-between items-center bg-white/95 dark:bg-black/95 backdrop-blur-2xl border border-white/20 dark:border-white/10 shadow-2xl rounded-[2.5rem] px-3 py-2 ${selecting ? 'nav-off' : ''}`}
          style={{ maxWidth: collapsed ? PILL_COLLAPSED : PILL_MAX }}
        >
          <span
            aria-hidden="true"
            className="nav-blob absolute z-0 rounded-full bg-sand dark:bg-[#1a1a1a] shadow-sm pointer-events-none"
            style={{
              left: blob.left,
              width: blob.width,
              top: blob.top,
              height: blob.height,
              opacity: blob.visible ? 1 : 0,
              transition: blob.instant ? 'opacity .2s' : undefined,
            }}
          />

          {TABS_LEFT.map(renderTab)}

          <button
            ref={plusRef}
            type="button"
            data-tour="nav-add"
            aria-label={t('nav.primary.holdHint', { action: primaryLabel })}
            aria-haspopup="dialog"
            aria-expanded={menuOpen || props.paletteOpen}
            aria-controls={menuOpen ? menuId : undefined}
            onPointerDown={plusHandlers.onPointerDown}
            onPointerMove={plusHandlers.onPointerMove}
            onPointerUp={plusHandlers.onPointerEnd}
            onPointerCancel={plusHandlers.onPointerCancel}
            onLostPointerCapture={plusHandlers.onPointerEnd}
            onClick={onPlusClick}
            onKeyDown={onPlusKeyDown}
            onContextMenu={preventContextMenu}
            style={{ touchAction: 'manipulation', WebkitTouchCallout: 'none', WebkitUserSelect: 'none', userSelect: 'none' }}
            className={`relative z-[1] flex-none w-[58px] h-[58px] mx-1 grid place-items-center rounded-full bg-forest text-white shadow-xl shadow-forest/20 transition-transform duration-150 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-bitter-lime/70 ${pressing ? 'scale-90' : ''} ${popping ? 'nav-pop' : ''} ${emphasize ? 'motion-safe:animate-pulse motion-safe:ring-4 motion-safe:ring-forest/20' : ''}`}
          >
            <svg
              aria-hidden="true"
              viewBox="0 0 70 70"
              className="absolute -left-[6px] -top-[6px] w-[70px] h-[70px] -rotate-90 pointer-events-none overflow-visible"
            >
              <circle
                cx="35"
                cy="35"
                r={RING_R}
                fill="none"
                stroke="#D9FF00"
                strokeWidth={3.5}
                strokeLinecap="round"
                strokeDasharray={`${RING_C} ${RING_C}`}
                strokeDashoffset={pressing ? 0 : RING_EMPTY}
                strokeOpacity={pressing ? 1 : 0}
                style={{
                  transition: prefersReducedMotion() ? 'none' : pressing
                    ? `stroke-dashoffset ${LONG_PRESS_MS}ms linear`
                    : 'stroke-dashoffset 150ms ease-out',
                }}
              />
            </svg>
            <span key={primary} aria-hidden="true" className={`grid place-items-center ${morph ? 'nav-morph' : ''}`}>
              <PrimaryIcon size={24} strokeWidth={3} />
            </span>
            {/* Signe permanent : le + cache d'autres options. */}
            <span aria-hidden="true" className="absolute top-[6px] left-1/2 -translate-x-1/2 flex gap-[2.5px]">
              <i className="block w-[3px] h-[3px] rounded-full bg-current opacity-75" />
              <i className="block w-[3px] h-[3px] rounded-full bg-current opacity-75" />
              <i className="block w-[3px] h-[3px] rounded-full bg-current opacity-75" />
            </span>
          </button>

          {TABS_RIGHT.map(renderTab)}
        </div>

        {/* Éventail : ce que cache le + */}
        {fan && (
          <div data-testid="nav-fan" className="pointer-events-none absolute inset-0">
            {fan === 'anim' && (
              <span aria-hidden="true" className="absolute left-1/2 top-1/2 w-0 h-0">
                {fanKinds.map((kind, i) => {
                  const Icon = ADD_ICONS[kind];
                  const [x, y] = FAN_POSITIONS[i];
                  return (
                    <span
                      key={kind}
                      className="nav-fan-item absolute -left-[19px] -top-[19px] w-[38px] h-[38px] rounded-full grid place-items-center bg-white dark:bg-[#161616] text-charcoal dark:text-white border border-stone-200 dark:border-white/10 shadow-lg"
                      style={{ '--x': `${x}px`, '--y': `${y}px`, animationDelay: `${i * 50}ms` } as React.CSSProperties}
                    >
                      <Icon size={17} />
                    </span>
                  );
                })}
              </span>
            )}
            <div
              className={`absolute inset-x-0 flex justify-center ${fan === 'anim' ? 'bottom-[calc(100%+84px)]' : 'bottom-[calc(100%+14px)]'}`}
            >
              <span
                role="status"
                className="nav-rise w-max max-w-[270px] rounded-2xl bg-bitter-lime text-charcoal text-[12.5px] font-bold leading-snug px-3 py-2.5 shadow-xl"
              >
                {t('nav.discovery.fan')}
              </span>
            </div>
          </div>
        )}

        {/* Bulle d'action : ce que fait le + sur cette page */}
        {pageLabel && !overlay && !selecting && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[calc(100%+10px)] flex justify-center">
            <span
              data-testid="nav-page-label"
              role="status"
              className="nav-rise whitespace-nowrap rounded-full bg-charcoal text-white dark:bg-white dark:text-charcoal text-xs font-black px-3 py-1.5 shadow-lg"
            >
              {pageLabel}
            </span>
          </div>
        )}

        {/* Astuce après le 3e appui court */}
        {tipVisible && !selecting && (
          <div className="pointer-events-none absolute inset-x-0 bottom-[calc(100%+14px)] flex justify-center">
            <div
              data-testid="nav-hold-tip"
              role="status"
              className="nav-rise pointer-events-auto relative grid gap-2 w-max max-w-[270px] rounded-2xl bg-bitter-lime text-charcoal text-[12.5px] font-bold leading-snug px-3 py-2.5 shadow-xl"
            >
              <span>{t('nav.discovery.tip')}</span>
              <button
                type="button"
                onClick={() => setTipVisible(false)}
                className="justify-self-end rounded-full bg-charcoal text-bitter-lime text-[11.5px] font-black px-3 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-charcoal focus-visible:ring-offset-2 focus-visible:ring-offset-bitter-lime"
              >
                {t('nav.discovery.gotIt')}
              </button>
              <span
                aria-hidden="true"
                className="absolute left-1/2 -bottom-[5px] w-3 h-3 -translate-x-1/2 rotate-45 rounded-[2px] bg-bitter-lime"
              />
            </div>
          </div>
        )}

        {/* Menu d'ajout (appui long) */}
        {menuOpen && (
          <div
            ref={menuRef}
            id={menuId}
            role="menu"
            aria-labelledby={`${menuId}-title`}
            data-testid="nav-add-menu"
            onKeyDown={onMenuKeyDown}
            className="nav-menu-in absolute bottom-[calc(100%+14px)] left-[calc(50%-116px)] w-[232px] grid gap-0.5 p-1.5 rounded-3xl bg-white dark:bg-[#161616] border border-stone-200/80 dark:border-white/10 shadow-[0_24px_50px_-20px_rgba(0,0,0,0.45)]"
          >
            <span
              id={`${menuId}-title`}
              aria-hidden="true"
              className="px-3 pt-2 pb-1 text-[10px] font-black uppercase tracking-[0.16em] text-stone-400 dark:text-stone-500"
            >
              {t('nav.add.title')}
            </span>
            {addMenu.map((kind) => {
              const Icon = ADD_ICONS[kind];
              return (
                <button
                  key={kind}
                  type="button"
                  role="menuitem"
                  data-add={kind}
                  onClick={() => chooseAdd(kind)}
                  className="flex items-center gap-3 px-3 py-[11px] rounded-2xl text-left text-sm font-extrabold text-charcoal dark:text-white hover:bg-sand dark:hover:bg-white/10 focus-visible:outline-none focus-visible:bg-sand dark:focus-visible:bg-white/10 focus-visible:ring-2 focus-visible:ring-forest"
                >
                  <Icon size={19} aria-hidden="true" />
                  {t(addMenuLabelKey(kind, mediaMode))}
                </button>
              );
            })}
          </div>
        )}

        {/* Barre de sélection : remplace la pilule tant qu'une affiche est cochée */}
        <div
          data-testid="nav-selection-bar"
          role="toolbar"
          aria-label={t('nav.selection.label')}
          aria-hidden={!selecting || undefined}
          inert={!selecting}
          onKeyDown={onToolbarKeyDown}
          className={`nav-selbar absolute inset-0 flex items-center justify-between gap-0.5 rounded-[2.5rem] bg-charcoal text-white dark:bg-white dark:text-charcoal px-2.5 py-2 shadow-2xl ${selecting ? '' : 'nav-off'}`}
        >
          <span
            aria-live="polite"
            className="pointer-events-none absolute left-1/2 -translate-x-1/2 bottom-[calc(100%+10px)] max-w-full truncate whitespace-nowrap rounded-full bg-bitter-lime text-charcoal text-xs font-black px-3 py-1.5 shadow-lg"
          >
            {shown.length === 1 ? shown[0].title : t('nav.selection.count', { count: shown.length })}
          </span>
          <button
            type="button"
            aria-label={t('nav.selection.cancel')}
            onClick={() => {
              haptics.soft();
              latest.current.onClearSelection();
            }}
            className="flex items-center gap-1.5 h-[46px] pl-2.5 pr-3 rounded-full bg-white/15 dark:bg-charcoal/10 text-[15px] font-black tabular-nums focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitter-lime dark:focus-visible:ring-forest"
          >
            <X size={16} strokeWidth={2.6} aria-hidden="true" />
            <span aria-hidden="true">{shown.length}</span>
          </button>
          {SELECTION_BUTTONS.map(({ action, icon: Icon, labelKey }) => (
            <button
              key={action}
              type="button"
              data-action={action}
              disabled={!selectionActions[action]}
              onClick={() => {
                haptics.soft();
                latest.current.onSelectionAction(action);
              }}
              className="grid justify-items-center gap-[3px] w-[52px] py-1 rounded-[14px] text-[10px] font-black leading-tight disabled:opacity-30 disabled:cursor-default enabled:active:bg-white/15 dark:enabled:active:bg-charcoal/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bitter-lime dark:focus-visible:ring-forest"
            >
              <Icon size={19} aria-hidden="true" />
              <span>{t(labelKey)}</span>
            </button>
          ))}
        </div>
      </div>
    </nav>
  );
}

export default memo(ContextualNav);
