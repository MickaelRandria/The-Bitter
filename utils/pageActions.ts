import type { NavPage, MediaMode } from './navActions';

export type PageAction =
  | 'rate'
  | 'watchlist'
  | 'dictate'
  | 'recos'
  | 'tonight'
  | 'plan'
  | 'ticket'
  | 'rateDay'
  | 'mood'
  | 'filters'
  | 'platforms'
  | 'share'
  | 'recalibrate'
  | 'propose'
  | 'organize'
  | 'invite'
  | 'series';
export interface PageActionContext {
  page: NavPage;
  mediaMode: MediaMode;
  feedTab: 'history' | 'queue';
  statsUnlocked: boolean;
  pastDay: boolean;
}

export function pageActionsFor(c: PageActionContext): PageAction[] {
  if (c.page === 'SharedSpace') return ['propose', 'organize', 'invite'];
  if (c.page === 'Discover') return ['mood', 'filters', 'platforms'];
  if (c.page === 'Analytics')
    return c.statsUnlocked ? ['share', 'recalibrate'] : ['rate', 'recalibrate'];
  if (c.page === 'Calendar')
    return c.mediaMode === 'tv'
      ? ['series', 'watchlist']
      : c.pastDay
        ? ['plan', 'ticket', 'rateDay']
        : ['plan', 'ticket'];
  if (c.feedTab === 'queue') return ['watchlist', 'tonight'];
  return c.mediaMode === 'tv'
    ? ['series', 'watchlist', 'dictate']
    : ['rate', 'watchlist', 'dictate', 'recos'];
}

export const contextLabelKey = (page: NavPage, tab: 'history' | 'queue') =>
  `pageActions.context.${page === 'Feed' && tab === 'queue' ? 'queue' : page}`;

export interface DiscoverActionRequest {
  id: number;
  kind: 'mood' | 'filters' | 'platforms';
}
export interface SpaceActionRequest {
  id: number;
  kind: 'organize' | 'invite';
}
