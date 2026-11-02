import React, { useEffect, useState } from 'react';
import { CalendarSync, Check, Copy, Loader2, Send } from 'lucide-react';
import ActionSheet from './ActionSheet';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { agendaLinks, getAgendaToken } from '../services/calendarFeed';

/**
 * « Synchroniser mon agenda » : le lien d'abonnement iCal du compte. L'ajouter
 * au Calendrier, le copier pour Google Agenda, l'envoyer à un proche, ou le
 * changer pour couper l'ancien.
 */
export default function AgendaSyncSheet({ onClose }: { onClose: () => void }) {
  const { t } = useLanguage();
  const [token, setToken] = useState<string | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'error'>('loading');
  const [copied, setCopied] = useState(false);
  const [confirmRotate, setConfirmRotate] = useState(false);

  const load = async (rotate = false) => {
    setState('loading');
    const next = await getAgendaToken(rotate);
    setToken(next);
    setState(next ? 'ready' : 'error');
  };

  useEffect(() => {
    load();
  }, []);

  const links = token ? agendaLinks(token) : null;

  const copy = async () => {
    if (!links) return;
    try {
      await navigator.clipboard.writeText(links.https);
      haptics.soft();
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Sans presse-papiers, le lien reste lisible juste en dessous.
    }
  };

  const send = async () => {
    if (!links) return;
    haptics.soft();
    if (navigator.share) {
      try {
        await navigator.share({ title: t('agenda.shareTitle'), text: t('agenda.shareText'), url: links.https });
        return;
      } catch {
        return; // partage annulé
      }
    }
    copy();
  };

  const row =
    'flex min-h-14 w-full items-center gap-3 rounded-2xl border border-sand bg-white p-4 text-left text-sm font-black active:scale-[0.99] dark:border-white/10 dark:bg-white/5';

  return (
    <ActionSheet title={t('agenda.title')} subtitle={t('agenda.subtitle')} onClose={onClose}>
      {state === 'loading' ? (
        <div className="flex justify-center py-8 text-stone-400">
          <Loader2 className="animate-spin" size={22} />
        </div>
      ) : state === 'error' || !links ? (
        <p className="rounded-2xl bg-sand p-4 text-sm font-semibold text-stone-600 dark:bg-white/5 dark:text-stone-300">{t('agenda.error')}</p>
      ) : (
        <div className="space-y-2.5">
          <a
            href={links.webcal}
            onClick={() => haptics.medium()}
            className="flex min-h-16 w-full items-center gap-3 rounded-2xl bg-forest p-4 text-left text-white active:scale-[0.99] dark:bg-[#a9c78a] dark:text-[#172111]"
          >
            <CalendarSync size={22} />
            <span className="flex flex-col">
              <b className="text-[15px] font-black">{t('agenda.add')}</b>
              <small className="text-[11px] font-semibold opacity-80">{t('agenda.addHint')}</small>
            </span>
          </a>
          <button type="button" onClick={copy} className={row}>
            {copied ? <Check size={18} className="text-forest dark:text-bitter-lime" /> : <Copy size={18} />}
            {copied ? t('agenda.copied') : t('agenda.copy')}
          </button>
          <button type="button" onClick={send} className={row}>
            <Send size={18} />
            <span className="flex flex-col">
              {t('agenda.send')}
              <small className="text-[11px] font-semibold text-stone-500 dark:text-stone-400">{t('agenda.sendHint')}</small>
            </span>
          </button>
          <p className="px-1 pt-2 text-[11.5px] font-medium leading-relaxed text-stone-500 dark:text-stone-400">{t('agenda.google')}</p>
          <p className="break-all px-1 font-mono text-[10.5px] text-stone-400">{links.https}</p>
          <div className="border-t border-sand pt-3 dark:border-white/10">
            {confirmRotate ? (
              <div className="flex items-center justify-between gap-3">
                <span className="text-[12px] font-semibold text-stone-600 dark:text-stone-300">{t('agenda.rotateConfirm')}</span>
                <span className="flex shrink-0 gap-2">
                  <button type="button" onClick={() => setConfirmRotate(false)} className="min-h-10 rounded-full px-3 text-[12px] font-black text-stone-500">
                    {t('common.cancel')}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setConfirmRotate(false);
                      load(true);
                    }}
                    className="min-h-10 rounded-full bg-charcoal px-4 text-[12px] font-black text-white dark:bg-white dark:text-charcoal"
                  >
                    {t('agenda.rotate')}
                  </button>
                </span>
              </div>
            ) : (
              <button type="button" onClick={() => setConfirmRotate(true)} className="min-h-10 text-[12px] font-black text-stone-500 underline underline-offset-4">
                {t('agenda.rotate')}
              </button>
            )}
          </div>
        </div>
      )}
    </ActionSheet>
  );
}
