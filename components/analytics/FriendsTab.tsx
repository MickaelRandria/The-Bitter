import React, { useEffect, useMemo, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { useLanguage } from '../../contexts/LanguageContext';
import { haptics } from '../../utils/haptics';
import { resizeTmdbImage } from '../../utils/tmdbImage';
import { avatarSrc } from '../../utils/avatar';
import { fmt1 } from '../../utils/verdict';
import { computeAffinities, MIN_COMMON, type RatingEntry } from '../../utils/affinities';
import { loadAffinityEntries } from '../../services/affinities';

/**
 * L'onglet Amis des statistiques : ton jumeau ciné, ton accord avec chacun, le
 * film qui vous divise et ceux sur lesquels vous êtes d'accord. Tout vient des
 * notes de tes espaces (voir utils/affinities.ts).
 */
interface Props {
  currentUserId?: string;
  onOpenSpaces?: () => void;
  /** Ouvre l'espace d'où viennent les notes. */
  onOpenSpace?: (spaceId: string) => void;
}

const TINTS = ['#E76F51', '#457B9D', '#8E7DBE', '#2A9D8F', '#E9C46A', '#B45309'];

const Avatar: React.FC<{ name: string; url?: string | null; index: number; size?: number; me?: boolean }> = ({ name, url, index, size = 36, me }) => {
  const src = avatarSrc(url ?? null);
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center overflow-hidden rounded-full font-black ${me ? 'bg-bitter-lime text-charcoal' : 'text-white'}`}
      style={{ width: size, height: size, fontSize: size * 0.4, background: me ? undefined : TINTS[index % TINTS.length] }}
    >
      {src ? <img src={src} alt="" className="h-full w-full object-cover" /> : (name || '?')[0].toUpperCase()}
    </span>
  );
};

const Head: React.FC<{ title: string; aside?: string }> = ({ title, aside }) => (
  <div className="flex items-baseline justify-between gap-3 px-1">
    <h3 className="text-[19px] font-black tracking-[-0.04em] text-charcoal dark:text-white">{title}</h3>
    {aside && <small className="whitespace-nowrap text-[11px] font-extrabold text-stone-400 dark:text-white/35">{aside}</small>}
  </div>
);

const card = 'rounded-[24px] border border-sand bg-white dark:border-white/[0.08] dark:bg-[#1C1B19]';

export default function FriendsTab({ currentUserId, onOpenSpaces, onOpenSpace }: Props) {
  const { t } = useLanguage();
  const [state, setState] = useState<{ loading: boolean; spaces: number; entries: RatingEntry[] }>({ loading: true, spaces: 0, entries: [] });

  useEffect(() => {
    if (!currentUserId) {
      setState({ loading: false, spaces: 0, entries: [] });
      return;
    }
    let alive = true;
    loadAffinityEntries(currentUserId)
      .then((res) => alive && setState({ loading: false, ...res }))
      .catch(() => alive && setState({ loading: false, spaces: 0, entries: [] }));
    return () => {
      alive = false;
    };
  }, [currentUserId]);

  const report = useMemo(() => (currentUserId ? computeAffinities(currentUserId, state.entries) : null), [currentUserId, state.entries]);
  const indexOf = (id: string) => Math.max(0, report?.friends.findIndex((f) => f.personId === id) ?? 0);

  if (state.loading) {
    return (
      <div className="flex justify-center py-16 text-stone-400">
        <Loader2 className="animate-spin" size={22} />
      </div>
    );
  }

  if (!report || !report.friends.length) {
    return (
      <section className={`${card} p-6 text-center`}>
        <h3 className="text-[20px] font-black tracking-[-0.04em] text-charcoal dark:text-white">
          {state.spaces ? t('friends.notYetTitle') : t('friends.emptyTitle')}
        </h3>
        <p className="mt-2 text-[13px] font-semibold leading-relaxed text-stone-500 dark:text-stone-400">
          {state.spaces ? t('friends.notYetSub', { n: String(MIN_COMMON) }) : t('friends.emptySub')}
        </p>
        {onOpenSpaces && (
          <button
            type="button"
            onClick={() => {
              haptics.soft();
              onOpenSpaces();
            }}
            className="mt-4 h-11 rounded-full bg-charcoal px-5 text-[13px] font-black text-white active:scale-95 dark:bg-white dark:text-charcoal"
          >
            {t('friends.openSpaces')}
          </button>
        )}
      </section>
    );
  }

  const twin = report.friends[0];
  const go = (spaceId: string) => {
    if (!onOpenSpace) return;
    haptics.soft();
    onOpenSpace(spaceId);
  };
  return (
    <div className="flex flex-col gap-7 animate-[fadeIn_0.3s_ease-out]">
      <section className="flex flex-col gap-3">
        <Head title={t('friends.twin')} aside={t(state.spaces > 1 ? 'friends.spacesMany' : 'friends.spacesOne', { n: String(state.spaces) })} />
        <div className="rounded-[28px] bg-charcoal p-5 text-white">
          <div className="flex items-center gap-3">
            <span className="flex">
              <Avatar name="Moi" index={0} size={52} me />
              <span className="-ml-3">
                <Avatar name={twin.name} url={twin.avatarUrl} index={0} size={52} />
              </span>
            </span>
            <span className="min-w-0">
              <b className="block truncate text-[21px] font-black tracking-[-0.04em]">{twin.name}</b>
              <small className="text-[12px] font-bold text-white/65">{t('friends.common', { n: String(twin.common) })}</small>
            </span>
            <b className="ml-auto whitespace-nowrap text-[38px] font-black tracking-[-0.07em] text-bitter-lime">{twin.score} %</b>
          </div>
          <p className="mt-3.5 text-[13px] font-semibold leading-snug text-white/80">
            {t('friends.twinLine', { gap: fmt1(twin.gap) })}{' '}
            {Math.abs(twin.generosity) >= 0.3 &&
              t(twin.generosity > 0 ? 'friends.kinder' : 'friends.harsher', { name: twin.name, gap: fmt1(Math.abs(twin.generosity)) })}
          </p>
          {onOpenSpace && (
            <button type="button" onClick={() => go(twin.spaceId)} className="mt-4 h-10 rounded-full bg-white/10 px-4 text-[12px] font-black text-white active:scale-95">
              {t('friends.goSpace', { space: twin.spaceName })}
            </button>
          )}
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <Head title={t('friends.affinities')} aside={t('friends.affinitiesAside')} />
        <ul className={`${card} px-4 py-1`}>
          {report.friends.map((f, i) => (
            <li key={f.personId} className="border-t border-sand first:border-t-0 dark:border-white/10">
              <button
                type="button"
                onClick={() => go(f.spaceId)}
                aria-label={t('friends.openSpace', { space: f.spaceName })}
                className="flex w-full items-center gap-3 py-2.5 text-left active:opacity-80"
              >
              <Avatar name={f.name} url={f.avatarUrl} index={i} />
              <span className="min-w-0 flex-1">
                <b className="block truncate text-[14px] font-black text-charcoal dark:text-white">{f.name}</b>
                <small className="block truncate text-[11px] font-bold text-stone-500 dark:text-stone-400">
                  {t('friends.commonShort', { n: String(f.common) })} · <span className="text-forest dark:text-bitter-lime">{f.spaceName}</span>
                </small>
              </span>
              <span aria-hidden="true" className="h-2 w-20 overflow-hidden rounded-full bg-sand dark:bg-white/10">
                <span className={`block h-full rounded-full ${f.score >= 80 ? 'bg-forest dark:bg-bitter-lime' : 'bg-charcoal dark:bg-white'}`} style={{ width: `${f.score}%` }} />
              </span>
              <b className="w-11 text-right text-[14px] font-black tabular-nums text-charcoal dark:text-white">{f.score} %</b>
              </button>
            </li>
          ))}
        </ul>
      </section>

      {report.divider && (
        <section className="flex flex-col gap-3">
          <Head title={t('friends.divider')} aside={report.divider.spaceName} />
          <div className={`${card} flex items-center gap-3.5 p-3.5`}>
            {report.divider.posterUrl && (
              <img src={resizeTmdbImage(report.divider.posterUrl, 'w185')} alt="" className="h-[111px] w-[74px] shrink-0 -rotate-3 rounded-xl object-cover shadow-[0_8px_18px_rgba(26,26,26,0.16)]" />
            )}
            <div className="min-w-0 flex-1">
              <b className="block truncate text-[17px] font-black tracking-[-0.03em] text-charcoal dark:text-white">{report.divider.title}</b>
              <div className="mt-2.5 flex items-center gap-2">
                <Avatar name="Moi" index={0} size={26} me />
                <b className={`text-[18px] font-black ${report.divider.mine < report.divider.theirs ? 'text-[#C2630F] dark:text-[#F08A24]' : 'text-forest dark:text-bitter-lime'}`}>{fmt1(report.divider.mine)}</b>
                <span className="h-0.5 flex-1 bg-sand dark:bg-white/10" />
                <b className={`text-[18px] font-black ${report.divider.theirs < report.divider.mine ? 'text-[#C2630F] dark:text-[#F08A24]' : 'text-forest dark:text-bitter-lime'}`}>{fmt1(report.divider.theirs)}</b>
                <Avatar name={report.divider.friend.name} url={report.divider.friend.avatarUrl} index={indexOf(report.divider.friend.id)} size={26} />
              </div>
              <p className="mt-2 text-[12px] font-bold text-stone-500 dark:text-stone-400">
                {t('friends.dividerLine', { gap: fmt1(Math.abs(report.divider.mine - report.divider.theirs)), name: report.divider.friend.name })}
              </p>
            </div>
          </div>
          {onOpenSpace && (
            <button
              type="button"
              onClick={() => go(report.divider!.spaceId)}
              className="h-11 rounded-[14px] bg-charcoal text-[12px] font-black text-white active:scale-[0.98] dark:bg-white dark:text-charcoal"
            >
              {t('friends.debate', { space: report.divider.spaceName })}
            </button>
          )}
        </section>
      )}

      {report.agreed.length > 0 && (
        <section className="flex flex-col gap-3">
          <Head title={t('friends.agreed')} />
          <div className="grid grid-cols-3 gap-2.5">
            {report.agreed.map((f) => (
              <div key={f.key} className="flex min-w-0 flex-col gap-1.5">
                {f.posterUrl ? (
                  <img src={resizeTmdbImage(f.posterUrl, 'w342')} alt="" className="aspect-[2/3] w-full rounded-2xl object-cover shadow-[0_8px_18px_rgba(26,26,26,0.16)]" />
                ) : (
                  <span className="block aspect-[2/3] w-full rounded-2xl bg-sand dark:bg-white/5" />
                )}
                <b className="truncate text-[12px] font-black text-charcoal dark:text-white">{f.title}</b>
                <small className="-mt-1 truncate text-[11px] font-bold text-stone-500 dark:text-stone-400">
                  {t('friends.agreedLine', { name: f.friend.name, mine: fmt1(f.mine), theirs: fmt1(f.theirs) })}
                </small>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
