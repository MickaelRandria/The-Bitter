import React, { useEffect, useMemo, useState } from 'react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { canonicalName, normalizeName, suggestCinemas } from '../utils/cinemaNames';
import { knownCinemas, searchUgc } from '../services/cinemaMemory';

/**
 * Le nom d'un cinéma, tapé à la main : l'app propose les cinémas déjà saisis
 * (même mal écrits), ceux de l'annuaire UGC quand on tape « UGC … », et le nom
 * propre (« pathe wepler » → « Pathé Wepler »).
 */
interface Props {
  value: string;
  onChange: (name: string) => void;
}

export default function CinemaNameInput({ value, onChange }: Props) {
  const { t } = useLanguage();
  const [ugc, setUgc] = useState<string[]>([]);
  const [picked, setPicked] = useState(false);
  const known = useMemo(() => knownCinemas(), []);

  useEffect(() => {
    if (picked) return;
    let alive = true;
    const timer = window.setTimeout(() => {
      searchUgc(value).then((list) => alive && setUgc(list));
    }, 400);
    return () => {
      alive = false;
      window.clearTimeout(timer);
    };
  }, [value, picked]);

  const clean = canonicalName(value);
  const suggestions = useMemo(() => {
    if (picked) return [];
    const list = [...ugc, ...suggestCinemas(value, known)];
    const seen = new Set<string>([normalizeName(value)]);
    const out: string[] = [];
    for (const name of list) {
      const key = normalizeName(name);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(name);
    }
    // Le nom tapé, bien écrit, quand il diffère de ce qui est tapé.
    if (clean && clean !== value.trim() && !out.some((n) => normalizeName(n) === normalizeName(clean))) out.push(clean);
    return out.slice(0, 5);
  }, [ugc, value, known, clean, picked]);

  const choose = (name: string) => {
    haptics.soft();
    setPicked(true);
    onChange(name);
  };

  return (
    <div className="flex min-w-0 flex-col gap-2">
      <input
        value={value}
        onChange={(event) => {
          setPicked(false);
          onChange(event.target.value);
        }}
        onBlur={() => clean && clean !== value && onChange(clean)}
        placeholder={t('seance.cinemaPlaceholder')}
        autoCapitalize="words"
        className="h-11 rounded-2xl border border-sand bg-cream px-3.5 text-[13px] font-semibold text-charcoal outline-none focus:border-charcoal dark:border-white/10 dark:bg-[#121212] dark:text-white dark:focus:border-white/40"
      />
      {suggestions.length > 0 && (
        <div className="flex flex-col gap-1">
          <small className="px-1 text-[10px] font-black uppercase tracking-[0.12em] text-stone-500 dark:text-stone-400">{t('seance.didYouMean')}</small>
          <div className="flex flex-wrap gap-1.5">
            {suggestions.map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => choose(name)}
                className="inline-flex h-9 max-w-full items-center truncate rounded-full bg-bitter-lime/80 px-3 text-[12px] font-black text-charcoal dark:bg-bitter-lime"
              >
                {name}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
