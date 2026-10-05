import React, { useEffect, useMemo, useState } from 'react';
import { X, Check, Loader2, Shuffle, Trash2, ImagePlus } from 'lucide-react';
import { UploadError, isUploadedAvatar } from '../services/avatarUpload';
import {
  AVATAR_STYLES,
  AvatarStyle,
  avatarSeeds,
  avatarSrc,
  buildAvatarDescriptor,
} from '../utils/avatar';
import { haptics } from '../utils/haptics';
import { useLanguage } from '../contexts/LanguageContext';
import { useDialog } from '../utils/useDialog';

interface Props {
  profileId: string;
  /** Avatar actuel, pour le montrer sélectionné à l'ouverture. */
  current?: string | null;
  onChoose: (descriptor: string | null) => Promise<void> | void;
  onClose: () => void;
  /**
   * Envoie une photo de la galerie et rend son adresse. Absent sans compte :
   * la photo vit sur le serveur, pour que les membres des espaces la voient.
   */
  onUploadPhoto?: (file: File) => Promise<{ url?: string; error?: UploadError }>;
}

/** Valeur de sélection d'une photo choisie mais pas encore envoyée. */
const NEW_PHOTO = 'photo:new';

/**
 * Choix d'un avatar dans une grille.
 *
 * Toute la planche est fabriquée sur l'appareil : aucun appel réseau, donc aucune
 * attente et aucun écran de chargement. C'est ce qui permet d'afficher une centaine
 * de propositions sans y penser, là où une banque d'images distante imposerait de
 * paginer.
 */
