import React, { createContext, useContext, useState } from 'react';
import { fr } from '../translations/fr';
import { en } from '../translations/en';

export type Language = 'fr' | 'en';
type TranslationMap = Record<string, string>;

const translations: Record<Language, TranslationMap> = { fr, en };

const LANG_STORAGE_KEY = 'the_bitter_language';

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  /** Vrai une fois la langue choisie : avant, l'accueil la demande. */
  hasChosenLanguage: boolean;
  /** La langue du téléphone, proposée en premier tant que rien n'est choisi. */
  deviceLanguage: Language;
  t: (key: string, params?: Record<string, string | number>) => string;
}

/** Anglais si le téléphone est réglé en anglais, français sinon. */
const detectDeviceLanguage = (): Language => {
  try {
    return (navigator.language || '').toLowerCase().startsWith('en') ? 'en' : 'fr';
  } catch {
    return 'fr';
  }
};

const readSavedLanguage = (): Language | null => {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'en' || saved === 'fr' ? saved : null;
  } catch {
    return null;
  }
};

/** Des profils existent déjà sur l'appareil : l'app y tournait avant le choix de langue. */
const hasExistingProfiles = (): boolean => {
  try {
    const raw = localStorage.getItem('the_bitter_profiles_v2');
    return !!raw && (JSON.parse(raw) as unknown[]).length > 0;
  } catch {
    return false;
  }
};

const LanguageContext = createContext<LanguageContextType>({
  language: 'fr',
  setLanguage: () => {},
  hasChosenLanguage: true,
  deviceLanguage: 'fr',
  t: (key) => key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [deviceLanguage] = useState<Language>(detectDeviceLanguage);
  // Une installation qui a déjà des profils a toujours été en français : elle
  // le reste, sans qu'on lui pose la question à la mise à jour.
  const [hasChosenLanguage, setHasChosenLanguage] = useState(
    () => readSavedLanguage() != null || hasExistingProfiles()
  );
  // Sinon, tant que rien n'est choisi, on parle la langue du téléphone.
  const [language, setLanguageState] = useState<Language>(
    () => readSavedLanguage() ?? (hasExistingProfiles() ? 'fr' : deviceLanguage)
  );

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    setHasChosenLanguage(true);
    try {
      localStorage.setItem(LANG_STORAGE_KEY, lang);
    } catch {
      // Stockage indisponible : la langue vaut pour la session.
    }
    document.documentElement.lang = lang;
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const map = translations[language];
    let str = map[key] ?? translations.fr[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        // split/join plutôt que replace : replace ne remplace que la 1re occurrence,
        // or certaines chaînes utilisent le même token deux fois ('{count} film{s} vu{s}').
        str = str.split(`{${k}}`).join(String(v));
      });
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t, hasChosenLanguage, deviceLanguage }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
