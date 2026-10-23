import React, { useEffect, useState } from 'react';
import {
  BarChart3,
  Bell,
  CalendarDays,
  Camera,
  Check,
  Clapperboard,
  Clock,
  Music,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Ticket,
  Tv,
  Users,
} from 'lucide-react';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { UpdateMode, restartApp } from '../utils/appUpdate';

/**
 * L'écran d'une nouvelle version.
 *
 * Il dit les faits : une nouvelle version est prête, il faut redémarrer, rien
 * n'est perdu. Puis au plus trois grands changements, et un seul bouton. En
 * fond, un mur de tes affiches qui défile lentement, comme un générique.
 *
 * Les changements sont lus dans `/changelog.json` sur le serveur, sans cache :
 * l'app restée sur l'ancienne version affiche donc ceux de la nouvelle. On y lit
 * `highlights` (trois thèmes, avec une icône) ; à défaut, les trois premiers
 * titres de `items`. Toujours en sombre, comme une salle.
 */
interface Change {
  title: string;
  body?: string;
}

interface Highlight {
  icon?: string;
  title: string;
}

interface Changelog {
  version?: string;
  label?: string;
  highlights?: Highlight[];
  items?: Change[];
  /** Affiches de secours, pour qui n'a encore rien noté. */
  posters?: string[];
}

const ICONS: Record<string, React.ComponentType<{ size?: number; strokeWidth?: number }>> = {
  stats: BarChart3,
  platforms: Tv,
  calendar: CalendarDays,
  trailers: Clapperboard,
  spaces: Users,
  notifications: Bell,
  cinema: Ticket,
  music: Music,
  photo: Camera,
};

/**
 * Les affiches des films vus, lues dans la copie locale de la collection : l'écran
 * vit hors de l'app (il remplace un écran qui n'a pas pu se charger) et n'a pas
 * accès à son état.
 */
const readPosters = (): string[] => {
  try {
    const profiles = JSON.parse(localStorage.getItem('the_bitter_profiles_v2') || '[]');
    const movies = (Array.isArray(profiles) ? profiles : []).flatMap((p: { movies?: unknown[] }) => (p?.movies ?? []) as any[]);
    const seen = new Set<string>();
    return movies
      .filter((m) => m?.status === 'watched' && typeof m.posterUrl === 'string' && m.posterUrl && m.seasonNumber == null)
      .sort((a, b) => Number(b.dateWatched || b.dateAdded || 0) - Number(a.dateWatched || a.dateAdded || 0))
      .map((m) => m.posterUrl as string)
      .filter((url) => (seen.has(url) ? false : (seen.add(url), true)));
  } catch {
    return [];
  }
};

/** Le temps de lire les étapes avant que la page se recharge. */
const STEP_MS = 650;

