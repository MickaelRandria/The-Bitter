import React, { useEffect, useRef, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { UpdateMode, restartApp } from '../utils/appUpdate';

/**
 * « Changement de bobine » : l'écran d'une nouvelle version.
 *
 * En projection, des repères ronds en haut à droite de l'image annoncent qu'il
 * faut passer à la bobine suivante ; l'amorce 3-2-1 ouvre chaque bobine. L'écran
 * reprend les deux, puis liste ce qui vient de changer et propose de redémarrer.
 *
 * La liste est lue dans `/changelog.json` sur le serveur, sans cache : l'app
 * restée sur l'ancienne version affiche donc les nouveautés de la nouvelle.
 * Toujours en sombre, comme une salle.
 */
interface Change {
  /** Quelle affiche illustre la nouveauté : ton film le mieux noté, le dernier vu, ou le suivant. */
  visual?: 'top' | 'recent' | 'next';
  title: string;
  body?: string;
}

interface Changelog {
  version?: string;
  label?: string;
  items?: Change[];
  /** Affiches de secours, pour qui n'a encore rien noté. */
  posters?: string[];
}

interface Shot {
  url: string;
  title?: string;
  rating?: number;
}

/**
 * Les films vus, lus dans la copie locale de la collection : l'écran vit hors de
 * l'app (il remplace un écran qui n'a pas pu se charger) et n'a pas accès à son état.
 */
const readCollection = (): { recent: Shot[]; top: Shot | null } => {
  try {
    const profiles = JSON.parse(localStorage.getItem('the_bitter_profiles_v2') || '[]');
    const movies = (Array.isArray(profiles) ? profiles : []).flatMap((p: { movies?: unknown[] }) => (p?.movies ?? []) as any[]);
    const seen = new Set<string>();
    const watched = movies
      .filter((m) => m?.status === 'watched' && typeof m.posterUrl === 'string' && m.posterUrl && m.seasonNumber == null)
      .map((m) => {
        const r = m.ratings ?? {};
        const weighted = Number(m.adaptiveRating?.weightedRating);
        const rating =
          Number.isFinite(weighted) && weighted > 0
            ? weighted
            : (Number(r.story) + Number(r.visuals) + Number(r.acting) + Number(r.sound)) / 4;
        return {
          url: m.posterUrl as string,
          title: m.title as string,
          rating: Number.isFinite(rating) ? rating : undefined,
          at: Number(m.dateWatched || m.dateAdded || 0),
        };
      })
      .filter((m) => (seen.has(m.url) ? false : (seen.add(m.url), true)));
    const recent = [...watched].sort((a, b) => b.at - a.at);
    const top = [...watched].filter((m) => m.rating != null).sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))[0] ?? null;
    return { recent, top };
  } catch {
    return { recent: [], top: null };
  }
};

const fmt = (n: number) => (Math.round(n * 10) / 10).toFixed(1).replace('.', ',');

const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

const LEADER_KEY = (version: string) => `bitter_update_leader_${version}`;

