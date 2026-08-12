import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { getSpacePitches, SpacePitch } from '../services/ai';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';

export interface MemberTaste {
  profileId: string;
  name: string;
  /** Sa façon de noter, résumée en une ligne à partir des notes de l'espace. */
  taste: string;
}

interface Props {
  film: { title: string; year?: number; overview?: string };
  members: MemberTaste[];
}

/**
 * Pour qui ce film est-il, membre par membre.
 *
 * L'espace de l'application comptait deux films proposés pour six votes. Un
 * film posé sans un mot ne déclenche rien : celui qui le voit ne sait pas s'il
 * lui est destiné, et dans le doute il passe.
 *
 * L'argument s'adresse donc à chacun séparément, à partir de ses propres notes —
 * celles qu'il a déjà posées dans cet espace, donc rien à aller chercher. Un
 * même film ne se défend pas de la même façon auprès de quelqu'un qui adore
 * l'image et de quelqu'un qui ne pardonne rien au scénario, et c'est cette
 * différence qui fait qu'on clique.
 *
 * Le modèle a le droit de dire non. Un argumentaire qui ne sait pas décourager
 * ne veut plus rien dire quand il encourage.
 */
const SpacePitchPanel: React.FC<Props> = ({ film, members }) => {
  const { t } = useLanguage();
  const [pitches, setPitches] = useState<SpacePitch[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async () => {
    if (loading) return;
    haptics.medium();
    setError(null);
    setLoading(true);
    try {
      const result = await getSpacePitches(
        film,
        members.map((m) => ({ name: m.name, taste: m.taste }))
      );
      if (result.length === 0) {
        setError(t('pitch.failed'));
        return;
      }
      setPitches(result);
      haptics.success();
    } catch (e: any) {
      setError(e?.message || t('pitch.failed'));
    } finally {
      setLoading(false);
    }
  };

  // Sans notes, il n'y a rien sur quoi fonder un argument : le modèle
  // inventerait des goûts, ce qui est pire que de se taire.
  if (members.length === 0) return null;

  return (
    <div className="space-y-3">
      {pitches.length === 0 ? (
        <button
          onClick={(e) => {
            e.stopPropagation();
            run();
          }}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-2xl border border-dashed border-stone-300 dark:border-white/15 text-[10px] font-black uppercase tracking-widest text-stone-500 dark:text-stone-400 active:scale-[0.98] transition-transform disabled:opacity-50"
        >
          {loading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
          {loading ? t('pitch.thinking') : t('pitch.ask')}
        </button>
      ) : (
        <div className="space-y-2 p-4 rounded-2xl bg-stone-50 dark:bg-white/5">
          <p className="text-[9px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600">
            {t('pitch.title')}
          </p>
          {pitches.map((pitch) => (
            <div key={pitch.name} className="flex gap-2.5">
              <span className="shrink-0 w-6 h-6 rounded-full bg-white dark:bg-[#252525] text-[9px] font-black flex items-center justify-center text-stone-500 dark:text-stone-400 mt-0.5">
                {pitch.name[0]?.toUpperCase()}
              </span>
              <p className="flex-1 text-[12px] font-medium text-stone-600 dark:text-stone-300 leading-snug">
                <span className="font-black text-charcoal dark:text-white">{pitch.name}</span>{' '}
                {pitch.text}
              </p>
            </div>
          ))}
        </div>
      )}

      {error && (
        <p className="text-[11px] font-semibold text-red-600 dark:text-red-400">{error}</p>
      )}
    </div>
  );
};

export default SpacePitchPanel;
