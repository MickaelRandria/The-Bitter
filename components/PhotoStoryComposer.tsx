import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Check, ImagePlus, Link2, Loader2, MoreHorizontal, RotateCcw, Share, Sticker, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import {
  DEFAULT_FRAMING,
  FRAMING_MAX_ZOOM,
  PhotoFraming,
  PhotoStoryLayout,
  RELEVE_STYLES,
  ReleveStyle,
  SAFE_BOTTOM,
  SAFE_TOP,
  Size,
  STICKER_COLORS,
  StickerColor,
  StickerPlacement,
  STORY_H,
  STORY_W,
  autoColor,
  clamp,
  clampPlacement,
  coverRect,
  cycle,
  defaultPlacement,
  isFlick,
  isTap,
  snapToCenter,
} from '../utils/photoStory';
import {
  PhotoStoryData,
  StickerLook,
  StoryPhoto,
  canvasToBlob,
  ensureStoryFonts,
  gradePhoto,
  loadImage,
  loadPhotoFile,
  measureBlock,
  posterTones,
  renderPhotoStory,
  renderStickerOnly,
} from '../utils/photoStoryRender';

interface PhotoStoryComposerProps {
  file: File;
  initialLayout: PhotoStoryLayout;
  data: PhotoStoryData;
  posterUrl?: string;
  /** Nom de fichier sans extension, déjà nettoyé. */
  fileStem: string;
  onShare: (blob: Blob, fileName: string) => Promise<void>;
  onClose: () => void;
  /** Lien public du verdict, copié au partage pour le sticker Lien d'Instagram. */
  copyLink?: () => Promise<string | null>;
}

type Box = { left: number; top: number; width: number; height: number };
type Point = { x: number; y: number };
type GestureBase = { points: Map<number, Point>; origin: Map<number, Point>; t0: number; multi: boolean };
type Gesture =
  | (GestureBase & { target: 'sticker'; start: StickerPlacement })
  | (GestureBase & { target: 'photo'; start: PhotoFraming });

const STYLE_LABELS: Record<ReleveStyle, string> = { ligne: 'story.style.ligne', compact: 'story.style.compact', badge: 'story.style.badge' };
const COLOR_SWATCH: Record<StickerColor, string> = {
  blanc: '#FFFFFF',
  noir: '#0c0c0c',
  accent: 'radial-gradient(circle, #D9FF00 0 34%, #FFFFFF 36%)',
};

const distance = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const midpoint = (a: { x: number; y: number }, b: { x: number; y: number }) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * Aperçu plein écran d'une story avec photo. Le bloc de textes se déplace et
 * se pince comme un sticker, la photo se cadre autour ; au partage, les deux
 * partent fondus en une seule image.
 */
