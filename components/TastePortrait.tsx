import React, { useEffect, useMemo, useState } from 'react';
import { Movie } from '../types';
import { getTastePortrait } from '../services/ai';
import { supabase } from '../services/supabase';
import { haptics } from '../utils/haptics';
import { getDisplayWeightedRating } from '../utils/rating';
import { getPublicRating } from '../utils/publicRating';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { criteriaOf } from '../utils/verdict';
import { FactTone, MIN_FILMS, PortraitFact, PortraitFilm, cleanSentence, computeFacts, describeFact } from '../utils/portraitFacts';
import { useLanguage } from '../contexts/LanguageContext';

/**
 * « Ce que tes notes disent » : trois constats, chacun avec son chiffre et deux
 * films qui le montrent.
 *
 * L'app trouve les constats (utils/portraitFacts), Mistral les met en phrases.
 * Un constat que le modèle n'a pas su écrire garde sa phrase de secours : le
 * chiffre et les films restent ceux calculés ici, jamais ceux du modèle.
 *
 * Le portrait est gardé sur l'appareil et sur le compte (profiles.taste_portrait),
 * avec le nombre de films au moment du tirage : cinq films de plus, et on
 * propose de le refaire. Il ne change jamais tout seul.
 */
interface Props {
  movies: Movie[];
  /** Ouvert depuis le bouton « Mon portrait » : le tirer tout de suite s'il n'existe pas. */
  autoDraw?: boolean;
  /** Toucher une affiche-preuve : ouvrir ce film. */
  onOpenFilm?: (movie: Movie) => void;
}

interface StoredItem {
  kind: string;
  figure: string;
  tone: FactTone;
  text: string;
  evidence: { id: string; title: string; posterUrl?: string; detail: string }[];
}

interface Stored {
  v: 3;
  count: number;
  drawnAt: number;
  items: StoredItem[];
}

// v3 : les portraits v2 mélangeaient les phrases du modèle et nos chiffres, on les refait.
const CACHE_KEY = 'bitter_taste_portrait_v3';
/** Cinq films de plus : le portrait a pu bouger, on le propose. */
const STALE_AFTER = 5;

export const PORTRAIT_MIN_MOVIES = MIN_FILMS;

const readLocal = (): Stored | null => {
  try {
    const raw = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return raw?.v === 3 && Array.isArray(raw.items) ? raw : null;
  } catch {
    return null;
  }
};
const writeLocal = (value: Stored) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch {
    // Stockage plein : le portrait reste sur le compte.
  }
};

/** Un portrait déjà tiré sur cet appareil. */
export const hasCachedPortrait = (): boolean => !!readLocal();

const TONE: Record<FactTone, string> = { lime: 'text-bitter-lime', orange: 'text-[#F08A24]', blue: 'text-[#9DB6FF]' };

const toFilm = (m: Movie): PortraitFilm => ({
  id: m.id,
  title: m.title,
  posterUrl: m.posterUrl,
  score: getDisplayWeightedRating(m),
  criteria: criteriaOf({
    adaptive_rating: m.adaptiveRating ?? null,
    story: m.ratings?.story,
    visuals: m.ratings?.visuals,
    acting: m.ratings?.acting,
    sound: m.ratings?.sound,
  } as never),
  runtime: m.runtime,
  genre: m.genre,
  director: m.director,
  publicScore: getPublicRating(m)?.value,
  at: Number(m.dateWatched ?? m.dateAdded ?? 0),
});

