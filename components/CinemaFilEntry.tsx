import React from 'react';
import { ArrowUpRight, Clapperboard } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';

const CinemaFilEntry: React.FC<{ image?: string; onOpen: () => void }> = ({ image, onOpen }) => {
  const { t } = useLanguage();
  return <button type="button" onClick={onOpen} className="relative isolate flex min-h-[230px] w-full flex-col justify-between overflow-hidden rounded-[2rem] bg-charcoal p-6 text-left text-white shadow-lg">
    {image && <img src={image} alt="" className="absolute inset-0 -z-20 h-full w-full object-cover opacity-70" />}
    <div className="absolute inset-0 -z-10 bg-gradient-to-b from-black/20 via-black/10 to-black/95" />
    <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-bitter-lime px-3 py-1.5 text-[9px] font-black uppercase tracking-wider text-charcoal"><Clapperboard size={12} />{t('cineFil.title')}</span>
    <div className="mt-5"><h2 className="max-w-[260px] text-[32px] font-black leading-none tracking-tighter">{t('cineFil.entryTitle')}</h2><p className="mt-3 max-w-[270px] text-xs font-medium leading-relaxed text-white/70">{t('cineFil.entryHint')}</p><span className="mt-5 flex items-center justify-between text-xs font-black">{t('cineFil.open')}<span className="flex h-9 w-9 items-center justify-center rounded-full bg-bitter-lime text-charcoal"><ArrowUpRight size={18} /></span></span></div>
  </button>;
};
export default CinemaFilEntry;
