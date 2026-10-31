// Язык на сервере: cookie gs_lang запроса, иначе язык браузера (Accept-Language).
// Достаточно импортировать этот файл (он импортируется в lib/helpers.ts) —
// после этого t() в API-маршрутах и письмах отвечает на языке пользователя.
import { cookies, headers } from "next/headers";
import { registerServerLang, isLang, langFromAcceptLanguage, LANG_COOKIE, type Lang } from "./i18n";

export function requestLang(): Lang {
  const c = cookies().get(LANG_COOKIE)?.value;
  if (isLang(c)) return c;
  return langFromAcceptLanguage(headers().get("accept-language"));
}

registerServerLang(requestLang);
