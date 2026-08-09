import React, { useMemo, useState } from 'react';
import { X, Film, Check, Ticket, Home, ListChecks, Sparkles } from 'lucide-react';
import { CinemaSubscription, Movie, ViewingContext } from '../types';
import {
  formatCurrency,
  getHistorySessions,
  getSubscriptionStats,
} from '../utils/cinemaSubscription';
import { resizeTmdbImage } from '../utils/tmdbImage';
import { getAvgRating } from '../utils/insights';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { getCinemaProviderBrand } from '../utils/cinemaBrand';
import ViewingContextPicker from './ViewingContextPicker';
import CinemaSubscriptionArtwork from './CinemaSubscriptionArtwork';

interface CinemaHistoryImportModalProps {
  movies: Movie[];
  subscription: CinemaSubscription;
  /** Contextes explicitement choisis par l'utilisateur, indexés par séance. */
  onConfirm: (contextsByWatchId: Record<string, ViewingContext>) => void;
  onClose: () => void;
  onSeeStats: () => void;
}

type HistoryImportMode = 'subscription' | 'home' | 'manual' | null;
type HistoryReviewScope = 'summary' | 'exceptions' | 'all';

/**
 * Complétion de l'historique, à la séance et non au film.
 *
 * Toute la liste réellement notée est présentée. Aucun visionnage n'est présumé
 * avoir été inclus dans l'abonnement : l'utilisateur choisit son contexte.
 */