const TastePortrait: React.FC<Props> = ({ movies, autoDraw = false, onOpenFilm }) => {
  const { t, language } = useLanguage();
  const watched = useMemo(() => movies.filter((m) => m.status === 'watched'), [movies]);
  const byId = useMemo(() => new Map(watched.map((m) => [m.id, m])), [watched]);
  const [stored, setStored] = useState<Stored | null>(readLocal);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Le portrait du compte, s'il est plus récent que celui de l'appareil.
  useEffect(() => {
    let alive = true;
    (async () => {
      if (!supabase) return;
      const { data: auth } = await supabase.auth.getUser();
      const uid = auth?.user?.id;
      if (!uid) return;
      const { data, error: err } = await supabase.from('profiles').select('taste_portrait').eq('id', uid).maybeSingle();
      const remote = !err ? (data as { taste_portrait?: Stored } | null)?.taste_portrait : null;
      if (alive && remote?.v === 3 && (!stored || remote.drawnAt > stored.drawnAt)) {
        setStored(remote);
        writeLocal(remote);
      }
    })().catch(() => {});
    return () => {
      alive = false;
    };
    // Une seule lecture, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = async () => {
    if (loading) return;
    haptics.medium();
    setLoading(true);
    setError(null);
    try {
      const facts: PortraitFact[] = computeFacts(watched.map(toFilm), Date.now());
      if (facts.length === 0) {
        setError(t('portrait.noFacts'));
        return;
      }
      // Une demande par constat : chaque phrase reste en face de son chiffre. Une
      // phrase vide, trop longue ou qui cite un nombre absent du constat est
      // remplacée par la phrase calculée.
      const texts = await Promise.all(
        facts.map(async (fact) => {
          try {
            const [first] = await getTastePortrait(describeFact(fact));
            return cleanSentence(first?.text ?? '', fact);
          } catch {
            return null;
          }
        })
      );
      const value: Stored = {
        v: 3,
        count: watched.length,
        drawnAt: Date.now(),
        items: facts.map((f, i) => ({
          kind: f.kind,
          figure: f.figure,
          tone: f.tone,
          text: (texts[i] || f.fallback).trim(),
          evidence: f.evidence,
        })),
      };
      setStored(value);
      writeLocal(value);
      haptics.success();
      if (supabase) {
        const { data: auth } = await supabase.auth.getUser();
        if (auth?.user?.id) {
          await supabase.from('profiles').update({ taste_portrait: value }).eq('id', auth.user.id);
        }
      }
    } catch (e: any) {
      setError(e?.message || t('portrait.failed'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoDraw && !stored && watched.length >= MIN_FILMS) void draw();
    // Une seule fois, à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (watched.length < MIN_FILMS) return null;

  const fresh = stored ? watched.length - stored.count : 0;
  const date = stored
    ? new Date(stored.drawnAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR', { day: 'numeric', month: 'short' })
    : null;
  const fan = watched.filter((m) => m.posterUrl).slice(0, 3);
  const line = 'border-t border-white/[0.08]';

  return (
    <section aria-label={t('portrait.title')} className="flex flex-col">
      <div className="flex items-baseline justify-between gap-3 pb-[18px] px-1">
        <h3 className="text-[10.5px] font-black uppercase tracking-[0.12em] text-white/60 whitespace-nowrap">{t('portrait.title')}</h3>
        <small className="text-[11px] font-bold text-white/35 whitespace-nowrap">
          {stored ? t('portrait.meta', { n: String(stored.count), date: date ?? '' }) : t('portrait.metaNone', { n: String(watched.length) })}
        </small>
      </div>

      {stored && fresh >= STALE_AFTER && !loading && (
        <button type="button" onClick={draw} className="-mt-1.5 mb-4 px-1 text-left text-[12px] font-bold text-white/60">
          {t('portrait.stale', { n: String(fresh) })} · <span className="font-black text-bitter-lime">{t('portrait.update')}</span>
        </button>
      )}

      {loading ? (
        <>
          <p className={`${line} flex items-center gap-2.5 py-[18px] text-[13px] font-bold text-white/60`}>
            <i className="w-2 h-2 rounded-full bg-bitter-lime animate-pulse" />
            {t('portrait.reading', { n: String(watched.length) })}
          </p>
          {[0, 1].map((i) => (
            <div key={i} className={`${line} py-[18px] space-y-2.5`}>
              <i className="block w-2/5 h-[30px] rounded-[10px] bg-white/[0.06] animate-pulse" />
              <i className="block w-4/5 h-3.5 rounded-full bg-white/[0.06] animate-pulse" />
            </div>
          ))}
        </>
      ) : stored ? (
        <>
          {stored.items.map((item, i) => (
            <div key={`${item.kind}-${i}`} className={`${line} py-[22px] grid grid-cols-[minmax(0,1fr)_92px] gap-3.5 items-center`}>
              <div className="min-w-0">
                <b className={`block text-[40px] font-black tracking-[-0.065em] leading-[0.95] tabular-nums ${TONE[item.tone] ?? 'text-white'}`}>{item.figure}</b>
                <p className="mt-2.5 text-[16px] font-bold tracking-[-0.02em] leading-[1.3] text-white">{item.text}</p>
                <span className="block mt-2 text-[11px] font-semibold text-white/35 truncate">
                  {item.evidence.map((e) => e.title).join(' · ')}
                </span>
              </div>
              <div className="relative h-[112px]">
                {item.evidence.slice(0, 2).map((e, j) => {
                  const movie = byId.get(e.id);
                  return (
                    <button
                      key={e.id}
                      type="button"
                      onClick={() => {
                        if (!movie) return;
                        haptics.soft();
                        onOpenFilm?.(movie);
                      }}
                      aria-label={e.title}
                      className={`absolute w-16 aspect-[2/3] rounded-[10px] overflow-hidden bg-white/5 shadow-[0_14px_24px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06] active:scale-95 transition-transform ${
                        j === 0 ? 'right-[26px] top-1.5 -rotate-6' : 'right-0 top-3.5 rotate-[5deg]'
                      }`}
                    >
                      {e.posterUrl && <img src={resizeTmdbImage(e.posterUrl, 'w185')} alt="" loading="lazy" className="w-full h-full object-cover" />}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          {error && <p className="pt-2 text-[12px] font-semibold text-[#F08A24]">{error}</p>}
          <button type="button" onClick={draw} className="mt-1 self-center py-2 text-[12px] font-extrabold text-white/40">
            {t('portrait.redo')}
          </button>
        </>
      ) : (
        <div className={`${line} py-[26px] flex flex-col gap-3`}>
          <div className="relative h-[104px] mb-1.5" aria-hidden="true">
            {fan.map((m, i) => (
              <img
                key={m.id}
                src={resizeTmdbImage(m.posterUrl, 'w185')}
                alt=""
                className={`absolute w-[62px] aspect-[2/3] object-cover rounded-[10px] shadow-[0_14px_24px_-12px_rgba(0,0,0,0.9)] ring-1 ring-white/[0.06] ${
                  i === 0 ? 'left-0 top-1 -rotate-[8deg]' : i === 1 ? 'left-11 top-0 z-[1]' : 'left-[88px] top-1 rotate-[8deg]'
                }`}
              />
            ))}
          </div>
          <b className="text-[26px] font-black tracking-[-0.05em] leading-[1.05] max-w-[14ch] text-white">{t('portrait.introTitle')}</b>
          <p className="text-[14px] font-semibold leading-[1.45] text-white/60 max-w-[30ch]">{t('portrait.introBody', { n: String(watched.length) })}</p>
          {error && <p className="text-[12px] font-semibold text-[#F08A24]">{error}</p>}
          <button
            type="button"
            onClick={draw}
            className="mt-2 self-start h-11 px-[18px] rounded-full bg-bitter-lime text-charcoal text-[13px] font-black active:scale-95 transition-transform"
          >
            {t('portrait.draw')}
          </button>
        </div>
      )}
    </section>
  );
};

export default TastePortrait;
