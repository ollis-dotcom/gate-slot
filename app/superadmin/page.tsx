"use client";

import { SiteHeader } from "@/components/Logo";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, ArrowLeft, MapPin, Mail, Download, LogOut, Trash2, X } from "lucide-react";
import { supabaseBrowser } from "@/lib/supabaseClient";

type UserRow = {
  id: string;
  email: string;
  created_at: string;
  last_sign_in_at: string | null;
  warehouses: { id: string; name: string; slug: string }[];
  dispatcherOf?: { id: string; name: string; slug: string }[];
  isSuperAdmin: boolean;
  isMe: boolean;
};

type WarehouseRow = {
  id: string;
  slug: string;
  name: string;
  city: string;
  address: string | null;
  gates: number;
  ownerEmail: string | null;
  totalBookings: number;
  todayBookings: number;
  created_at: string;
};

export default function SuperAdminPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [warehouses, setWarehouses] = useState<WarehouseRow[]>([]);
  const [totals, setTotals] = useState({ warehouses: 0, bookings: 0, bookingsToday: 0 });
  const [q, setQ] = useState("");
  const [tab, setTab] = useState<"warehouses" | "users">("warehouses");
  const [users, setUsers] = useState<UserRow[]>([]);
  const [toDelete, setToDelete] = useState<UserRow | null>(null);

  function loadUsers() {
    fetch("/api/superadmin/users").then(async (r) => {
      if (!r.ok) return;
      const j = await r.json();
      setUsers(j.users || []);
    });
  }
  useEffect(() => { if (tab === "users") loadUsers(); }, [tab]);

  async function logout() {
    await supabaseBrowser().auth.signOut();
    router.push("/");
  }

  useEffect(() => {
    fetch("/api/superadmin/overview").then(async (r) => {
      if (r.status === 403) { setDenied(true); setLoading(false); return; }
      const j = await r.json();
      setWarehouses(j.warehouses || []);
      setTotals(j.totals || { warehouses: 0, bookings: 0, bookingsToday: 0 });
      setLoading(false);
    });
  }, []);

  const filtered = warehouses.filter((w) => {
    const s = q.trim().toLowerCase();
    if (!s) return true;
    return [w.name, w.city, w.address, w.ownerEmail, w.slug].some((v) => (v || "").toLowerCase().includes(s));
  });

  if (loading) return <div className="min-h-screen flex items-center justify-center text-gray-500 text-sm font-mono">ЗАГРУЗКА…</div>;

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center text-center px-5">
        <div>
          <div className="text-gray-700 font-semibold mb-2">Доступ запрещён</div>
          <div className="text-sm text-gray-500 mb-4">Эта страница видна только владельцу сервиса.</div>
          <a href="/dashboard" className="text-sm text-gray-600 hover:text-ink underline">В кабинет склада</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <SiteHeader href="/superadmin" subtitle="Супер-админка" wide>
        <a href="/dashboard" className="text-white underline">В свой кабинет</a>
        <span>|</span>
        <button onClick={logout} className="text-white underline">Выйти</button>
      </SiteHeader>

      <div className="max-w-6xl mx-auto px-5 py-8">
        <div className="flex items-start justify-between flex-wrap gap-3 mb-1">
          <h1 className="text-2xl font-bold text-link">Все склады сервиса</h1>
          <a href="/api/superadmin/export" className="px-3 py-2 border border-gray-300 rounded-md text-sm font-medium hover:bg-gray-100 flex items-center gap-1.5"><Download size={14} /> Экспорт всех броней (CSV)</a>
        </div>
        <p className="text-xs text-gray-500 uppercase tracking-widest font-mono mb-6">Видно только вам — по SUPER_ADMIN_EMAILS</p>

        <div className="grid grid-cols-3 gap-3 mb-6 max-w-lg">
          <StatCard label="Складов" value={totals.warehouses} />
          <StatCard label="Броней всего" value={totals.bookings} />
          <StatCard label="Броней сегодня" value={totals.bookingsToday} />
        </div>

        <div className="flex gap-1 bg-gray-200 p-1 rounded-md mb-5 w-fit">
          <button onClick={() => setTab("warehouses")} className={`px-3 py-1.5 rounded text-sm font-semibold ${tab === "warehouses" ? "bg-ink text-amber" : "text-gray-600"}`}>Склады</button>
          <button onClick={() => setTab("users")} className={`px-3 py-1.5 rounded text-sm font-semibold ${tab === "users" ? "bg-ink text-amber" : "text-gray-600"}`}>Пользователи</button>
        </div>

        {tab === "users" && (
          <UsersList users={users} q={q} setQ={setQ} onDelete={setToDelete} />
        )}

        {tab === "warehouses" && <>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Поиск по названию, городу, адресу, email владельца…"
          className="w-full max-w-lg border border-gray-300 rounded-md px-3 py-2 text-sm mb-5"
        />

        {filtered.length === 0 ? (
          <div className="bg-white border border-dashed border-gray-300 rounded-lg py-16 text-center text-gray-400 text-sm">Ничего не найдено</div>
        ) : (
          <div className="bg-white border border-gray-300 rounded-lg overflow-hidden divide-y divide-gray-100">
            {filtered.map((w) => (
              <button
                key={w.id}
                onClick={() => router.push(`/superadmin/${w.id}`)}
                className="w-full text-left p-4 flex items-center gap-4 flex-wrap hover:bg-gray-50 transition-colors"
              >
                <div className="flex-1 min-w-[220px]">
                  <div className="text-sm font-semibold">{w.name} <span className="text-gray-400 font-normal font-mono text-xs">/{w.slug}</span></div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><MapPin size={11} /> {w.city}{w.address ? `, ${w.address}` : ""}</div>
                  <div className="text-xs text-gray-500 flex items-center gap-1 mt-0.5"><Mail size={11} /> {w.ownerEmail || "—"}</div>
                </div>
                <div className="text-xs text-gray-500 font-mono">Зон: {w.gates}</div>
                <div className="text-xs font-mono px-2 py-1 rounded bg-gray-100">Всего: {w.totalBookings}</div>
                <div className="text-xs font-mono px-2 py-1 rounded bg-[#FFF3CD] text-[#6B5200]">Сегодня: {w.todayBookings}</div>
                <div className="text-[10px] text-gray-400 font-mono">{new Date(w.created_at).toLocaleDateString("ru-RU")}</div>
              </button>
            ))}
          </div>
        )}
        </>}
      </div>

      {toDelete && (
        <DeleteUserModal
          user={toDelete}
          onClose={() => setToDelete(null)}
          onDeleted={() => {
            setToDelete(null);
            loadUsers();
            fetch("/api/superadmin/overview").then((r) => r.json()).then((j) => { setWarehouses(j.warehouses || []); setTotals(j.totals || totals); });
          }}
        />
      )}
    </div>
  );
}

