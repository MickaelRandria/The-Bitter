import React from 'react';

interface Props {
  children: React.ReactNode;
  /** Où l'on se trouvait, pour situer l'erreur dans le message et les journaux. */
  where?: string;
  /**
   * React consomme `key` avant le composant, mais notre constructeur redéclaré
   * ne le sait pas : sans cette ligne, l'appelant ne pourrait pas remettre la
   * frontière à zéro en changeant de vue.
   */
  key?: React.Key;
}

interface State {
  error: Error | null;
}

/**
 * Un écran qui explique, plutôt qu'un écran noir.
 *
 * L'application n'en avait aucune, et la moindre erreur de rendu effaçait donc
 * tout : pas de message, pas de bouton, aucun moyen de repartir ni de dire ce
 * qui s'était passé. C'est ce qui a rendu les deux dernières pannes si longues à
 * cerner — le symptôme était identique quelle que soit la cause.
 *
 * Le message affiche le texte brut de l'erreur. Ce n'est pas très élégant, mais
 * c'est la seule chose qui permette à quelqu'un de rapporter utilement ce qu'il
 * a vu, et cela vaut mille fois mieux qu'un « oups » qui n'apprend rien.
 *
 * Le second bouton vide le cache et les services workers avant de recharger :
 * une PWA sert obstinément la version qu'elle a enregistrée, et sur un téléphone
 * personne ne sait forcer ce rafraîchissement à la main. Si la version installée
 * est celle qui plante, c'est le seul geste qui en sorte.
 */
/**
 * `@types/react` n'est pas installé dans ce projet : `React.Component` arrive
 * donc sans typage, et TypeScript ne voit ni `props`, ni `state`, ni `setState`
 * sur la classe. On redéclare ce contrat ici plutôt que d'ajouter la dépendance
 * de types, qui ferait remonter des centaines d'erreurs dans tout le reste du
 * code pour un composant de quarante lignes.
 *
 * Une frontière d'erreur doit être une classe : React n'a pas d'équivalent en
 * composant de fonction, même en version 19.
 */
const Base = React.Component as unknown as new (props: Props) => {
  props: Props;
  state: State;
  setState(state: State): void;
};

class ErrorBoundary extends Base {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: { componentStack?: string }) {
    console.error(`[Erreur] ${this.props.where ?? 'Application'} :`, error, info?.componentStack);
  }

  private retry = () => this.setState({ error: null });

  private hardReload = async () => {
    try {
      if ('serviceWorker' in navigator) {
        const registrations = await navigator.serviceWorker.getRegistrations();
        await Promise.all(registrations.map((r) => r.unregister()));
      }
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch (e) {
      console.warn('[Erreur] Nettoyage du cache impossible :', e);
    } finally {
      window.location.reload();
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6">
        <div className="w-full max-w-sm bg-white dark:bg-[#161616] rounded-[2rem] p-7 border border-stone-100 dark:border-white/10 shadow-sm text-center">
          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-600 mb-2">
            {this.props.where ?? 'Application'}
          </p>
          <h2 className="text-lg font-black text-charcoal dark:text-white mb-2 leading-tight">
            Cet écran n'a pas pu s'afficher
          </h2>
          <p className="text-[12px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed mb-4">
            Le reste de l'application fonctionne. Si le problème revient, envoie-moi
            la ligne ci-dessous : elle dit exactement ce qui a échoué.
          </p>

          <p className="text-[10px] font-mono text-left text-stone-500 dark:text-stone-400 bg-stone-50 dark:bg-black/40 rounded-xl p-3 mb-5 break-words max-h-32 overflow-y-auto">
            {error.message || String(error)}
          </p>

          <div className="space-y-2">
            <button
              onClick={this.retry}
              className="w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal py-3.5 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] active:scale-95 transition-transform"
            >
              Réessayer
            </button>
            <button
              onClick={this.hardReload}
              className="w-full py-3 rounded-2xl font-black text-[10px] uppercase tracking-[0.15em] text-stone-400 dark:text-stone-600 active:scale-95 transition-transform"
            >
              Recharger la dernière version
            </button>
          </div>
        </div>
      </div>
    );
  }
}

export default ErrorBoundary;
