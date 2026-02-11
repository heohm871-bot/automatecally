"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, limit, onSnapshot, orderBy, query, serverTimestamp } from "firebase/firestore";
import { AuthGuard } from "../../components/auth-guard";
import { useAuth } from "../../components/auth-provider";
import { getFirebaseDb } from "../../lib/firebaseClient";

type SiteRow = { id: string; name?: string };

export default function SitesPage() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [name, setName] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user) return;
    const q = query(collection(db, "sites"), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SiteRow, "id">) }));
      setSites(rows);
    });
  }, [user]);

  async function createSite(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !name.trim()) return;
    const db = getFirebaseDb();
    if (!db) return;

    await addDoc(collection(db, "sites"), {
      name: name.trim(),
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });

    setName("");
    setMsg("site created");
    setTimeout(() => setMsg(""), 1200);
  }

  return (
    <AuthGuard title="Sites">
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Sites</h1>
          <p className="mt-2 text-sm text-slate-600">list + create(최소)</p>

          <form onSubmit={createSite} className="mt-4 flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="new site name"
              className="h-10 flex-1 rounded-md border border-slate-300 px-3 text-sm"
            />
            <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white" disabled={!user}>
              생성
            </button>
          </form>
          {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}

          <ul className="mt-4 max-h-[520px] overflow-auto rounded-md border border-slate-200">
            {sites.map((s) => (
              <li key={s.id} className="border-b border-slate-100 px-3 py-2 text-sm last:border-none">
                <p className="font-medium">{s.name ?? "(no name)"}</p>
                <p className="text-xs text-slate-500">{s.id}</p>
              </li>
            ))}
            {sites.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">no sites</li>}
          </ul>
        </div>
      </main>
    </AuthGuard>
  );
}
