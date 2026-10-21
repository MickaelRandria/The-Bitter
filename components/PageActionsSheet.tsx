import React from 'react';
import {
  ArrowRight,
  BookmarkPlus,
  CalendarPlus,
  Mic,
  Share2,
  SlidersHorizontal,
  Sparkles,
  Star,
  Ticket,
  Tv,
  Users,
  Send,
  UserPlus,
} from 'lucide-react';
import ActionSheet from './ActionSheet';
import { useLanguage } from '../contexts/LanguageContext';
import type { PageAction } from '../utils/pageActions';

const icons = {
  rate: Star,
  watchlist: BookmarkPlus,
  dictate: Mic,
  recos: Sparkles,
  tonight: Sparkles,
  plan: CalendarPlus,
  ticket: Ticket,
  rateDay: Star,
  mood: Sparkles,
  filters: SlidersHorizontal,
  platforms: Tv,
  share: Share2,
  recalibrate: SlidersHorizontal,
  propose: Send,
  organize: Users,
  invite: UserPlus,
  series: Tv,
};

export default function PageActionsSheet({
  title,
  subtitle,
  actions,
  onAction,
  onAllAdd,
  onClose,
  dark,
  series,
}: {
  title: string;
  subtitle?: string;
  actions: PageAction[];
  onAction: (action: PageAction) => void;
  onAllAdd: () => void;
  onClose: () => void;
  dark?: boolean;
  series?: boolean;
}) {
  const { t } = useLanguage();
  return (
    <ActionSheet title={title} subtitle={subtitle} onClose={onClose} dark={dark}>
      <div className="space-y-2">
        {actions.map((action, i) => {
          const Icon = icons[action];
          const label =
            action === 'rate' && series
              ? 'seriesRate'
              : action === 'watchlist' && series
                ? 'seriesWatchlist'
                : action;
          return (
            <button
              key={action}
              type="button"
              data-page-action={action}
              onClick={() => onAction(action)}
              className={`flex min-h-14 w-full items-center gap-3 rounded-2xl p-4 text-left active:scale-[0.99] ${i === 0 ? 'min-h-20 bg-forest text-white dark:bg-[#a9c78a] dark:text-[#172111]' : 'border border-sand bg-white dark:border-white/10 dark:bg-white/5'}`}
            >
              <Icon size={20} className="shrink-0" />
              <span className="min-w-0 flex-1">
                <b className="block text-sm font-black">{t(`pageActions.${label}`)}</b>
                {i === 0 && (
                  <small className="mt-1 block text-[11px] opacity-75">
                    {t(`pageActions.desc.${action}`)}
                  </small>
                )}
              </span>
              <ArrowRight size={16} className="shrink-0 opacity-60" />
            </button>
          );
        })}
      </div>
      <button
        type="button"
        onClick={onAllAdd}
        className="mt-5 flex min-h-11 w-full items-center justify-between border-t border-sand pt-3 text-xs font-black text-stone-500 dark:border-white/10 dark:text-stone-400"
      >
        {t('pageActions.allAdd')}
        <ArrowRight size={15} />
      </button>
      <p className="mt-3 text-center text-[10px] leading-relaxed text-stone-400">
        {t('pageActions.hold')}
      </p>
    </ActionSheet>
  );
}
