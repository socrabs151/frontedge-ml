import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import { en, ru, type Dictionary, type StringKey } from "./strings";

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

export interface I18nProviderProps {
  children: ReactNode;
  defaultLang?: Lang;
  /** Controlled language. Pass `onLangChange` to keep the toggle working. */
  lang?: Lang;
  onLangChange?: (lang: Lang) => void;
  /** Product strings layered over the package dictionary for each language. */
  strings?: Partial<Record<Lang, Partial<Dictionary>>>;
  /** Keep the choice in localStorage; ignored while `lang` is controlled. */
  persist?: boolean;
  /** Write `lang` onto `<html>`; a host that owns the document can turn this off. */
  syncDocument?: boolean;
}

export function I18nProvider({
  children,
  defaultLang = "en",
  lang: controlledLang,
  onLangChange,
  strings,
  persist = true,
  syncDocument = true,
}: I18nProviderProps) {
  const [ownLang, setOwnLang] = useState<Lang>(() => {
    const stored =
      persist && typeof localStorage !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null;
    return stored === "ru" || stored === "en" ? stored : defaultLang;
  });
  const lang = controlledLang ?? ownLang;

  const setLang = useCallback(
    (next: Lang) => {
      if (controlledLang === undefined) {
        if (persist) localStorage.setItem(STORAGE_KEY, next);
        setOwnLang(next);
      }
      onLangChange?.(next);
    },
    [controlledLang, onLangChange, persist],
  );

  useEffect(() => {
    if (!syncDocument) return;
    document.documentElement.lang = lang;
    document.documentElement.dataset.lang = lang;
  }, [lang, syncDocument]);

  const dictionary = useMemo(
    () => ({ ...dictionaries[lang], ...(strings?.[lang] ?? {}) }),
    [lang, strings],
  );
  const value = useMemo<I18nValue>(
    () => ({
      lang,
      setLang,
      t: (key, params) => interpolate(dictionary[key], params),
    }),
    [dictionary, lang, setLang],
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
