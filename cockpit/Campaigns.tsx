import React, { useEffect, useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, chip, field, sectionLabel } from '../utils/ui';
import { CampaignFormat, CockpitSnapshot, draftCampaign, previewCampaign, sendCampaign, testCampaign } from '../services/cockpit';

type Segment = 'active' | 'never' | 'asleep' | 'trial';
const SEGMENTS: { id: Segment; label: string }[] = [
  { id: 'active', label: 'Actifs' },
  { id: 'never', label: 'Jamais noté' },
  { id: 'asleep', label: 'Endormis' },
  { id: 'trial', label: 'Essai sans suite' },
];
const LABELS: Record<string, string> = { active: 'Actifs', never: 'Jamais noté', asleep: 'Endormis', trial: 'Essai sans suite' };
const FORMATS: { id: CampaignFormat; label: string; subject: string; line: string; segment: Segment }[] = [
  { id: 'wall', label: 'Le mur à noter', subject: 'Des films attendent ta note', line: 'Tu les as ajoutés à ta liste. Tu les as vus ?', segment: 'asleep' },
  { id: 'notes', label: 'Tes notes du mois', subject: 'Ton mois de cinéma en une note', line: '', segment: 'active' },
  { id: 'news', label: 'Quoi de neuf', subject: 'Du nouveau sur The Bitter', line: '', segment: 'never' },
];
const dayMonth = (value: string) => new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
const row = 'flex justify-between gap-3 border-t border-white/10 py-3 text-[13px] font-bold text-stone-300';
const textarea = 'w-full resize-y rounded-2xl border border-white/10 bg-[#0c0c0c] px-4 py-3.5 text-sm font-semibold leading-relaxed text-white outline-none focus:border-bitter-lime';

const Campaigns: React.FC<{ data: CockpitSnapshot; onSent: () => void }> = ({ data, onSent }) => {
  const [format, setFormat] = useState<CampaignFormat>('wall');
  const [segment, setSegment] = useState<Segment>(FORMATS[0].segment);
  const [subject, setSubject] = useState(FORMATS[0].subject);
  const [body, setBody] = useState(FORMATS[0].line);
  const [preview, setPreview] = useState('');
  const [previewError, setPreviewError] = useState('');
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [confirming, setConfirming] = useState(false);

  const members = useMemo(() => data.contacts.filter((contact) => contact.status === segment), [data.contacts, segment]);
  const accepted = members.filter((contact) => contact.consent === true);
  const reachable = members.filter((contact) => contact.canReceive);
  const contacted = members.filter((contact) => contact.contacted14).length;
  const valid = !!subject.trim();

  // L'aperçu est le vrai e-mail, construit par le serveur.
  useEffect(() => {
    if (!valid) return;
    let alive = true;
    const timer = setTimeout(async () => {
      const result = await previewCampaign(format, segment, subject, body);
      if (!alive) return;
      setPreview(result.ok && result.data ? result.data.html : '');
      setPreviewError(result.ok ? '' : result.message ?? 'Aperçu indisponible.');
    }, 500);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [format, segment, subject, body, valid]);

  const chooseFormat = (id: CampaignFormat) => {
    const next = FORMATS.find((item) => item.id === id)!;
    setFormat(id);
    setSegment(next.segment);
    setSubject(next.subject);
    setBody(next.line);
    setConfirming(false);
  };

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
      const result = await testCampaign(format, subject, body);
      setNotice(result.ok ? 'Test envoyé sur ton adresse.' : result.message ?? 'Test impossible.');
    });
  const send = () =>
    run('send', async () => {
      const result = await sendCampaign(format, segment, subject, body);
      setConfirming(false);
      if (result.ok && result.data) {
        const { sent, failed, skipped } = result.data;
        setNotice(`${sent} envoyé${sent > 1 ? 's' : ''}${failed ? `, ${failed} en échec` : ''}${skipped ? `, ${skipped} sans contenu pour ce format` : ''}.`);
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
            <div className={sectionLabel}>Format</div>
            <div role="group" aria-label="Format de l’e-mail" className="flex flex-wrap gap-1.5">
              {FORMATS.map((item) => (
                <button key={item.id} type="button" aria-pressed={format === item.id} className={chip(format === item.id)} onClick={() => chooseFormat(item.id)}>{item.label}</button>
              ))}
            </div>
          </div>
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
            <span className={sectionLabel}>Phrase d’accroche (facultative)</span>
            <textarea rows={3} maxLength={400} value={body} onChange={(event) => setBody(event.target.value)} className={textarea} />
          </label>
          <div className="flex flex-col gap-1.5">
            <div role="group" aria-label="Rédaction assistée" className="flex flex-wrap gap-1.5">
              <button type="button" disabled={!!busy} className={chip(true)} onClick={() => draft('write')}>{busy === 'write' ? 'Rédaction…' : 'Rédiger avec l’IA'}</button>
              <button type="button" disabled={!!busy || !body.trim()} className={chip(false)} onClick={() => draft('shorter')}>Plus court</button>
              <button type="button" disabled={!!busy || !body.trim()} className={chip(false)} onClick={() => draft('warmer')}>Plus chaleureux</button>
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

        <section aria-label="Aperçu de l’e-mail" className="min-w-0 flex-[1_1_360px] overflow-hidden rounded-[20px] bg-[#1A1A19]">
          {preview ? (
            <iframe title="Aperçu de l’e-mail" srcDoc={preview} sandbox="" className="block h-[760px] w-full border-0" />
          ) : (
            <div className="flex h-[300px] items-center justify-center p-6 text-center text-sm font-bold text-stone-300">{previewError || 'Préparation de l’aperçu…'}</div>
          )}
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
