"use client";

import { setCurrentLang, LANGS, LANG_COOKIE, type Lang } from "@/lib/i18n";

// Задаёт язык для всех страниц. Значение приходит с сервера (app/layout.tsx),
// поэтому страница сразу отрисовывается на нужном языке.
export default function LangProvider({ lang, children }: { lang: Lang; children: React.ReactNode }) {
  setCurrentLang(lang);
  return <>{children}</>;
}

export function switchLang(l: Lang) {
  document.cookie = `${LANG_COOKIE}=${l}; path=/; max-age=31536000; samesite=lax`;
  window.location.reload();
}

// Переключатель RU | EN | DE для синей шапки.
export function LangSwitcher({ current }: { current: Lang }) {
  return (
    <span className="flex items-center gap-1" aria-label="Language">
      {LANGS.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 && <span className="text-white/60">|</span>}
          {l === current
            ? <b className="text-white">{l.toUpperCase()}</b>
            : <button type="button" onClick={() => switchLang(l)} className="text-white underline">{l.toUpperCase()}</button>}
        </span>
      ))}
    </span>
  );
}