const AvatarPickerModal: React.FC<Props> = ({ profileId, current, onChoose, onClose, onUploadPhoto }) => {
  const { t } = useLanguage();
  const dialog = useDialog(onClose, t('avatar.title'));

  const [round, setRound] = useState(0);
  const [selected, setSelected] = useState<string | null>(current ?? null);
  const [saving, setSaving] = useState(false);
  /** Photo choisie dans la galerie, montrée tout de suite, envoyée à la confirmation. */
  const [photo, setPhoto] = useState<{ file: File; preview: string } | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);
  useEffect(
    () => () => {
      if (photo) URL.revokeObjectURL(photo.preview);
    },
    [photo]
  );
  const uploadedCurrent = isUploadedAvatar(current) ? (current as string) : null;
  const photoShown = photo?.preview ?? uploadedCurrent;
  const photoSelected = selected === NEW_PHOTO || (!!uploadedCurrent && selected === uploadedCurrent);

  const pickPhoto = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    haptics.soft();
    setPhotoError(null);
    setPhoto({ file, preview: URL.createObjectURL(file) });
    setSelected(NEW_PHOTO);
  };

  /**
   * Un style par ligne, six graines par style. Grouper par style plutôt que de tout
   * mélanger : on choisit d'abord une famille de dessin, puis un visage dedans.
   */
  const grid = useMemo(
    () =>
      AVATAR_STYLES.map((style) => ({
        style,
        options: avatarSeeds(profileId, round).map((seed) => ({
          seed,
          descriptor: buildAvatarDescriptor(style as AvatarStyle, seed),
        })),
      })),
    [profileId, round]
  );

  const confirm = async () => {
    if (saving) return;
    setSaving(true);
    let choice = selected;
    if (selected === NEW_PHOTO && photo && onUploadPhoto) {
      const result = await onUploadPhoto(photo.file);
      if (!result.url) {
        haptics.error();
        setPhotoError(t(`avatar.err.${result.error ?? 'failed'}`));
        setSaving(false);
        return;
      }
      choice = result.url;
    }
    haptics.success();
    await onChoose(choice);
    setSaving(false);
    onClose();
  };

  return (
    <div
      {...dialog.props}
      className="fixed inset-0 z-[270] flex items-end sm:items-center justify-center p-0 sm:p-6 bg-charcoal/60 dark:bg-black/85 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]"
    >
      <div className="relative w-full sm:max-w-md bg-cream dark:bg-[#0c0c0c] rounded-t-[2.5rem] sm:rounded-[2.5rem] shadow-2xl flex flex-col max-h-[92dvh] overflow-hidden animate-[slideUp_0.4s_cubic-bezier(0.16,1,0.3,1)] border-t border-white/20 dark:border-white/10">
        <div className="px-6 pt-5 pb-4 border-b border-sand dark:border-white/5 flex items-center justify-between bg-white dark:bg-[#1a1a1a] shrink-0">
          <h2 className="text-xl font-black tracking-tight text-charcoal dark:text-white truncate">
            {t('avatar.title')}
          </h2>
          <div className="flex items-center gap-2 shrink-0 ml-3">
            <button
              onClick={() => {
                haptics.soft();
                setRound((n) => n + 1);
              }}
              aria-label={t('avatar.reroll')}
              className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
            >
              <Shuffle size={15} />
            </button>
            <button
              onClick={onClose}
              aria-label={t('common.close')}
              className="w-8 h-8 rounded-full bg-stone-100 dark:bg-[#252525] flex items-center justify-center active:scale-90 transition-transform text-stone-500 dark:text-stone-400"
            >
              <X size={18} strokeWidth={2.5} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar p-6 space-y-6">
          {/* Une vraie photo d'abord : c'est ce qui fait reconnaître quelqu'un
              dans un espace. Les dessins restent en dessous. */}
          <div className="space-y-3">
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-500">
              {t('avatar.photoTitle')}
            </p>
            {onUploadPhoto ? (
              <div className="flex items-center gap-4">
                <button
                  onClick={() => photoShown && setSelected(photo ? NEW_PHOTO : uploadedCurrent)}
                  aria-pressed={photoSelected}
                  aria-label={t('avatar.photoTitle')}
                  className={`w-20 h-20 shrink-0 rounded-full overflow-hidden border-[3px] transition-all ${photoSelected ? 'border-charcoal dark:border-bitter-lime' : 'border-transparent'} bg-stone-100 dark:bg-[#202020] flex items-center justify-center`}
                >
                  {photoShown ? (
                    <img src={photoShown} alt="" className="w-full h-full object-cover" />
                  ) : (
                    <ImagePlus size={24} className="text-stone-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0 space-y-1.5">
                  <label className="inline-flex items-center gap-2 h-11 px-4 rounded-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal text-xs font-black cursor-pointer active:scale-95 transition-transform">
                    <ImagePlus size={15} strokeWidth={2.5} />
                    {photoShown ? t('avatar.changePhoto') : t('avatar.pickPhoto')}
                    <input type="file" accept="image/*" onChange={pickPhoto} className="sr-only" />
                  </label>
                  <p className="text-[11px] font-semibold text-stone-500 dark:text-stone-500">{t('avatar.photoHint')}</p>
                </div>
              </div>
            ) : (
              <p className="text-xs font-semibold text-stone-500 dark:text-stone-400">{t('avatar.err.no-account')}</p>
            )}
            {photoError && <p className="text-xs font-bold text-orange-600 dark:text-orange-400">{photoError}</p>}
          </div>

          <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-500 dark:text-stone-500 -mb-3">
            {t('avatar.drawnTitle')}
          </p>
          {grid.map(({ style, options }) => (
            <div key={style} className="space-y-2">
              <p className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400 dark:text-stone-500">
                {style.replace(/-/g, ' ')}
              </p>
              <div className="grid grid-cols-6 gap-2">
                {options.map(({ seed, descriptor }) => {
                  const isSelected = selected === descriptor;
                  return (
                    <button
                      key={seed}
                      onClick={() => {
                        haptics.soft();
                        setSelected(descriptor);
                      }}
                      aria-pressed={isSelected}
                      className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all active:scale-90 ${
                        isSelected
                          ? 'border-charcoal dark:border-bitter-lime scale-105'
                          : 'border-transparent bg-white dark:bg-[#202020]'
                      }`}
                    >
                      <img
                        src={avatarSrc(descriptor) ?? undefined}
                        alt=""
                        className="w-full h-full object-cover"
                        loading="lazy"
                        decoding="async"
                      />
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="p-6 pt-4 border-t border-sand dark:border-white/5 bg-white dark:bg-[#1a1a1a] shrink-0 space-y-2">
          <button
            onClick={confirm}
            disabled={saving}
            className="w-full bg-charcoal dark:bg-bitter-lime text-white dark:text-charcoal py-4 rounded-2xl font-black text-[11px] uppercase tracking-[0.2em] active:scale-95 transition-all disabled:opacity-40 flex items-center justify-center gap-2"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} strokeWidth={3} />}
            {t('avatar.confirm')}
          </button>

          {/* Retirer son avatar doit rester possible : on revient alors à l'initiale,
              qui est le repli déjà utilisé partout dans l'app. */}
          {current && (
            <button
              onClick={() => {
                haptics.medium();
                setSelected(null);
              }}
              className="w-full py-3 rounded-2xl text-stone-400 dark:text-stone-600 font-black text-[10px] uppercase tracking-[0.2em] flex items-center justify-center gap-2 active:scale-95 transition-all hover:text-orange-400"
            >
              <Trash2 size={13} />
              {t('avatar.remove')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default AvatarPickerModal;
