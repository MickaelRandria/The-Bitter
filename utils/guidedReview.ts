/**
 * L'avis guidé : trois questions tirées de la note, et la lecture d'un resserrage.
 *
 * Les questions sont CALCULÉES, sans modèle. Une note dit déjà où regarder :
 * l'écart entre le meilleur et le pire critère est ce qu'il y a de plus
 * intéressant à expliquer, le sommet ce qu'il y a de plus facile à raconter.
 * Demander « qu'est-ce qui coinçait dans l'histoire ? » à quelqu'un qui vient
 * de mettre 4 à l'histoire, c'est lui donner sa première phrase.
 *
 * Module pur, testé par `tests/guidedReview.test.mjs`.
 */

export interface GuidedCriterion {
  label: string;
  value: number;
}

export interface GuidedChip {
  label: string;
  value: string;
  tone: 'low' | 'high' | 'neutral';
}

export interface GuidedQuestion {
  kind: 'gap' | 'marked' | 'dropped' | 'peak' | 'save' | 'verdict';
  /** Clé de traduction de la question, et de son indication. */
  key: string;
  hintKey: string;
  params: Record<string, string>;
  chips: GuidedChip[];
}

/** En deçà, la note est plate : il n'y a pas d'écart à faire expliquer. */
export const GAP_THRESHOLD = 3;

export const formatScore = (value: number, lang: 'fr' | 'en' = 'fr') => {
  const rounded = Math.round(value * 10) / 10;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  return lang === 'fr' ? text.replace('.', ',') : text;
};

const lower = (label: string, lang: 'fr' | 'en') =>
  label.charAt(0).toLocaleLowerCase(lang) + label.slice(1);

export function guidedQuestions(
  criteria: GuidedCriterion[],
  rating: number | undefined,
  lang: 'fr' | 'en' = 'fr'
): GuidedQuestion[] {
  const rated = criteria.filter((c) => c.label && Number.isFinite(c.value));
  const sorted = [...rated].sort((a, b) => b.value - a.value);
  const top = sorted[0];
  const low = sorted[sorted.length - 1];
  const overall = Number.isFinite(rating) ? (rating as number) : top ? top.value : 5;
  const chip = (c: GuidedCriterion, tone: GuidedChip['tone']): GuidedChip => ({
    label: c.label,
    value: formatScore(c.value, lang),
    tone,
  });

  const questions: GuidedQuestion[] = [];

  // 1. Ce qui se discute : l'écart, ou à défaut l'impression d'ensemble.
  if (top && low && top !== low && top.value - low.value >= GAP_THRESHOLD) {
    questions.push({
      kind: 'gap',
      key: 'guided.qGap',
      hintKey: 'guided.hintGap',
      params: {
        top: top.label,
        low: lower(low.label, lang),
        lowValue: formatScore(low.value, lang),
      },
      chips: [chip(low, 'low'), chip(top, 'neutral')],
    });
  } else if (overall < 5) {
    questions.push({
      kind: 'dropped',
      key: 'guided.qDropped',
      hintKey: 'guided.hintDropped',
      params: {},
      chips: [],
    });
  } else {
    questions.push({
      kind: 'marked',
      key: 'guided.qMarked',
      hintKey: 'guided.hintMarked',
      params: {},
      chips: [],
    });
  }

  // 2. Ce qui se raconte : le meilleur critère. Sur un film raté, ce qui se sauve.
  if (top) {
    const params = {
      label: top.label,
      labelLower: lower(top.label, lang),
      value: formatScore(top.value, lang),
    };
    questions.push(
      overall < 4
        ? {
            kind: 'save',
            key: 'guided.qSave',
            hintKey: 'guided.hintSave',
            params,
            chips: [chip(top, 'high')],
          }
        : {
            kind: 'peak',
            key: 'guided.qPeak',
            hintKey: 'guided.hintPeak',
            params,
            chips: [chip(top, 'high')],
          }
    );
  }

  // 3. Ce qui sert à celui qui lit : à qui le conseiller.
  questions.push({
    kind: 'verdict',
    key: 'guided.qVerdict',
    hintKey: 'guided.hintVerdict',
    params: {},
    chips: [],
  });
  return questions;
}

const norm = (word: string) =>
  word
    .toLocaleLowerCase('fr')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]/gu, '');

/**
 * Ce que le resserrage a coupé, et ce qu'il a ajouté, mot à mot.
 *
 * Plus longue sous-suite commune entre les deux textes : un mot de l'avis
 * complet qui n'y figure pas a été coupé, un mot de la version courte qui n'y
 * figure pas a été ajouté. Les coupes consécutives sont regroupées en passages,
 * pour qu'on lise « les basses font trembler le siège » et non six mots épars.
 */
export function compareTightened(
  full: string,
  tight: string
): { removed: string[]; added: string[] } {
  const a = full.split(/\s+/).filter(Boolean);
  const b = tight.split(/\s+/).filter(Boolean);
  const na = a.map(norm);
  const nb = b.map(norm);
  const dp: number[][] = Array.from({ length: a.length + 1 }, () =>
    new Array(b.length + 1).fill(0)
  );
  for (let i = a.length - 1; i >= 0; i--) {
    for (let j = b.length - 1; j >= 0; j--) {
      dp[i][j] =
        na[i] && na[i] === nb[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const removed: string[] = [];
  const added: string[] = [];
  let run: string[] = [];
  const flush = () => {
    const passage = run.join(' ').replace(/^[,;:.\s]+|[,;:.\s]+$/g, '');
    if (norm(passage)) removed.push(passage);
    run = [];
  };

  let i = 0;
  let j = 0;
  while (i < a.length || j < b.length) {
    if (i < a.length && j < b.length && na[i] && na[i] === nb[j]) {
      flush();
      i++;
      j++;
    } else if (j >= b.length || (i < a.length && dp[i + 1][j] >= dp[i][j + 1])) {
      run.push(a[i]);
      i++;
    } else {
      if (norm(b[j])) added.push(b[j].replace(/[^\p{L}\p{N}'’-]/gu, ''));
      j++;
    }
  }
  flush();
  return { removed, added };
}
