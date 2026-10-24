/**
 * Les styles communs des boutons, champs, titres de section et feuilles.
 *
 * Chaque écran avait inventé les siens : 27 hauteurs de bouton, 13 versions du
 * gros bouton lime, une centaine de petits titres différents (audit du
 * 24/10/2026). Les règles validées sur maquette vivent ici, et seulement ici :
 * un écran harmonisé n'écrit plus ses propres tailles.
 *
 * Fichier dans utils/ : Tailwind le lit (voir `content` dans tailwind.config.js),
 * les classes écrites ici sont donc bien générées.
 */

const press = 'transition active:scale-95 disabled:opacity-50 disabled:active:scale-100';
const pillText = 'text-[11px] font-black uppercase tracking-[0.12em]';

/** Action principale : pilule lime de 48 px, une seule par écran ou par carte. */
export const btnPrimary = `inline-flex h-12 items-center justify-center gap-2 rounded-full bg-bitter-lime px-6 text-[#111] ${pillText} ${press}`;

/** Action secondaire : même forme, en contour. */
export const btnSecondary = `inline-flex h-12 items-center justify-center gap-2 rounded-full border border-stone-300 px-6 text-charcoal dark:border-white/15 dark:text-white ${pillText} ${press}`;

/** Bouton rond à icône, 44 px (la taille de toucher minimale). Toujours avec un aria-label. */
export const btnIcon = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-stone-300 text-charcoal dark:border-white/15 dark:text-white ${press}`;
export const btnIconPrimary = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-bitter-lime text-[#111] ${press}`;
/** Bouton rond « fermer » des en-têtes de feuille : fond discret, sans bordure. */
export const btnClose = `inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-stone-500 shadow-sm hover:text-charcoal dark:bg-white/10 dark:text-white ${press}`;

/** Petite pastille de choix (jour, heure, rappel). Blanche ou charbon une fois choisie, pour laisser le lime au bouton principal. */
export const chip = (active: boolean) =>
  `inline-flex h-9 items-center justify-center gap-1 whitespace-nowrap rounded-full px-3.5 text-xs font-extrabold ${press} ${
    active
      ? 'bg-charcoal text-white dark:bg-white dark:text-charcoal'
      : 'border border-stone-300 text-stone-500 dark:border-white/15 dark:text-stone-300'
  }`;

/** Champ de saisie ou de sélection : 48 px, arrondi 16 px. */
export const field =
  'h-12 w-full rounded-2xl border border-stone-200 bg-white px-4 text-sm font-bold text-charcoal outline-none transition focus:border-bitter-lime dark:border-white/10 dark:bg-[#1A1A19] dark:text-white';

/** Petit titre de section en capitales. */
export const sectionLabel = 'text-[10px] font-black uppercase tracking-[0.16em] text-stone-500 dark:text-stone-400';

/** Feuille qui monte du bas : coins de 40 px, marge intérieure de 20 px. */
export const sheetFrame = 'rounded-t-[2.5rem] sm:rounded-[2.5rem]';
export const sheetPad = 'px-5';
