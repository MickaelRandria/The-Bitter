import { useEffect, useState } from 'react';

/**
 * « Un souci ? » : quand un message d'erreur s'affiche, une petite pop-in
 * propose de le signaler (components/ProblemReportPrompt, puis FeedbackModal).
 *
 * Les erreurs de l'app s'affichent déjà avec `role="alert"` : un observateur du
 * DOM les repère toutes, sans toucher aux écrans. Un écran qui plante
 * (ErrorBoundary) appelle `signalProblem` directement.
 *
 * Pour ne pas harceler : un même message n'est proposé qu'une fois par
 * session, et une proposition au plus par minute. Ce qui se trouve sous
 * `[data-no-report]` (le formulaire de signalement lui-même) est ignoré.
 */

export interface Problem {
  message: string;
  /** L'écran ou le composant, quand on le sait. */
  where?: string;
  at: number;
}

const MIN_GAP_MS = 60_000;
const seen = new Set<string>();
let lastShownAt = 0;
let current: Problem | null = null;
const listeners = new Set<(problem: Problem | null) => void>();

const emit = () => listeners.forEach((listener) => listener(current));

const clean = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 300);

export function signalProblem(message: string, where?: string) {
  const text = clean(message);
  if (text.length < 4 || seen.has(text)) return;
  const now = Date.now();
  if (now - lastShownAt < MIN_GAP_MS) return;
  seen.add(text);
  lastShownAt = now;
  current = { message: text, where, at: now };
  emit();
}

export function dismissProblem() {
  current = null;
  emit();
}

/** Prévenu à chaque proposition, et quand elle s'efface (null). Rend la fonction qui se désabonne. */
export function subscribeProblem(listener: (problem: Problem | null) => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useProblem(): Problem | null {
  const [problem, setProblem] = useState<Problem | null>(current);
  useEffect(() => subscribeProblem(setProblem), []);
  return problem;
}

/** Les alertes d'un nœud ajouté au DOM : lui-même et ses descendants. */
function alertsIn(node: Node): HTMLElement[] {
  if (!(node instanceof HTMLElement)) return [];
  const found = node.matches('[role="alert"]') ? [node] : [];
  return [...found, ...node.querySelectorAll<HTMLElement>('[role="alert"]')];
}

/** Surveille les messages d'erreur affichés. Rend la fonction qui arrête la surveillance. */
export function watchAlerts(): () => void {
  if (typeof MutationObserver === 'undefined') return () => {};
  const check = (element: HTMLElement) => {
    if (element.closest('[data-no-report]')) return;
    // Laisse React finir d'écrire le texte de l'alerte.
    window.setTimeout(() => {
      if (element.isConnected && element.textContent) signalProblem(element.textContent);
    }, 300);
  };
  const observer = new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((node) => alertsIn(node).forEach(check));
        // Le texte d'une alerte déjà là qui change (« Réessaie » → autre erreur).
        const target = mutation.target instanceof HTMLElement ? mutation.target.closest<HTMLElement>('[role="alert"]') : null;
        if (target) check(target);
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
  return () => observer.disconnect();
}
