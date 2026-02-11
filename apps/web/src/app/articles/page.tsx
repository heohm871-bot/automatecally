"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { AuthGuard } from "../../components/auth-guard";
import { useAuth } from "../../components/auth-provider";
import { getFirebaseDb } from "../../lib/firebaseClient";

type SiteRow = { id: string; name?: string };
type ArticleRow = { id: string; titleFinal?: string; status?: string };

function statusClass(status?: string) {
  if (status === "ready") return "bg-emerald-100 text-emerald-800";
  if (status === "failed") return "bg-red-100 text-red-800";
  if (status === "draft") return "bg-amber-100 text-amber-800";
  return "bg-slate-100 text-slate-700";
}

export default function ArticlesPage() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [articles, setArticles] = useState<ArticleRow[]>([]);

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user) return;
    const q = query(collection(db, "sites"), orderBy("createdAt", "desc"), limit(30));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SiteRow, "id">) }));
      setSites(rows);
      if (!selectedSiteId && rows[0]?.id) setSelectedSiteId(rows[0].id);
    });
  }, [user, selectedSiteId]);

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user || !selectedSiteId) return;
    const q = query(
      collection(db, "articles"),
      where("siteId", "==", selectedSiteId),
      orderBy("createdAt", "desc"),
      limit(50)
    );
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<ArticleRow, "id">) }));
      setArticles(rows);
    });
  }, [user, selectedSiteId]);

  return (
    <AuthGuard title="Articles">
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Articles</h1>
          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700">Site</label>
            <select
              value={selectedSiteId}
              onChange={(e) => {
                setSelectedSiteId(e.target.value);
                setArticles([]);
              }}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">선택</option>
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ?? s.id}
                </option>
              ))}
            </select>
          </div>

          <ul className="mt-4 max-h-[520px] overflow-auto rounded-md border border-slate-200">
            {articles.map((a) => (
              <li key={a.id} className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2 last:border-none">
                <div>
                  <p className="text-sm font-medium">{a.titleFinal ?? "(untitled)"}</p>
                  <p className="text-xs text-slate-500">{a.id}</p>
                </div>
                <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(a.status)}`}>
                  {a.status ?? "unknown"}
                </span>
              </li>
            ))}
            {articles.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">no articles</li>}
          </ul>
        </div>
      </main>
    </AuthGuard>
  );
}
