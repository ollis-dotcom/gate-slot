"use client";

import { SiteHeader } from "@/components/Logo";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, ShieldCheck, MapPin, Mail, Copy, Download, Trash2, X } from "lucide-react";

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: "Подтверждено", color: "#2B6B4F", bg: "#E8F3EC" },
  arrived: { label: "На месте", color: "#1E5A8C", bg: "#E4EFF7" },
  departed: { label: "Убыл", color: "#5A5F6B", bg: "#EEEFF1" },
  no_show: { label: "Не явился", color: "#B23A2E", bg: "#FBEAE8" },
  cancelled: { label: "Отменено", color: "#8A8F98", bg: "#F1F0EC" },
};

const NOTIF_KIND: Record<string, { label: string; color: string; bg: string }> = {
  confirmation: { label: "Подтверждение", color: "#2B6B4F", bg: "#E8F3EC" },
  reminder: { label: "Напоминание", color: "#946B1E", bg: "#FBF0DD" },
  update: { label: "Изменение", color: "#1E5A8C", bg: "#E4EFF7" },
  cancellation: { label: "Отмена", color: "#B23A2E", bg: "#FBEAE8" },
};

export default function SuperAdminWarehousePage({ params }: { params: { id: string } }) {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [notFound, setNotFound] = useState(false);
  const [warehouse, setWarehouse] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [tab, setTab] = useState<"bookings" | "notifications">("bookings");
  const [showDelete, setShowDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const [deleteUserToo, setDeleteUserToo] = useState(false);

  useEffect(() => {
    fetch(`/api/superadmin/warehouse/${params.id}`).then(async (r) => {
      if (r.status === 403) { setDenied(true); setLoading(false); return; }
      if (r.status === 404) { setNotFound(true); setLoading(false); return; }
      const j = await r.json();
      setWarehouse(j.warehouse);
      setBookings(j.bookings || []);
      setNotifications(j.notifications || []);
      setLoading(false);
    });
  }, [params.id]);

  async function deleteWarehouse() {
    if (confirmText.trim() !== warehouse.slug) return;
    setDeleting(true);
    setDeleteError("");
    const res = await fetch(`/api/superadmin/warehouse/${params.id}${deleteUserToo ? "?withUser=1" : ""}`, { method: "DELETE" });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      setDeleting(false);
      setDeleteError(j.error || "Не удалось удалить склад");
      return;
    }
    router.push("/superadmin");
  }

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm font-mono">ЗАГРУЗКА…</div>;
  if (denied) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Доступ запрещён</div>;
  if (notFound || !warehouse) return <div className="min-h-screen flex items-center justify-center text-sm text-gray-500">Склад не найден</div>;

  const bookingLink = typeof window !== "undefined" ? `${window.location.origin}/book/${warehouse.slug}` : "";

  return (
    <div className="min-h-screen">
      <SiteHeader href="/superadmin" subtitle={<span className="flex items-center gap-1"><ShieldCheck size={11} /> Просмотр из супер-админки: {warehouse.name}</span>}>
        <a href={`/api/superadmin/warehouse/${params.id}/export`} className="text-white underline">Экспорт CSV</a>
        <span>|</span>
        <button onClick={() => { setShowDelete(true); setConfirmText(""); setDeleteError(""); setDeleteUserToo(false); }} className="text-white underline">Удалить склад</button>
        <span>|</span>
        <a href="/superadmin" className="text-white underline">Ко всем складам</a>
      </SiteHeader>

      <div className="max-w-5xl mx-auto px-5 py-8">
        <div className="bg-white border border-gray-300 rounded-lg p-5 mb-6 grid sm:grid-cols-2 gap-3 text-sm">
          <div className="flex items-center gap-2 text-gray-700"><MapPin size={14} className="text-gray-400" /> {warehouse.city}{warehouse.address ? `, ${warehouse.address}` : " — адрес не указан"}</div>
          <div className="flex items-center gap-2 text-gray-700"><Mail size={14} className="text-gray-400" /> {warehouse.ownerEmail || "—"}</div>
          <div className="text-gray-500 text-xs font-mono">Зон: {warehouse.gates} · Слот: {warehouse.slot_minutes} мин · Часы: {warehouse.start_hour}:00–{warehouse.end_hour}:00 · Горизонт: {warehouse.booking_horizon_days ? `${warehouse.booking_horizon_days} дн.` : "без огр."} · Запрет отмены: {warehouse.cancel_limit_hours ? `${warehouse.cancel_limit_hours} ч` : "нет"}</div>
          <div className="text-gray-500 text-xs font-mono">Создан: {new Date(warehouse.created_at).toLocaleDateString("ru-RU")}</div>
          <div className="sm:col-span-2 flex items-center gap-2">
            <span className="text-xs font-mono text-gray-500 break-all">{bookingLink}</span>
            <button
              onClick={() => navigator.clipboard?.writeText(bookingLink)}
              className="text-xs px-2 py-1 border border-gray-300 rounded hover:bg-gray-100 flex items-center gap-1 shrink-0"
            >
              <Copy size={11} /> Копировать
            </button>
          </div>
        </div>

        <div className="flex gap-1 bg-gray-200 p-1 rounded-md mb-5 w-fit">
          <button onClick={() => setTab("bookings")} className={`px-3 py-1.5 rounded text-sm font-semibold ${tab === "bookings" ? "bg-ink text-amber" : "text-gray-600"}`}>Брони ({bookings.length})</button>
          <button onClick={() => setTab("notifications")} className={`px-3 py-1.5 rounded text-sm font-semibold ${tab === "notifications" ? "bg-ink text-amber" : "text-gray-600"}`}>Уведомления ({notifications.length})</button>
        </div>

        {tab === "bookings" ? (
          bookings.length === 0 ? (
            <div className="bg-white border border-dashed border-gray-300 rounded-lg py-16 text-center text-gray-400 text-sm">Броней пока нет</div>
          ) : (
            <div className="bg-white border border-gray-300 rounded-lg overflow-hidden divide-y divide-gray-100">
              {bookings.map((b) => {
                const st = STATUS[b.status] || STATUS.confirmed;
                return (
                  <div key={b.id} className="p-4 flex items-center gap-4 flex-wrap">
                    <div className="font-mono text-xs text-gray-500 w-24">{b.date}</div>
                    <div className="font-mono text-sm font-bold w-14">{b.time}</div>
                    <div className="font-mono text-xs bg-ink text-amber px-2 py-0.5 rounded font-bold">ЗОНА {b.gate}</div>
                    <div className="flex-1 min-w-[180px]">
                      <div className="text-sm font-semibold">{b.company} <span className="text-gray-500 font-normal">· {b.carrier}</span></div>
                      <div className="text-xs text-gray-500">{b.plate} · {b.phone} · {b.email} · <span className="font-mono">{b.id}</span></div>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 rounded" style={{ color: st.color, background: st.bg }}>{st.label}</span>
                  </div>
                );
              })}
            </div>
          )
        ) : notifications.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg py-16 text-center text-gray-400 text-sm">Уведомлений пока нет</div>
        ) : (
          <div className="bg-white border border-gray-300 rounded-lg overflow-hidden divide-y divide-gray-100">
            {notifications.map((n) => {
              const kind = NOTIF_KIND[n.type] || NOTIF_KIND.confirmation;
              return (
                <div key={n.id} className="p-4">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ color: kind.color, background: kind.bg }}>{kind.label}</span>
                    <span className="text-[10px] text-gray-400 font-mono">{new Date(n.sent_at).toLocaleString("ru-RU")}</span>
                  </div>
                  <div className="text-sm font-semibold">{n.subject}</div>
                  <div className="text-xs text-gray-500 mb-1">Кому: {n.to_email}</div>
                  <div className="text-xs text-gray-600">{n.body}</div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {showDelete && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !deleting && setShowDelete(false)}>
          <div className="bg-white rounded-lg p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-display text-lg font-bold text-red-600">Удалить склад безвозвратно</h3>
              <button onClick={() => setShowDelete(false)} disabled={deleting}><X size={18} /></button>
            </div>
            <p className="text-sm text-gray-700 mb-1">Склад «{warehouse.name}» и <b>все</b> его брони ({bookings.length}) и уведомления ({notifications.length}) будут удалены без возможности восстановления.</p>
            <label className="flex items-start gap-2 text-sm text-gray-700 mb-4 cursor-pointer">
              <input type="checkbox" className="mt-0.5" checked={deleteUserToo} onChange={(e) => setDeleteUserToo(e.target.checked)} />
              <span>
                Удалить и аккаунт владельца ({warehouse.ownerEmail || "—"}).
                <span className="block text-xs text-gray-500 mt-0.5">
                  {deleteUserToo
                    ? "Email освободится — с ним можно будет заново зарегистрироваться."
                    : "Без галочки аккаунт останется: после входа владелец сможет создать новый склад под тем же email."}
                </span>
              </span>
            </label>
            <label className="block mb-4">
              <div className="text-xs font-medium text-gray-600 mb-1.5">Чтобы подтвердить, введите код склада: <span className="font-mono font-bold">{warehouse.slug}</span></div>
              <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" />
            </label>
            {deleteError && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md mb-4">{deleteError}</div>}
            <div className="flex gap-2">
              <button onClick={() => setShowDelete(false)} disabled={deleting} className="flex-1 py-2.5 border border-gray-300 rounded-md text-sm font-semibold disabled:opacity-40">Отмена</button>
              <button
                onClick={deleteWarehouse}
                disabled={deleting || confirmText.trim() !== warehouse.slug}
                className="flex-1 py-2.5 bg-red-600 text-white rounded-md text-sm font-semibold disabled:opacity-40"
              >
                {deleting ? "Удаление…" : "Удалить безвозвратно"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
