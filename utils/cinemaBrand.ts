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
  /**
   * La tuile d'accueil, dans l'onglet Profil des statistiques.
   *
   * Elle est le seul endroit où la marque doit se voir de loin : c'est par elle
   * qu'on reconnaît son abonnement sans lire. Une surface à part plutôt que
   * `cardClass`, car cette dernière sert aussi aux cartes des modales — les
   * teinter reviendrait à repeindre l'écran entier, ce qu'on vient justement
   * d'arrêter de faire.
   */
  tileClass: string;
}

/**
 * Le socle : l'identité de l'application, pour tout ce qui n'est pas la marque.
 *
 * Chaque partenaire habillait auparavant l'écran entier — fond, en-tête, pied,
 * cartes, champs, étiquettes, textes secondaires. Vingt-cinq surfaces, sept
 * couleurs et seize niveaux de transparence pour le seul thème UGC, là où le
 * reste de l'application en emploie quatre. Ce n'est pas la couleur qui vieillit
 * un écran, c'est ce nombre : quand des bordures voisines portent 15 %, 20 % et
 * 25 % d'opacité, l'œil ne lit plus une hiérarchie, il lit du bruit.
 *
 * Et l'utilisateur quittait visuellement The Bitter pour entrer dans une
 * application UGC, puis dans une application Pathé : trois identités dans un
 * même parcours.
 *
 * La marque ne garde donc que ce qui la fait reconnaître — le badge, la pastille
 * sélectionnée, l'accent — et le reste redevient l'écran de l'application.
 */
const APP_SURFACES = {
  modalClass: 'bg-cream dark:bg-[#0c0c0c] border-white/20 dark:border-white/10',
  headerClass: 'bg-white dark:bg-[#1a1a1a] border-sand dark:border-white/5',
  headerTitleClass: 'text-charcoal dark:text-white',
  headerMutedClass: 'text-stone-400 dark:text-stone-500',
  headerControlClass: 'bg-stone-100 dark:bg-[#252525] text-stone-500 dark:text-stone-400',
  contentClass: 'bg-cream dark:bg-[#0c0c0c]',
  footerClass: 'bg-white dark:bg-[#1a1a1a] border-sand dark:border-white/5',
  cardClass: 'bg-white dark:bg-[#202020] border-sand dark:border-white/10',
  inputClass:
    'bg-white dark:bg-[#161616] border-stone-200 dark:border-white/10 focus:border-charcoal dark:focus:border-white/30 text-charcoal dark:text-white placeholder:text-stone-300 dark:placeholder:text-stone-700',
  labelClass: 'text-stone-400 dark:text-stone-500',
  titleClass: 'text-charcoal dark:text-white',
  mutedTextClass: 'text-stone-400 dark:text-stone-500',
  secondaryActionClass: 'text-stone-500 dark:text-stone-400 hover:text-charcoal dark:hover:text-white',
  secondaryPillClass: 'bg-stone-100 dark:bg-[#252525] text-stone-400 dark:text-stone-500',
  progressTrackClass: 'bg-stone-200 dark:bg-[#202020]',
  choiceClass:
    'bg-white dark:bg-[#202020] border-sand dark:border-white/10 hover:border-stone-300 dark:hover:border-white/20',
  /**
   * Aucune police de marque.
   *
   * `font-[Heebo]` apparaissait huit fois par thème. Heebo est dessinée pour
   * l'hébreu et son jeu latin dérive de Roboto : sur du français, elle
   * n'évoque pas la marque, elle évoque Android — à côté d'une application
   * entièrement composée en Inter. Deux grotesques presque identiques se
   * disputaient l'écran, et le chargement différé faisait sauter le texte de
   * l'une à l'autre au premier affichage. Une marque se reconnaît à sa couleur,
   * pas à sa graisse.
   */
  fontClass: '',
} as const;

/** Trois niveaux d'opacité, répétés. Pas seize. */
const CINEMA_PROVIDER_BRANDS: Record<CinemaSubscriptionProvider, CinemaProviderBrand> = {
  ugc: {
    ...APP_SURFACES,
    label: 'UGC',
    badgeClass: 'bg-[#001340] text-white border-[#001340]',
    subtleClass: 'bg-[#001340]/10 text-[#001340] dark:text-[#9DB6FF] border-[#001340]/20',
    selectedClass: 'bg-[#001340] text-white border-[#001340]',
    selectedCardClass: 'bg-[#001340]/10 dark:bg-[#001340]/30 border-[#001340]/40 dark:border-[#9DB6FF]/40',
    accentPanelClass: 'bg-[#001340] text-white border border-[#001340]',
    progressClass: 'bg-[#001340] dark:bg-[#9DB6FF]',
    tileClass: 'bg-[#001340]/[0.07] dark:bg-[#001340]/40 border-[#001340]/25 dark:border-[#9DB6FF]/30',
    actionTextClass: 'text-[#001340] dark:text-[#9DB6FF]',
  },
  pathe: {
    ...APP_SURFACES,
    label: 'Pathé',
    badgeClass: 'bg-[#FFC105] text-black border-[#FFC105]',
    subtleClass: 'bg-[#FFC105]/20 text-charcoal dark:text-[#FFC105] border-[#FFC105]/40',
    selectedClass: 'bg-[#FFC105] text-black border-[#FFC105]',
    selectedCardClass: 'bg-[#FFC105]/20 dark:bg-[#FFC105]/10 border-[#FFC105]/40',
    accentPanelClass: 'bg-[#FFC105] text-black border border-[#FFC105]',
    progressClass: 'bg-[#FFC105]',
    tileClass: 'bg-[#FFC105]/[0.12] dark:bg-[#FFC105]/10 border-[#FFC105]/40 dark:border-[#FFC105]/30',
    actionTextClass: 'text-charcoal dark:text-[#FFC105]',
  },
  custom: {
    ...APP_SURFACES,
    label: 'Cinéma',
    badgeClass: 'bg-charcoal dark:bg-white text-white dark:text-charcoal border-charcoal dark:border-white',
    subtleClass:
      'bg-stone-100 dark:bg-[#252525] text-charcoal dark:text-white border-stone-200 dark:border-white/10',
    selectedClass:
      'bg-charcoal dark:bg-white text-white dark:text-charcoal border-charcoal dark:border-white',
    selectedCardClass: 'bg-forest/5 dark:bg-bitter-lime/10 border-forest/30 dark:border-bitter-lime/30',
    accentPanelClass: 'bg-bitter-lime/10 border border-bitter-lime/30 text-bitter-lime',
    progressClass: 'bg-charcoal dark:bg-white',
    tileClass: 'bg-white dark:bg-[#202020] border-sand dark:border-white/10',
    actionTextClass: 'text-forest dark:text-bitter-lime',
  },
};

export const getCinemaProviderBrand = (
  provider: CinemaSubscriptionProvider
): CinemaProviderBrand => CINEMA_PROVIDER_BRANDS[provider];