const CinemaHistoryImportModal: React.FC<CinemaHistoryImportModalProps> = ({
  movies,
  subscription,
  onConfirm,
  onClose,
  onSeeStats,
}) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('cinemaSub.history.title'));
  const sessions = useMemo(() => getHistorySessions(movies), [movies]);
  const [contextsByWatchId, setContextsByWatchId] = useState<Record<string, ViewingContext>>({});
  const [result, setResult] = useState<{ count: number; value: number; net: number } | null>(null);
  const [importMode, setImportMode] = useState<HistoryImportMode>(null);
  const [reviewScope, setReviewScope] = useState<HistoryReviewScope>('summary');
  const [searchQuery, setSearchQuery] = useState('');

  const locale = language === 'en' ? 'en-GB' : 'fr-FR';
  const brand = getCinemaProviderBrand(subscription.provider);
  const subscriptionStart = new Date(subscription.startDate).getTime();
  const automaticSessions = useMemo(
    () =>
      sessions.filter(
        ({ watch, watchedAt }) =>
          watchedAt.getTime() >= subscriptionStart && !watch.viewingContext
      ),
    [sessions, subscriptionStart]
  );
  const isExpressMode = importMode === 'subscription' || importMode === 'home';
  const sessionsToReview = useMemo(() => {
    const baseSessions =
      isExpressMode && reviewScope === 'exceptions'
        ? sessions.filter(({ watchedAt }) => watchedAt.getTime() >= subscriptionStart)
        : sessions;
    const query = searchQuery.trim().toLocaleLowerCase(locale);
    return query
      ? baseSessions.filter(({ movie }) => movie.title.toLocaleLowerCase(locale).includes(query))
      : baseSessions;
  }, [isExpressMode, locale, reviewScope, searchQuery, sessions, subscriptionStart]);
  const changedCount = Object.keys(contextsByWatchId).length;
  const automaticCount = automaticSessions.filter(({ watch }) => !!contextsByWatchId[watch.id]).length;

  const beginExpressImport = (mode: Extract<HistoryImportMode, 'subscription' | 'home'>) => {
    const context: ViewingContext =
      mode === 'subscription'
        ? {
            locationType: 'cinema',
            cinemaProvider: subscription.provider,
            paymentType: 'subscription',
            subscriptionId: subscription.id,
          }
        : { locationType: 'home' };

    setContextsByWatchId((previous) => {
      const next = { ...previous };
      automaticSessions.forEach(({ watch }) => {
        if (!next[watch.id]) next[watch.id] = context;
      });
      return next;
    });
    setImportMode(mode);
    setReviewScope('summary');
    setSearchQuery('');
    haptics.success();
  };

  const beginManualImport = () => {
    setImportMode('manual');
    setReviewScope('all');
    setSearchQuery('');
    haptics.soft();
  };

  const setWatchContext = (watchId: string, context: ViewingContext | undefined) => {
    setContextsByWatchId((previous) => {
      if (context) return { ...previous, [watchId]: context };
      const { [watchId]: _removed, ...rest } = previous;
      return rest;
    });
  };

  const confirm = () => {
    if (changedCount === 0) return;
    haptics.success();
    onConfirm(contextsByWatchId);

    // Projection locale : le parent n'a pas encore propagé le profil mis à jour
    // lorsque l'écran de résultat s'affiche.
    const projected = movies.map((movie) => ({
      ...movie,
      watches: movie.watches?.map((watch) =>
        contextsByWatchId[watch.id]
          ? { ...watch, viewingContext: contextsByWatchId[watch.id] }
          : watch
      ),
    }));
    const stats = getSubscriptionStats(projected, subscription, 'allTime', new Date());
    setResult({ count: changedCount, value: stats.value, net: stats.netSavings });
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[210] flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
        onClick={onClose}
      />

      <div className={`relative z-10 w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t ${brand.modalClass}`}>
        <div className={`px-6 pt-5 pb-4 border-b flex items-center justify-between shrink-0 ${brand.headerClass}`}>
          <div className="min-w-0 flex items-center gap-3">
            <CinemaSubscriptionArtwork provider={subscription.provider} />
            <div className="min-w-0">
              <h2 className={`text-xl font-black tracking-tight truncate ${brand.headerTitleClass} ${brand.fontClass}`}>
                {result ? t('cinemaSub.history.doneTitle') : t('cinemaSub.history.title')}
              </h2>
              {!result && (
                <p className={`text-[10px] font-bold uppercase tracking-widest mt-0.5 ${brand.headerMutedClass} ${brand.fontClass}`}>
                  {t('cinemaSub.history.sub')}
                </p>
              )}
            </div>
          </div>
          <button
            onClick={result ? onSeeStats : onClose}
            aria-label={t('common.close')}
            className={`shrink-0 ml-3 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform ${brand.headerControlClass}`}
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        {result ? (
          <div className={`flex-1 overflow-y-auto no-scrollbar p-6 ${brand.contentClass}`}>
            <div className="text-center py-6 space-y-8">
              <div className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto ${brand.accentPanelClass}`}>
                <Check size={26} strokeWidth={3} />
              </div>
              <p className={`text-sm font-black uppercase tracking-widest ${brand.titleClass}`}>
                {t('cinemaSub.history.added', { count: String(result.count) })}
              </p>
              <div className="space-y-6">
                <div>
                  <p className={`text-4xl font-black tracking-tighter ${brand.titleClass}`}>
                    {formatCurrency(result.value, language)}
                  </p>
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${brand.labelClass}`}>
                    {t('cinemaSub.history.valueLabel')}
                  </p>
                </div>
                <div>
                  <p className={`text-4xl font-black tracking-tighter ${result.net >= 0 ? 'text-forest dark:text-bitter-lime' : 'text-charcoal dark:text-white'}`}>
                    {result.net >= 0 ? '+' : ''}{formatCurrency(result.net, language)}
                  </p>
                  <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-1 ${brand.labelClass}`}>
                    {t('cinemaSub.history.savedLabel')}
                  </p>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className={`flex-1 overflow-y-auto no-scrollbar p-6 space-y-3 ${brand.contentClass}`}>
            {sessions.length === 0 ? (
              <div className="py-12 text-center space-y-3">
                <div className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto ${brand.selectedCardClass} ${brand.actionTextClass}`}>
                  <Ticket size={24} />
                </div>
                <p className={`text-sm font-medium max-w-xs mx-auto leading-relaxed ${brand.mutedTextClass}`}>
                  {t('cinemaSub.history.empty')}
                </p>
              </div>
            ) : importMode === null ? (
              <div className="space-y-4 animate-[fadeIn_0.25s_ease-out]">
                <div className="text-center px-3 py-2">
                  <div className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto mb-4 ${brand.accentPanelClass}`}>
                    <Sparkles size={24} />
                  </div>
                  <h3 className={`text-2xl font-black tracking-tight ${brand.titleClass}`}>
                    {t('cinemaSub.history.expressTitle')}
                  </h3>
                  <p className={`text-sm font-medium leading-relaxed mt-3 ${brand.mutedTextClass}`}>
                    {t('cinemaSub.history.expressSub')}
                  </p>
                </div>

                <button
                  type="button"
                  onClick={() => beginExpressImport('subscription')}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left active:scale-[0.99] transition-all ${brand.selectedClass}`}
                >
                  <CinemaSubscriptionArtwork provider={subscription.provider} size="thumbnail" />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-black uppercase tracking-wide">
                      {t('cinemaSub.history.expressSubscription', { name: brand.label })}
                    </span>
                    <span className="block text-[10px] font-medium normal-case tracking-normal opacity-75 mt-1 leading-relaxed">
                      {t('cinemaSub.history.expressSubscriptionSub')}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => beginExpressImport('home')}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left active:scale-[0.99] transition-all ${brand.cardClass}`}
                >
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${brand.selectedCardClass} ${brand.actionTextClass}`}>
                    <Home size={18} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-black uppercase tracking-wide ${brand.titleClass}`}>
                      {t('cinemaSub.history.expressHome')}
                    </span>
                    <span className={`block text-[10px] font-medium normal-case tracking-normal mt-1 leading-relaxed ${brand.mutedTextClass}`}>
                      {t('cinemaSub.history.expressHomeSub')}
                    </span>
                  </span>
                </button>

                <button
                  type="button"
                  onClick={beginManualImport}
                  className={`w-full flex items-center gap-4 p-4 rounded-2xl border text-left active:scale-[0.99] transition-all ${brand.secondaryPillClass}`}
                >
                  <span className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${brand.selectedCardClass} ${brand.actionTextClass}`}>
                    <ListChecks size={18} />
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className={`block text-sm font-black uppercase tracking-wide ${brand.titleClass}`}>
                      {t('cinemaSub.history.manual')}
                    </span>
                    <span className={`block text-[10px] font-medium normal-case tracking-normal mt-1 leading-relaxed ${brand.mutedTextClass}`}>
                      {t('cinemaSub.history.manualSub')}
                    </span>
                  </span>
                </button>
              </div>
            ) : isExpressMode && reviewScope === 'summary' ? (
              <div className="space-y-4 animate-[fadeIn_0.25s_ease-out]">
                <div className={`rounded-[2rem] border p-6 text-center space-y-4 ${brand.cardClass}`}>
                  <div className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto ${brand.accentPanelClass}`}>
                    <Check size={26} strokeWidth={3} />
                  </div>
                  <div>
                    <h3 className={`text-2xl font-black tracking-tight ${brand.titleClass}`}>
                      {t('cinemaSub.history.expressReady')}
                    </h3>
                    <p className={`text-sm font-medium leading-relaxed mt-3 ${brand.mutedTextClass}`}>
                      {t('cinemaSub.history.expressApplied', { count: String(automaticCount) })}
                    </p>
                  </div>
                </div>

                <p className={`text-[11px] font-medium leading-relaxed px-2 ${brand.mutedTextClass}`}>
                  {t('cinemaSub.history.expressPreserved')}
                </p>

                <button
                  type="button"
                  onClick={() => setReviewScope('exceptions')}
                  className={`w-full py-3.5 rounded-2xl text-[10px] font-black uppercase tracking-widest border transition-colors ${brand.secondaryPillClass}`}
                >
                  {t('cinemaSub.history.reviewExceptions')}
                </button>
                <button
                  type="button"
                  onClick={() => setReviewScope('all')}
                  className={`w-full py-2 text-[10px] font-black uppercase tracking-widest transition-colors ${brand.secondaryActionClass}`}
                >
                  {t('cinemaSub.history.reviewAll')}
                </button>
              </div>
            ) : (
              <>
                <div className="space-y-3 px-1">
                  <p className={`text-[11px] font-medium leading-relaxed ${brand.mutedTextClass}`}>
                    {isExpressMode && reviewScope === 'exceptions'
                      ? t('cinemaSub.history.reviewHint')
                      : t('cinemaSub.history.contextHint')}
                  </p>
                  {isExpressMode && (
                    <>
                      <input
                        type="search"
                        value={searchQuery}
                        onChange={(event) => setSearchQuery(event.target.value)}
                        placeholder={t('cinemaSub.history.searchPlaceholder')}
                        className={`w-full border rounded-2xl px-4 py-3 text-sm font-bold outline-none transition-all ${brand.inputClass}`}
                      />
                      <div className="flex justify-between gap-3">
                        {reviewScope === 'exceptions' && (
                          <button
                            type="button"
                            onClick={() => setReviewScope('all')}
                            className={`text-[10px] font-black uppercase tracking-widest ${brand.secondaryActionClass}`}
                          >
                            {t('cinemaSub.history.reviewAll')}
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => {
                            setReviewScope('summary');
                            setSearchQuery('');
                          }}
                          className={`text-[10px] font-black uppercase tracking-widest ml-auto ${brand.secondaryActionClass}`}
                        >
                          {t('cinemaSub.history.backToSummary')}
                        </button>
                      </div>
                    </>
                  )}
                </div>

                {sessionsToReview.length === 0 ? (
                  <p className={`py-10 text-center text-sm font-medium ${brand.mutedTextClass}`}>
                    {t('cinemaSub.history.noSearchResult')}
                  </p>
                ) : sessionsToReview.map(({ movie, watch, watchedAt }) => {
                  const context = contextsByWatchId[watch.id] ?? watch.viewingContext;
                  const wasChanged = !!contextsByWatchId[watch.id];
                  const beforeSubscription = watchedAt.getTime() < subscriptionStart;

                  return (
                    <article
                      key={watch.id}
                      style={{ contentVisibility: 'auto', containIntrinsicSize: '220px' }}
                      className={`p-3 rounded-2xl border transition-colors ${
                        wasChanged ? brand.selectedCardClass : brand.cardClass
                      }`}
                    >
                      <div className="flex gap-3 mb-3">
                        <div className={`w-10 aspect-[2/3] rounded-lg overflow-hidden shrink-0 ${brand.selectedCardClass}`}>
                          {movie.posterUrl ? (
                            <img src={resizeTmdbImage(movie.posterUrl, 'w185')} className="w-full h-full object-cover" alt="" loading="lazy" decoding="async" />
                          ) : (
                            <div className={`w-full h-full flex items-center justify-center ${brand.actionTextClass}`}><Film size={12} /></div>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-black truncate leading-tight ${brand.titleClass}`}>{movie.title}</p>
                          <p className={`text-[10px] font-bold uppercase tracking-wide mt-0.5 ${brand.labelClass}`}>
                            {watchedAt.toLocaleDateString(locale, { day: '2-digit', month: 'short', year: 'numeric' })}
                            {watch.watch_number > 1 && ` · ${t('cinemaSub.history.rewatch')}`}
                            {' · '}{getAvgRating(movie).toFixed(1)}
                          </p>
                          {beforeSubscription && (
                            <p className={`text-[9px] font-bold mt-1 ${brand.mutedTextClass}`}>
                              {t('cinemaSub.history.beforeSubscription')}
                            </p>
                          )}
                        </div>
                      </div>
                      <ViewingContextPicker
                        value={context}
                        onChange={(nextContext) => setWatchContext(watch.id, nextContext)}
                        subscription={subscription}
                        showLabel={false}
                      />
                    </article>
                  );
                })}
              </>
            )}
          </div>
        )}

        {(result || importMode !== null) && (
          <div className={`p-6 pt-4 border-t shrink-0 ${brand.footerClass}`}>
            {result ? (
              <button onClick={onSeeStats} className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all ${brand.selectedClass}`}>
                {t('cinemaSub.history.seeStats')}
              </button>
            ) : (
              <button
                onClick={confirm}
                disabled={changedCount === 0}
                className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 ${brand.selectedClass}`}
              >
                {t('cinemaSub.history.addSessions', { count: String(changedCount) })}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default CinemaHistoryImportModal;