function UsersList({ users, q, setQ, onDelete }: { users: UserRow[]; q: string; setQ: (v: string) => void; onDelete: (u: UserRow) => void }) {
  const s = q.trim().toLowerCase();
  const list = users.filter((u) => !s || u.email.toLowerCase().includes(s) || u.warehouses.some((w) => w.name.toLowerCase().includes(s)));
  return (
    <>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по email или складу…"
        className="w-full max-w-lg border border-gray-300 rounded-md px-3 py-2 text-sm mb-5" />
      {list.length === 0 ? (
        <div className="bg-white border border-dashed border-gray-300 rounded-lg py-16 text-center text-gray-400 text-sm">Ничего не найдено</div>
      ) : (
        <div className="bg-white border border-gray-300 rounded-lg overflow-hidden divide-y divide-gray-100">
          {list.map((u) => (
            <div key={u.id} className="p-4 flex items-center gap-4 flex-wrap">
              <div className="flex-1 min-w-[220px]">
                <div className="text-sm font-semibold flex items-center gap-2">
                  {u.email || "—"}
                  {u.isSuperAdmin && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-ink text-amber">СУПЕР-АДМИН</span>}
                  {u.isMe && <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-gray-200">ЭТО ВЫ</span>}
                </div>
                <div className="text-xs text-gray-500 mt-0.5">
                  {u.warehouses.length ? <>Склад: {u.warehouses.map((w) => <a key={w.id} href={`/superadmin/${w.id}`} className="underline hover:text-ink mr-2">{w.name}</a>)}</> : u.dispatcherOf?.length ? <>Пользователь склада: {u.dispatcherOf.map((w) => <a key={w.id} href={`/superadmin/${w.id}`} className="underline hover:text-ink mr-2">{w.name}</a>)}</> : <span className="text-[#8A5A00]">Без склада</span>}
                </div>
              </div>
              <div className="text-[10px] text-gray-400 font-mono">
                создан {new Date(u.created_at).toLocaleDateString("ru-RU")}
                {u.last_sign_in_at && <> · вход {new Date(u.last_sign_in_at).toLocaleDateString("ru-RU")}</>}
              </div>
              {!u.isMe && !u.isSuperAdmin && (
                <button onClick={() => onDelete(u)} className="px-2.5 py-1 border border-red-200 text-red-600 rounded-md text-xs hover:bg-red-50 flex items-center gap-1">
                  <Trash2 size={12} /> Удалить
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function DeleteUserModal({ user, onClose, onDeleted }: { user: UserRow; onClose: () => void; onDeleted: () => void }) {
  const [confirm, setConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  async function del() {
    setDeleting(true);
    setError("");
    const res = await fetch(`/api/superadmin/users/${user.id}`, { method: "DELETE" });
    const j = await res.json().catch(() => ({}));
    setDeleting(false);
    if (!res.ok) { setError(j.error || "Не удалось удалить"); return; }
    onDeleted();
  }
  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center p-4 z-50" onClick={() => !deleting && onClose()}>
      <div className="bg-white rounded-lg p-6 w-full max-w-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-display text-lg font-bold text-red-600">Удалить пользователя</h3>
          <button onClick={onClose} disabled={deleting}><X size={18} /></button>
        </div>
        <p className="text-sm text-gray-700 mb-2">Аккаунт <b>{user.email}</b> будет удалён без возможности восстановления — войти под ним будет нельзя.</p>
        {user.warehouses.length > 0 ? (
          <p className="text-sm text-gray-700 mb-4">Вместе с ним удалится склад «{user.warehouses.map((w) => w.name).join(", ")}» со всеми бронями и уведомлениями.</p>
        ) : (
          <p className="text-sm text-gray-700 mb-4">Склада у пользователя нет.</p>
        )}
        <p className="text-xs text-gray-500 mb-4">После удаления этот email можно снова использовать для регистрации.</p>
        <label className="block mb-4">
          <div className="text-xs font-medium text-gray-600 mb-1.5">Для подтверждения введите email пользователя</div>
          <input value={confirm} onChange={(e) => setConfirm(e.target.value)} className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm font-mono" />
        </label>
        {error && <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-md mb-4">{error}</div>}
        <div className="flex gap-2">
          <button onClick={onClose} disabled={deleting} className="flex-1 py-2.5 border border-gray-300 rounded-md text-sm font-semibold disabled:opacity-40">Отмена</button>
          <button onClick={del} disabled={deleting || confirm.trim().toLowerCase() !== user.email.toLowerCase()} className="flex-1 py-2.5 bg-red-600 text-white rounded-md text-sm font-semibold disabled:opacity-40">
            {deleting ? "Удаление…" : "Удалить"}
          </button>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-white border border-gray-300 rounded-lg p-4">
      <div className="text-xs text-gray-500 mb-1">{label}</div>
      <div className="font-display text-2xl font-bold">{value}</div>
    </div>
  );
}
