import React, { useEffect, useMemo, useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import { btnIcon, chip, field, sectionLabel } from '../utils/ui';
import { CockpitContact, CockpitSnapshot, loadCockpit } from '../services/cockpit';
import Campaigns from './Campaigns';

/**
 * Le cockpit, en lecture seule : vue d'ensemble, contacts, fiche.
 * Les chiffres arrivent calculés du serveur ; cet écran ne fait que les montrer.
 */

type Status = CockpitContact['status'];
type Filter = 'all' | Status;

const STATUS: Record<Status, { label: string; className: string }> = {
  active: { label: 'Actif', className: 'bg-white text-charcoal' },
  asleep: { label: 'Endormi', className: 'bg-forest text-white' },
  trial: { label: 'Essai sans suite', className: 'border border-white/25 text-stone-300' },
  never: { label: 'Jamais noté', className: 'border border-dashed border-white/30 text-stone-300' },
};

const card = 'rounded-3xl bg-[#1A1A19] p-5';
const dayMonth = (value: string | null) =>
  value ? new Date(value).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—';
const plural = (count: number, word: string) => `${count} ${word}${count > 1 ? 's' : ''}`;

const useRoute = () => {
  const [hash, setHash] = useState(window.location.hash);
  useEffect(() => {
    const update = () => {
      setHash(window.location.hash);
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', update);
    return () => window.removeEventListener('hashchange', update);
  }, []);
  return hash.replace(/^#\/?/, '').split('/');
};

const Badge: React.FC<{ status: Status }> = ({ status }) => (
  <span className={`inline-flex h-[26px] items-center whitespace-nowrap rounded-full px-2.5 text-[11px] font-extrabold ${STATUS[status].className}`}>
    {STATUS[status].label}
  </span>
);

const Tile: React.FC<{ label: string; value: React.ReactNode; note?: string }> = ({ label, value, note }) => (
  <div className="flex flex-col gap-1.5 rounded-[22px] bg-[#1A1A19] px-[18px] py-4">
    <div className={sectionLabel}>{label}</div>
    <div className="text-4xl font-black leading-none tracking-[-0.04em] text-white">{value}</div>
    {note && <div className="text-xs font-bold leading-snug text-stone-300">{note}</div>}
  </div>
);

const Header: React.FC<{ title: string; subtitle: string }> = ({ title, subtitle }) => (
  <header className="flex flex-col gap-1">
    <h1 className="m-0 text-[34px] font-black leading-[1.05] tracking-[-0.035em]">{title}</h1>
    <div className="text-[13px] font-bold text-stone-400">{subtitle}</div>
  </header>
);

const Overview: React.FC<{ data: CockpitSnapshot }> = ({ data }) => {
  const { kpis, funnel, groups, ai } = data;
  const peak = Math.max(1, ...data.days.map((day) => day.count));
  const steps = [
    { label: 'Compte créé', value: funnel.created, lost: funnel.created - funnel.firstNote, verb: 's’arrêtent' },
    { label: 'Première note', value: funnel.firstNote, lost: funnel.firstNote - funnel.fiveNotes, verb: 's’arrêtent' },
    { label: '5 notes', value: funnel.fiveNotes, lost: funnel.fiveNotes - funnel.stillHere, verb: 'inactifs' },
    { label: 'Encore là ce mois-ci', value: funnel.stillHere, lost: 0, verb: '' },
  ];
  const todo = [
    { label: 'Jamais noté', note: `dont ${groups.neverNew} inscrits ce mois-ci`, value: groups.never },
    { label: 'Endormis', note: `5 notes ou plus, rien depuis 30 jours · ${groups.asleepWithEmail} ont un e-mail`, value: groups.asleep },
    { label: 'Essai sans suite', note: 'moins de 5 notes, rien depuis 30 jours', value: groups.trial },
    { label: 'Séance sans note', note: `${plural(groups.screenings, 'séance')} ce mois-ci`, value: groups.screeningsUnrated },
  ];

  return (
    <>
      <Header title="Vue d’ensemble" subtitle={`30 derniers jours · ${plural(data.excludedTests, 'compte')} de test exclu${data.excludedTests > 1 ? 's' : ''}`} />
      <section aria-label="Chiffres clés" className="grid grid-cols-[repeat(auto-fit,minmax(160px,1fr))] gap-2.5">
        <Tile label="Comptes réels" value={kpis.accounts} />
        <Tile label="Actifs" value={kpis.active30} note={`${kpis.othersActive30} sans te compter`} />
        <Tile label="Notes" value={kpis.notes30} note={`dont ${kpis.ownerNotes30} de toi`} />
        <Tile label="Notes en 7 j" value={kpis.notes7} note={plural(kpis.people7, 'personne')} />
        <Tile label="Nouveaux" value={kpis.newcomers} note={`dont ${kpis.newcomersSilent} sans aucune note`} />
        <Tile label="Accords e-mail" value={kpis.consents} note="pour les campagnes" />
        <Tile label="Push actifs" value={kpis.pushActive} note="personnes abonnées" />
      </section>

      <div className="flex flex-wrap gap-3">
        <section className={`${card} flex min-w-0 flex-[3_1_420px] flex-col gap-3.5`}>
          <h2 className="m-0 text-lg font-black tracking-[-0.02em]">Notes par jour</h2>
          <div role="img" aria-label={`Notes par jour : ${kpis.notes30} sur 30 jours`} className="flex h-[170px] items-end gap-1">
            {data.days.map((day) => (
              <div
                key={day.date}
                title={`${dayMonth(day.date)} : ${day.count}`}
                className={`min-w-0 flex-1 rounded-md ${day.count ? 'bg-white' : 'bg-white/10'}`}
                style={{ height: day.count ? `${16 + (day.count / peak) * 150}px` : '8px' }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs font-bold text-stone-400">
            <span>{dayMonth(data.days[0]?.date)}</span>
            <span>{dayMonth(data.days[data.days.length - 1]?.date)}</span>
          </div>
        </section>

        <section className={`${card} flex min-w-0 flex-[2_1_320px] flex-col gap-2.5`}>
          <h2 className="m-0 mb-1 text-lg font-black tracking-[-0.02em]">Où ils décrochent</h2>
          {steps.map((step, index) => (
            <div key={step.label} className="flex flex-col gap-1">
              <div className="flex justify-between gap-2.5 text-[13px] font-extrabold">
                <span>{step.label}</span>
                {step.lost > 0 && <span className="text-stone-400">{step.lost} {step.verb}</span>}
              </div>
              <div
                className={`flex h-10 min-w-[54px] items-center rounded-xl px-3.5 text-xl font-black ${index === steps.length - 1 ? 'bg-white text-charcoal' : 'bg-forest text-white'}`}
                style={{ width: `${funnel.created ? (step.value / funnel.created) * 100 : 0}%` }}
              >
                {step.value}
              </div>
            </div>
          ))}
        </section>
      </div>

      <div className="flex flex-wrap gap-3">
        <section className={`${card} flex min-w-0 flex-[1_1_300px] flex-col`}>
          <h2 className="m-0 mb-2.5 text-lg font-black tracking-[-0.02em]">À traiter</h2>
          {todo.map((item) => (
            <a key={item.label} href="#/contacts" className="flex min-h-[58px] items-center justify-between gap-3.5 border-t border-white/10 py-2 text-white no-underline">
              <span className="flex min-w-0 flex-col gap-0.5">
                <b className="text-sm font-black">{item.label}</b>
                <span className="text-xs font-bold text-stone-400">{item.note}</span>
              </span>
              <span className="text-2xl font-black tracking-[-0.03em]">{item.value}</span>
            </a>
          ))}
        </section>

        <section className={`${card} flex min-w-0 flex-[1_1_300px] flex-col`}>
          <h2 className="m-0 mb-2.5 text-lg font-black tracking-[-0.02em]">Dernières notes</h2>
          {data.activity.map((item, index) => (
            <div key={`${item.date}-${index}`} className="flex min-h-12 items-center gap-3 border-t border-white/10 py-1">
              <span className="w-[42px] shrink-0 text-xs font-extrabold text-stone-400">{dayMonth(item.date)}</span>
              <span className="flex min-w-0 flex-col">
                <b className="truncate text-[13px] font-extrabold">{item.title}</b>
                <span className="text-xs font-bold text-stone-400">{item.who}</span>
              </span>
            </div>
          ))}
        </section>

        <section className="flex min-w-0 flex-[1_1_240px] flex-col gap-2.5 rounded-3xl bg-forest p-5">
          <h2 className="m-0 text-[10px] font-black uppercase tracking-[0.16em] text-stone-200">Appels IA</h2>
          <div className="text-[52px] font-black leading-none tracking-[-0.05em]">{ai.total}</div>
          <div role="img" aria-label={`${ai.owner} appels sur ${ai.total} viennent de toi`} className="flex h-3 gap-[3px]">
            <div className="rounded-md bg-white" style={{ flex: `${ai.owner} 1 0` }} />
            <div className="rounded-md bg-white/40" style={{ flex: `${ai.total - ai.owner} 1 0` }} />
          </div>
          <div className="text-[13px] font-bold leading-snug text-stone-200">
            {ai.owner} de toi, {ai.total - ai.owner} des autres. Au plus {plural(ai.peak, 'appel')} par jour.
          </div>
        </section>
      </div>
    </>
  );
};

const columns = 'grid grid-cols-[minmax(190px,1.6fr)_130px_90px_70px_110px] items-center gap-3';

const Contacts: React.FC<{ data: CockpitSnapshot }> = ({ data }) => {
  const [filter, setFilter] = useState<Filter>('all');
  const [query, setQuery] = useState('');
  const count = (status: Status) => data.contacts.filter((contact) => contact.status === status).length;
  const filters: { id: Filter; label: string; n: number }[] = [
    { id: 'all', label: 'Tous', n: data.contacts.length },
    { id: 'active', label: 'Actifs', n: count('active') },
    { id: 'asleep', label: 'Endormis', n: count('asleep') },
    { id: 'trial', label: 'Essai sans suite', n: count('trial') },
    { id: 'never', label: 'Jamais noté', n: count('never') },
  ];
  const rows = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return data.contacts.filter(
      (contact) =>
        (filter === 'all' || contact.status === filter) &&
        (!needle || contact.name.toLowerCase().includes(needle) || (contact.email ?? '').toLowerCase().includes(needle))
    );
  }, [data.contacts, filter, query]);

  return (
    <>
      <Header title="Contacts" subtitle={`${rows.length} sur ${data.contacts.length}`} />
      <div className="flex flex-wrap items-center gap-2.5">
        <input
          aria-label="Rechercher une personne"
          placeholder="Rechercher un nom ou un e-mail"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          className={`${field} max-w-[340px] flex-[1_1_240px]`}
        />
        <div role="group" aria-label="Filtrer par statut" className="flex flex-wrap gap-1.5">
          {filters.map((item) => (
            <button key={item.id} type="button" aria-pressed={filter === item.id} onClick={() => setFilter(item.id)} className={chip(filter === item.id)}>
              {item.label} · {item.n}
            </button>
          ))}
        </div>
      </div>
      <section aria-label="Liste des contacts" className="overflow-x-auto rounded-3xl bg-[#1A1A19]">
        <div role="table" aria-label="Contacts" className="min-w-[680px] px-5 py-2">
          <div role="row" className={`${columns} min-h-11 text-[10px] font-black uppercase tracking-[0.14em] text-stone-400`}>
            {['Personne', 'Statut', 'Inscrit', 'Notes', 'Dernière'].map((title) => (
              <span role="columnheader" key={title}>{title}</span>
            ))}
          </div>
          {rows.map((contact) => (
            <div role="row" key={contact.id} className={`${columns} min-h-[54px] border-t border-white/10 text-[13px] font-bold text-stone-300`}>
              <span role="cell" className="min-w-0">
                <a href={`#/contacts/${contact.id}`} className="flex min-h-11 items-center gap-2.5 text-white no-underline">
                  <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-black uppercase">
                    {contact.name.charAt(0)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-extrabold">{contact.isOwner ? `${contact.name} (toi)` : contact.name}</span>
                    <span className="block truncate text-xs font-semibold text-stone-400">{contact.email ?? 'Sans e-mail'}</span>
                  </span>
                </a>
              </span>
              <span role="cell"><Badge status={contact.status} /></span>
              <span role="cell">{dayMonth(contact.joined)}</span>
              <span role="cell" className="font-black text-white">{contact.notes}</span>
              <span role="cell">{dayMonth(contact.lastNote)}</span>
            </div>
          ))}
          {rows.length === 0 && <div className="border-t border-white/10 py-6 text-sm font-bold text-stone-300">Personne ici.</div>}
        </div>
      </section>
    </>
  );
};

const situation = (contact: CockpitContact): string => {
  const since = dayMonth(contact.lastNote);
  if (contact.status === 'active') return `${plural(contact.notes30, 'note')} sur les 30 derniers jours.`;
  if (contact.status === 'never') return contact.added30 > 0 ? 'A ajouté des films, mais n’a encore rien noté.' : 'Compte créé, aucune note pour l’instant.';
  return contact.added30 > 0 ? `Ajoute encore des films, mais n’a rien noté depuis le ${since}.` : `Plus aucune note depuis le ${since}.`;
};

const ContactSheet: React.FC<{ contact?: CockpitContact }> = ({ contact }) => {
  if (!contact) return <Header title="Contact introuvable" subtitle="Ce compte n’existe plus ou est exclu." />;
  const history = [
    contact.added30 > 0 ? { date: 'Ce mois-ci', text: `${plural(contact.added30, 'film')} ajouté${contact.added30 > 1 ? 's' : ''}` } : null,
    contact.lastNote ? { date: dayMonth(contact.lastNote), text: 'Dernière note' } : null,
    { date: dayMonth(contact.joined), text: 'Création du compte' },
  ].filter(Boolean) as { date: string; text: string }[];

  return (
    <>
      <header className="flex items-center gap-3.5">
        <a href="#/contacts" aria-label="Retour aux contacts" className={btnIcon}><ChevronLeft size={18} /></a>
        <div className="flex min-w-0 flex-col gap-1">
          <h1 className="m-0 truncate text-[34px] font-black leading-[1.05] tracking-[-0.035em]">{contact.name}</h1>
          <div className="truncate text-[13px] font-bold text-stone-400">
            {contact.email ?? 'Sans e-mail'}{contact.email && !contact.confirmed ? ' · non confirmé' : ''} · inscrit le {dayMonth(contact.joined)}
          </div>
        </div>
      </header>
      <section className="flex flex-col gap-2 rounded-[28px] bg-forest p-[22px]">
        <div><Badge status={contact.status} /></div>
        <p className="m-0 text-[28px] font-black leading-[1.1] tracking-[-0.03em]">{situation(contact)}</p>
      </section>
      <section aria-label="Chiffres de la personne" className="grid grid-cols-[repeat(auto-fit,minmax(140px,1fr))] gap-2.5">
        <Tile label="Notes" value={contact.notes} />
        <Tile label="Films suivis" value={contact.films} />
        <Tile label="Ajouts en 30 j" value={contact.added30} />
        <Tile label="Appels IA en 30 j" value={contact.ai30} />
      </section>
      <section className={`${card} flex flex-col`}>
        <h2 className="m-0 mb-2.5 text-lg font-black tracking-[-0.02em]">Historique</h2>
        {history.map((item) => (
          <div key={item.text} className="flex items-baseline gap-3.5 border-t border-white/10 py-3">
            <span className="w-[86px] shrink-0 text-xs font-extrabold text-stone-400">{item.date}</span>
            <span className="text-sm font-bold leading-snug text-white">{item.text}</span>
          </div>
        ))}
      </section>
    </>
  );
};

const NavLink: React.FC<{ href: string; active: boolean; children: React.ReactNode }> = ({ href, active, children }) => (
  <a
    href={href}
    aria-current={active ? 'page' : undefined}
    className={`flex min-h-11 flex-[1_1_150px] items-center justify-between rounded-[14px] px-3 text-sm font-extrabold no-underline ${active ? 'bg-[#1A1A19] text-white' : 'text-stone-300'}`}
  >
    {children}
  </a>
);

const Message: React.FC<{ title: string; text?: string }> = ({ title, text }) => (
  <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-[#0c0c0c] p-6 text-center font-sans text-white">
    <h1 className="m-0 text-2xl font-black tracking-[-0.03em]">{title}</h1>
    {text && <p className="m-0 max-w-sm text-sm font-semibold leading-relaxed text-stone-300">{text}</p>}
    <a href="/" className="mt-3 text-sm font-extrabold text-white underline">Retour à The Bitter</a>
  </div>
);

const CockpitApp: React.FC = () => {
  const [data, setData] = useState<CockpitSnapshot | null>(null);
  const [failure, setFailure] = useState<{ code?: string; message?: string } | null>(null);
  const route = useRoute();

  const refresh = () =>
    loadCockpit().then((result) => {
      if (result.ok && result.data) setData(result.data);
      else setFailure({ code: result.code, message: result.message });
    });

  useEffect(() => {
    void refresh();
  }, []);

  if (failure?.code === 'forbidden') return <Message title="Accès réservé" text="Ouvre le mode admin depuis les réglages de ton profil." />;
  if (failure) return <Message title="Cockpit indisponible" text={failure.message} />;
  if (!data) return <div role="status" className="flex min-h-screen items-center justify-center bg-[#0c0c0c] font-sans text-sm font-bold text-stone-300">Chargement…</div>;

  const inContacts = route[0] === 'contacts';
  const inCampaigns = route[0] === 'campagnes';
  return (
    <div className="flex min-h-screen flex-wrap items-stretch bg-[#0c0c0c] font-sans text-white">
      <aside className="flex flex-[1_1_232px] flex-col gap-[22px] border-r border-white/10 px-4 py-6">
        <div className="flex flex-col gap-[3px] px-3">
          <div className="text-xl font-black tracking-[-0.03em]">The Bitter</div>
          <div className={sectionLabel}>Cockpit</div>
        </div>
        <nav aria-label="Navigation du cockpit" className="flex flex-wrap gap-1">
          <NavLink href="#/" active={!inContacts && !inCampaigns}>Vue d’ensemble</NavLink>
          <NavLink href="#/contacts" active={inContacts}>
            <span>Contacts</span>
            <span className="text-xs text-stone-400">{data.contacts.length}</span>
          </NavLink>
          <NavLink href="#/campagnes" active={inCampaigns}>Campagnes</NavLink>
        </nav>
      </aside>
      <main className="flex min-w-0 max-w-[1240px] flex-[999_1_560px] flex-col gap-4 px-[clamp(16px,3vw,40px)] pb-10 pt-7">
        {!inContacts && !inCampaigns && <Overview data={data} />}
        {inCampaigns && <Campaigns data={data} onSent={() => void refresh()} />}
        {inContacts && !route[1] && <Contacts data={data} />}
        {inContacts && route[1] && <ContactSheet contact={data.contacts.find((contact) => contact.id === route[1])} />}
      </main>
    </div>
  );
};

export default CockpitApp;
