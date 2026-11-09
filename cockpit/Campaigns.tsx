import React, { useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, chip, field, sectionLabel } from '../utils/ui';
import { CockpitSnapshot, draftCampaign, sendCampaign, testCampaign } from '../services/cockpit';

type Segment = 'never' | 'asleep' | 'trial';
const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'never', label: 'Jamais noté' },
  { id: 'asleep', label: 'Endormis' },
  { id: 'trial', label: 'Essai sans suite' },
];
const LABELS: Record<string, string> = { never: 'Jamais noté', asleep: 'Endormis', trial: 'Essai sans suite' };
const STARTER = {
  subject: 'Quel est le dernier film que tu as vu ?',
  body: 'Ton carnet attend ta prochaine note. Pour reprendre, note le dernier film qui t’a marqué : tes goûts et tes recommandations partent de là.',
};
const dayMonth = (value: string) => new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const row = 'flex justify-between gap-3 border-t border-white/10 py-3 text-[13px] font-bold text-stone-300';
const textarea = 'w-full resize-y rounded-2xl border border-white/10 bg-[#0c0c0c] px-4 py-3.5 text-sm font-semibold leading-relaxed text-white outline-none focus:border-bitter-lime';

const Campaigns: React.FC<{ data: CockpitSnapshot; onSent: () => void }> = ({ data, onSent }) => {
  const [segment, setSegment] = useState<Segment>('never');
  const [subject, setSubject] = useState(STARTER.subject);
  const [body, setBody] = useState(STARTER.body);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);

  const members = useMemo(() => data.contacts.filter((contact) => contact.status === segment), [data.contacts, segment]);
  const accepted = members.filter((contact) => contact.consent === true);
  const reachable = members.filter((contact) => contact.canReceive);
  const sample = reachable[0]?.name ?? members[0]?.name ?? 'Inès';
  const contacted = members.filter((contact) => contact.contacted14).length;
  const paragraphs = body.trim().split(/\n\s*\n/).filter(Boolean);
  const valid = !!subject.trim() && !!body.trim();

  const run = async (name: string, action: () => Promise<void>) => {
    setBusy(name);
    setNotice('');
    await action();
    setBusy('');
  };
  const draft = (mode: 'write' | 'shorter' | 'warmer') =>
    run(mode, async () => {
      const result = await draftCampaign(segment, mode, subject, body);
      if (result.ok && result.data) {
        setSubject(result.data.subject);
        setBody(result.data.body);
        setNotice('Brouillon proposé par l’IA : relis-le avant d’envoyer.');
      } else setNotice(result.message ?? 'Brouillon impossible.');
    });
  const test = () =>
    run('test', async () => {
      const result = await testCampaign(subject, body);
      setNotice(result.ok ? 'Test envoyé sur ton adresse.' : result.message ?? 'Test impossible.');
    });
  const send = () =>
    run('send', async () => {
      const result = await sendCampaign(segment, subject, body);
      setConfirming(false);
      if (result.ok && result.data) {
        const { sent, failed } = result.data;
        setNotice(`${sent} envoyé${sent > 1 ? 's' : ''}${failed ? `, ${failed} en échec` : ''}.`);
        onSent();
      } else setNotice(result.message ?? 'Envoi impossible.');
    });

  return (
    <>
      <header className="flex flex-col gap-1">
        <h1 className="m-0 text-[34px] font-black leading-[1.05] tracking-[-0.035em]">Campagnes</h1>
        <div className="text-[13px] font-bold text-stone-400">
          {data.kpis.consents} sur {data.kpis.accounts} ont accepté les e-mails · chaque message est validé à la main
        </div>
      </header>

      <div className="flex flex-wrap items-start gap-3">
        <section aria-label="Préparer le message" className="flex min-w-0 flex-[1_1_360px] flex-col gap-4 rounded-3xl bg-[#1A1A19] p-5">
          <div className="flex flex-col gap-2">
            <div className={sectionLabel}>Destinataires</div>
            <div role="group" aria-label="Groupe" className="flex flex-wrap gap-1.5">
              {SEGMENTS.map((item) => (
                <button key={item.id} type="button" aria-pressed={segment === item.id} className={chip(segment === item.id)} onClick={() => { setSegment(item.id); setConfirming(false); }}>
                  {item.label} · {data.contacts.filter((contact) => contact.status === item.id).length}
                </button>
              ))}
            </div>
          </div>
          <label className="flex flex-col gap-2">
            <span className={sectionLabel}>Objet</span>
            <input value={subject} maxLength={120} onChange={(event) => setSubject(event.target.value)} className={field} />
          </label>
          <label className="flex flex-col gap-2">
            <span className={sectionLabel}>Message</span>
            <textarea rows={6} maxLength={2000} value={body} onChange={(event) => setBody(event.target.value)} className={textarea} />
          </label>
          <div className="flex flex-col gap-1.5">
            <div role="group" aria-label="Rédaction assistée" className="flex flex-wrap gap-1.5">
              <button type="button" disabled={!!busy} className={chip(true)} onClick={() => draft('write')}>{busy === 'write' ? 'Rédaction…' : 'Rédiger avec l’IA'}</button>
              <button type="button" disabled={!!busy || !valid} className={chip(false)} onClick={() => draft('shorter')}>Plus court</button>
              <button type="button" disabled={!!busy || !valid} className={chip(false)} onClick={() => draft('warmer')}>Plus chaleureux</button>
            </div>
            <div className="text-xs font-bold leading-snug text-stone-400">L’IA reçoit seulement la description du groupe, jamais de nom ni d’e-mail.</div>
          </div>
          <div className="flex flex-col">
            <div className={row}><span>Ont accepté les e-mails</span><b className="font-black text-white">{accepted.length} sur {members.length}</b></div>
            <div className={row}><span>Déjà contactés dans les 14 derniers jours</span><b className="font-black text-white">{contacted}</b></div>
            <div className={row}><span>Recevront ce message</span><b className="font-black text-white">{reachable.length}</b></div>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!busy || !valid} onClick={test} className={`${btnSecondary} flex-[1_1_160px]`}>{busy === 'test' ? 'Envoi…' : 'M’envoyer un test'}</button>
            {confirming ? (
              <button type="button" disabled={!!busy} onClick={send} className={`${btnPrimary} flex-[1_1_160px]`}>{busy === 'send' ? 'Envoi…' : `Confirmer : ${reachable.length} e-mail${reachable.length > 1 ? 's' : ''}`}</button>
            ) : (
              <button type="button" disabled={!!busy || !valid || reachable.length === 0} onClick={() => setConfirming(true)} className={`${btnPrimary} flex-[1_1_160px]`}>Envoyer</button>
            )}
          </div>
          {reachable.length === 0 && <div className="text-xs font-bold leading-snug text-stone-400">L’envoi s’active dès qu’au moins une personne de ce groupe a accepté.</div>}
          {notice && <div role="status" className="text-sm font-bold leading-snug text-white">{notice}</div>}
        </section>

        <section aria-label="Aperçu de l’e-mail" className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 rounded-[20px] bg-cream p-6 text-charcoal">
          <div className="text-[11px] font-black uppercase tracking-[0.2em] text-stone-500">The Bitter</div>
          <div className="text-sm font-extrabold">{subject}</div>
          <div className="flex flex-col gap-2 border-t border-stone-200 pt-3">
            <p className="m-0 text-base leading-normal">Salut {sample},</p>
            {paragraphs.map((part, index) => <p key={index} className="m-0 whitespace-pre-line text-[15px] leading-normal text-stone-600">{part}</p>)}
          </div>
          <div className="flex min-h-12 items-center justify-center rounded-full bg-forest text-[15px] font-black text-white">Ouvrir The Bitter</div>
          <p className="m-0 text-center text-xs leading-normal text-stone-500">Tu reçois cet e-mail parce que tu as accepté les nouvelles de The Bitter.<br />Ne plus recevoir ces e-mails</p>
        </section>
      </div>

      <section aria-label="Historique des campagnes" className="overflow-x-auto rounded-3xl bg-[#1A1A19]">
        <div role="table" aria-label="Campagnes envoyées" className="min-w-[640px] px-5 pb-3.5 pt-2">
          <div role="row" className="grid min-h-11 grid-cols-[minmax(180px,1.5fr)_1fr_90px_140px_90px] items-center gap-3 text-[10px] font-black uppercase tracking-[0.14em] text-stone-400">
            {['Campagne', 'Groupe', 'Envoyés', 'Ont noté sous 7 j', 'Désinscrits'].map((title) => <span role="columnheader" key={title}>{title}</span>)}
          </div>
          {data.campaigns.map((campaign) => (
            <div role="row" key={campaign.id} className="grid min-h-[54px] grid-cols-[minmax(180px,1.5fr)_1fr_90px_140px_90px] items-center gap-3 border-t border-white/10 text-[13px] font-bold text-stone-300">
              <span role="cell" className="min-w-0"><b className="block truncate text-sm font-extrabold text-white">{campaign.subject}</b><span className="text-xs text-stone-400">{dayMonth(campaign.createdAt)}</span></span>
              <span role="cell">{LABELS[campaign.segment] ?? campaign.segment}</span>
              <span role="cell" className="font-black text-white">{campaign.sent}</span>
              <span role="cell" className="font-black text-white">{campaign.rated7}</span>
              <span role="cell">{campaign.unsubscribed}</span>
            </div>
          ))}
          {data.campaigns.length === 0 && <div className="border-t border-white/10 py-5 text-sm font-bold text-stone-300">Tes campagnes et leur effet réel s’afficheront ici.</div>}
        </div>
      </section>
    </>
  );
};

export default Campaigns;
