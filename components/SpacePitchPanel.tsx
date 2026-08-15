import React, { useState } from 'react';
import { Sparkles, Loader2 } from 'lucide-react';
import { getSpacePitches, SpacePitch, describeLovedFilms } from '../services/ai';
import { getMemberFilms } from '../services/supabase';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { currentCriterionLabel } from '../config/ratingProfiles';

export interface MemberTaste {
  profileId: string;
  name: string;
  /** Sa façon de noter, résumée en une ligne. Vide tant qu'on ne l'a pas lue. */
  taste: string;
}

interface Props {
  film: { title: string; year?: number; overview?: string };
  members: MemberTaste[];
}

/**
 * Le goût d'un membre, lu dans sa propre collection.
 *
 * Première version : je calculais ce goût à partir des notes posées dans
 * l'espace. C'était élégant — aucune requête, les données déjà en mémoire — et
 * faux dès le premier essai : l'espace ne contenait aucun verdict, donc aucun
 * membre n'avait de goût, donc le panneau se masquait lui-même. Un espace qui
 * démarre est précisément celui où l'on a le plus besoin qu'on nous dise si un
 * film nous concerne.
 *
 * On lit donc la collection personnelle, qui existe elle. Au moment du clic
 * seulement : ces requêtes ne doivent pas partir à l'affichage de chaque film
 * proposé.
 */
const readTaste = async (profileId: string, name: string): Promise<string | null> => {
  const { data } = await getMemberFilms(profileId);
  if (!data || data.length < 3) return null;

  // Les films qu'il a aimés, film par film, plutôt que la moyenne de tout.
  // Une moyenne d'image à 6,4 décrit aussi bien quelqu'un que l'image
  // bouleverse que quelqu'un qu'elle laisse froid : elle écrase exactement ce
  // qu'on cherchait à connaître.
  return describeLovedFilms(
    data.map((film) => ({
      title: film.title,
      year: film.year,
      score: Number(film.rating),
      // La grille complète d'abord : c'est « Humour 10 » ou « Facteur peur 8 »
      // qui distingue un goût, pas un quatrième chiffre sur les mêmes axes que
      // tout le monde. Les quatre critères historiques servent de repli.
      criteria: film.allCriteria?.length
        ? film.allCriteria.map((c) => ({ label: currentCriterionLabel(c.label, c.key), value: c.value }))
        : [
            { label: 'Scénario', value: Number(film.criteria.story) },
            { label: 'Image', value: Number(film.criteria.visuals) },
            { label: 'Jeu des acteurs', value: Number(film.criteria.acting) },
            { label: 'Son & musique', value: Number(film.criteria.sound) },
          ],
    })),
    name
  );
};

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
      // Les goûts se lisent au clic, en parallèle : les charger à l'affichage
      // ferait partir une requête par membre pour chaque film proposé, et le
      // plus souvent pour rien.
      const withTaste = await Promise.all(
        members.map(async (m) => ({ name: m.name, taste: m.taste || (await readTaste(m.profileId, m.name)) }))
      );

      const usable = withTaste.filter((m): m is { name: string; taste: string } => !!m.taste);
      if (usable.length === 0) {
        // Personne n'a assez noté pour qu'on sache quoi que ce soit de ses
        // goûts. Le dire vaut mieux qu'un argumentaire inventé de toutes pièces.
        setError(t('pitch.noTaste'));
        return;
      }

      const result = await getSpacePitches(film, usable);
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

  // Le bouton reste visible même sans goût connu d'avance : c'est le clic qui
  // ira les chercher. Se masquer par précaution reviendrait à cacher la
  // fonction à ceux qui en ont le plus besoin — un espace qui démarre n'a
  // justement encore rien noté.
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
