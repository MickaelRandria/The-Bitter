import React, { useState } from 'react';
import { Bell, Check, Loader2, Share2 } from 'lucide-react';
import { useLanguage } from '../contexts/LanguageContext';
import { haptics } from '../utils/haptics';
import { PingKind, pingSpaceMembers, shareOutside } from '../services/spacePing';
import { Avatar, VerdictPerson } from './verdict/VerdictBits';

/**
 * « Préviens les autres » : choisir des membres de l'espace et les prévenir
 * dans l'app (notification), ou partager hors de l'app (Instagram, Messages…).
 * Sert à la fin du récap du mois et du blind test. Toujours sur fond sombre.
 */
const PingMembers: React.FC<{
  spaceId: string;
  what: PingKind;
  people: VerdictPerson[];
  /** Le texte du partage hors de l'app. */
  shareText: string;
  score?: number;
  total?: number;
  month?: string;
}> = ({ spaceId, what, people, shareText, score, total, month }) => {
  const { t } = useLanguage();
  const others = people.filter((p) => !p.isMe);
  const [picked, setPicked] = useState<string[]>(() => others.slice(0, 8).map((p) => p.id));
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const send = async () => {
    if (!picked.length) return;
    setSending(true);
    setError(null);
    const result = await pingSpaceMembers(spaceId, what, picked, { score, total, month });
    setSending(false);
    if (result.error) {
      haptics.error();
      setError(result.error);
      return;
    }
    haptics.success();
    setSent(result.sent);
  };

  return (
    <div className="flex flex-col gap-3" onPointerDown={(e) => e.stopPropagation()}>
      {others.length > 0 && (
        <>
          {sent ? (
            <p className="flex items-center justify-center gap-2 rounded-2xl bg-white/10 py-3.5 text-sm font-black" role="status">
              <Check size={16} className="text-bitter-lime" />
              {t('ping.sent', { n: sent })}
            </p>
          ) : (
            <>
              <div className="flex flex-wrap justify-center gap-1.5">
                {others.map((person) => {
                  const on = picked.includes(person.id);
                  return (
                    <button
                      key={person.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() =>
                        setPicked((list) => (on ? list.filter((id) => id !== person.id) : list.length < 8 ? [...list, person.id] : list))
                      }
                      className={`inline-flex min-h-10 items-center gap-2 rounded-full py-1 pl-1 pr-3 text-xs font-bold transition active:scale-95 ${
                        on ? 'bg-white text-charcoal' : 'bg-white/10 text-white'
                      }`}
                    >
                      <Avatar person={person} size={30} />
                      {person.name}
                    </button>
                  );
                })}
              </div>
              <button
                type="button"
                disabled={!picked.length || sending}
                onClick={send}
                className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-bitter-lime px-6 text-[11px] font-black uppercase tracking-[0.12em] text-[#111] transition active:scale-95 disabled:opacity-50"
              >
                {sending ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />}
                {t(what === 'blind' ? 'ping.challenge' : 'ping.notify', { n: picked.length })}
              </button>
            </>
          )}
          {error && (
            <p role="alert" className="text-center text-xs font-bold text-[#F08A24]">
              {error}
            </p>
          )}
        </>
      )}
      <button
        type="button"
        onClick={async () => {
          const result = await shareOutside(shareText, spaceId, what);
          if (result === 'copied') setCopied(true);
        }}
        className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-white/20 px-6 text-[11px] font-black uppercase tracking-[0.12em] text-white transition active:scale-95"
      >
        {copied ? <Check size={15} /> : <Share2 size={15} />}
        {copied ? t('ping.copied') : t('ping.share')}
      </button>
    </div>
  );
};

export default PingMembers;
