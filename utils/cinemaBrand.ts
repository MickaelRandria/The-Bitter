import { CinemaSubscriptionProvider } from '../types';

/**
 * Identité visuelle légère des abonnements partenaires.
 *
 * On emploie un badge typographique, pas un logo officiel : cela donne une
 * reconnaissance immédiate sans embarquer d'asset de marque non fourni.
 */
export interface CinemaProviderBrand {
  label: string;
  fontClass: string;
  badgeClass: string;
  subtleClass: string;
  selectedClass: string;
  modalClass: string;
  headerClass: string;
  headerTitleClass: string;
  headerMutedClass: string;
  headerControlClass: string;
  contentClass: string;
  footerClass: string;
  cardClass: string;
  selectedCardClass: string;
  inputClass: string;
  labelClass: string;
  titleClass: string;
  mutedTextClass: string;
  secondaryActionClass: string;
  secondaryPillClass: string;
  accentPanelClass: string;
  progressTrackClass: string;
  progressClass: string;
  choiceClass: string;
  actionTextClass: string;
}

const CINEMA_PROVIDER_BRANDS: Record<CinemaSubscriptionProvider, CinemaProviderBrand> = {
  ugc: {
    label: 'UGC',
    fontClass: 'font-[Heebo]',
    badgeClass: 'bg-[#001340] text-white border-[#001340] shadow-[#001340]/25',
    subtleClass: 'bg-[#001340]/10 text-[#001340] dark:text-white border-[#001340]/25',
    selectedClass: 'bg-[#001340] text-white border-[#001340] shadow-[#001340]/25 font-[Heebo]',
    modalClass: 'bg-[#EEF3FF] dark:bg-[#000D2B] border-[#001340]/25 dark:border-[#5D83D6]/35',
    headerClass: 'bg-[#001340] border-[#001340]',
    headerTitleClass: 'text-white',
    headerMutedClass: 'text-white/65',
    headerControlClass: 'bg-white/10 hover:bg-white/20 text-white',
    contentClass: 'bg-[#EEF3FF] dark:bg-[#000D2B]',
    footerClass: 'bg-white/85 dark:bg-[#001340] border-[#001340]/15 dark:border-white/10',
    cardClass: 'bg-white/90 dark:bg-[#001A54] border-[#001340]/15 dark:border-[#5D83D6]/35 shadow-[#001340]/5',
    selectedCardClass: 'bg-[#001340]/10 dark:bg-[#001A54] border-[#001340]/45 dark:border-[#7FA4FF]/60',
    inputClass: 'bg-white/95 dark:bg-[#001A54] border-[#001340]/20 dark:border-[#5D83D6]/40 focus:border-[#001340] dark:focus:border-[#7FA4FF] text-[#001340] dark:text-white placeholder:text-[#001340]/30 dark:placeholder:text-white/30 font-[Heebo]',
    labelClass: 'text-[#001340]/60 dark:text-[#B7C8FF] font-[Heebo]',
    titleClass: 'text-[#001340] dark:text-white font-[Heebo]',
    mutedTextClass: 'text-[#001340]/65 dark:text-[#B7C8FF] font-[Heebo]',
    secondaryActionClass: 'text-[#001340] dark:text-white hover:bg-[#001340]/5 dark:hover:bg-white/10 font-[Heebo]',
    secondaryPillClass: 'bg-white/75 dark:bg-white/10 text-[#001340]/60 dark:text-[#B7C8FF] border border-[#001340]/10 dark:border-white/10 font-[Heebo]',
    accentPanelClass: 'bg-[#001340] text-white border border-[#001340] shadow-[#001340]/20',
    progressTrackClass: 'bg-[#001340]/15 dark:bg-white/15',
    progressClass: 'bg-[#001340] dark:bg-[#7FA4FF]',
    choiceClass: 'bg-white/85 dark:bg-[#001A54] border-[#001340]/15 dark:border-[#5D83D6]/35 hover:bg-[#001340]/5 dark:hover:bg-[#001340] hover:border-[#001340]/55 dark:hover:border-[#7FA4FF]/65',
    actionTextClass: 'text-[#001340] dark:text-[#B7C8FF]',
  },
  pathe: {
    label: 'Pathé',
    fontClass: 'font-[Heebo]',
    badgeClass: 'bg-[#FFC105] text-black border-[#FFC105] shadow-[#FFC105]/25',
    subtleClass: 'bg-[#FFC105]/15 text-black dark:text-black border-[#FFC105]/35',
    selectedClass: 'bg-[#FFC105] text-black border-[#FFC105] shadow-[#FFC105]/25 font-[Heebo]',
    modalClass: 'bg-[#FFF8E1] dark:bg-[#2B2100] border-[#FFC105]/45 dark:border-[#FFC105]/55',
    headerClass: 'bg-[#FFC105] border-[#FFC105]',
    headerTitleClass: 'text-black',
    headerMutedClass: 'text-black/60',
    headerControlClass: 'bg-black/10 hover:bg-black/15 text-black',
    contentClass: 'bg-[#FFF8E1] dark:bg-[#2B2100]',
    footerClass: 'bg-[#FFFDF5] dark:bg-[#352700] border-[#FFC105]/35 dark:border-[#FFC105]/35',
    cardClass: 'bg-white/95 dark:bg-[#3B2B00] border-[#FFC105]/45 dark:border-[#FFC105]/45 shadow-[#FFC105]/10',
    selectedCardClass: 'bg-[#FFC105]/20 dark:bg-[#4A3700] border-[#FFC105]/70',
    inputClass: 'bg-white/95 dark:bg-[#3B2B00] border-[#FFC105]/60 dark:border-[#FFC105]/55 focus:border-black/60 dark:focus:border-[#FFE08A] text-black dark:text-white placeholder:text-black/35 dark:placeholder:text-white/35 font-[Heebo]',
    labelClass: 'text-black/55 dark:text-[#FFE08A] font-[Heebo]',
    titleClass: 'text-black dark:text-white font-[Heebo]',
    mutedTextClass: 'text-black/60 dark:text-[#F3D986] font-[Heebo]',
    secondaryActionClass: 'text-black dark:text-[#FFE08A] hover:bg-black/5 dark:hover:bg-white/10 font-[Heebo]',
    secondaryPillClass: 'bg-white/80 dark:bg-white/10 text-black/60 dark:text-[#F3D986] border border-[#FFC105]/35 dark:border-[#FFC105]/35 font-[Heebo]',
    accentPanelClass: 'bg-[#FFC105] text-black border border-[#FFC105] shadow-[#FFC105]/25',
    progressTrackClass: 'bg-black/10 dark:bg-white/15',
    progressClass: 'bg-[#FFC105]',
    choiceClass: 'bg-white/90 dark:bg-[#3B2B00] border-[#FFC105]/45 dark:border-[#FFC105]/45 hover:bg-[#FFC105]/15 dark:hover:bg-[#4A3700] hover:border-[#FFC105]',
    actionTextClass: 'text-black dark:text-[#FFE08A]',
  },
  custom: {
    fontClass: '',
    label: 'Cinéma',
    badgeClass: 'bg-charcoal dark:bg-white text-white dark:text-charcoal border-charcoal dark:border-white',
    subtleClass: 'bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white border-stone-200 dark:border-white/10',
    selectedClass: 'bg-charcoal dark:bg-white text-white dark:text-charcoal border-charcoal dark:border-white',
    modalClass: 'bg-cream dark:bg-[#0c0c0c] border-white/20 dark:border-white/10',
    headerClass: 'bg-white dark:bg-[#1a1a1a] border-sand dark:border-white/5',
    headerTitleClass: 'text-charcoal dark:text-white',
    headerMutedClass: 'text-stone-400 dark:text-stone-500',
    headerControlClass: 'bg-stone-100 dark:bg-[#252525] text-stone-500 dark:text-stone-400',
    contentClass: 'bg-cream dark:bg-[#0c0c0c]',
    footerClass: 'bg-white dark:bg-[#1a1a1a] border-sand dark:border-white/5',
    cardClass: 'bg-white dark:bg-[#202020] border-sand dark:border-white/10',
    selectedCardClass: 'bg-forest/5 dark:bg-bitter-lime/10 border-forest/30 dark:border-bitter-lime/30',
    inputClass: 'bg-white dark:bg-[#161616] border-stone-200 dark:border-white/10 focus:border-charcoal dark:focus:border-white/30 text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700',
    labelClass: 'text-stone-400 dark:text-stone-500',
    titleClass: 'text-charcoal dark:text-white',
    mutedTextClass: 'text-stone-400 dark:text-stone-500',
    secondaryActionClass: 'text-stone-500 dark:text-stone-400 hover:text-charcoal dark:hover:text-white',
    secondaryPillClass: 'bg-stone-100 dark:bg-[#252525] text-stone-400 dark:text-stone-500',
    accentPanelClass: 'bg-bitter-lime/10 border border-bitter-lime/30 text-bitter-lime',
    progressTrackClass: 'bg-stone-200 dark:bg-[#202020]',
    progressClass: 'bg-charcoal dark:bg-white',
    choiceClass: 'bg-white dark:bg-[#202020] border-sand dark:border-white/10 hover:border-stone-300 dark:hover:border-white/20',
    actionTextClass: 'text-forest dark:text-bitter-lime',
  },
};

export const getCinemaProviderBrand = (
  provider: CinemaSubscriptionProvider
): CinemaProviderBrand => CINEMA_PROVIDER_BRANDS[provider];
