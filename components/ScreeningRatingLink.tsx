import React from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { CinemaScreening, Movie } from '../types';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { ratingOf } from '../utils/ratingHistory';

export default function ScreeningRatingLink({ screening, movie, busy, error, onConfirm, onOther, onLater, onClose }: {
  screening: CinemaScreening; movie: Movie; busy: boolean; error: boolean;
  onConfirm: () => void; onOther: () => void; onLater: () => void; onClose: () => void;
}) {
  const { t, language } = useLanguage();
  const close = () => { if (!busy) onClose(); };
  const dialog = useDialog(close, t('lifecycle.linkTitle'));
  const date = new Intl.DateTimeFormat(language === 'fr' ? 'fr-FR' : 'en-GB', {
    day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris',
  }).format(screening.startsAt);
  return createPortal(<div {...dialog.props} className="fixed inset-0 z-[160] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={close}>
    <div onClick={event => event.stopPropagation()} className="max-h-[90dvh] w-full max-w-md overflow-y-auto rounded-t-[2.5rem] bg-cream p-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] text-charcoal dark:bg-[#161616] dark:text-white">
      <header className="flex items-center justify-between gap-4"><h2 className="text-2xl font-black">{t('lifecycle.linkTitle')}</h2><button type="button" onClick={close} disabled={busy} aria-label={t('common.close')}><X size={20} /></button></header>
      <p className="mt-5 font-bold">{movie.title} · {ratingOf(movie) ?? '—'}/10</p>
      <p className="mt-2 text-sm text-stone-500">{t('lifecycle.linkQuestion', { date })}</p>
      {error && <p role="alert" className="mt-3 text-sm text-orange-600">{t('lifecycle.cancelError')}</p>}
      <div className="mt-6 flex flex-col gap-3">
        <button type="button" disabled={busy} onClick={onConfirm} className="rounded-full bg-bitter-lime px-4 py-3 font-bold text-charcoal disabled:opacity-50">{t('lifecycle.linkYes')}</button>
        <button type="button" disabled={busy} onClick={onOther} className="rounded-full border border-stone-300 px-4 py-3 text-sm font-bold disabled:opacity-50">{t('lifecycle.linkOther')}</button>
        <button type="button" disabled={busy} onClick={onLater} className="py-2 text-xs font-bold text-stone-500">{t('lifecycle.later')}</button>
      </div>
    </div>
  </div>, document.body);
}
