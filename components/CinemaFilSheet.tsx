import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUpRight, Flag, Loader2, Trash2, X } from 'lucide-react';
import { useDialog } from '../utils/useDialog';
import { useLanguage } from '../contexts/LanguageContext';
import { FilItem } from '../utils/cinemaFil';
import { addFilComment, deleteFilComment, FilComment, getFilComments } from '../services/cinemaFil';
import { ReportTarget, useBlockedUsers } from '../services/moderation';
import ReportSheet from './ReportSheet';

export const FilSheet: React.FC<{ title: string; onClose: () => void; children: React.ReactNode }> = ({ title, onClose, children }) => {
  const dialog = useDialog(onClose, title);
  const { t } = useLanguage();
  return createPortal(<div {...dialog.props} className="fixed inset-0 z-[85] flex items-end justify-center bg-black/60 backdrop-blur-sm" onClick={onClose}>
    <div onClick={e => e.stopPropagation()} className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-t-[2.5rem] bg-cream px-6 pb-[calc(env(safe-area-inset-bottom,0px)+24px)] pt-3 text-charcoal dark:bg-[#0c0c0c] dark:text-white">
      <div className="mx-auto mb-5 h-1 w-10 rounded-full bg-stone-300 dark:bg-stone-700" />
      <header className="mb-5 flex items-center justify-between gap-4"><h2 className="text-2xl font-black tracking-tighter">{title}</h2><button type="button" onClick={onClose} aria-label={t('common.close')} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-100 dark:bg-white/10"><X size={16} /></button></header>
      {children}
    </div>
  </div>, document.body);
};

export const FilComments: React.FC<{ item: FilItem; profileId: string; onClose: () => void; onChanged: () => void }> = ({ item, profileId, onClose, onChanged }) => {
  const { t, language } = useLanguage();
  const blocked = useBlockedUsers();
  const [rows, setRows] = useState<FilComment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [more, setMore] = useState(false);
  const [report, setReport] = useState<ReportTarget | null>(null);
  const load = async (append = false) => {
    setLoading(true); setError(undefined);
    try {
      const result = await getFilComments(item.id, append ? rows.at(-1)?.createdAt : undefined);
      setError(result.error);
      setMore(result.data.length === 30);
      setRows(current => append ? [...current, ...result.data.filter(r => !current.some(c => c.id === r.id))] : result.data);
    } catch { setError('cineFil.commentsError'); }
    finally { setLoading(false); }
  };
  useEffect(() => {
    let alive = true;
    getFilComments(item.id).then(result => { if (alive) { setRows(result.data); setError(result.error); setMore(result.data.length === 30); } })
      .catch(() => { if (alive) setError('cineFil.commentsError'); }).finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, [item.id]);
  const send = async (event: React.FormEvent) => {
    event.preventDefault(); if (!body.trim() || sending) return;
    setSending(true); setError(undefined);
    try {
      const result = await addFilComment(profileId, item.id, body);
      if (result.error) setError(result.error);
      else { setBody(''); await load(); onChanged(); }
    } catch { setError('cineFil.writeError'); }
    finally { setSending(false); }
  };
  const remove = async (row: FilComment) => {
    try {
      const result = await deleteFilComment(profileId, row.id);
      if (result.error) setError(result.error);
      else { setRows(current => current.filter(r => r.id !== row.id)); onChanged(); }
    } catch { setError('cineFil.writeError'); }
  };
  return <>
    <FilSheet title={t('cineFil.commentsTitle')} onClose={onClose}>
      <p className="mb-4 text-xs font-bold text-stone-400">{item.title}</p>
      {item.kind === 'friend' && <blockquote className="mb-5 rounded-2xl bg-stone-100 p-4 text-sm font-medium leading-relaxed dark:bg-white/5">{item.description}</blockquote>}
      {rows.filter(r => !blocked.has(r.profileId)).map(row => <article key={row.id} className="flex gap-3 border-b border-stone-200/70 py-4 dark:border-white/5">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-forest text-xs font-black text-white">{(row.name || t('cineFil.member'))[0]}</span>
        <div className="min-w-0 flex-1"><b className="text-xs font-black">{row.profileId === profileId ? t('cineFil.you') : row.name || t('cineFil.member')}</b><p className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed">{row.body}</p><small className="mt-2 block text-[10px] text-stone-400">{new Date(row.createdAt).toLocaleDateString(language === 'en' ? 'en-GB' : 'fr-FR')}</small></div>
        {row.profileId === profileId ? <button type="button" aria-label={t('cineFil.deleteComment')} onClick={() => void remove(row)} className="self-start p-1 text-stone-400"><Trash2 size={15} /></button> : <button type="button" aria-label={t('cineFil.reportComment')} className="self-start p-1 text-stone-400" onClick={() => setReport({ contentType: 'feed_item', contentId: row.id, reportedUserId: row.profileId, reportedName: row.name || t('cineFil.member'), snapshot: row.body })}><Flag size={15} /></button>}
      </article>)}
      {loading && <div className="flex justify-center py-5"><Loader2 size={20} className="animate-spin" /></div>}
      {!loading && !rows.length && !error && <p className="py-6 text-sm text-stone-400">{t('cineFil.noComments')}</p>}
      {error && <p role="alert" className="my-4 text-xs font-bold text-orange-600 dark:text-orange-400">{t(error)}</p>}
      {more && <button type="button" onClick={() => void load(true)} disabled={loading} className="my-3 w-full rounded-2xl border border-stone-200 py-3 text-xs font-bold dark:border-white/10">{t('cineFil.moreComments')}</button>}
      <form onSubmit={send} className="mt-5 flex gap-2 border-t border-stone-200 pt-4 dark:border-white/10"><input value={body} onChange={e => setBody(e.target.value)} maxLength={500} aria-label={t('cineFil.commentPlaceholder')} placeholder={t('cineFil.commentPlaceholder')} className="min-w-0 flex-1 rounded-2xl border border-stone-200 bg-white px-4 py-3 text-sm dark:border-white/10 dark:bg-[#1a1a1a]" /><button type="submit" disabled={sending || !body.trim()} aria-label={t('cineFil.sendComment')} className="flex h-12 w-12 items-center justify-center rounded-2xl bg-bitter-lime text-charcoal">{sending ? <Loader2 size={18} className="animate-spin" /> : <ArrowUpRight size={18} />}</button></form>
    </FilSheet>
    {report && <ReportSheet target={report} onClose={() => setReport(null)} onBlocked={() => { setReport(null); onChanged(); }} />}
  </>;
};