const UpdateScreen: React.FC<{ mode: UpdateMode; onLater?: () => void }> = ({ mode, onLater }) => {
  const [log, setLog] = useState<Changelog | null>(null);
  const [offline, setOffline] = useState(false);
  const [leader, setLeader] = useState<number | null>(null);
  const [restarting, setRestarting] = useState(false);
  const sweepRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    let alive = true;
    fetch(`/changelog.json?t=${Date.now()}`, { cache: 'no-store' })
      .then((r) => (r.ok ? r.json() : Promise.reject()))
      .then((data: Changelog) => alive && setLog(data))
      .catch(() => alive && setOffline(true));
    return () => {
      alive = false;
    };
  }, []);

  /**
   * L'amorce 3-2-1 : une fois par version, jamais si le téléphone demande moins
   * d'animations. Elle attend la liste pour connaître la version.
   */
  useEffect(() => {
    if (!log && !offline) return;
    const version = log?.version ?? 'hors-ligne';
    let seen = false;
    try {
      seen = localStorage.getItem(LEADER_KEY(version)) === '1';
      localStorage.setItem(LEADER_KEY(version), '1');
    } catch {
      // Sans stockage, l'amorce se rejoue : sans gravité.
    }
    if (seen || reducedMotion()) return;
    let raf = 0;
    const t0 = performance.now();
    const tick = (t: number) => {
      const e = (t - t0) / 800;
      const step = Math.floor(e);
      if (step >= 3) {
        setLeader(null);
        return;
      }
      setLeader(3 - step);
      sweepRef.current?.style.setProperty('--a', `${((e - step) * 360).toFixed(1)}deg`);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [log, offline]);

  const restart = () => {
    setRestarting(true);
    void restartApp();
  };

  const items: Change[] = offline
    ? [{ visual: 'recent', title: 'Nouvelle version disponible', body: 'La liste des nouveautés s’affichera une fois reconnecté. Le redémarrage marche quand même.' }]
    : log?.items ?? [];

  /**
   * Les affiches : celles de ta collection d'abord, du plus récent au plus
   * ancien ; celles de la liste de secours pour compléter.
   */
  const [collection] = useState(readCollection);
  const pool: Shot[] = [...collection.recent];
  for (const url of log?.posters ?? []) if (pool.length < 12 && !pool.some((p) => p.url === url)) pool.push({ url });
  const reel = pool.slice(0, 12);
  let cursor = collection.recent.length ? 1 : 0;
  const visualOf = (item: Change): Shot | null => {
    if (item.visual === 'top' && collection.top) return collection.top;
    if (item.visual === 'recent' && pool[0]) return pool[0];
    const shot = pool.length ? pool[cursor % pool.length] : null;
    cursor += 1;
    return shot;
  };
  const lead =
    mode === 'found'
      ? 'Une nouvelle version de The Bitter est prête. Redémarre l’app pour en profiter, tu retrouveras tout là où tu l’as laissé.'
      : mode === 'preview'
        ? 'Voici ce qui a changé dans la dernière version de The Bitter.'
        : 'The Bitter a changé pendant que l’app était ouverte. Redémarre-la pour charger la nouvelle version : tes notes et tes listes ne bougent pas.';
  const ready = !!log || offline;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
      className="update-screen fixed inset-0 z-[400] overflow-hidden bg-[#0F0F0E] text-[#F5F3EE]"
    >
      <style>{`
        .update-screen .us-strip { position: absolute; top: -60px; bottom: -60px; right: -38px; width: 142px; opacity: .55; transform: rotate(8deg); background: #000; border-left: 11px dotted #232321; border-right: 11px dotted #232321; overflow: hidden; }
        .update-screen .us-strip::after { content: ""; position: absolute; inset: 0; background: linear-gradient(90deg, rgba(15,15,14,.55), transparent 60%); }
        .update-screen .us-reel { display: flex; flex-direction: column; gap: 8px; padding: 8px 6px; animation: us-roll 40s linear infinite; }
        .update-screen .us-frame { position: relative; aspect-ratio: 2 / 3; border-radius: 4px; flex: none; overflow: hidden; background: #1A1A19; }
        .update-screen .us-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
        @keyframes us-roll { to { transform: translateY(-50%); } }
        .update-screen .us-cue { position: absolute; top: calc(env(safe-area-inset-top, 0px) + 22px); right: 22px; width: 14px; height: 14px; border-radius: 50%; background: #F5F3EE; opacity: 0; animation: us-cue 1.6s .3s both; }
        @keyframes us-cue { 0%, 100% { opacity: 0; } 10%, 30% { opacity: .9; } 20% { opacity: .2; } 40% { opacity: 0; } }
        .update-screen .us-in { animation: us-rise .55s cubic-bezier(.22,1,.36,1) both; animation-delay: calc(var(--i) * 90ms); }
        @keyframes us-rise { from { opacity: 0; transform: translateY(14px); } }
        .update-screen .us-sweep { background: conic-gradient(rgba(217,255,0,.22) var(--a, 0deg), transparent 0); }
        @media (prefers-reduced-motion: reduce) {
          .update-screen .us-reel, .update-screen .us-cue, .update-screen .us-in { animation: none; }
        }
      `}</style>

      <div className="us-strip" aria-hidden>
        <div className="us-reel">
          {/* Deux fois la même suite : la boucle de défilement ne se voit pas. */}
          {[...reel, ...reel].map((shot, i) => (
            <span key={i} className="us-frame">
              <img
                src={resizeTmdbImage(shot.url, 'w185')}
                alt=""
                loading="lazy"
                decoding="async"
                onError={(e) => {
                  e.currentTarget.style.visibility = 'hidden';
                }}
              />
            </span>
          ))}
        </div>
      </div>
      <span className="us-cue" aria-hidden />

      {/* Remonté à la fin de l'amorce, pour que le texte et la liste entrent après le « 1 ». */}
      <div
        key={leader == null ? 'content' : 'leader'}
        className="relative h-full max-w-md mx-auto flex flex-col px-5 pt-[calc(env(safe-area-inset-top,0px)+48px)] pb-[calc(env(safe-area-inset-bottom,0px)+20px)]"
      >
        <span className="us-in text-[10px] font-black uppercase tracking-[0.18em] text-bitter-lime" style={{ ['--i' as string]: 0 }}>
          Nouvelle bobine
        </span>
        <h2
          id="update-title"
          className="us-in mt-2.5 text-[40px] font-black tracking-[-0.06em] leading-[0.92] max-w-[85%]"
          style={{ ['--i' as string]: 1 }}
        >
          The Bitter vient de changer
        </h2>
        <p className="us-in mt-3 text-[13.5px] font-semibold leading-snug text-[#9C978F] max-w-[90%]" style={{ ['--i' as string]: 2 }}>
          {lead}
        </p>
        {log?.label && (
          <span className="us-in mt-3.5 inline-flex items-center gap-1.5 text-[11px] font-extrabold text-[#9C978F]" style={{ ['--i' as string]: 2 }}>
            <i className="w-[7px] h-[7px] rounded-full bg-bitter-lime shadow-[0_0_0_3px_rgba(217,255,0,0.2)]" />
            {log.label}
          </span>
        )}

        <ul className="mt-5 flex-1 min-h-0 overflow-y-auto space-y-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden" aria-label="Ce qui change">
          {!ready && <li className="h-16 rounded-2xl bg-[#1A1A19] animate-pulse" />}
          {items.map((item, i) => (
            <li
              key={`${item.title}-${i}`}
              className="us-in grid grid-cols-[44px_minmax(0,1fr)] gap-3 items-center rounded-2xl bg-[#1A1A19] border border-[#2A2A28] p-2.5 pr-3"
              style={{ ['--i' as string]: i + 3 }}
            >
              {(() => {
                const shot = visualOf(item);
                return (
                  <span className="relative w-[44px] aspect-[2/3] rounded-lg overflow-hidden bg-[#262624] shadow-[0_8px_14px_-8px_rgba(0,0,0,0.8)]">
                    {shot && (
                      <img
                        src={resizeTmdbImage(shot.url, 'w154')}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                        onError={(e) => {
                          e.currentTarget.style.visibility = 'hidden';
                        }}
                      />
                    )}
                    {item.visual === 'top' && shot === collection.top && collection.top?.rating != null && (
                      <span className="absolute left-1 bottom-1 rounded-md bg-bitter-lime px-1 text-[9px] font-black tabular-nums text-[#111]">
                        {fmt(collection.top.rating)}
                      </span>
                    )}
                  </span>
                );
              })()}
              <span className="min-w-0">
                <b className="block text-[13px] font-black tracking-[-0.01em]">{item.title}</b>
                {item.body && <small className="block mt-0.5 text-[11.5px] font-semibold leading-snug text-[#9C978F]">{item.body}</small>}
              </span>
            </li>
          ))}
        </ul>

        <div className="us-in mt-3.5 space-y-2" style={{ ['--i' as string]: Math.min(items.length, 6) + 3 }}>
          {mode !== 'preview' && (
            <button
              onClick={restart}
              disabled={restarting}
              className="w-full h-[54px] rounded-[18px] bg-bitter-lime text-[#111] font-black text-[15px] flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-bitter-lime"
            >
              <RotateCcw size={17} strokeWidth={2.6} className={restarting ? 'animate-spin' : ''} />
              {restarting ? 'Redémarrage…' : 'Redémarrer l’app'}
            </button>
          )}
          {(mode === 'found' || mode === 'preview') && onLater ? (
            <button
              onClick={onLater}
              className={`w-full rounded-[18px] font-black transition-colors ${
                mode === 'preview'
                  ? 'h-[54px] bg-bitter-lime text-[#111] text-[15px]'
                  : 'h-11 text-[12.5px] text-[#9C978F] hover:text-[#F5F3EE]'
              }`}
            >
              {mode === 'preview' ? 'Continuer' : 'Plus tard'}
            </button>
          ) : (
            <p className="text-center text-[11px] font-semibold text-[#9C978F]">Deux secondes, et tu reprends où tu en étais.</p>
          )}
        </div>
      </div>

      {leader != null && (
        <div className="absolute inset-0 z-10 bg-[#0F0F0E] flex items-center justify-center" aria-hidden>
          <div className="relative w-[190px] h-[190px] rounded-full border-2 border-[#2A2A28] flex items-center justify-center">
            <span className="absolute left-1/2 -top-10 -bottom-10 w-0.5 -translate-x-1/2 bg-[#2A2A28]" />
            <span className="absolute top-1/2 -left-10 -right-10 h-0.5 -translate-y-1/2 bg-[#2A2A28]" />
            <span ref={sweepRef} className="us-sweep absolute inset-0 rounded-full" />
            <b className="relative text-[96px] font-black tracking-[-0.06em] tabular-nums">{leader}</b>
          </div>
        </div>
      )}
    </div>
  );
};

export default UpdateScreen;
