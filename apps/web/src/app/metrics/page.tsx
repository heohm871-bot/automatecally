"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { AuthGuard } from "../../components/auth-guard";
import { useAuth } from "../../components/auth-provider";
import { getFirebaseDb } from "../../lib/firebaseClient";

type SiteRow = { id: string; name?: string };

export default function MetricsPage() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [keyword, setKeyword] = useState("");
  const [views, setViews] = useState("0");
  const [ctr, setCtr] = useState("0");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user) return;
    const q = query(collection(db, "sites"), orderBy("createdAt", "desc"), limit(30));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SiteRow, "id">) }));
      setSites(rows);
      if (!siteId && rows[0]?.id) setSiteId(rows[0].id);
    });
  }, [user, siteId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !siteId || !keyword.trim()) return;
    const db = getFirebaseDb();
    if (!db) return;

    await addDoc(collection(db, "postMetrics"), {
      siteId,
      keyword: keyword.trim(),
      views: Number(views) || 0,
      ctr: Number(ctr) || 0,
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });

    setKeyword("");
    setViews("0");
    setCtr("0");
    setMsg("saved");
    setTimeout(() => setMsg(""), 1200);
  }

  return (
    <AuthGuard title="Metrics">
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Metrics</h1>

          <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-2">
            <select
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="">site 선택</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
            </select>
            <input
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="keyword"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <input
              value={views}
              onChange={(e) => setViews(e.target.value)}
              placeholder="views"
              inputMode="numeric"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <input
              value={ctr}
              onChange={(e) => setCtr(e.target.value)}
              placeholder="ctr"
              inputMode="decimal"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white" disabled={!user}>
              저장
            </button>
          </form>
          {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}
        </div>
      </main>
    </AuthGuard>
  );
}
