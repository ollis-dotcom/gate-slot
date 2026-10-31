// ============================================================
// Переводы интерфейса: русский (исходный текст) → английский, немецкий.
//
// Как это устроено:
//  • Ключ перевода — сам русский текст: t("Войти") → "Sign in" / "Anmelden".
//  • Подстановки: t("Бронь {0} подтверждена", { 0: id }).
//  • Если перевода нет — показывается русский текст (ничего не ломается).
//  • Язык хранится в cookie gs_lang. Без cookie — по языку браузера.
//  • В браузере язык задаёт <LangProvider> (components/LangProvider.tsx),
//    на сервере (API, письма) — lib/i18n-server.ts по cookie запроса.
// ============================================================
import { DICT } from "./i18n-dict";

export type Lang = "ru" | "en" | "de";
export const LANGS: Lang[] = ["ru", "en", "de"];
export const LANG_COOKIE = "gs_lang";

export function isLang(v: any): v is Lang {
  return v === "ru" || v === "en" || v === "de";
}

// Язык по заголовку Accept-Language браузера: de → немецкий, ru → русский, иначе английский.
export function langFromAcceptLanguage(header: string | null | undefined): Lang {
  const h = (header || "").toLowerCase();
  const first = h.split(",").map((p) => p.trim().slice(0, 2)).find((p) => isLang(p));
  return (first as Lang) || "en";
}

export function translate(lang: Lang, key: string, vars?: Record<string | number, any>) {
  let s = key;
  if (lang !== "ru") {
    const entry = DICT[key];
    if (entry && entry[lang]) s = entry[lang];
  }
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k] ?? "") : m));
  return s;
}

// Текущий язык в браузере / при отрисовке страницы. Задаётся LangProvider.
let currentLang: Lang = "ru";
// На сервере (API-маршруты) язык берётся из cookie запроса — см. lib/i18n-server.ts.
let serverResolver: (() => Lang) | null = null;

export function setCurrentLang(l: Lang) { currentLang = l; }
export function registerServerLang(fn: () => Lang) { serverResolver = fn; }

export function getLang(): Lang {
  if (serverResolver) {
    try { return serverResolver(); } catch { /* вне запроса — язык по умолчанию */ }
  }
  return currentLang;
}

export function t(key: string, vars?: Record<string | number, any>) {
  return translate(getLang(), key, vars);
}

// Локаль для дат и чисел.
export function locale() {
  return ({ ru: "ru-RU", en: "en-GB", de: "de-DE" } as const)[getLang()];
}
