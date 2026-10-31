"use client";
import { t } from "@/lib/i18n";

import { SiteHeader } from "@/components/Logo";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";

export default function ResetPasswordPage() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const supabase = supabaseBrowser();

    // Основной вариант: ссылка из нашего письма вида /reset-password?token_hash=...&type=recovery.
    // Проверяем одноразовый токен — Supabase создаёт временную сессию, в которой можно сменить пароль.
    const params = new URLSearchParams(window.location.search);
    const tokenHash = params.get("token_hash");
    if (tokenHash) {
      supabase.auth.verifyOtp({ token_hash: tokenHash, type: "recovery" }).then(({ error }) => {
        // убираем токен из адресной строки, чтобы он не остался в истории браузера
        window.history.replaceState(null, "", "/reset-password");
        setReady(!error);
        setChecking(false);
      });
      return;
    }

    // Резервный вариант: ссылка из стандартного письма Supabase сама устанавливает временную сессию восстановления
    // в браузере и генерирует событие PASSWORD_RECOVERY — ждём его.
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") { setReady(true); setChecking(false); }
    });

    // на случай, если событие уже произошло до подписки
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
      setChecking(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    if (password.length < 6) { setError(t("Пароль должен быть не короче 6 символов")); return; }
    if (password !== confirm) { setError(t("Пароли не совпадают")); return; }
    setLoading(true);
    const supabase = supabaseBrowser();
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { setError(error.message); return; }
    setDone(true);
    setTimeout(() => router.push("/dashboard"), 1500);
  }

  return (
    <>
    <SiteHeader />
    <div className="max-w-sm mx-auto px-4 py-8">
      <div className="text-center mb-6">
                <h1 className="text-xl font-bold text-link">{t("Новый пароль")}</h1>
      </div>

      {checking ? (
        <div className="text-center text-sm text-gray-500">{t("Проверяем ссылку…")}</div>
      ) : done ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center text-sm text-gray-700">
          
          {t("Пароль изменён. Переходим в кабинет…")}
        </div>
      ) : !ready ? (
        <div className="bg-white border border-gray-200 rounded-lg p-6 text-center space-y-3">
          <div className="text-sm text-gray-700">{t("Ссылка недействительна или устарела.")}</div>
          <a href="/forgot-password" className="inline-block text-sm text-gray-600 hover:text-ink underline">{t("Запросить новую ссылку")}</a>
        </div>
      ) : (
        <form onSubmit={submit} className="bg-white border border-gray-300 p-4 space-y-4">
          <label className="block">
            <div className="text-xs font-medium text-gray-600 mb-1.5">{t("Новый пароль (мин. 6 симв.)")}</div>
            <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none " />
          </label>
          <label className="block">
            <div className="text-xs font-medium text-gray-600 mb-1.5">{t("Повторите пароль")}</div>
            <input value={confirm} onChange={(e) => setConfirm(e.target.value)} type="password" required
              className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:outline-none " />
          </label>
          {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
          <button disabled={loading} type="submit" className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-50">
            {loading ? t("Сохраняем…") : t("Сохранить новый пароль")}
          </button>
        </form>
      )}
    </div>
    </>
  );
}
