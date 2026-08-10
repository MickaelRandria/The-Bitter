import React, { useState } from 'react';
import { X, Check, Loader2, Mail, CloudUpload, AlertTriangle } from 'lucide-react';
import { BackfillReport } from '../services/movieSync';
import {
  attachEmail,
  sendMagicLink,
  startAnonymousSession,
  verifyEmailCode,
} from '../services/auth';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface AccountSyncModalProps {
  /** Email du compte connecté, absent si personne ne l'est. */
  accountEmail?: string | null;
  /** Identifiant du compte connecté, nécessaire pour y rattacher un email. */
  accountId?: string | null;
  /** Vrai quand la session est anonyme : le compte existe mais n'a pas d'email. */
  isAnonymous?: boolean;
  /** Films du profil actif pas encore présents sur le compte. */
  pendingCount: number;
  onBackfill: () => Promise<BackfillReport>;
  onClose: () => void;
}

/**
 * Point d'entrée unique de la sauvegarde en ligne, depuis les paramètres.
 *
 * Trois états dans une seule modale : pas connecté (lien magique), connecté avec
 * des films en attente (envoi + rapport), tout à jour (simple confirmation). Le
 * mot de passe n'existe nulle part : les comptes historiques se retrouvent par
 * leur email, ce qui évite de leur demander un secret qu'ils n'ont jamais choisi.
 */
