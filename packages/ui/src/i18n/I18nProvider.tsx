import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en, ru, type StringKey } from "./strings";

export type Lang = "en" | "ru";

const STORAGE_KEY = "fe-lang";

const dictionaries = { en, ru } as const;

export interface I18nValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: StringKey, params?: Record<string, string | number>) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

/**
 * A component may be used on its own, without the provider: it then speaks English.
 * The provider is what turns the toggle on.
 */
const fallback: I18nValue = {
  lang: "en",
  setLang: () => {},
  t: (key, params) => interpolate(en[key], params),
};

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  );
}

export function I18nProvider({
  children,
  defaultLang = "en",
}: {
  children: ReactNode;
  defaultLang?: Lang;
}) {
  const [lang, setLangState] = useState<Lang>(() => {
    const stored = typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return stored === "ru" || stored === "en" ? stored : defaultLang;
  });

  const setLang = useCallback((next: Lang) => {
    localStorage.setItem(STORAGE_KEY, next);
    setLangState(next);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  }, [lang]);

  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key, params) => interpolate(dictionaries[lang][key], params),
    }),
    [lang, setLang],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  return useContext(I18nContext) ?? fallback;
}

/** The package dictionary for the selected language. */
export function useT() {
  const { t } = useI18n();
  return t;
}