const UpdateScreen: React.FC<{ mode: UpdateMode; onLater?: () => void }> = ({ mode, onLater }) => {
  const [log, setLog] = useState<Changelog | null>(null);
  const [offline, setOffline] = useState(false);
  /** 0 : pas encore lancé ; 1 : données à l'abri ; 2 : téléchargement ; 3 : relance. */
  const [step, setStep] = useState(0);
  const [mine] = useState(readPosters);

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

  const restart = () => {
    if (step) return;
    setStep(1);
    window.setTimeout(() => setStep(2), STEP_MS);
    window.setTimeout(() => {
      setStep(3);
      void restartApp();
    }, STEP_MS * 2);
  };

  // Le mur : tes affiches d'abord, celles de la version pour compléter.
  const pool = [...mine];
  for (const url of log?.posters ?? []) if (pool.length < 16 && !pool.includes(url)) pool.push(url);
  const columns = [0, 1, 2, 3].map((c) => pool.filter((_, i) => i % 4 === c).slice(0, 4));
  const hasWall = columns.every((col) => col.length > 0);

  const themes: Highlight[] = (log?.highlights?.length ? log.highlights : (log?.items ?? []).map((i) => ({ title: i.title }))).slice(0, 3);
  const ready = !!log || offline;
  const preview = mode === 'preview';
  const found = mode === 'found';

  const title = preview ? 'Ce qui a changé' : found ? 'Une mise à jour est arrivée' : 'Nouvelle version prête';
  const why = preview
    ? 'Les grands changements de la dernière version de The Bitter.'
    : found
      ? 'Redémarre l’app pour l’avoir. Tu retrouveras tout là où tu l’as laissé.'
      : 'The Bitter a été mis à jour pendant que tu l’utilisais. Redémarre pour passer à la nouvelle version.';

  const stepRow = (n: number, label: string) => {
    const done = step > n || (n === 1 && step >= 1);
    const now = step === n && n > 1;
    return (
      <li className={`flex items-center gap-2.5 text-[13.5px] font-extrabold ${done || now ? 'text-[#F5F3EE]' : 'text-[#9C978F]'}`}>
        <b
          className={`w-5 h-5 shrink-0 rounded-full flex items-center justify-center border-[1.5px] ${
            done ? 'bg-bitter-lime border-bitter-lime text-[#111]' : now ? 'border-bitter-lime' : 'border-white/20'
          }`}
        >
          {done ? <Check size={11} strokeWidth={3.5} /> : now ? <i className="w-2 h-2 rounded-full bg-bitter-lime animate-pulse" /> : null}
        </b>
        {label}
      </li>
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-title"
      className="update-screen fixed inset-0 z-[400] overflow-hidden bg-[#0F0F0E] text-[#F5F3EE] isolate"
    >
      <style>{`
        .update-screen .us-wall { position: absolute; inset: -18% -30%; z-index: -3; display: flex; gap: 10px; transform: rotate(-8deg); }
        .update-screen .us-col { flex: 1; display: flex; flex-direction: column; gap: 10px; animation: us-rise 38s linear infinite; }
        .update-screen .us-col:nth-child(even) { animation-name: us-fall; animation-duration: 44s; }
        .update-screen .us-col:nth-child(3) { animation-duration: 52s; }
        .update-screen .us-col img { flex: none; width: 100%; aspect-ratio: 2 / 3; object-fit: cover; border-radius: 12px; display: block; box-shadow: 0 10px 24px -12px rgba(0,0,0,.8); background: #1A1A19; }
        .update-screen .us-shade { position: absolute; inset: 0; z-index: -2; background:
          radial-gradient(120% 70% at 50% 18%, rgba(15,15,14,.15), rgba(15,15,14,.7) 60%),
          linear-gradient(180deg, rgba(15,15,14,.55) 0%, rgba(15,15,14,.35) 22%, rgba(15,15,14,.88) 46%, #0F0F0E 74%); }
        /* Une lueur diffuse bien plus grande que l'écran : aucun bord ne passe dans le cadre. */
        .update-screen .us-glow { position: absolute; top: -30%; left: -60%; width: 90%; height: 90%; z-index: -1; border-radius: 50%;
          background: radial-gradient(closest-side, rgba(217,255,0,.10), rgba(217,255,0,.04) 55%, transparent);
          filter: blur(30px); animation: us-glow 9s ease-in-out infinite alternate; }
        @keyframes us-rise { from { transform: translateY(0); } to { transform: translateY(-50%); } }
        @keyframes us-fall { from { transform: translateY(-50%); } to { transform: translateY(0); } }
        @keyframes us-glow { from { transform: translate(0, 0); } to { transform: translate(110%, 20%); } }
        .update-screen .us-in { animation: us-enter .8s cubic-bezier(.16,1,.3,1) both; animation-delay: calc(var(--i) * 90ms + 150ms); }
        @keyframes us-enter { from { opacity: 0; transform: translateY(12px); } }
        .update-screen .us-bar i { animation: us-load 1.6s ease-in-out infinite; }
        @keyframes us-load { from { transform: translateX(-100%); } to { transform: translateX(260%); } }
        .update-screen .us-turn { animation: us-turn 1.1s linear infinite; }
        @keyframes us-turn { to { transform: rotate(360deg); } }
        @media (prefers-reduced-motion: reduce) {
          .update-screen .us-col, .update-screen .us-glow, .update-screen .us-in, .update-screen .us-bar i, .update-screen .us-turn { animation: none; }
        }
      `}</style>

      {hasWall && (
        <div className="us-wall" aria-hidden>
          {columns.map((col, c) => (
            <div key={c} className="us-col">
              {/* Deux fois la même suite : la boucle de défilement ne se voit pas. */}
              {[...col, ...col].map((url, i) => (
                <img
                  key={i}
                  src={resizeTmdbImage(url, 'w185')}
                  alt=""
                  decoding="async"
                  onError={(e) => {
                    e.currentTarget.style.visibility = 'hidden';
                  }}
                />
              ))}
            </div>
          ))}
        </div>
      )}
      <span className="us-shade" aria-hidden />
      <span className="us-glow" aria-hidden />

      <div className="relative h-full max-w-md mx-auto flex flex-col px-[22px] pt-[calc(env(safe-area-inset-top,0px)+64px)] pb-[calc(env(safe-area-inset-bottom,0px)+22px)]">
        <span
          className="us-in w-[58px] h-[58px] rounded-[18px] bg-bitter-lime text-[#111] flex items-center justify-center shadow-[0_0_0_6px_rgba(217,255,0,0.12)]"
          style={{ ['--i' as string]: 0 }}
        >
          {preview ? <Sparkles size={27} strokeWidth={2.6} /> : <RotateCcw size={27} strokeWidth={2.6} className={step ? 'us-turn' : ''} />}
        </span>

        {step === 0 ? (
          <>
            <h2 id="update-title" className="us-in mt-[22px] text-[34px] font-black tracking-[-0.06em] leading-[0.95] max-w-[90%] text-balance" style={{ ['--i' as string]: 1 }}>
              {title}
            </h2>
            <p className="us-in mt-2.5 text-[14px] font-semibold leading-[1.4] text-[#9C978F] max-w-[30ch]" style={{ ['--i' as string]: 2 }}>
              {why}
            </p>

            {(themes.length > 0 || !ready) && (
              <>
                <span className="us-in mt-7 text-[10px] font-black uppercase tracking-[0.18em] text-[#9C978F]" style={{ ['--i' as string]: 3 }}>
                  Ce qui change
                </span>
                <ul className="us-in mt-3 space-y-2.5" style={{ ['--i' as string]: 4 }} aria-label="Ce qui change">
                  {!ready && <li className="h-9 rounded-xl bg-white/5 animate-pulse" />}
                  {themes.map((theme, i) => {
                    const Icon = (theme.icon && ICONS[theme.icon]) || Sparkles;
                    return (
                      <li key={`${theme.title}-${i}`} className="flex items-center gap-3 text-[15px] font-extrabold tracking-[-0.02em]">
                        <i className="w-9 h-9 shrink-0 rounded-xl bg-white/[0.08] border border-white/[0.09] flex items-center justify-center text-bitter-lime">
                          <Icon size={18} strokeWidth={2.4} />
                        </i>
                        {theme.title}
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
            {offline && (
              <p className="us-in mt-6 text-[12.5px] font-semibold text-[#9C978F]" style={{ ['--i' as string]: 3 }}>
                Les nouveautés s’afficheront une fois reconnecté. Le redémarrage marche quand même.
              </p>
            )}

            <span className="flex-1" />
            {!preview && (
              <span className="us-in mb-3 flex items-center gap-2 text-[12px] font-bold text-[#9C978F]" style={{ ['--i' as string]: 5 }}>
                <ShieldCheck size={15} strokeWidth={2.4} className="text-bitter-lime shrink-0" />
                Tes notes et ta liste sont gardées.
              </span>
            )}
            <div className="us-in space-y-1.5" style={{ ['--i' as string]: 6 }}>
              <button
                onClick={preview ? onLater : restart}
                className="w-full h-[54px] rounded-[18px] bg-bitter-lime text-[#111] font-black text-[15px] flex items-center justify-center gap-2.5 active:scale-[0.98] transition-transform focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-bitter-lime"
              >
                {!preview && <RotateCcw size={17} strokeWidth={2.8} />}
                {preview ? 'Continuer' : 'Redémarrer'}
              </button>
              {found && onLater && (
                <button onClick={onLater} className="w-full h-10 rounded-[18px] text-[12.5px] font-black text-[#9C978F] hover:text-[#F5F3EE] transition-colors">
                  Plus tard
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            {/* Après le bouton : ce qui se passe, étape par étape. */}
            <h2 id="update-title" className="mt-[22px] text-[34px] font-black tracking-[-0.06em] leading-[0.95]">
              Mise à jour en cours
            </h2>
            <p className="mt-2.5 text-[14px] font-semibold leading-[1.4] text-[#9C978F] max-w-[30ch]">
              L’app télécharge la nouvelle version, puis se relance toute seule.
            </p>
            <div className="us-bar mt-[26px] h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
              <i className="block h-full w-2/5 rounded-full bg-bitter-lime" />
            </div>
            <ul className="mt-[18px] space-y-2.5" aria-live="polite">
              {stepRow(1, 'Tes données sont à l’abri')}
              {stepRow(2, 'Téléchargement de la nouvelle version')}
              {stepRow(3, 'Relance de l’app')}
            </ul>
            <span className="flex-1" />
            <span className="flex items-center justify-center gap-2 text-[12px] font-bold text-[#9C978F]">
              <Clock size={15} strokeWidth={2.4} className="text-bitter-lime" />
              Quelques secondes.
            </span>
          </>
        )}
      </div>
    </div>
  );
};

export default UpdateScreen;
