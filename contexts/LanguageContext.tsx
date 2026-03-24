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
  t: (key: string, params?: Record<string, string | number>) => string;
}

const LanguageContext = createContext<LanguageContextType>({
  language: 'fr',
  setLanguage: () => {},
  t: (key) => key,
});

export const LanguageProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [language, setLanguageState] = useState<Language>(() => {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    return saved === 'en' ? 'en' : 'fr';
  });

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    localStorage.setItem(LANG_STORAGE_KEY, lang);
  };

  const t = (key: string, params?: Record<string, string | number>): string => {
    const map = translations[language];
    let str = map[key] ?? translations.fr[key] ?? key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        str = str.replace(`{${k}}`, String(v));
      });
    }
    return str;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useLanguage = () => useContext(LanguageContext);