const PhotoStoryComposer: React.FC<PhotoStoryComposerProps> = ({
  file,
  initialLayout,
  data,
  posterUrl,
  fileStem,
  onShare,
  onClose,
  copyLink,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('story.composer.title'));
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentFile, setCurrentFile] = useState(file);
  const [layout, setLayout] = useState<PhotoStoryLayout>(initialLayout);
  const [filmLook, setFilmLook] = useState(initialLayout === 'seance');
  const [light, setLight] = useState(false);
  const [raw, setRaw] = useState<StoryPhoto | null>(null);
  const [graded, setGraded] = useState<StoryPhoto | null>(null);
  const [poster, setPoster] = useState<HTMLImageElement | null>(null);
  const [framing, setFraming] = useState<PhotoFraming>(DEFAULT_FRAMING);
  const [placements, setPlacements] = useState<Record<string, StickerPlacement | undefined>>({});
  const [look, setLook] = useState<StickerLook>({ style: 'ligne', color: 'blanc', verdict: true });
  const [linkCopied, setLinkCopied] = useState<string | null>(null);
  /** Une fois la couleur choisie à la main, l'app ne la change plus d'elle-même. */
  const colorTouched = useRef(false);
  const autoColorDone = useRef(false);
  const [box, setBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState<null | { snapped: boolean }>(null);
  const [touched, setTouched] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);

  const blockSize = useMemo<Record<PhotoStoryLayout, Size>>(
    () => ({ seance: measureBlock('seance', data), releve: measureBlock('releve', data, look) }),
    // Les polices changent la mesure : on la refait une fois la photo prête,
    // c'est-à-dire après leur chargement.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [data, raw, look.style, look.verdict],
  );
  // Chaque style du relevé garde son propre placement.
  const placementKey = layout === 'releve' ? `releve:${look.style}` : 'seance';
  const placement = clampPlacement(
    placements[placementKey] ?? defaultPlacement(layout, blockSize[layout], look.style),
    blockSize[layout],
  );

  // Photo : décodage, polices, puis affiche et étalonnage en arrière-plan.
  useEffect(() => {
    let cancelled = false;
    setRaw(null);
    setGraded(null);
    setError(null);
    setFraming(DEFAULT_FRAMING);
    autoColorDone.current = false;
    Promise.all([loadPhotoFile(currentFile), ensureStoryFonts(data.title.toUpperCase())])
      .then(([photo]) => {
        if (!cancelled) setRaw(photo);
      })
      .catch(() => {
        if (!cancelled) setError(t('story.composer.error'));
      });
    return () => {
      cancelled = true;
    };
  }, [currentFile, data.title, t]);

  useEffect(() => {
    let cancelled = false;
    if (posterUrl) loadImage(posterUrl).then((img) => !cancelled && setPoster(img));
    return () => {
      cancelled = true;
    };
  }, [posterUrl]);

  useEffect(() => {
    if (!raw || !filmLook || graded) return;
    // Laisse l'aperçu s'afficher avant le calcul pixel par pixel.
    const id = window.setTimeout(() => setGraded(gradePhoto(raw, posterTones(poster))), 30);
    return () => window.clearTimeout(id);
  }, [raw, filmLook, graded, poster]);

  // Une affiche arrivée après coup change les teintes : on refait l'étalonnage.
  useEffect(() => {
    setGraded(null);
  }, [poster]);

  const photo = filmLook ? graded ?? raw : raw;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !raw) return;
    const id = window.requestAnimationFrame(() => {
      const b = renderPhotoStory(canvas, {
        layout,
        data,
        photo,
        framing,
        placement,
        poster,
        filmLook: filmLook && !!graded,
        light: layout === 'seance' && light,
        look: layout === 'releve' ? look : undefined,
      });
      // Première vue du relevé : texte noir d'office si la photo est claire sous le bloc.
      if (layout === 'releve' && !colorTouched.current && !autoColorDone.current) {
        autoColorDone.current = true;
        const color = autoColor(b.luminance);
        if (color !== look.color) setLook((l) => ({ ...l, color }));
      }
      setBox((prev) =>
        prev && prev.left === b.left && prev.top === b.top && prev.width === b.width && prev.height === b.height
          ? prev
          : { left: b.left, top: b.top, width: b.width, height: b.height },
      );
    });
    return () => window.cancelAnimationFrame(id);
  }, [layout, data, photo, framing, placement.cx, placement.cy, placement.scale, poster, filmLook, graded, raw, light, look]);

  const toStory = (e: React.PointerEvent) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * STORY_W, y: ((e.clientY - rect.top) / rect.height) * STORY_H };
  };

  const setPlacement = (p: StickerPlacement) =>
    setPlacements((prev) => ({ ...prev, [placementKey]: clampPlacement(p, blockSize[layout]) }));

  const recenter = () => setPlacements((prev) => ({ ...prev, [placementKey]: undefined }));

  const chooseColor = (color: StickerColor) => {
    colorTouched.current = true;
    setLook((l) => ({ ...l, color }));
  };

  const onPointerDown = (e: React.PointerEvent) => {
    if (!raw) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setTouched(true);
    setMenuOpen(false);
    const p = toStory(e);
    const g = gesture.current;
    if (g) {
      // Deuxième doigt : le pincement part de l'état courant.
      g.points.set(e.pointerId, p);
      g.origin = new Map(g.points);
      g.multi = true;
      if (g.target === 'sticker') g.start = placement;
      else g.start = framing;
      return;
    }
    const onSticker =
      !!box && p.x >= box.left && p.x <= box.left + box.width && p.y >= box.top && p.y <= box.top + box.height;
    const points = new Map([[e.pointerId, p]]);
    const t0 = performance.now();
    if (onSticker) {
      gesture.current = { target: 'sticker', start: placement, points, origin: new Map(points), t0, multi: false };
      setDragging({ snapped: false });
    } else {
      gesture.current = { target: 'photo', start: framing, points, origin: new Map(points), t0, multi: false };
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g || !g.points.has(e.pointerId) || !raw) return;
    g.points.set(e.pointerId, toStory(e));
    const ids = Array.from(g.points.keys());
    const now = ids.map((id) => g.points.get(id)!);
    const was = ids.map((id) => g.origin.get(id) ?? g.points.get(id)!);
    let dx: number;
    let dy: number;
    let ratio = 1;
    if (now.length >= 2) {
      const m0 = midpoint(was[0], was[1]);
      const m1 = midpoint(now[0], now[1]);
      dx = m1.x - m0.x;
      dy = m1.y - m0.y;
      ratio = distance(now[0], now[1]) / Math.max(1, distance(was[0], was[1]));
    } else {
      dx = now[0].x - was[0].x;
      dy = now[0].y - was[0].y;
    }
    if (g.target === 'sticker') {
      const snap = snapToCenter(g.start.cx + dx);
      setPlacement({ cx: snap.cx, cy: g.start.cy + dy, scale: g.start.scale * ratio });
      setDragging({ snapped: snap.snapped });
    } else {
      const zoom = clamp(g.start.zoom * ratio, 1, FRAMING_MAX_ZOOM);
      const next = coverRect(
        { width: raw.width, height: raw.height },
        { zoom, panX: g.start.panX + dx, panY: g.start.panY + dy },
      );
      setFraming(next.framing);
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const last = g.points.get(e.pointerId);
    const first = g.origin.get(e.pointerId);
    g.points.delete(e.pointerId);
    if (g.points.size === 0) {
      gesture.current = null;
      setDragging(null);
      // Sur le relevé : un balayage change de style, un toucher change de couleur.
      if (g.target === 'sticker' && !g.multi && layout === 'releve' && last && first) {
        const dx = last.x - first.x;
        const dy = last.y - first.y;
        const ms = performance.now() - g.t0;
        if (isFlick(dx, dy, ms)) {
          setPlacements((prev) => ({ ...prev, [placementKey]: g.start }));
          setLook((l) => ({ ...l, style: cycle(RELEVE_STYLES, l.style, dx < 0 ? 1 : -1) }));
        } else if (isTap(dx, dy, ms)) {
          colorTouched.current = true;
          setLook((l) => ({ ...l, color: cycle(STICKER_COLORS, l.color) }));
        }
      }
    } else {
      g.origin = new Map(g.points);
      if (g.target === 'sticker') g.start = placement;
      else g.start = framing;
    }
  };

  /**
   * Copie le lien du verdict dans le geste même du toucher : Safari refuse
   * d'écrire dans le presse-papiers une fois la feuille de partage refermée.
   * Le lien se crée pendant ce temps, la copie l'attend.
   */
  const startLinkCopy = (): Promise<string | null> => {
    if (!copyLink || !navigator.clipboard) return Promise.resolve(null);
    const link = copyLink().catch(() => null);
    const asBlob = link.then((url) => {
      if (!url) throw new Error('pas de lien');
      return new Blob([url], { type: 'text/plain' });
    });
    let written: Promise<unknown>;
    if (typeof ClipboardItem !== 'undefined' && navigator.clipboard.write) {
      written = navigator.clipboard.write([new ClipboardItem({ 'text/plain': asBlob })]);
    } else {
      written = link.then((url) => (url ? navigator.clipboard.writeText(url) : Promise.reject()));
    }
    return written.then(() => link, () => null);
  };

  const share = async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    setLinkCopied(null);
    const copied = startLinkCopy();
    try {
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      await onShare(blob, `${fileStem}.jpg`);
      const url = await copied;
      if (url) setLinkCopied(url);
    } finally {
      setBusy(false);
    }
  };

  const shareSticker = async () => {
    setMenuOpen(false);
    setBusy(true);
    try {
      const blob = await canvasToBlob(renderStickerOnly(layout, data, look), 'image/png');
      await onShare(blob, `${fileStem}-sticker.png`);
    } finally {
      setBusy(false);
    }
  };

  const pct = (v: number, total: number) => `${(v / total) * 100}%`;
  const segment = (active: boolean) =>
    `px-4 py-2.5 rounded-full text-[10.5px] font-black uppercase tracking-[0.12em] transition-colors ${
      active ? 'bg-white text-[#0c0c0c]' : 'text-stone-300'
    }`;
  const toggle = (active: boolean) =>
    `px-3.5 py-2 rounded-full text-[10.5px] font-bold transition-colors ${active ? 'bg-white text-[#0c0c0c]' : 'text-stone-300'}`;

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[310] bg-[#0c0c0c] text-white flex flex-col animate-[fadeIn_0.2s_ease-out]"
      style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}
      onClick={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onTouchMove={(e) => e.stopPropagation()}
      onTouchEnd={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-4">
        <button
          type="button"
          onClick={onClose}
          aria-label={t('common.close')}
          className="w-11 h-11 rounded-full bg-white/10 border border-white/10 flex items-center justify-center active:scale-90 transition-transform"
        >
          <X size={16} strokeWidth={2.5} />
        </button>
        <div role="tablist" aria-label={t('story.composer.layout')} className="flex p-1 rounded-full bg-white/[0.08] border border-white/10">
          <button type="button" role="tab" aria-selected={layout === 'seance'} onClick={() => setLayout('seance')} className={segment(layout === 'seance')}>
            {t('story.seance')}
          </button>
          <button type="button" role="tab" aria-selected={layout === 'releve'} onClick={() => setLayout('releve')} className={segment(layout === 'releve')}>
            {t('story.releve')}
          </button>
        </div>
        <span className="w-11" aria-hidden="true" />
      </div>

      <div className="flex-1 min-h-0 flex items-center justify-center px-5 py-4">
        <div
          ref={surfaceRef}
          className="relative h-full max-w-full rounded-[18px] overflow-hidden bg-[#111] shadow-[0_0_0_1px_rgba(255,255,255,0.12),0_24px_60px_rgba(0,0,0,0.6)] select-none"
          style={{ aspectRatio: '9 / 16', touchAction: 'none' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <canvas ref={canvasRef} width={STORY_W} height={STORY_H} className="absolute inset-0 w-full h-full" aria-label={t('story.composer.title')} />

          {dragging && (
            <div className="absolute inset-0 pointer-events-none" aria-hidden="true">
              <div
                className="absolute inset-x-0 top-0 border-b border-dashed border-red-300/90"
                style={{ height: pct(SAFE_TOP, STORY_H), background: 'repeating-linear-gradient(135deg, rgba(255,70,70,0.3) 0 6px, rgba(255,70,70,0.1) 6px 12px)' }}
              />
              <div
                className="absolute inset-x-0 bottom-0 border-t border-dashed border-red-300/90"
                style={{ height: pct(SAFE_BOTTOM, STORY_H), background: 'repeating-linear-gradient(135deg, rgba(255,70,70,0.3) 0 6px, rgba(255,70,70,0.1) 6px 12px)' }}
              />
              {dragging.snapped && (
                <div
                  className="absolute left-1/2 border-l border-dashed border-[#D9FF00]"
                  style={{ top: pct(SAFE_TOP, STORY_H), bottom: pct(SAFE_BOTTOM, STORY_H) }}
                />
              )}
              {box && (
                <div
                  className="absolute border-2 border-dashed border-white/90 rounded-xl"
                  style={{
                    left: pct(box.left - 14, STORY_W),
                    top: pct(box.top - 14, STORY_H),
                    width: pct(box.width + 28, STORY_W),
                    height: pct(box.height + 28, STORY_H),
                  }}
                />
              )}
            </div>
          )}

          {!touched && raw && (
            <span className="absolute left-1/2 top-3 -translate-x-1/2 w-max max-w-[90%] text-center leading-snug px-3 py-1.5 rounded-full bg-black/60 text-[10px] font-semibold pointer-events-none">
              {t(layout === 'releve' ? 'story.composer.hintReleve' : 'story.composer.hint')}
            </span>
          )}

          {!raw && (
            <div role="status" className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-stone-300 text-[11px] font-medium px-8 text-center">
              {error ? (
                <span>{error}</span>
              ) : (
                <>
                  <Loader2 size={22} className="animate-spin" />
                  {t('story.composer.loading')}
                </>
              )}
            </div>
          )}
        </div>
      </div>

      {layout === 'releve' && (
        <div className="flex flex-col items-center gap-2.5 px-5 mb-2.5">
          <div role="radiogroup" aria-label={t('story.composer.stickerStyle')} className="flex gap-1.5">
            {RELEVE_STYLES.map((style) => (
              <button
                key={style}
                type="button"
                role="radio"
                aria-checked={look.style === style}
                onClick={() => setLook((l) => ({ ...l, style }))}
                className={`px-3.5 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.12em] transition-colors ${
                  look.style === style ? 'bg-white text-[#0c0c0c] border-white' : 'bg-white/[0.06] text-stone-300 border-white/10'
                }`}
              >
                {t(STYLE_LABELS[style])}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <div role="radiogroup" aria-label={t('story.composer.textColor')} className="flex items-center gap-2.5">
              {STICKER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  role="radio"
                  aria-checked={look.color === color}
                  aria-label={t(`story.color.${color}`)}
                  onClick={() => chooseColor(color)}
                  className="w-7 h-7 rounded-full border border-white/25"
                  style={{
                    background: COLOR_SWATCH[color],
                    boxShadow: look.color === color ? '0 0 0 2px #0c0c0c, 0 0 0 4px #FFFFFF' : 'none',
                  }}
                />
              ))}
            </div>
            <span className="w-px h-5 bg-white/15" aria-hidden="true" />
            <button
              type="button"
              aria-pressed={look.verdict}
              onClick={() => setLook((l) => ({ ...l, verdict: !l.verdict }))}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-full border text-[10px] font-black uppercase tracking-[0.12em] transition-colors ${
                look.verdict ? 'bg-white text-[#0c0c0c] border-white' : 'bg-white/[0.06] text-stone-300 border-white/10'
              }`}
            >
              {look.verdict && <Check size={12} strokeWidth={3} />}
              {t('story.composer.verdict')}
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap justify-center gap-2 px-5">
        {layout === 'seance' && (
          <div role="radiogroup" aria-label={t('story.composer.style')} className="flex p-[3px] rounded-full bg-white/[0.06] border border-white/10">
            <button type="button" role="radio" aria-checked={!light} onClick={() => setLight(false)} className={toggle(!light)}>
              {t('story.composer.full')}
            </button>
            <button type="button" role="radio" aria-checked={light} onClick={() => setLight(true)} className={toggle(light)}>
              {t('story.composer.light')}
            </button>
          </div>
        )}
        <div role="radiogroup" aria-label={t('story.composer.colors')} className="flex p-[3px] rounded-full bg-white/[0.06] border border-white/10">
          <button type="button" role="radio" aria-checked={filmLook} onClick={() => setFilmLook(true)} className={toggle(filmLook)}>
            {t('story.composer.film')}
          </button>
          <button type="button" role="radio" aria-checked={!filmLook} onClick={() => setFilmLook(false)} className={toggle(!filmLook)}>
            {t('story.composer.raw')}
          </button>
        </div>
      </div>

      <div className="relative flex gap-2.5 px-5 mt-4">
        {linkCopied && !menuOpen && (
          <div role="status" className="absolute left-5 right-5 bottom-[66px] flex items-start gap-3 p-3.5 rounded-[18px] bg-[#1f1f1f] border border-white/10 shadow-2xl z-10">
            <span className="w-7 h-7 rounded-full bg-[#D9FF00] text-black flex items-center justify-center shrink-0">
              <Link2 size={14} strokeWidth={2.6} />
            </span>
            <span className="flex-1 min-w-0">
              <span className="block text-[12px] font-extrabold">{t('story.composer.linkCopied')}</span>
              <span className="block mt-0.5 text-[10.5px] font-medium text-stone-400 leading-snug">
                {t('story.composer.linkCopiedDesc', { title: data.title })}
              </span>
              <span className="inline-block mt-2 px-2 py-1 rounded-lg bg-white/[0.08] text-[10px] font-bold text-stone-200 max-w-full truncate">
                {linkCopied.replace(/^https?:\/\//, '')}
              </span>
            </span>
            <button type="button" onClick={() => setLinkCopied(null)} aria-label={t('common.close')} className="text-stone-500 shrink-0">
              <X size={14} />
            </button>
          </div>
        )}
        {menuOpen && (
          <div role="menu" aria-label={t('story.composer.more')} className="absolute left-5 bottom-[66px] w-[270px] p-1.5 rounded-[20px] bg-[#1f1f1f] border border-white/10 shadow-2xl z-10">
            <button type="button" role="menuitem" onClick={shareSticker} className="w-full flex items-start gap-3 p-3 rounded-[14px] text-left hover:bg-white/5">
              <Sticker size={18} className="text-[#D9FF00] shrink-0" />
              <span>
                <span className="block text-[12px] font-extrabold">{t('story.composer.stickerOnly')}</span>
                <span className="block mt-0.5 text-[10.5px] font-medium text-stone-400 leading-snug">{t('story.composer.stickerOnlyDesc')}</span>
              </span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                recenter();
                setMenuOpen(false);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-[14px] text-left hover:bg-white/5"
            >
              <RotateCcw size={18} className="text-stone-400 shrink-0" />
              <span className="text-[12px] font-bold">{t('story.composer.recenter')}</span>
            </button>
            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setMenuOpen(false);
                fileInputRef.current?.click();
              }}
              className="w-full flex items-center gap-3 p-3 rounded-[14px] text-left hover:bg-white/5"
            >
              <ImagePlus size={18} className="text-stone-400 shrink-0" />
              <span className="text-[12px] font-bold">{t('story.composer.changePhoto')}</span>
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-label={t('story.composer.more')}
          aria-expanded={menuOpen}
          aria-haspopup="menu"
          className={`w-[54px] h-[54px] shrink-0 rounded-full border flex items-center justify-center transition-colors ${
            menuOpen ? 'bg-white text-[#0c0c0c] border-white' : 'bg-white/[0.06] border-white/15 text-white'
          }`}
        >
          <MoreHorizontal size={20} />
        </button>
        <button
          type="button"
          onClick={share}
          disabled={!raw || busy}
          className="flex-1 h-[54px] rounded-full bg-[#D9FF00] text-black text-[11px] font-black uppercase tracking-[0.14em] flex items-center justify-center gap-2 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {busy ? <Loader2 size={16} className="animate-spin" /> : <Share size={16} strokeWidth={2.4} />}
          {t('story.composer.share')}
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const next = e.target.files?.[0];
          e.target.value = '';
          if (next) setCurrentFile(next);
        }}
      />
    </div>
  );
};

export default PhotoStoryComposer;
