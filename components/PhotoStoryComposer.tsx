import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ImagePlus, Loader2, MoreHorizontal, RotateCcw, Share, Sticker, X } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import {
  DEFAULT_FRAMING,
  FRAMING_MAX_ZOOM,
  PhotoFraming,
  PhotoStoryLayout,
  SAFE_BOTTOM,
  SAFE_TOP,
  Size,
  StickerPlacement,
  STORY_H,
  STORY_W,
  clamp,
  clampPlacement,
  coverRect,
  defaultPlacement,
  snapToCenter,
} from '../utils/photoStory';
import {
  PhotoStoryData,
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
}

type Box = { left: number; top: number; width: number; height: number };
type Gesture =
  | { target: 'sticker'; start: StickerPlacement; points: Map<number, { x: number; y: number }>; origin: Map<number, { x: number; y: number }> }
  | { target: 'photo'; start: PhotoFraming; points: Map<number, { x: number; y: number }>; origin: Map<number, { x: number; y: number }> };

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
  const [placements, setPlacements] = useState<Partial<Record<PhotoStoryLayout, StickerPlacement>>>({});
  const [box, setBox] = useState<Box | null>(null);
  const [dragging, setDragging] = useState<null | { snapped: boolean }>(null);
  const [touched, setTouched] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const lastTap = useRef(0);

  const blockSize = useMemo<Record<PhotoStoryLayout, Size>>(
    () => ({ seance: measureBlock('seance', data), releve: measureBlock('releve', data) }),
    // Les polices changent la mesure : on la refait une fois la photo prête,
    // c'est-à-dire après leur chargement.
    [data, raw],
  );
  const placement = clampPlacement(
    placements[layout] ?? defaultPlacement(layout, blockSize[layout]),
    blockSize[layout],
  );

  // Photo : décodage, polices, puis affiche et étalonnage en arrière-plan.
  useEffect(() => {
    let cancelled = false;
    setRaw(null);
    setGraded(null);
    setError(null);
    setFraming(DEFAULT_FRAMING);
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
      });
      setBox((prev) =>
        prev && prev.left === b.left && prev.top === b.top && prev.width === b.width && prev.height === b.height
          ? prev
          : { left: b.left, top: b.top, width: b.width, height: b.height },
      );
    });
    return () => window.cancelAnimationFrame(id);
  }, [layout, data, photo, framing, placement.cx, placement.cy, placement.scale, poster, filmLook, graded, raw, light]);

  const toStory = (e: React.PointerEvent) => {
    const rect = surfaceRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: ((e.clientX - rect.left) / rect.width) * STORY_W, y: ((e.clientY - rect.top) / rect.height) * STORY_H };
  };

  const setPlacement = (p: StickerPlacement) =>
    setPlacements((prev) => ({ ...prev, [layout]: clampPlacement(p, blockSize[layout]) }));

  const recenter = () => setPlacements((prev) => ({ ...prev, [layout]: undefined }));

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
      if (g.target === 'sticker') g.start = placement;
      else g.start = framing;
      return;
    }
    const onSticker =
      !!box && p.x >= box.left && p.x <= box.left + box.width && p.y >= box.top && p.y <= box.top + box.height;
    const points = new Map([[e.pointerId, p]]);
    if (onSticker) {
      const now = Date.now();
      if (now - lastTap.current < 300) {
        recenter();
        lastTap.current = 0;
        return;
      }
      lastTap.current = now;
      gesture.current = { target: 'sticker', start: placement, points, origin: new Map(points) };
      setDragging({ snapped: false });
    } else {
      gesture.current = { target: 'photo', start: framing, points, origin: new Map(points) };
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
    g.points.delete(e.pointerId);
    if (g.points.size === 0) {
      gesture.current = null;
      setDragging(null);
    } else {
      g.origin = new Map(g.points);
      if (g.target === 'sticker') g.start = placement;
      else g.start = framing;
    }
  };

  const share = async () => {
    const canvas = canvasRef.current;
    if (!canvas || busy) return;
    setBusy(true);
    try {
      const blob = await canvasToBlob(canvas, 'image/jpeg', 0.92);
      await onShare(blob, `${fileStem}.jpg`);
    } finally {
      setBusy(false);
    }
  };

  const shareSticker = async () => {
    setMenuOpen(false);
    setBusy(true);
    try {
      const blob = await canvasToBlob(renderStickerOnly(layout, data), 'image/png');
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
            <span className="absolute left-1/2 top-3 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 rounded-full bg-black/60 text-[10px] font-semibold pointer-events-none">
              {t('story.composer.hint')}
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
