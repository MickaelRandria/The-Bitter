/**
 * La part sans réseau de la dictée d'avis : ce qu'on envoie à Voxtral comme
 * vocabulaire, et ce qu'on accepte de la mise au propre.
 *
 * Module sans dépendance, transpilé tel quel par `tests/reviewVoice.test.mjs`.
 */

/** Plafond de Voxtral pour le vocabulaire imposé. */
export const MAX_BIAS_TERMS = 100;
const MAX_TERM_LENGTH = 60;

/**
 * Le vocabulaire imposé à la transcription.
 *
 * C'est là que la dictée gagne le plus : un avis cite le film, son réalisateur,
 * ses acteurs, et ce sont précisément les mots qu'un modèle généraliste écorche
 * (« Villeneuve » devient « vile neuve »). On garde chaque nom entier ET chacun
 * de ses mots porteurs, parce qu'on dit plus souvent « Chalamet » que
 * « Timothée Chalamet ».
 */
export function biasTerms(input: unknown): string[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<string>();
  const terms: string[] = [];
  const push = (term: string) => {
    const clean = term.replace(/\s+/g, ' ').trim();
    if (clean.length < 2 || clean.length > MAX_TERM_LENGTH) return;
    const key = clean.toLocaleLowerCase('fr');
    if (seen.has(key) || terms.length >= MAX_BIAS_TERMS) return;
    seen.add(key);
    terms.push(clean);
  };

  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    // « Inconnu » est la valeur de repli de l'écran d'ajout, pas un nom.
    if (/^inconnu$/i.test(raw.trim())) continue;
    for (const name of raw.split(/[,;\n]/)) {
      push(name);
      const words = name
        .split(/[\s:–—-]+/)
        .filter((word) => /^\p{Lu}/u.test(word) && word.length >= 4);
      if (words.length > 1) words.forEach(push);
    }
  }
  return terms;
}

/** Les tics de l'oral, retirés quand la mise au propre n'a pas pu se faire. */
const FILLERS: Record<'fr' | 'en', RegExp> = {
  fr: /(^|[\s,])(euh+|heu+|hum+|bah|ben|hein|euhm)(?=[\s,.!?]|$)/giu,
  en: /(^|[\s,])(uh+|um+|erm+|hmm+)(?=[\s,.!?]|$)/giu,
};

/**
 * Nettoyage minimal, sans modèle : hésitations retirées, mots doublés fondus,
 * majuscule initiale et point final. C'est le repli quand la mise au propre
 * échoue ou se fait refuser ; la transcription brute de Voxtral est déjà
 * ponctuée la plupart du temps, on ne fait que l'épousseter.
 */
export function tidyTranscript(text: string, lang: 'fr' | 'en' = 'fr'): string {
  let out = text.replace(FILLERS[lang], '$1');
  // « le le film », « c'est c'est » : le faux départ le plus courant à l'oral.
  out = out.replace(/\b([\p{L}']+)(\s+\1\b)+/giu, '$1');
  out = out
    .replace(/\s+([,.!?;:])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/(^|[.!?]\s+)[,\s]+/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .replace(/^[,;:\s]+/, '');
  if (!out) return '';
  out = out.charAt(0).toLocaleUpperCase(lang) + out.slice(1);
  if (!/[.!?…]$/.test(out)) out += '.';
  return out;
}

/** Les mots d'un texte, en minuscules et sans accents ni ponctuation. */
const tokens = (text: string) =>
  text
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

/**
 * Accepte ou refuse la mise au propre.
 *
 * Elle doit retirer, jamais ajouter. On ne peut pas vérifier le sens, mais on
 * peut vérifier deux choses. La quantité : plus long que la dictée débarrassée
 * de ses hésitations, le texte a reçu des mots que personne n'a dits ; fondu de
 * moitié, il a été résumé. Le vocabulaire : un mot porteur (4 lettres et plus)
 * absent de la dictée et des noms du film est un mot ajouté. On tolère les
 * corrections d'accord et d'orthographe, pas une idée en plus.
 */
export function acceptPolish(raw: string, polished: string, terms: string[] = []): boolean {
  // Un modèle qui commente au lieu de corriger (« Voici le texte corrigé : »).
  if (/^(voici|here is|here's|texte corrig|corrected)/i.test(polished.trim())) return false;

  const before = tokens(tidyTranscript(raw)).length;
  const after = tokens(polished);
  if (after.length === 0) return false;
  if (after.length > before + 2) return false;
  if (before >= 8 && after.length < before * 0.5) return false;

  const known = new Set([...tokens(raw), ...terms.flatMap(tokens)]);
  // Une faute d'accord corrigée change la fin du mot, pas son début.
  const stems = new Set([...known].map((word) => word.slice(0, 5)));
  const added = after.filter(
    (word) => word.length >= 4 && !known.has(word) && !stems.has(word.slice(0, 5))
  );
  return added.length <= Math.max(1, Math.floor(after.length * 0.1));
}

/** Retire ce que le modèle ajoute parfois autour du texte : guillemets, balises. */
export function unwrapPolish(text: string): string {
  return text
    .trim()
    .replace(/^```[a-z]*\s*|\s*```$/g, '')
    .replace(/^["«“]\s*([\s\S]*?)\s*["»”]$/, '$1')
    .trim();
}
