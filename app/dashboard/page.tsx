"use client";
import { t, locale } from "@/lib/i18n";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabaseClient";
import {
  Truck, Check, X, ChevronLeft, ChevronRight, Plus, Settings, Copy,
  AlertTriangle, Mail, LogOut, Edit3, ArrowLeftRight, ScanLine, Download, Users, Trash2, KeyRound,
} from "lucide-react";
import { SiteHeader } from "@/components/Logo";
import {
  zoneSlots, findWindow, describeWindow, gateList, WEEKDAYS,
  type Interval, type ZoneSchedule, type CompanyWindow, type BookingMode,
} from "@/lib/schedule";

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  confirmed: { label: "Подтверждено", color: "#2B6B4F", bg: "#E8F3EC" },
  arrived: { label: "На месте", color: "#1E5A8C", bg: "#E4EFF7" },
  departed: { label: "Убыл", color: "#5A5F6B", bg: "#EEEFF1" },
  no_show: { label: "Не явился", color: "#B23A2E", bg: "#FBEAE8" },
  cancelled: { label: "Отменено", color: "#8A8F98", bg: "#F1F0EC" },
};

function pad(n: number) { return String(n).padStart(2, "0"); }
function fmtDate(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function dateLabel(dStr: string) { const d = new Date(dStr + "T00:00:00"); return d.toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" }); }

export default function DashboardPage() {
  const router = useRouter();
  const [warehouse, setWarehouse] = useState<any>(null);
  const [bookings, setBookings] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [dateOffset, setDateOffset] = useState(0);
  const [tab, setTab] = useState<"schedule" | "scanner" | "notifications" | "settings" | "users">("schedule");
  const [role, setRole] = useState<"owner" | "dispatcher" | null>(null);
  const [myEmail, setMyEmail] = useState("");
  const [companies, setCompanies] = useState<any[]>([]);
  const [toast, setToast] = useState<{ msg: string; kind: string } | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [editBooking, setEditBooking] = useState<any>(null);
  const [swapMode, setSwapMode] = useState(false);
  const [swapPick, setSwapPick] = useState<any[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [isSuperAdmin, setIsSuperAdmin] = useState(false);
  const [noWarehouse, setNoWarehouse] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const date = useMemo(() => { const d = new Date(); d.setDate(d.getDate() + dateOffset); return fmtDate(d); }, [dateOffset]);

  function showToast(msg: string, kind = "ok") {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ msg, kind });
    toastTimer.current = setTimeout(() => setToast(null), kind === "err" ? 6000 : 3500);
  }

  // Склад и роль берём с сервера: владелец видит свой склад, доп. диспетчер — склад, куда его добавили.
  async function loadWarehouse() {
    const res = await fetch("/api/me", { cache: "no-store" });
    if (res.status === 401) { router.push("/"); return; }
    const me = await res.json().catch(() => null);
    setMyEmail(me?.user?.email || "");
    if (!me?.warehouse) { setNoWarehouse(true); return; }
    setNoWarehouse(false);
    setRole(me.role);
    setWarehouse(me.warehouse);
  }

  async function loadCompanies(warehouseId: string) {
    const res = await fetch(`/api/companies?warehouseId=${warehouseId}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setCompanies(j.companies || []);
  }

  async function loadBookings(warehouseId: string) {
    const res = await fetch(`/api/bookings?warehouseId=${warehouseId}&date=${date}`);
    const json = await res.json();
    setBookings(json.bookings || []);
  }

  useEffect(() => { loadWarehouse().then(() => setLoaded(true)); }, []);
  useEffect(() => { fetch("/api/superadmin/check").then((r) => setIsSuperAdmin(r.ok)).catch(() => {}); }, []);
  useEffect(() => { if (warehouse) loadBookings(warehouse.id); }, [warehouse, dateOffset]);
  // список компаний нужен для режима В и для вкладки настроек (там его редактируют)
  useEffect(() => {
    if (warehouse && (warehouse.booking_mode === "companies" || tab === "settings")) loadCompanies(warehouse.id);
  }, [warehouse?.id, warehouse?.booking_mode, tab]);

  async function logout() {
    const supabase = supabaseBrowser();
    await supabase.auth.signOut();
    router.push("/");
  }

  async function updateStatus(id: string, status: string) {
    const res = await fetch(`/api/bookings/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ mode: "admin", patch: { status } }),
    });
    if (!res.ok) { const j = await res.json(); showToast(j.error || t("Ошибка"), "err"); return; }
    showToast(t("Статус изменён: {0}", { 0: t(STATUS[status]?.label || status) }));
    loadBookings(warehouse.id);
  }

  async function removeBooking(id: string) {
    const res = await fetch(`/api/bookings/${id}`, { method: "DELETE" });
    if (!res.ok) { const j = await res.json(); showToast(j.error || t("Ошибка"), "err"); return; }
    showToast(t("Заявка удалена"));
    loadBookings(warehouse.id);
  }

  async function saveEditedBooking(patch: any) {
    const res = await fetch(`/api/bookings/${editBooking.id}`, {
      method: "PATCH",
      body: JSON.stringify({ mode: "admin", patch }),
    });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setEditBooking(null);
    showToast(t("Заявка обновлена"));
    loadBookings(warehouse.id);
  }

  async function doSwap() {
    if (swapPick.length !== 2) return;
    const res = await fetch("/api/bookings/swap", {
      method: "POST",
      body: JSON.stringify({ warehouseId: warehouse.id, idA: swapPick[0].id, idB: swapPick[1].id }),
    });
    if (!res.ok) { const j = await res.json(); showToast(j.error || t("Ошибка"), "err"); return; }
    showToast(t("Слоты поменяны местами"));
    setSwapPick([]); setSwapMode(false);
    loadBookings(warehouse.id);
  }

  function toggleSwapPick(b: any) {
    setSwapPick((prev) => {
      const exists = prev.find((x) => x.id === b.id);
      if (exists) return prev.filter((x) => x.id !== b.id);
      if (prev.length >= 2) return prev;
      return [...prev, b];
    });
  }

  async function createManualBooking(form: any) {
    const res = await fetch("/api/bookings", {
      method: "POST",
      body: JSON.stringify({ warehouseId: warehouse.id, warehouseName: warehouse.name, ...form }),
    });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setShowManual(false);
    showToast(t("Бронь добавлена"));
    loadBookings(warehouse.id);
  }

  async function saveSettings(cfg: any) {
    const res = await fetch("/api/warehouses", { method: "PATCH", body: JSON.stringify({ warehouseId: warehouse.id, ...cfg }) });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setWarehouse(j.warehouse);
    showToast(t("Настройки сохранены"));
  }

  async function loadNotifications() {
    const res = await fetch(`/api/notifications?warehouseId=${warehouse.id}`, { cache: "no-store" });
    const j = await res.json().catch(() => ({}));
    setNotifications(j.notifications || []);
  }
  useEffect(() => { if (warehouse && tab === "notifications") loadNotifications(); }, [warehouse, tab]);

  async function sendReminder(b: any) {
    const res = await fetch("/api/notifications", {
      method: "POST",
      body: JSON.stringify({
        warehouseId: warehouse.id,
        type: "reminder",
        bookingId: b.id,
      }),
    });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Не удалось отправить напоминание"), "err"); return; }
    showToast(t("Напоминание отправлено (запись в журнал)"));
    if (tab === "notifications") loadNotifications();
  }

  if (!loaded) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm font-mono">{t("ЗАГРУЗКА…")}</div>;
  if (noWarehouse || !warehouse) {
    return <NoWarehouse isSuperAdmin={isSuperAdmin} onLogout={logout} onCreated={(w: any) => { setWarehouse(w); setRole("owner"); setNoWarehouse(false); }} />;
  }

  const dayBookings = [...bookings].filter((b) => b.status !== "cancelled").sort((a, b) => a.time.localeCompare(b.time) || a.gate - b.gate);
  const stats = {
    total: dayBookings.length,
    confirmed: dayBookings.filter((b) => b.status === "confirmed").length,
    arrived: dayBookings.filter((b) => b.status === "arrived").length,
    departed: dayBookings.filter((b) => b.status === "departed").length,
  };

  return (
    <div className="min-h-screen">
      <SiteHeader href="/dashboard" subtitle={warehouse.name}>
        <span className="hidden sm:inline">{myEmail} ({role === "owner" ? t("владелец") : t("пользователь")})</span>
        {isSuperAdmin && <><span className="hidden sm:inline">|</span><a href="/superadmin" className="text-white underline">{t("Супер-админка")}</a></>}
        <span>|</span>
        <button onClick={logout} className="text-white underline">{t("Выйти")}</button>
      </SiteHeader>

      {toast && (
        <div className="fixed top-4 right-4 z-[60] px-4 py-3 rounded-md shadow-lg text-sm font-medium font-mono text-white flex items-center gap-2" style={{ background: toast.kind === "ok" ? "#2B587A" : "#B23A2E" }}>
          {toast.kind === "ok" ? <Check size={15} /> : <AlertTriangle size={15} />}
          {toast.msg}
        </div>
      )}

      <div className="max-w-5xl mx-auto px-4 py-5">
        <div className="flex items-start justify-between mb-2 flex-wrap gap-3">
          <div>
            <div className="text-xs text-gray-500 mb-1">{t("Главная » Кабинет склада")}</div>
            <h1 className="text-2xl font-bold text-link">{t("Расписание склада")}</h1>
          </div>
          <div className="flex gap-2 flex-wrap">
            <a href={`/api/bookings/export?warehouseId=${warehouse.id}`} className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-100 flex items-center gap-1.5"><Download size={14} />  {t("Экспорт CSV")}</a>
            <button onClick={() => setShowCode(true)} className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-100 flex items-center gap-1.5"><Copy size={14} />  {t("Ссылка для бронирования")}</button>
            {role === "owner" && <button onClick={() => setTab("settings")} className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-100 flex items-center gap-1.5"><Settings size={14} />  {t("Настройки")}</button>}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 mt-4">
          <StatCard label={t("Всего броней")} value={stats.total} />
          <StatCard label={t("Подтверждено")} value={stats.confirmed} color="#2B6B4F" />
          <StatCard label={t("На месте")} value={stats.arrived} color="#1E5A8C" />
          <StatCard label={t("Убыло")} value={stats.departed} color="#5A5F6B" />
        </div>

        <div className="flex gap-[3px] flex-wrap">
          <TabBtn active={tab === "schedule"} onClick={() => setTab("schedule")}>{t("Расписание")}</TabBtn>
          <TabBtn active={tab === "scanner"} onClick={() => setTab("scanner")}><ScanLine size={13} className="inline mr-1" />{t("Сканер QR")}</TabBtn>
          <TabBtn active={tab === "notifications"} onClick={() => setTab("notifications")}><Mail size={13} className="inline mr-1" />{t("Уведомления")}</TabBtn>
          {role === "owner" && <TabBtn active={tab === "settings"} onClick={() => setTab("settings")}><Settings size={13} className="inline mr-1" />{t("Настройки")}</TabBtn>}
          {role === "owner" && <TabBtn active={tab === "users"} onClick={() => setTab("users")}><Users size={13} className="inline mr-1" />{t("Пользователи")}</TabBtn>}
        </div>
        <div className="bg-white border border-gray-300 p-4 mb-4">

        {tab === "schedule" && (
          <>
            <div className="flex items-center gap-3 mb-5 flex-wrap">
              <NavBtn onClick={() => setDateOffset((d) => d - 1)}><ChevronLeft size={16} /></NavBtn>
              <div className="font-display text-lg font-semibold min-w-[180px] text-center capitalize bg-white border border-gray-300 rounded-md py-2 px-4">{dateLabel(date)}</div>
              <NavBtn onClick={() => setDateOffset((d) => d + 1)}><ChevronRight size={16} /></NavBtn>

              <button onClick={() => { setSwapMode((s) => !s); setSwapPick([]); }} className={`px-3 py-2 rounded-md text-sm font-semibold flex items-center gap-1.5 border ${swapMode ? "bg-ink text-amber border-ink" : "border-gray-300 hover:bg-gray-100"}`}>
                <ArrowLeftRight size={14} />  {t("Поменять местами")}
              </button>
              {swapMode && swapPick.length === 2 && (
                <button onClick={doSwap} className="px-3 py-2 bg-ink text-amber rounded-md text-sm font-bold">{t("Подтвердить обмен")}</button>
              )}
              <button onClick={() => setShowManual(true)} className="ml-auto px-3 py-2 bg-ink text-amber rounded-md text-sm font-semibold flex items-center gap-1.5"><Plus size={14} />  {t("Добавить бронь")}</button>
            </div>

            {dayBookings.length === 0 ? (
              <div className="bg-white border border-dashed border-gray-300 rounded-lg py-16 text-center text-gray-400 text-sm">{t("На эту дату броней пока нет")}</div>
            ) : (
              <div className="bg-white border border-gray-300 rounded-lg overflow-hidden divide-y divide-gray-100">
                {dayBookings.map((b) => {
                  const st = STATUS[b.status] || STATUS.confirmed;
                  const pickIndex = swapPick.findIndex((x) => x.id === b.id);
                  const picked = pickIndex !== -1;
                  return (
                    <div key={b.id} className={`p-4 flex items-center gap-4 flex-wrap ${swapMode ? "cursor-pointer" : ""} ${picked ? "bg-[#FFF3CD] ring-2 ring-inset ring-[#E5CF7C]" : ""}`} onClick={() => swapMode && toggleSwapPick(b)}>
                      {swapMode && <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold shrink-0 ${picked ? "bg-ink text-amber" : "border border-gray-300 text-gray-300"}`}>{picked ? pickIndex + 1 : ""}</div>}
                      <div className="font-mono text-sm font-bold w-14">{b.time}</div>
                      <div className="font-mono text-xs bg-ink text-amber px-2 py-0.5 rounded font-bold">{t("ЗОНА")} {b.gate}</div>
                      <div className="flex-1 min-w-[180px]">
                        <div className="text-sm font-semibold">{b.company} <span className="text-gray-500 font-normal">· {b.carrier}</span>{b.company_id && <span className="ml-2 text-[10px] font-mono uppercase bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded align-middle">{t("из списка")}</span>}</div>
                        <div className="text-xs text-gray-500">{b.plate} · {b.phone}{b.cargo ? ` · ${b.cargo}` : ""} · <span className="font-mono">{b.id}</span></div>
                        {(b.arrived_at || b.departed_at) && (
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5">
                            {b.arrived_at && <>{t("прибыл")} {new Date(b.arrived_at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}</>}
                            {b.departed_at && <>  {t("· убыл")} {new Date(b.departed_at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}</>}
                          </div>
                        )}
                      </div>
                      <span className="text-xs font-semibold px-2.5 py-1 rounded" style={{ color: st.color, background: st.bg }}>{t(st.label)}</span>
                      {!swapMode && (
                        <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
                          {b.status === "confirmed" && <IconBtn title={t("Прибыл")} onClick={() => updateStatus(b.id, "arrived")}><Truck size={13} /></IconBtn>}
                          {b.status === "arrived" && <IconBtn title={t("Убыл")} onClick={() => updateStatus(b.id, "departed")}><LogOut size={13} /></IconBtn>}
                          <IconBtn title={t("Редактировать")} onClick={() => setEditBooking(b)}><Edit3 size={13} /></IconBtn>
                          <IconBtn title={t("Напоминание")} onClick={() => sendReminder(b)}><Mail size={13} /></IconBtn>
                          {b.status !== "no_show" && <IconBtn title={t("Не явился")} onClick={() => updateStatus(b.id, "no_show")}><AlertTriangle size={13} /></IconBtn>}
                          <IconBtn title={t("Удалить")} onClick={() => removeBooking(b.id)}><X size={13} /></IconBtn>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}

        {tab === "scanner" && <ScannerPanel warehouseId={warehouse.id} showToast={showToast} onScanned={() => loadBookings(warehouse.id)} />}
        {tab === "notifications" && <NotificationsLog notifications={notifications} />}
        {tab === "settings" && role === "owner" && (
          <SettingsPanel
            key={warehouse.id + (warehouse.booking_mode || "")}
            warehouse={warehouse}
            companies={companies}
            reloadCompanies={() => loadCompanies(warehouse.id)}
            onWarehouseChanged={setWarehouse}
            onSave={saveSettings}
            showToast={showToast}
          />
        )}
        {tab === "users" && role === "owner" && <UsersPanel warehouseId={warehouse.id} showToast={showToast} />}
        </div>
      </div>

      {showManual && (
        <Modal title={t("Добавить бронь · {0}", { 0: dateLabel(date) })} onClose={() => setShowManual(false)}>
          <ManualBookingForm warehouse={warehouse} companies={companies} date={date} bookings={bookings} onSave={createManualBooking} />
        </Modal>
      )}
      {editBooking && (
        <Modal title={t("Редактировать {0}", { 0: editBooking.id })} onClose={() => setEditBooking(null)}>
          <EditForm booking={editBooking} warehouse={warehouse} companies={companies} bookings={bookings} onSave={saveEditedBooking} />
        </Modal>
      )}
      {showCode && (
        <Modal title={t("Ссылка для бронирования")} onClose={() => setShowCode(false)}>
          <LinkBox slug={warehouse.slug} showToast={showToast} />
        </Modal>
      )}
    </div>
  );
}

function LinkBox({ slug, showToast }: any) {
  const [link, setLink] = useState("");
  useEffect(() => { setLink(`${window.location.origin}/book/${slug}`); }, [slug]);
  return (
    <div>
      <div className="bg-ink rounded-lg p-4 mb-4 break-all">
        <div className="font-mono text-sm text-amber">{link}</div>
      </div>
      <button onClick={() => { navigator.clipboard?.writeText(link); showToast(t("Ссылка скопирована")); }} className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm flex items-center justify-center gap-2"><Copy size={14} />  {t("Скопировать ссылку")}</button>
      <p className="text-xs text-gray-500 leading-relaxed mt-4">{t("Отправьте эту ссылку перевозчикам — она открывает форму бронирования именно вашего склада, без входа.")}</p>
    </div>
  );
}

function ScannerPanel({ warehouseId, showToast, onScanned }: any) {
  const [code, setCode] = useState("");
  async function scan() {
    const res = await fetch("/api/scan", { method: "POST", body: JSON.stringify({ warehouseId, code }) });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); setCode(""); return; }
    showToast(t("{0}: отмечено — {1}", { 0: j.booking.id, 1: j.action === "arrived" ? t("прибытие") : t("убытие") }));
    setCode("");
    onScanned();
  }
  return (
    <div className="max-w-md bg-white border border-gray-300 rounded-lg p-6 space-y-4">
      <div className="text-sm text-gray-600">{t("Отсканируйте QR-код камерой телефона и вставьте распознанный код сюда, либо введите вручную.")}</div>
      <input value={code} onChange={(e) => setCode(e.target.value)} onKeyDown={(e) => e.key === "Enter" && scan()} placeholder="DK-XXXXXXXX" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
      <button onClick={scan} disabled={!code} className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-40 flex items-center justify-center gap-2"><ScanLine size={15} />  {t("Обработать скан")}</button>
    </div>
  );
}

const NOTIF_KIND: Record<string, { label: string; color: string; bg: string }> = {
  confirmation: { label: "Подтверждение", color: "#2B6B4F", bg: "#E8F3EC" },
  reminder: { label: "Напоминание", color: "#946B1E", bg: "#FBF0DD" },
  update: { label: "Изменение", color: "#1E5A8C", bg: "#E4EFF7" },
  cancellation: { label: "Отмена", color: "#B23A2E", bg: "#FBEAE8" },
};

function NotificationsLog({ notifications }: any) {
  if (!notifications.length) return <div className="bg-white border border-dashed border-gray-300 rounded-lg py-16 text-center text-gray-400 text-sm">{t("Уведомлений пока нет")}</div>;
  return (
    <div className="bg-white border border-gray-300 rounded-lg overflow-hidden divide-y divide-gray-100">
      {notifications.map((n: any) => {
        const kind = NOTIF_KIND[n.type] || NOTIF_KIND.confirmation;
        return (
        <div key={n.id} className="p-4">
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs font-semibold px-2 py-0.5 rounded" style={{ color: kind.color, background: kind.bg }}>{t(kind.label)}</span>
            <span className="text-[10px] text-gray-400 font-mono">{new Date(n.sent_at).toLocaleTimeString(locale(), { hour: "2-digit", minute: "2-digit" })}</span>
          </div>
          <div className="text-sm font-semibold">{n.subject}</div>
          <div className="text-xs text-gray-500 mb-1">{t("Кому:")} {n.to_email}</div>
          <div className="text-xs text-gray-600">{n.body}</div>
        </div>
        );
      })}
    </div>
  );
}

// ================= НАСТРОЙКИ СКЛАДА (только владелец) =================

const MODE_INFO: { id: BookingMode; letter: string; title: string; text: string }[] = [
  { id: "basic", letter: "А", title: "Простой", text: "Одни часы работы для всех зон. Слоты идут подряд с начала до конца дня." },
  { id: "zones", letter: "Б", title: "График по зонам", text: "У каждой зоны свои часы. Можно сделать перерыв на обед, паузу посреди дня или вечернюю смену." },
  { id: "companies", letter: "В", title: "Окна для компаний", text: "Всё из режима Б, плюс время, которое могут бронировать только выбранные компании из вашего списка." },
];

function defaultZoneSchedule(gates: number, startHour: number, endHour: number, prev?: ZoneSchedule | null): ZoneSchedule {
  const base: Interval = { start: `${pad(startHour)}:00`, end: endHour >= 24 ? "24:00" : `${pad(endHour)}:00` };
  const out: ZoneSchedule = {};
  for (let g = 1; g <= gates; g++) out[String(g)] = prev && Array.isArray(prev[String(g)]) ? prev[String(g)] : [{ ...base }];
  return out;
}

function SettingsPanel({ warehouse, companies, reloadCompanies, onWarehouseChanged, onSave, showToast }: any) {
  // Числа храним как строки, чтобы поле можно было очистить и ввести новое значение без «0» в начале.
  const str = (v: any) => (v === null || v === undefined ? "" : String(v));
  const [c, setC] = useState({
    address: warehouse.address || "",
    gates: str(warehouse.gates),
    slot_minutes: str(warehouse.slot_minutes),
    start_hour: str(warehouse.start_hour),
    end_hour: str(warehouse.end_hour),
    booking_horizon_days: str(warehouse.booking_horizon_days),
    cancel_limit_hours: str(warehouse.cancel_limit_hours),
  });
  const [mode, setMode] = useState<BookingMode>((warehouse.booking_mode as BookingMode) || "basic");
  const [zones, setZones] = useState<ZoneSchedule>(() =>
    defaultZoneSchedule(warehouse.gates, warehouse.start_hour, warehouse.end_hour, warehouse.zone_schedule));
  const [windows, setWindows] = useState<CompanyWindow[]>(() => warehouse.company_windows || []);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const set = (k: string) => (v: string) => setC({ ...c, [k]: v });

  const gatesNum = Math.max(1, Math.min(50, Number(c.gates) || 1));
  // при изменении числа зон — добавляем новым зонам график по умолчанию
  useEffect(() => {
    setZones((z) => defaultZoneSchedule(gatesNum, Number(c.start_hour) || 0, Number(c.end_hour) || 24, z));
  }, [gatesNum]);

  async function submit() {
    const required: [string, string][] = [["gates", t("Количество зон")], ["slot_minutes", t("Длительность слота")], ["start_hour", t("Начало работы")], ["end_hour", t("Конец работы")]];
    for (const [k, label] of required) {
      if ((c as any)[k] === "") { setError(t("Заполните поле «{0}»", { 0: label })); return; }
    }
    if (Number(c.start_hour) >= Number(c.end_hour)) { setError(t("Конец работы должен быть позже начала")); return; }
    if (mode === "companies" && windows.some((w) => !w.company_ids.length)) { setError(t("В каждом окне выберите хотя бы одну компанию")); return; }
    setError("");
    setSaving(true);
    const payload: any = { ...c, booking_mode: mode };
    if (mode !== "basic") {
      const z: ZoneSchedule = {};
      for (let g = 1; g <= gatesNum; g++) z[String(g)] = zones[String(g)] || [];
      payload.zone_schedule = z;
    }
    if (mode === "companies") payload.company_windows = windows;
    await onSave(payload);
    setSaving(false);
  }

  const preview = { ...warehouse, gates: gatesNum, slot_minutes: Number(c.slot_minutes) || 30, start_hour: Number(c.start_hour) || 0, end_hour: Number(c.end_hour) || 24, booking_mode: mode, zone_schedule: zones };

  return (
    <div className="space-y-6 max-w-3xl">
      <Section title={t("Основное")}>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block sm:col-span-3"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Адрес (улица, дом)")}</div>
            <input value={c.address} onChange={(e) => setC({ ...c, address: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
          <NumField label={t("Количество зон приёмки")} value={c.gates} onChange={set("gates")} hint={t("Сколько машин склад может принимать одновременно")} />
          <NumField label={t("Длительность слота (мин)")} value={c.slot_minutes} onChange={set("slot_minutes")} />
        </div>
      </Section>

      <Section title={t("Режим работы")}>
        <div className="grid sm:grid-cols-3 gap-2">
          {MODE_INFO.map((m) => (
            <button key={m.id} onClick={() => setMode(m.id)}
              className={`text-left border-2 rounded-lg p-3 ${mode === m.id ? "border-ink bg-[#EEF4FB]" : "border-gray-200 hover:border-gray-400 bg-white"}`}>
              <div className="flex items-center gap-2 mb-1">
                <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${mode === m.id ? "bg-ink text-amber" : "bg-gray-200 text-gray-600"}`}>{t(m.letter)}</span>
                <span className="font-semibold text-sm">{t(m.title)}</span>
              </div>
              <div className="text-[11px] text-gray-600 leading-snug">{t(m.text)}</div>
            </button>
          ))}
        </div>

        {mode === "basic" && (
          <div className="grid grid-cols-2 gap-3 mt-4 max-w-sm">
            <NumField label={t("Начало работы (час)")} value={c.start_hour} onChange={set("start_hour")} />
            <NumField label={t("Конец работы (час)")} value={c.end_hour} onChange={set("end_hour")} />
          </div>
        )}

        {mode !== "basic" && (
          <ZoneScheduleEditor gates={gatesNum} zones={zones} setZones={setZones} preview={preview} />
        )}
      </Section>

      {mode === "companies" && (
        <Section title={t("Компании и их окна")}>
          <CompaniesEditor warehouse={warehouse} companies={companies} reloadCompanies={reloadCompanies} showToast={showToast}
            onCompanyDeleted={(id: string, wh: any) => {
              setWindows((ws) => ws.map((w) => ({ ...w, company_ids: w.company_ids.filter((x) => x !== id) })).filter((w) => w.company_ids.length));
              if (wh) onWarehouseChanged(wh);
            }} />
          <WindowsEditor gates={gatesNum} windows={windows} setWindows={setWindows} companies={companies} />
        </Section>
      )}

      <Section title={t("Ограничения для перевозчиков")}>
        <div className="grid sm:grid-cols-2 gap-3">
          <NumField label={t("Бронирование не дальше чем на (дней)")} value={c.booking_horizon_days} onChange={set("booking_horizon_days")}
            hint={t("Например 7 — перевозчик видит и бронирует слоты только на 7 календарных дней вперёд. Пусто или 0 — без ограничений.")} />
          <NumField label={t("Запрет отмены и переноса менее чем за (часов)")} value={c.cancel_limit_hours} onChange={set("cancel_limit_hours")}
            hint={t("Например 24 — за сутки до слота перевозчик уже не может сам отменить или перенести бронь. Пусто или 0 — без ограничений.")} />
        </div>
      </Section>

      {error && <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
      <div className="sticky bottom-0 bg-paper py-3 border-t border-gray-200">
        <button onClick={submit} disabled={saving} className="w-full sm:w-auto px-8 py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-40">{saving ? t("Сохранение…") : t("Сохранить настройки")}</button>
      </div>
    </div>
  );
}

function Section({ title, children }: any) {
  return (
    <div className="bg-white border border-gray-300">
      <div className="box-head">{title}</div>
      <div className="p-4">{children}</div>
    </div>
  );
}

// Время «ЧЧ:ММ» двумя списками (часы и минуты с шагом 5) — одинаково выглядит в любом браузере, без AM/PM.
function TimeInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = (value || "00:00").split(":");
  const hours = Array.from({ length: 25 }, (_, i) => pad(i));
  const minutes = Array.from({ length: 12 }, (_, i) => pad(i * 5));
  if (!minutes.includes(m)) minutes.push(m);
  const cls = "border border-gray-300 rounded-md px-1.5 py-1.5 text-sm font-mono bg-white";
  return (
    <span className="inline-flex items-center gap-0.5">
      <select value={h} onChange={(e) => onChange(`${e.target.value}:${e.target.value === "24" ? "00" : m}`)} className={cls}>
        {hours.map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
      <span className="font-mono text-gray-500">:</span>
      <select value={m} disabled={h === "24"} onChange={(e) => onChange(`${h}:${e.target.value}`)} className={cls}>
        {minutes.sort().map((x) => <option key={x} value={x}>{x}</option>)}
      </select>
    </span>
  );
}

function ZoneScheduleEditor({ gates, zones, setZones, preview }: any) {
  const list = Array.from({ length: gates }, (_, i) => i + 1);
  function update(g: number, intervals: Interval[]) { setZones({ ...zones, [String(g)]: intervals }); }
  function copyToAll(g: number) {
    const src = zones[String(g)] || [];
    const next: ZoneSchedule = {};
    for (const z of list) next[String(z)] = src.map((iv: Interval) => ({ ...iv }));
    setZones(next);
  }
  return (
    <div className="mt-4 space-y-3">
      <div className="text-[11px] text-gray-600 bg-gray-50 border border-gray-200 rounded-md px-3 py-2 leading-relaxed">
        
        {t("У каждой зоны — один или несколько интервалов работы. Всё, что между интервалами, недоступно для брони. Например")} <b>08:00–12:00</b>  {t("и")} <b>13:00–17:00</b>  {t("— обед с 12 до 13;")} <b>06:00–11:00</b>  {t("и")} <b>18:00–23:00</b>  {t("— днём приёмки нет, вечером снова работаем. Слот должен целиком помещаться в интервал. Чтобы зона в целом не работала — удалите все её интервалы.")}
      </div>
      {list.map((g) => {
        const ivs: Interval[] = zones[String(g)] || [];
        const slots = zoneSlots(preview, g);
        return (
          <div key={g} className="border border-gray-200 rounded-md p-3">
            <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
              <div className="font-mono text-xs bg-ink text-amber px-2 py-0.5 rounded font-bold">{t("ЗОНА")} {g}</div>
              <div className="flex items-center gap-3 text-xs">
                <span className="text-gray-500">{slots.length ? t("{0} слот(ов)", { 0: slots.length }) : t("не работает")}</span>
                {gates > 1 && <button onClick={() => copyToAll(g)} className="underline text-gray-600 hover:text-ink">{t("Скопировать на все зоны")}</button>}
              </div>
            </div>
            <div className="space-y-2">
              {ivs.map((iv, i) => (
                <div key={i} className="flex items-center gap-2 flex-wrap">
                  <TimeInput value={iv.start} onChange={(v) => update(g, ivs.map((x, j) => (j === i ? { ...x, start: v } : x)))} />
                  <span className="text-gray-400">—</span>
                  <TimeInput value={iv.end} onChange={(v) => update(g, ivs.map((x, j) => (j === i ? { ...x, end: v } : x)))} />
                  <button title={t("Удалить интервал")} onClick={() => update(g, ivs.filter((_, j) => j !== i))} className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 flex items-center justify-center"><X size={13} /></button>
                  {i > 0 && <span className="text-[11px] text-gray-400">{t("перерыв")} {ivs[i - 1].end}–{iv.start}</span>}
                </div>
              ))}
              <button onClick={() => {
                const last = ivs[ivs.length - 1];
                update(g, [...ivs, last ? { start: last.end < "23:00" ? last.end : "22:00", end: "24:00" } : { start: "08:00", end: "17:00" }]);
              }} className="text-xs font-semibold text-ink border border-dashed border-gray-400 rounded-md px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1"><Plus size={12} />  {t("Добавить интервал")}</button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// Email-адреса из поля ввода: через запятую, пробел или с новой строки.
function splitEmails(v: string) {
  return Array.from(new Set(v.split(/[\s,;]+/).map((x) => x.trim().toLowerCase()).filter(Boolean)));
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Проверка на стороне браузера (сервер проверяет то же самое ещё раз).
function checkCompanyForm(name: string, emails: string[], companies: any[], selfId?: string) {
  if (!name.trim()) return t("Укажите название компании");
  if (!emails.length) return t("Укажите хотя бы один email компании");
  const bad = emails.find((e) => !EMAIL_RE.test(e));
  if (bad) return t("Некорректный email: {0}", { 0: bad });
  const dup = companies.find((c) => c.id !== selfId && c.name.trim().toLowerCase() === name.trim().toLowerCase());
  if (dup) return t("Компания «{0}» уже есть в списке", { 0: dup.name });
  for (const c of companies) {
    if (c.id === selfId) continue;
    const e = emails.find((x) => (c.emails || []).includes(x));
    if (e) return t("Email {0} уже привязан к компании «{1}»", { 0: e, 1: c.name });
  }
  return null;
}

function CompaniesEditor({ warehouse, companies, reloadCompanies, showToast, onCompanyDeleted }: any) {
  const [name, setName] = useState("");
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState({ name: "", emails: "" });

  async function add() {
    if (busy) return;
    const list = splitEmails(emails);
    const err = checkCompanyForm(name, list, companies);
    if (err) { showToast(err, "err"); return; }
    setBusy(true);
    const res = await fetch("/api/companies", { method: "POST", body: JSON.stringify({ warehouseId: warehouse.id, name: name.trim(), emails: list }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setName(""); setEmails("");
    showToast(t("Компания добавлена"));
    reloadCompanies();
  }
  async function save(id: string) {
    if (busy) return;
    const list = splitEmails(edit.emails);
    const err = checkCompanyForm(edit.name, list, companies, id);
    if (err) { showToast(err, "err"); return; }
    setBusy(true);
    const res = await fetch(`/api/companies/${id}`, { method: "PATCH", body: JSON.stringify({ name: edit.name.trim(), emails: list }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setEditId(null);
    showToast(t("Компания обновлена"));
    reloadCompanies();
  }
  async function remove(id: string) {
    const res = await fetch(`/api/companies/${id}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setConfirmId(null);
    showToast(t("Компания удалена"));
    onCompanyDeleted(id, j.warehouse);
    reloadCompanies();
  }

  return (
    <div className="mb-5">
      <div className="text-[11px] text-gray-600 mb-3 leading-relaxed">
        
        {t("Перевозчики бронируют по")} <b>{t("общей ссылке")}</b>  {t("склада. Если перевозчик указывает email из этого списка, ему открывается время, зарезервированное для его компании (окна ниже). Остальное время открыто для всех, как обычно.")}
      </div>
      {companies.length > 0 && (
        <div className="border border-gray-200 rounded-md divide-y divide-gray-100 mb-3">
          {companies.map((co: any) => editId === co.id ? (
            <div key={co.id} className="p-3 space-y-2 bg-gray-50">
              <input value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} placeholder={t("Название")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <textarea value={edit.emails} onChange={(e) => setEdit({ ...edit, emails: e.target.value })} rows={2} placeholder={t("email через запятую")}
                className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
              <div className="flex gap-2">
                <button onClick={() => save(co.id)} disabled={busy} className="text-xs bg-ink text-amber rounded-md px-3 py-1.5 font-semibold disabled:opacity-50">{t("Сохранить")}</button>
                <button onClick={() => setEditId(null)} className="text-xs border border-gray-300 rounded-md px-3 py-1.5">{t("Отмена")}</button>
              </div>
            </div>
          ) : (
            <div key={co.id} className="p-3 flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-semibold">{co.name}</div>
                <div className="flex gap-1 flex-wrap mt-1">
                  {(co.emails || []).length
                    ? co.emails.map((e: string) => <span key={e} className="text-[11px] bg-violet-50 text-violet-700 px-1.5 py-0.5 rounded">{e}</span>)
                    : <span className="text-[11px] text-[#8A5A00]">{t("нет email — компания не сможет открыть свои окна")}</span>}
                </div>
              </div>
              <button title={t("Изменить")} onClick={() => { setEditId(co.id); setEdit({ name: co.name, emails: (co.emails || []).join(", ") }); }}
                className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 flex items-center justify-center"><Edit3 size={13} /></button>
              {confirmId === co.id ? (
                <span className="flex items-center gap-1">
                  <button onClick={() => remove(co.id)} className="text-xs bg-red-600 text-white rounded-md px-2 py-1">{t("Удалить")}</button>
                  <button onClick={() => setConfirmId(null)} className="text-xs border border-gray-300 rounded-md px-2 py-1">{t("Нет")}</button>
                </span>
              ) : (
                <button title={t("Удалить компанию")} onClick={() => setConfirmId(co.id)} className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 flex items-center justify-center"><Trash2 size={13} /></button>
              )}
            </div>
          ))}
        </div>
      )}
      <div className="flex gap-2 flex-wrap items-end">
        <label className="block flex-1 min-w-[160px]"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Название компании")}</div>
          <input value={name} onChange={(e) => setName(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
        <label className="block flex-[2] min-w-[200px]"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Email (можно несколько через запятую)")}</div>
          <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="logist@company.com, driver@mail.com" className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
        <button onClick={add} disabled={busy} className="px-4 py-2 bg-ink text-amber rounded-md text-sm font-semibold flex items-center gap-1.5 disabled:opacity-50"><Plus size={14} /> {busy ? t("Добавляем…") : t("Добавить")}</button>
      </div>
    </div>
  );
}

function Chip({ on, onClick, children }: any) {
  return <button onClick={onClick} className={`px-2 py-1 rounded text-xs font-semibold border ${on ? "bg-ink text-amber border-ink" : "bg-white text-gray-600 border-gray-300 hover:bg-gray-50"}`}>{children}</button>;
}

function WindowsEditor({ gates, windows, setWindows, companies }: any) {
  const zonesList = Array.from({ length: gates }, (_, i) => i + 1);
  function upd(i: number, patch: Partial<CompanyWindow>) { setWindows(windows.map((w: CompanyWindow, j: number) => (j === i ? { ...w, ...patch } : w))); }
  function toggle(arr: any[] | null, v: any) { const a = arr || []; return a.includes(v) ? a.filter((x) => x !== v) : [...a, v]; }
  return (
    <div className="border-t border-gray-200 pt-4">
      <div className="text-sm font-semibold mb-1">{t("Окна для компаний")}</div>
      <div className="text-[11px] text-gray-600 mb-3">{t("В указанное время слоты выбранных зон может бронировать только компания из списка окна. Сотрудник склада в кабинете может поставить туда бронь вручную.")}</div>
      {!companies.length && <div className="text-xs text-[#6B5200] bg-[#FFF3CD] border border-[#E5CF7C] px-3 py-2 rounded-md mb-3">{t("Сначала добавьте хотя бы одну компанию выше.")}</div>}
      <div className="space-y-3">
        {windows.map((w: CompanyWindow, i: number) => (
          <div key={w.id} className="border border-violet-200 bg-violet-50/40 rounded-md p-3 space-y-2.5">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-violet-700 mr-1">{t("Окно")} {i + 1}</span>
              <TimeInput value={w.start} onChange={(v) => upd(i, { start: v })} />
              <span className="text-gray-400">—</span>
              <TimeInput value={w.end} onChange={(v) => upd(i, { end: v })} />
              <button onClick={() => setWindows(windows.filter((_: any, j: number) => j !== i))} className="ml-auto text-xs text-red-600 underline">{t("Удалить окно")}</button>
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-gray-500 w-20">{t("Дни:")}</span>
              {WEEKDAYS.map((d, k) => <Chip key={d} on={!!w.weekdays?.includes(k + 1)} onClick={() => upd(i, { weekdays: toggle(w.weekdays, k + 1) })}>{t(d)}</Chip>)}
              {!w.weekdays?.length && <span className="text-[11px] text-gray-400 ml-1">{t("ничего не выбрано = каждый день")}</span>}
            </div>
            <div className="flex items-center gap-1 flex-wrap">
              <span className="text-[11px] text-gray-500 w-20">{t("Зоны:")}</span>
              {zonesList.map((g) => <Chip key={g} on={!!w.gates?.includes(g)} onClick={() => upd(i, { gates: toggle(w.gates, g) })}>{g}</Chip>)}
              {!w.gates?.length && <span className="text-[11px] text-gray-400 ml-1">{t("ничего не выбрано = все зоны")}</span>}
            </div>
            <div className="flex items-start gap-1 flex-wrap">
              <span className="text-[11px] text-gray-500 w-20 pt-1">{t("Компании:")}</span>
              {companies.map((co: any) => <Chip key={co.id} on={w.company_ids.includes(co.id)} onClick={() => upd(i, { company_ids: toggle(w.company_ids, co.id) })}>{co.name}</Chip>)}
            </div>
          </div>
        ))}
      </div>
      <button disabled={!companies.length} onClick={() => setWindows([...windows, { id: Math.random().toString(36).slice(2, 10), gates: null, weekdays: null, start: "08:00", end: "10:00", company_ids: [] }])}
        className="mt-3 text-xs font-semibold border border-dashed border-gray-400 rounded-md px-3 py-1.5 hover:bg-gray-50 flex items-center gap-1 disabled:opacity-40"><Plus size={12} />  {t("Добавить окно")}</button>
    </div>
  );
}

// ================= ДОПОЛНИТЕЛЬНЫЕ ДИСПЕТЧЕРЫ (только владелец) =================

function genPassword() {
  const abc = "abcdefghjkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 10; i++) s += abc[Math.floor(Math.random() * abc.length)];
  return s;
}

function UsersPanel({ warehouseId, showToast }: any) {
  const [data, setData] = useState<{ owner: { email: string }; members: any[]; needsMigration?: boolean } | null>(null);
  const [f, setF] = useState({ name: "", email: "", password: "" });
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const [pwFor, setPwFor] = useState<string | null>(null);
  const [newPw, setNewPw] = useState("");
  const [confirmId, setConfirmId] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/members?warehouseId=${warehouseId}`, { cache: "no-store" });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setData(j);
  }
  useEffect(() => { load(); }, [warehouseId]);

  async function add() {
    if (!f.email.trim()) { showToast(t("Укажите email"), "err"); return; }
    if (f.password.length < 6) { showToast(t("Пароль — не короче 6 символов"), "err"); return; }
    setBusy(true);
    const res = await fetch("/api/members", { method: "POST", body: JSON.stringify({ warehouseId, ...f }) });
    const j = await res.json();
    setBusy(false);
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setCreated({ email: j.member.email, password: f.password });
    setF({ name: "", email: "", password: "" });
    load();
  }
  async function setPassword(id: string) {
    if (newPw.length < 6) { showToast(t("Пароль — не короче 6 символов"), "err"); return; }
    const res = await fetch(`/api/members/${id}`, { method: "PATCH", body: JSON.stringify({ password: newPw }) });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    showToast(t("Новый пароль сохранён — передайте его пользователю"));
    setPwFor(null); setNewPw("");
  }
  async function remove(id: string) {
    const res = await fetch(`/api/members/${id}`, { method: "DELETE" });
    const j = await res.json();
    if (!res.ok) { showToast(j.error || t("Ошибка"), "err"); return; }
    setConfirmId(null);
    showToast(t("Доступ пользователя удалён"));
    load();
  }

  if (!data) return <div className="text-sm text-gray-500">{t("Загрузка…")}</div>;

  return (
    <div className="max-w-2xl space-y-5">
      {data.needsMigration && (
        <div className="text-sm text-[#6B5200] bg-[#FFF3CD] border border-[#E5CF7C] px-4 py-3 rounded-md">
          
          {t("Чтобы добавлять пользователей, выполните в Supabase → SQL Editor файл")} <span className="font-mono">supabase/migrations/2026-10-03_dispatchers_modes.sql</span>.
        </div>
      )}
      <div className="text-sm text-gray-600 leading-relaxed">
        
        {t("Пользователи входят в этот же кабинет на главной странице — со своим email и паролем. Они видят расписание, добавляют и редактируют брони, отмечают прибытие и пользуются сканером. Настройки склада и список пользователей доступны только вам.")}
      </div>

      <div className="bg-white border border-gray-300 rounded-lg divide-y divide-gray-100">
        <div className="p-4 flex items-center gap-3">
          <div className="flex-1"><div className="text-sm font-semibold">{data.owner?.email}</div><div className="text-xs text-gray-500">{t("владелец кабинета (вы)")}</div></div>
        </div>
        {data.members.map((m) => (
          <div key={m.id} className="p-4 space-y-2">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex-1 min-w-[180px]">
                <div className="text-sm font-semibold">{m.email}</div>
                <div className="text-xs text-gray-500">{m.name ? `${m.name} · ` : ""}{t("пользователь с")} {new Date(m.created_at).toLocaleDateString(locale())}</div>
              </div>
              <button onClick={() => { setPwFor(pwFor === m.id ? null : m.id); setNewPw(genPassword()); }} className="text-xs border border-gray-300 rounded-md px-2 py-1 hover:bg-gray-100 flex items-center gap-1"><KeyRound size={12} />  {t("Новый пароль")}</button>
              {confirmId === m.id ? (
                <span className="flex items-center gap-1">
                  <button onClick={() => remove(m.id)} className="text-xs bg-red-600 text-white rounded-md px-2 py-1">{t("Удалить доступ")}</button>
                  <button onClick={() => setConfirmId(null)} className="text-xs border border-gray-300 rounded-md px-2 py-1">{t("Нет")}</button>
                </span>
              ) : (
                <button title={t("Удалить пользователя")} onClick={() => setConfirmId(m.id)} className="w-7 h-7 rounded border border-gray-300 text-gray-500 hover:bg-gray-100 flex items-center justify-center"><Trash2 size={13} /></button>
              )}
            </div>
            {pwFor === m.id && (
              <div className="flex gap-2 items-center flex-wrap">
                <input value={newPw} onChange={(e) => setNewPw(e.target.value)} className="border border-gray-300 rounded-md px-3 py-1.5 text-sm font-mono w-48" />
                <button onClick={() => setPassword(m.id)} className="text-xs bg-ink text-amber rounded-md px-3 py-1.5 font-semibold">{t("Сохранить пароль")}</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {created && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-4 text-sm">
          <div className="font-semibold text-green-800 mb-2 flex items-center gap-1.5"><Check size={15} />  {t("Пользователь добавлен. Передайте ему данные для входа:")}</div>
          <div className="font-mono text-xs bg-white border border-green-200 rounded p-3 space-y-1">
            <div>{t("Сайт:")} {typeof window !== "undefined" ? window.location.origin : ""}</div>
            <div>Email: {created.email}</div>
            <div>{t("Пароль:")} {created.password}</div>
          </div>
          <div className="flex gap-3 mt-2">
            <button onClick={() => { navigator.clipboard?.writeText(t("Вход в Gate-Slot: {0}\nEmail: {1}\nПароль: {2}", { 0: window.location.origin, 1: created.email, 2: created.password })); showToast(t("Скопировано")); }} className="text-xs underline flex items-center gap-1"><Copy size={12} />  {t("Скопировать")}</button>
            <button onClick={() => setCreated(null)} className="text-xs underline text-gray-500">{t("Скрыть")}</button>
          </div>
        </div>
      )}

      <div className="bg-white border border-gray-300 rounded-lg p-5">
        <div className="text-xs font-semibold text-gray-700 mb-3 uppercase tracking-wide">{t("Добавить пользователя")}</div>
        <div className="grid sm:grid-cols-3 gap-3">
          <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Имя (необязательно)")}</div>
            <input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
          <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Email (логин) *")}</div>
            <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
          <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5 flex justify-between">{t("Пароль *")} <button onClick={() => setF({ ...f, password: genPassword() })} className="underline text-gray-500 font-normal">{t("придумать")}</button></div>
            <input value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" /></label>
        </div>
        <button onClick={add} disabled={busy} className="mt-4 px-5 py-2.5 bg-ink text-amber rounded-md font-semibold text-sm flex items-center gap-1.5 disabled:opacity-50"><Plus size={14} /> {busy ? t("Создаём…") : t("Добавить пользователя")}</button>
      </div>
    </div>
  );
}

function NoWarehouse({ isSuperAdmin, onLogout, onCreated }: any) {
  const [f, setF] = useState({ name: "", city: "", address: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function create() {
    if (!f.name.trim()) { setError(t("Укажите название склада")); return; }
    if (!f.city.trim()) { setError(t("Укажите город")); return; }
    setError("");
    setSaving(true);
    const res = await fetch("/api/warehouses", { method: "POST", body: JSON.stringify(f) });
    const j = await res.json();
    setSaving(false);
    if (!res.ok) { setError(j.error || t("Не удалось создать склад")); return; }
    onCreated(j.warehouse);
  }
  return (
    <div className="max-w-sm mx-auto px-5 py-16">
      <div className="flex items-center gap-2 mb-2"><Truck size={18} /><h1 className="text-2xl font-bold font-display">{t("У вас пока нет склада")}</h1></div>
      <p className="text-sm text-gray-600 mb-5">{t("Склад, привязанный к этому аккаунту, не найден (возможно, он был удалён). Создайте новый — вход и пароль остаются прежними.")}</p>
      {isSuperAdmin && (
        <a href="/superadmin" className="block w-full text-center py-2.5 mb-5 border-2 border-ink rounded-md font-semibold text-sm hover:bg-gray-100">{t("Перейти в супер-админку")}</a>
      )}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-4">
        {([["name", t("Название склада *")], ["city", t("Город *")], ["address", t("Адрес (улица, дом)")]] as const).map(([k, label]) => (
          <label key={k} className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{label}</div>
            <input value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" /></label>
        ))}
        {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
        <button onClick={create} disabled={saving} className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-50">{saving ? t("Создаём…") : t("Создать склад")}</button>
      </div>
      <button onClick={onLogout} className="block mx-auto mt-5 text-sm text-gray-600 hover:text-ink underline">{t("Выйти")}</button>
    </div>
  );
}

// Подсказка под выбором слота: зарезервировано ли время для компаний (режим В).
function WindowHint({ warehouse, companies, date, gate, time }: any) {
  if (!time) return null;
  const w = findWindow<CompanyWindow>(warehouse, date, gate, time);
  if (!w) return null;
  const names = (companies || []).filter((c: any) => w.company_ids.includes(c.id)).map((c: any) => c.name);
  return (
    <div className="text-xs text-violet-800 bg-violet-50 px-3 py-2 rounded-md">
      
      {t("Это время — окно для компаний (")}{describeWindow(w)}): {names.join(", ") || "—"}{t(". Перевозчикам с другим email это время недоступно, вы можете поставить бронь вручную.")}
    </div>
  );
}

function ManualBookingForm({ warehouse, companies, date, bookings, onSave }: any) {
  const gates = gateList(warehouse);
  const [gate, setGate] = useState(gates[0]);
  const slots = useMemo(() => zoneSlots(warehouse, gate), [warehouse, gate]);
  const [time, setTime] = useState(slots[0] || "");
  const [companyId, setCompanyId] = useState("");
  const [form, setForm] = useState({ email: "", company: "", carrier: "", phone: "", plate: "", cargo: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // при смене зоны — выбираем первое доступное время этой зоны
  useEffect(() => { if (!slots.includes(time)) setTime(slots[0] || ""); }, [slots]);
  function taken(g: number, tm: string) { return bookings.some((b: any) => b.gate === g && b.time === tm && !["no_show", "cancelled"].includes(b.status)); }
  const listMode = warehouse.booking_mode === "companies" && companies.length > 0;
  // email из списка компании — компания подставляется сама
  useEffect(() => {
    const e = form.email.trim().toLowerCase();
    const match = companies.find((c: any) => (c.emails || []).includes(e));
    if (match) setCompanyId(match.id);
  }, [form.email]);
  async function submit() {
    if (!time) { setError(t("Эта зона не работает — выберите другую")); return; }
    if (!(form.company || companyId) || !form.carrier || !form.plate || !form.email) { setError(t("Заполните обязательные поля")); return; }
    if (taken(gate, time)) { setError(t("Слот занят")); return; }
    setError("");
    setSaving(true);
    await onSave({ date, gate, time, ...form, ...(companyId ? { companyId } : {}) });
    setSaving(false);
  }
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Зона")}</div>
          <select value={gate} onChange={(e) => setGate(Number(e.target.value))} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            {gates.map((g) => <option key={g} value={g}>{t("Зона")} {g}</option>)}
          </select>
        </label>
        <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Время")}</div>
          <select value={time} onChange={(e) => setTime(e.target.value)} disabled={!slots.length} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            {!slots.length && <option value="">{t("зона не работает")}</option>}
            {slots.map((tm) => <option key={tm} value={tm} disabled={taken(gate, tm)}>{tm}{taken(gate, tm) ? t(" (занято)") : findWindow(warehouse, date, gate, tm) ? t(" (окно)") : ""}</option>)}
          </select>
        </label>
      </div>
      <WindowHint warehouse={warehouse} companies={companies} date={date} gate={gate} time={time} />
      {listMode && (
        <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Компания из списка склада")}</div>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            <option value="">{t("— другая компания (ввести вручную) —")}</option>
            {companies.map((c: any) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      )}
      {["email", "company", "carrier", "phone", "plate", "cargo"].filter((k) => !(k === "company" && companyId)).map((k) => (
        <label key={k} className="block">
          <div className="text-xs font-medium text-gray-600 mb-1.5">{{ email: "Email *", company: t("Компания *"), carrier: t("Перевозчик *"), phone: t("Телефон"), plate: t("Номер машины *"), cargo: t("Тип груза") }[k]}</div>
          <input value={(form as any)[k]} onChange={(e) => setForm({ ...form, [k]: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </label>
      ))}
      {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{error}</div>}
      <button onClick={submit} disabled={saving} className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-40">{saving ? t("Сохранение…") : t("Добавить бронь")}</button>
    </div>
  );
}

function EditForm({ booking, warehouse, companies, bookings, onSave }: any) {
  const [f, setF] = useState({ company: booking.company, carrier: booking.carrier, phone: booking.phone, plate: booking.plate, cargo: booking.cargo || "", email: booking.email, date: booking.date, gate: booking.gate, time: booking.time });
  const [saving, setSaving] = useState(false);
  const gates = gateList(warehouse);
  const slots = useMemo(() => {
    const list = zoneSlots(warehouse, f.gate);
    // старая бронь могла стоять на времени, которого уже нет в графике — оставляем его в списке
    if (f.gate === booking.gate && !list.includes(booking.time)) return [...list, booking.time].sort();
    return list;
  }, [warehouse, f.gate]);
  useEffect(() => { if (!slots.includes(f.time)) setF((p) => ({ ...p, time: slots[0] || "" })); }, [slots]);
  // занятость слота: та же дата, та же зона/время, не эта же самая бронь, и бронь ещё активна
  function taken(g: number, tm: string) {
    return (bookings || []).some((b: any) => b.id !== booking.id && b.date === f.date && b.gate === g && b.time === tm && !["no_show", "cancelled"].includes(b.status));
  }
  const conflict = taken(f.gate, f.time);
  const crossDate = f.date !== booking.date;
  async function submit() {
    setSaving(true);
    await onSave(f);
    setSaving(false);
  }
  return (
    <div className="space-y-4">
      <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Дата")}</div>
        <input type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
      </label>
      <div className="grid grid-cols-2 gap-3">
        <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Зона")}</div>
          <select value={f.gate} onChange={(e) => setF({ ...f, gate: Number(e.target.value) })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            {gates.map((g) => <option key={g} value={g}>{t("Зона")} {g}</option>)}
          </select>
        </label>
        <label className="block"><div className="text-xs font-medium text-gray-600 mb-1.5">{t("Время")}</div>
          <select value={f.time} onChange={(e) => setF({ ...f, time: e.target.value })} disabled={!slots.length} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm">
            {!slots.length && <option value="">{t("зона не работает")}</option>}
            {slots.map((tm) => {
              const busy = taken(f.gate, tm);
              return <option key={tm} value={tm} disabled={busy}>{tm}{busy ? t(" (занято)") : findWindow(warehouse, f.date, f.gate, tm) ? t(" (окно)") : ""}</option>;
            })}
          </select>
        </label>
      </div>
      <WindowHint warehouse={warehouse} companies={companies} date={f.date} gate={f.gate} time={f.time} />
      {crossDate && <div className="text-xs text-[#6B5200] bg-[#FFF3CD] border border-[#E5CF7C] px-3 py-2 rounded-md">{t("Дата изменена — занятость слотов показана только по данным, загруженным для исходного дня. При сохранении сервер проверит занятость на новой дате ещё раз.")}</div>}
      {conflict && !crossDate && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md">{t("Этот слот уже занят другой заявкой")}</div>}
      {["company", "carrier", "phone", "plate", "cargo", "email"].map((k) => (
        <label key={k} className="block">
          <div className="text-xs font-medium text-gray-600 mb-1.5">{t(FIELD_LABELS[k])}</div>
          <input value={(f as any)[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
        </label>
      ))}
      <button onClick={submit} disabled={saving || !f.time || (conflict && !crossDate)} className="w-full py-2.5 bg-ink text-amber rounded-md font-semibold text-sm disabled:opacity-40">{saving ? t("Сохранение…") : t("Сохранить")}</button>
    </div>
  );
}

const FIELD_LABELS: Record<string, string> = { company: "Компания", carrier: "Перевозчик", phone: "Телефон", plate: "Номер машины", cargo: "Тип груза", email: "Email" };

function StatCard({ label, value, color = "#222222" }: any) {
  return <div className="bg-white border border-gray-300 rounded-lg p-4"><div className="text-xs text-gray-500 mb-1">{label}</div><div className="font-display text-2xl font-bold" style={{ color }}>{value}</div></div>;
}
function TabBtn({ children, active, onClick }: any) {
  return <button onClick={onClick} className={`tab ${active ? "tab-on" : ""}`}>{children}</button>;
}
function NavBtn({ children, onClick }: any) {
  return <button onClick={onClick} className="w-9 h-9 rounded-md border border-gray-300 flex items-center justify-center hover:bg-gray-100">{children}</button>;
}
function IconBtn({ children, onClick, title }: any) {
  return <button title={title} onClick={onClick} className="w-7 h-7 rounded flex items-center justify-center border border-gray-300 text-gray-600 hover:bg-gray-100 bg-white">{children}</button>;
}
function NumField({ label, value, onChange, hint }: any) {
  // Текстовое поле с цифровой клавиатурой: принимает только цифры, при фокусе выделяет значение целиком,
  // поэтому новое число просто вводится поверх старого — без «0» в начале.
  return (
    <label className="block">
      <div className="text-xs font-medium text-gray-600 mb-1.5">{label}</div>
      <input type="text" inputMode="numeric" pattern="[0-9]*" value={value}
        onFocus={(e) => e.target.select()}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, "").replace(/^0+(?=\d)/, ""))}
        className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" />
      {hint && <div className="text-[11px] text-gray-500 mt-1 leading-snug">{hint}</div>}
    </label>
  );
}
function Modal({ children, onClose, title }: any) {
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={onClose}>
      <div className="bg-white border border-inkdark w-full max-w-sm max-h-[85vh] overflow-y-auto shadow-xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-ink text-white px-3 py-2 sticky top-0"><h3 className="font-bold text-[15px]">{title}</h3><button onClick={onClose} aria-label={t("Закрыть")} className="text-white"><X size={18} /></button></div>
        <div className="p-4">{children}</div>
      </div>
    </div>
  );
}