const AccountSyncModal: React.FC<AccountSyncModalProps> = ({
  accountEmail,
  accountId,
  isAnonymous = false,
  pendingCount,
  onBackfill,
  onClose,
}) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('accountSync.title'));

  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [linkSent, setLinkSent] = useState(false);
  /**
   * Vrai seulement après une demande de connexion, jamais après un rattachement
   * d'email : ce dernier envoie une confirmation de changement d'adresse, dont le
   * code relève d'un autre type et ne se vérifie pas ici.
   */
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [code, setCode] = useState('');
  /**
   * Comble l'intervalle entre `verifyOtp` qui rend la main et la session qui
   * redescend de l'App via `accountEmail`. Sans cet état, la modale repasserait
   * une fraction de seconde par le formulaire d'email : la connexion réussie
   * ressemblerait à un échec.
   */
  const [justSignedIn, setJustSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<BackfillReport | null>(null);

  const emailValid = /\S+@\S+\.\S+/.test(email.trim());
  /**
   * La longueur du code est un réglage du projet Supabase, pas une constante :
   * elle va de 6 à 10 chiffres et peut changer sans que l'app soit redéployée.
   * On accepte donc toute la plage et on laisse le serveur trancher, plutôt que
   * de bloquer le bouton sur une longueur devinée.
   */
  const codeValid = /^\d{6,10}$/.test(code.trim()) || code.trim().includes('://');

  const requestLink = async () => {
    if (!emailValid || busy) return;
    haptics.medium();
    setBusy(true);
    setError(null);

    const result = await sendMagicLink(email);
    setBusy(false);

    if (!result.ok) {
      setError(
        result.reason === 'not-configured'
          ? t('accountSync.notConfigured')
          : (result.message ?? null)
      );
      return;
    }

    setCode('');
    setLinkSent(true);
    setAwaitingCode(true);
    haptics.success();
  };

  /**
   * Ouvre la session dans CE contexte de stockage, sans passer par le lien.
   *
   * On ne ferme pas la modale : la session remonte à l'App, qui repasse
   * `accountEmail`, et la vue bascule d'elle-même sur l'état connecté. L'utilisateur
   * enchaîne donc sur la sauvegarde de ses films sans avoir à rouvrir quoi que ce soit.
   */
  const submitCode = async () => {
    if (!codeValid || busy) return;
    haptics.medium();
    setBusy(true);
    setError(null);

    const result = await verifyEmailCode(email, code);
    setBusy(false);

    if (!result.ok) {
      setError(
        result.reason === 'not-configured'
          ? t('accountSync.notConfigured')
          : (result.message ?? t('accountSync.codeInvalid'))
      );
      haptics.error();
      return;
    }

    setLinkSent(false);
    setAwaitingCode(false);
    setCode('');
    setJustSignedIn(true);
    haptics.success();
  };

  /** Retour au formulaire : sert aussi bien à corriger l'adresse qu'à renvoyer un code. */
  const backToEmail = () => {
    haptics.soft();
    setLinkSent(false);
    setAwaitingCode(false);
    setCode('');
    setError(null);
  };

  /**
   * Session anonyme : un compte réel est créé, sans email ni mot de passe.
   * Indispensable quand l'envoi d'emails est indisponible, et de toute façon le
   * chemin le plus court pour quelqu'un qui veut juste sauvegarder ses films.
   */
  const startAnonymous = async () => {
    if (busy) return;
    haptics.medium();
    setBusy(true);
    setError(null);

    const result = await startAnonymousSession();
    setBusy(false);

    if (!result.ok) {
      setError(
        result.reason === 'not-configured'
          ? t('accountSync.notConfigured')
          : (result.message ?? null)
      );
      return;
    }
    haptics.success();
  };

  /**
   * Rattache un email à un compte anonyme. L'identifiant du compte ne change pas,
   * donc les films déjà sauvegardés restent attachés : c'est une conversion, pas
   * une nouvelle inscription.
   */
  const linkEmail = async () => {
    if (!emailValid || busy || !accountId) return;
    haptics.medium();
    setBusy(true);
    setError(null);

    const result = await attachEmail(accountId, email);
    setBusy(false);

    if (!result.ok) {
      setError(result.message ?? null);
      return;
    }
    setLinkSent(true);
    haptics.success();
  };

  const backfill = async () => {
    if (busy) return;
    haptics.medium();
    setBusy(true);
    try {
      setReport(await onBackfill());
    } finally {
      setBusy(false);
    }
  };

  const inputClass =
    'w-full bg-white dark:bg-[#161616] border border-stone-200 dark:border-white/10 focus:border-charcoal dark:focus:border-white/30 rounded-2xl px-4 py-3.5 text-base font-black outline-none transition-all text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700';
  const primaryClass =
    'w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 flex items-center justify-center gap-2';

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[260] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="px-6 pt-5 pb-4 border-b border-sand dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#1a1a1a] shrink-0">
          <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white truncate">
            {t('accountSync.title')}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className="shrink-0 ml-3 w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-5">
          {report ? (
            <div className="text-center py-4 space-y-5">
              <div
                className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto border ${
                  report.failed.length > 0
                    ? 'bg-orange-400/10 border-orange-400/30 text-orange-400'
                    : 'bg-bitter-lime/10 border-bitter-lime/30 text-bitter-lime'
                }`}
              >
                {report.failed.length > 0 ? (
                  <AlertTriangle size={24} />
                ) : (
                  <Check size={26} strokeWidth={3} />
                )}
              </div>
              <div>
                <p className="text-5xl font-black text-charcoal dark:text-white tracking-tighter">
                  {report.pushed}
                </p>
                <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 mt-2">
                  {t('accountSync.savedLabel')}
                </p>
              </div>
              {/* Un compte sans email ne vit que dans ce navigateur : perdre le
                  stockage local, c'est perdre l'accès aux films qu'on vient tout
                  juste de sauvegarder. On insiste ici plutôt que de le proposer
                  discrètement ailleurs. */}
              {isAnonymous && report.pushed > 0 && (
                <div className="text-left bg-orange-400/5 border border-orange-400/30 rounded-2xl p-4 space-y-3">
                  <div className="flex items-center gap-2 text-orange-400">
                    <AlertTriangle size={14} />
                    <p className="text-[10px] font-black uppercase tracking-widest">
                      {t('accountSync.secureTitle')}
                    </p>
                  </div>
                  <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
                    {t('accountSync.secureBody')}
                  </p>
                  <input
                    type="email"
                    inputMode="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@exemple.com"
                  />
                  {error && (
                    <p className="text-[11px] font-medium text-orange-400 leading-relaxed">
                      {error}
                    </p>
                  )}
                  <button
                    onClick={linkEmail}
                    disabled={!emailValid || busy}
                    className={primaryClass}
                  >
                    {busy && <Loader2 size={14} className="animate-spin" />}
                    {t('accountSync.attachEmailCta')}
                  </button>
                </div>
              )}

              {report.skippedDeleted > 0 && (
                <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                  {t('accountMerge.skippedDeleted', { count: String(report.skippedDeleted) })}
                </p>
              )}
              {report.failed.length > 0 && (
                <div className="text-left bg-orange-400/5 border border-orange-400/20 rounded-2xl p-4 space-y-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-orange-400 mb-1">
                    {t('accountMerge.failed', { count: String(report.failed.length) })}
                  </p>
                  {report.failed.map((line) => (
                    <p
                      key={line}
                      className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-snug"
                    >
                      {line}
                    </p>
                  ))}
                </div>
              )}
            </div>
          ) : linkSent ? (
            <div className="text-center py-4 space-y-5">
              <div className="w-14 h-14 rounded-3xl bg-bitter-lime/10 border border-bitter-lime/30 flex items-center justify-center text-bitter-lime mx-auto">
                <Mail size={24} />
              </div>
              <h3 className="text-2xl font-black text-charcoal dark:text-white tracking-tight">
                {t('accountSync.linkSentTitle')}
              </h3>
              {/* Le rattachement d'email envoie une confirmation de changement
                  d'adresse, pas un code de connexion : lui servir le texte du code
                  ferait chercher six chiffres qui n'existent pas. */}
              <p className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed max-w-xs mx-auto">
                {t(awaitingCode ? 'accountSync.linkSentBody' : 'accountSync.attachSentBody', {
                  email: email.trim(),
                })}
              </p>

              {/* Le code plutôt que le lien : depuis l'app installée sur l'écran
                  d'accueil, le lien s'ouvrirait dans le navigateur par défaut, qui a
                  son propre stockage. La session s'ouvrirait à côté des films au lieu
                  de s'ouvrir avec eux. Saisi ici, le code connecte au bon endroit. */}
              {awaitingCode && (
                <div className="text-left space-y-3 pt-2">
                  <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 block ml-1">
                    {t('accountSync.codeLabel')}
                  </label>
                  <input
                    type="text"
                    autoComplete="one-time-code"
                    /* Pas de maxLength : il tronquerait le texte collé AVANT que
                       les espaces et le reste soient retirés, et « 123 456 » ne
                       donnerait que cinq chiffres avec un bouton inerte. */
                    className={`${inputClass} text-center ${code.includes('://') ? 'text-[11px] tracking-normal' : 'text-2xl tracking-[0.3em]'} font-black`}
                    value={code}
                    onChange={(e) => setCode(e.target.value.trim())}
                  />

                  {error && (
                    <p className="text-[11px] font-medium text-orange-400 leading-relaxed">
                      {error}
                    </p>
                  )}

                  <button
                    onClick={submitCode}
                    disabled={!codeValid || busy}
                    className={primaryClass}
                  >
                    {busy && <Loader2 size={14} className="animate-spin" />}
                    {t('accountSync.codeCta')}
                  </button>

                  <button
                    onClick={backToEmail}
                    disabled={busy}
                    className="w-full pt-1 text-[10px] font-black uppercase tracking-widest text-stone-400 dark:text-stone-500 hover:text-charcoal dark:hover:text-white transition-colors disabled:opacity-40"
                  >
                    {t('accountSync.codeResend')}
                  </button>
                </div>
              )}
            </div>
          ) : justSignedIn && !accountEmail ? (
            <div className="text-center py-10 space-y-4">
              <div className="w-14 h-14 rounded-3xl bg-bitter-lime/10 border border-bitter-lime/30 flex items-center justify-center text-bitter-lime mx-auto">
                <Check size={26} strokeWidth={3} />
              </div>
              <h3 className="text-2xl font-black text-charcoal dark:text-white tracking-tight">
                {t('accountSync.signedInTitle')}
              </h3>
              <Loader2 size={16} className="animate-spin text-stone-400 mx-auto" />
            </div>
          ) : /* Un compte anonyme n'a pas d'email : tester `accountEmail` seul
                 renvoyait sur le formulaire de connexion, si bien que « Continuer
                 sans email » ne disait jamais qu'on était connecté et que tout le
                 parcours anonyme en dessous restait inatteignable. */
            accountEmail || accountId ? (
            <div className="space-y-5">
              <div className="bg-white dark:bg-[#202020] border border-sand dark:border-white/10 rounded-2xl p-4">
                <p className="text-[10px] font-black uppercase tracking-widest text-stone-400 mb-1">
                  {t('accountSync.connectedAs')}
                </p>
                <p className="text-sm font-black text-charcoal dark:text-white truncate">
                  {accountEmail ?? t('accountSync.anonymousAccount')}
                </p>
              </div>

              {/* Compte anonyme : on propose d'y rattacher un email, ce qui le rend
                  permanent sans changer son identifiant, donc sans perdre les films. */}
              {isAnonymous && (
                <div className="bg-stone-50 dark:bg-[#161616] border border-stone-100 dark:border-white/5 rounded-2xl p-4 space-y-3">
                  <p className="text-[11px] font-medium text-stone-500 dark:text-stone-400 leading-relaxed">
                    {t('accountSync.attachEmailHint')}
                  </p>
                  <input
                    type="email"
                    inputMode="email"
                    className={inputClass}
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="nom@exemple.com"
                  />
                  {error && (
                    <p className="text-[11px] font-medium text-orange-400 leading-relaxed">
                      {error}
                    </p>
                  )}
                  <button
                    onClick={linkEmail}
                    disabled={!emailValid || busy}
                    className="w-full py-3 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-charcoal dark:text-white font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40"
                  >
                    {t('accountSync.attachEmailCta')}
                  </button>
                </div>
              )}

              {pendingCount > 0 ? (
                <>
                  <p className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                    {t('accountSync.pendingBody', { count: String(pendingCount) })}
                  </p>
                  <button onClick={backfill} disabled={busy} className={primaryClass}>
                    {busy ? <Loader2 size={14} className="animate-spin" /> : <CloudUpload size={14} />}
                    {t('accountSync.saveCta', { count: String(pendingCount) })}
                  </button>
                </>
              ) : (
                <div className="text-center py-4 space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-bitter-lime/10 border border-bitter-lime/30 flex items-center justify-center text-bitter-lime mx-auto">
                    <Check size={22} strokeWidth={3} />
                  </div>
                  <p className="text-sm font-medium text-stone-400 dark:text-stone-500">
                    {t('accountSync.upToDate')}
                  </p>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm font-medium text-stone-400 dark:text-stone-500 leading-relaxed">
                {t('accountSync.intro')}
              </p>

              <div>
                <label className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500 mb-2 block ml-1">
                  {t('auth.email')}
                </label>
                <input
                  type="email"
                  inputMode="email"
                  autoComplete="email"
                  className={inputClass}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="nom@exemple.com"
                />
              </div>

              {error && (
                <p className="text-[11px] font-medium text-orange-400 leading-relaxed">{error}</p>
              )}

              <button onClick={requestLink} disabled={!emailValid || busy} className={primaryClass}>
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />}
                {t('accountSync.sendLink')}
              </button>

              <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed text-center">
                {t('accountSync.noPassword')}
              </p>

              <div className="pt-2 border-t border-sand dark:border-white/5 space-y-2">
                <button
                  onClick={startAnonymous}
                  disabled={busy}
                  className="w-full py-3 rounded-2xl bg-white dark:bg-[#202020] border border-stone-200 dark:border-white/10 text-stone-500 dark:text-stone-400 font-black text-[10px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40"
                >
                  {t('accountSync.anonymousCta')}
                </button>
                <p className="text-[10px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed text-center">
                  {t('accountSync.anonymousHint')}
                </p>
              </div>
            </div>
          )}
        </div>

        {(report || (linkSent && !awaitingCode)) && (
          <div className="p-6 pt-4 border-t border-sand dark:border-white/5 bg-white dark:bg-[#1a1a1a] shrink-0">
            <button onClick={onClose} className={primaryClass}>
              {t('common.done')}
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default AccountSyncModal;
