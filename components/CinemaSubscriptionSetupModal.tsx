import React, { useMemo, useState } from 'react';
import { X, ChevronLeft, Check, Clapperboard } from 'lucide-react';
import { CinemaSubscription, CinemaSubscriptionProvider } from '../types';
import {
  SUBSCRIPTION_PRESETS,
  formatCurrency,
  getBreakEvenSessions,
} from '../utils/cinemaSubscription';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';
import { getCinemaProviderBrand } from '../utils/cinemaBrand';
import CinemaSubscriptionArtwork from './CinemaSubscriptionArtwork';
import { newId } from '../utils/id';

interface CinemaSubscriptionSetupModalProps {
  /** Abonnement existant en édition, absent à la première configuration. */
  existing?: CinemaSubscription;
  onSave: (subscription: CinemaSubscription) => void;
  onDelete?: () => void;
  onClose: () => void;
  /** Proposé après une première configuration seulement. */
  onImportHistory?: () => void;
}

type Step = 'provider' | 'pricing' | 'confirm' | 'history';

const toDateInput = (iso: string) => iso.slice(0, 10);

const CinemaSubscriptionSetupModal: React.FC<CinemaSubscriptionSetupModalProps> = ({
  existing,
  onSave,
  onDelete,
  onClose,
  onImportHistory,
}) => {
  const { t, language } = useLanguage();
  const dialog = useDialog(onClose, t('cinemaSub.setup.title'));

  // En édition on saute le choix du fournisseur : il est déjà fait.
  const [step, setStep] = useState<Step>(existing ? 'pricing' : 'provider');
  const [provider, setProvider] = useState<CinemaSubscriptionProvider>(
    existing?.provider ?? 'ugc'
  );
  const [name, setName] = useState(existing?.name ?? '');
  const [monthlyPrice, setMonthlyPrice] = useState(
    existing ? String(existing.monthlyPrice) : ''
  );
  const [ticketPrice, setTicketPrice] = useState(
    existing ? String(existing.referenceTicketPrice) : ''
  );
  const [startDate, setStartDate] = useState(
    toDateInput(existing?.startDate ?? new Date().toISOString())
  );

  const parsedMonthly = Number(monthlyPrice.replace(',', '.'));
  const parsedTicket = Number(ticketPrice.replace(',', '.'));
  const pricingValid =
    name.trim().length > 0 &&
    Number.isFinite(parsedMonthly) &&
    parsedMonthly > 0 &&
    Number.isFinite(parsedTicket) &&
    parsedTicket > 0 &&
    startDate.length === 10;

  const draft: CinemaSubscription = useMemo(
    () => ({
      id: existing?.id ?? newId(),
      provider,
      name: name.trim(),
      monthlyPrice: parsedMonthly,
      referenceTicketPrice: parsedTicket,
      startDate: new Date(`${startDate}T00:00:00`).toISOString(),
      active: true,
      createdAt: existing?.createdAt ?? new Date().toISOString(),
    }),
    [existing, provider, name, parsedMonthly, parsedTicket, startDate]
  );

  const breakEven = pricingValid ? getBreakEvenSessions(draft) : 0;
  const brand = getCinemaProviderBrand(provider);
  // Tant qu'aucun partenaire n'est choisi, l'écran reste dans la DA The Bitter.
  // Dès le choix fait (ou en édition), tout le parcours adopte sa charte.
  const frameBrand = step === 'provider' && !existing
    ? getCinemaProviderBrand('custom')
    : brand;
  const primaryActionClass =
    provider === 'custom'
      ? 'bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal'
      : brand.selectedClass;

  const pickProvider = (id: CinemaSubscriptionProvider) => {
    haptics.soft();
    const preset = SUBSCRIPTION_PRESETS.find((p) => p.provider === id);
    setProvider(id);
    if (preset) {
      setName(t(preset.nameKey));
      setMonthlyPrice(preset.monthlyPrice > 0 ? String(preset.monthlyPrice) : '');
      setTicketPrice(String(preset.referenceTicketPrice));
    }
    setStep('pricing');
  };

  const confirmPricing = () => {
    if (!pricingValid) return;
    haptics.soft();
    setStep('confirm');
  };

  const save = () => {
    haptics.success();
    onSave(draft);
    // À la première configuration on enchaîne sur le rattrapage historique plutôt
    // que de renvoyer l'utilisateur dans des statistiques encore vides.
    if (!existing && onImportHistory) setStep('history');
    else onClose();
  };

  const inputClass =
    `w-full border rounded-2xl px-4 py-3.5 text-base font-black outline-none transition-all ${frameBrand.inputClass}`;
  const labelClass =
    `text-[10px] font-black uppercase tracking-[0.2em] mb-2 block ml-1 ${frameBrand.labelClass}`;
  // Les deux intitulés de prix n'ont pas la même longueur sur mobile. On réserve
  // deux lignes pour que leurs champs restent parfaitement alignés.
  const priceLabelClass = `${labelClass} min-h-[30px]`;

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center p-0 sm:p-6"
    >
      <div
        className="absolute inset-0 bg-charcoal/60 dark:bg-black/80 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
        onClick={onClose}
      />

      <div className={`relative z-10 w-full sm:max-w-md rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t ${frameBrand.modalClass}`}>
        <div className={`px-6 pt-5 pb-4 border-b flex items-center justify-between shrink-0 ${frameBrand.headerClass}`}>
          <div className="flex items-center gap-3 min-w-0">
            {step === 'pricing' && !existing && (
              <button
                onClick={() => setStep('provider')}
                aria-label={t('common.back')}
                className={`w-8 h-8 rounded-xl flex items-center justify-center active:scale-90 transition-transform shrink-0 ${frameBrand.headerControlClass}`}
              >
                <ChevronLeft size={16} strokeWidth={3} />
              </button>
            )}
            <h2 className={`text-xl font-black tracking-tight truncate ${frameBrand.headerTitleClass} ${frameBrand.fontClass}`}>
              {t('cinemaSub.setup.title')}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label={t('common.close')}
            className={`shrink-0 ml-3 w-8 h-8 rounded-full flex items-center justify-center active:scale-90 transition-transform ${frameBrand.headerControlClass}`}
          >
            <X size={18} strokeWidth={2.5} />
          </button>
        </div>

        <div className={`flex-1 overflow-y-auto no-scrollbar p-6 space-y-6 ${frameBrand.contentClass}`}>
          {step === 'provider' && (
            <div className="space-y-5 animate-[fadeIn_0.25s_ease-out]">
              <div>
                <h3 className={`text-2xl font-black tracking-tight leading-tight ${frameBrand.titleClass}`}>
                  {t('cinemaSub.setup.step1Title')}
                </h3>
                <p className={`text-sm font-medium mt-2 leading-relaxed ${frameBrand.mutedTextClass}`}>
                  {t('cinemaSub.setup.step1Sub')}
                </p>
              </div>

              <div className="space-y-2">
                {SUBSCRIPTION_PRESETS.map((preset) => (
                  <button
                    key={preset.provider}
                    onClick={() => pickProvider(preset.provider)}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border active:scale-[0.99] transition-all text-left ${getCinemaProviderBrand(preset.provider).choiceClass}`}
                  >
                    <CinemaSubscriptionArtwork provider={preset.provider} size="selector" />
                    <span className={`flex-1 text-sm font-black uppercase tracking-wide ${getCinemaProviderBrand(preset.provider).titleClass}`}>
                      {t(preset.nameKey)}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 'pricing' && (
            <div className="space-y-5 animate-[fadeIn_0.25s_ease-out]">
              <div>
                <label className={labelClass}>{t('cinemaSub.setup.name')}</label>
                <input
                  className={inputClass}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder={t('cinemaSub.preset.custom')}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className={priceLabelClass}>{t('cinemaSub.setup.monthlyPrice')}</label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={monthlyPrice}
                    onChange={(e) => setMonthlyPrice(e.target.value)}
                    placeholder="24,90"
                  />
                </div>
                <div>
                  <label className={priceLabelClass}>{t('cinemaSub.setup.ticketPrice')}</label>
                  <input
                    className={inputClass}
                    inputMode="decimal"
                    value={ticketPrice}
                    onChange={(e) => setTicketPrice(e.target.value)}
                    placeholder="14,50"
                  />
                </div>
              </div>

              <div>
                <label className={labelClass}>{t('cinemaSub.setup.startDate')}</label>
                <input
                  type="date"
                  className={inputClass}
                  value={startDate}
                  max={toDateInput(new Date().toISOString())}
                  onChange={(e) => setStartDate(e.target.value)}
                />
              </div>

              <p className="text-[11px] font-medium text-stone-400 dark:text-stone-500 leading-relaxed ml-1">
                {t('cinemaSub.setup.disclaimer')}
              </p>
            </div>
          )}

          {step === 'confirm' && (
            <div className="space-y-6 animate-[fadeIn_0.25s_ease-out] text-center py-4">
              <div className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto ${frameBrand.accentPanelClass}`}>
                <Clapperboard size={26} />
              </div>
              <div>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] ${frameBrand.mutedTextClass}`}>
                  {t('cinemaSub.setup.breakEvenLabel')}
                </p>
                <p className={`text-5xl font-black tracking-tighter mt-3 ${frameBrand.titleClass}`}>
                  {breakEven}
                </p>
                <p className={`text-[10px] font-black uppercase tracking-[0.2em] mt-2 ${frameBrand.mutedTextClass}`}>
                  {t('cinemaSub.setup.breakEvenUnit')}
                </p>
              </div>
              <p className={`text-sm font-medium leading-relaxed max-w-xs mx-auto ${frameBrand.mutedTextClass}`}>
                {t('cinemaSub.setup.breakEvenHelp', {
                  monthly: formatCurrency(parsedMonthly, language),
                  ticket: formatCurrency(parsedTicket, language),
                })}
              </p>
            </div>
          )}

          {step === 'history' && (
            <div className="space-y-5 animate-[fadeIn_0.25s_ease-out] text-center py-4">
              <div className={`w-14 h-14 rounded-3xl flex items-center justify-center mx-auto ${frameBrand.accentPanelClass}`}>
                <Check size={26} strokeWidth={3} />
              </div>
              <h3 className={`text-2xl font-black tracking-tight leading-tight ${frameBrand.titleClass}`}>
                {t('cinemaSub.history.promptTitle')}
              </h3>
              <p className={`text-sm font-medium leading-relaxed max-w-xs mx-auto ${frameBrand.mutedTextClass}`}>
                {t('cinemaSub.history.promptSub')}
              </p>
            </div>
          )}
        </div>

        <div className={`p-6 pt-4 border-t shrink-0 space-y-2 ${frameBrand.footerClass}`}>
          {step === 'pricing' && (
            <>
              <button
                onClick={confirmPricing}
                disabled={!pricingValid}
                className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 disabled:active:scale-100 ${primaryActionClass}`}
              >
                {t('common.next')}
              </button>
              {existing && onImportHistory && (
                <button
                  onClick={() => {
                    haptics.soft();
                    onImportHistory();
                  }}
                  className={`w-full py-3 text-[10px] font-black uppercase tracking-widest transition-colors ${frameBrand.secondaryActionClass}`}
                >
                  {t('cinemaSub.setup.completeHistory')}
                </button>
              )}
              {existing && onDelete && (
                <button
                  onClick={() => {
                    haptics.medium();
                    onDelete();
                  }}
                  className="w-full py-3 text-[10px] font-bold text-red-500 hover:text-red-400 uppercase tracking-widest transition-colors"
                >
                  {t('cinemaSub.setup.delete')}
                </button>
              )}
            </>
          )}

          {step === 'confirm' && (
            <button
              onClick={save}
              className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all ${primaryActionClass}`}
            >
              {t('cinemaSub.setup.continue')}
            </button>
          )}

          {step === 'history' && (
            <>
              <button
                onClick={() => {
                  haptics.soft();
                  onImportHistory?.();
                }}
                className={`w-full py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all ${primaryActionClass}`}
              >
                {t('cinemaSub.history.pickMovies')}
              </button>
              <button
                onClick={onClose}
                className={`w-full py-3 text-[10px] font-bold uppercase tracking-widest transition-colors ${frameBrand.secondaryActionClass}`}
              >
                {t('cinemaSub.history.later')}
              </button>
            </>
          )}

          {step === 'provider' && (
            <p className={`text-[10px] font-medium text-center leading-relaxed ${frameBrand.mutedTextClass}`}>
              {t('cinemaSub.setup.step1Hint')}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};

export default CinemaSubscriptionSetupModal;
