"use client";

import { useEffect, useState } from "react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { AuthGuard } from "../../components/auth-guard";
import { useAuth } from "../../components/auth-provider";
import { getFirebaseDb } from "../../lib/firebaseClient";

type SiteRow = { id: string; name?: string };
type TraceEntry = {
  task?: string;
  taskType?: string;
  at?: string;
  ok?: boolean | null;
  status?: string;
  error?: string;
};
type ArticleImage = {
  slot?: string;
  kind?: string;
  source?: unknown;
  storagePath?: string;
};
type ArticleRow = {
  id: string;
  titleFinal?: string;
  status?: string;
  titleSimMax?: number;
  packagePath?: string;
  k12?: { main?: string[]; longtail?: string[] };
  qa?: { pass?: boolean };
  images?: ArticleImage[];
  trace?: TraceEntry[];
  pipelineHistory?: TraceEntry[];
};

const IMAGE_SLOTS = ["top", "h2_1", "h2_2", "h2_3", "h2_4"] as const;

function statusClass(status?: string) {
  if (status === "published") return "bg-sky-100 text-sky-800";
  if (status === "packaged") return "bg-indigo-100 text-indigo-800";
  if (status === "ready") return "bg-emerald-100 text-emerald-800";
  if (status === "qa_failed") return "bg-rose-100 text-rose-800";
  if (status === "generating") return "bg-amber-100 text-amber-800";
  if (status === "queued") return "bg-slate-100 text-slate-700";
  return "bg-slate-100 text-slate-700";
}

export default function ArticlesPage() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [articles, setArticles] = useState<ArticleRow[]>([]);
  const [selectedArticleId, setSelectedArticleId] = useState("");

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
      if (!selectedArticleId && rows[0]?.id) setSelectedArticleId(rows[0].id);
      if (selectedArticleId && !rows.some((r) => r.id === selectedArticleId)) {
        setSelectedArticleId(rows[0]?.id ?? "");
      }
    });
  }, [user, selectedSiteId, selectedArticleId]);

  const selected = articles.find((a) => a.id === selectedArticleId) ?? null;
  const selectedTrace = selected ? (selected.trace?.length ? selected.trace : selected.pipelineHistory ?? []) : [];

  function keywords3(article: ArticleRow) {
    const k = article.k12;
    const main = k?.main ?? [];
    const longtail = k?.longtail ?? [];
    return [main[0], main[1], longtail[0]].filter((x): x is string => Boolean(x));
  }

  function imageSlotStatus(article: ArticleRow, slot: (typeof IMAGE_SLOTS)[number]) {
    const image = (article.images ?? []).find((x) => x.slot === slot);
    const traceRows = article.trace?.length ? article.trace : article.pipelineHistory ?? [];
    const imageFailed = traceRows.some(
      (t) => (t.task === "image_generate" || t.taskType === "image_generate") && (t.ok === false || t.status === "failed")
    );
    if (image?.kind === "top_card") return "generated";
    if (image?.source || image?.storagePath) return "free";
    if (imageFailed) return "failed";
    if (article.status === "generating" || article.status === "ready") return "generating";
    return "pending";
  }

  return (
    <AuthGuard title="Articles">
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Articles</h1>
          <div className="mt-4">
            <label className="text-sm font-medium text-slate-700">Site</label>
            <select
              value={selectedSiteId}
              onChange={(e) => {
                setSelectedSiteId(e.target.value);
                setArticles([]);
                setSelectedArticleId("");
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
          <div className="mt-4 grid gap-4 md:grid-cols-[1.1fr_1fr]">
            <ul className="max-h-[580px] overflow-auto rounded-md border border-slate-200">
              {articles.map((a) => (
                <li
                  key={a.id}
                  className={`cursor-pointer border-b border-slate-100 px-3 py-3 last:border-none ${
                    selectedArticleId === a.id ? "bg-slate-50" : "bg-white"
                  }`}
                  onClick={() => setSelectedArticleId(a.id)}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-medium">{a.titleFinal ?? "(untitled)"}</p>
                      <p className="text-xs text-slate-500">{a.id}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(a.status)}`}>
                      {a.status ?? "unknown"}
                    </span>
                  </div>
                </li>
              ))}
              {articles.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">no articles</li>}
            </ul>

            <div className="rounded-md border border-slate-200 p-3">
              {!selected && <p className="text-sm text-slate-500">article 선택</p>}
              {selected && (
                <div className="space-y-3">
                  <div>
                    <p className="text-sm font-semibold">{selected.titleFinal ?? "(untitled)"}</p>
                    <p className="text-xs text-slate-500">{selected.id}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${statusClass(selected.status)}`}>
                      {selected.status ?? "unknown"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      titleSim: {typeof selected.titleSimMax === "number" ? selected.titleSimMax.toFixed(3) : "n/a"}
                    </span>
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700">
                      qa: {selected.qa?.pass === true ? "pass" : selected.qa?.pass === false ? "fail" : "n/a"}
                    </span>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-700">대표 키워드 3개</p>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {keywords3(selected).map((k) => (
                        <span key={k} className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs text-emerald-700">
                          {k}
                        </span>
                      ))}
                      {keywords3(selected).length === 0 && <span className="text-xs text-slate-500">n/a</span>}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-700">이미지 슬롯 5개 상태</p>
                    <div className="mt-1 grid grid-cols-2 gap-2">
                      {IMAGE_SLOTS.map((slot) => (
                        <div key={slot} className="rounded border border-slate-200 px-2 py-1 text-xs text-slate-700">
                          {slot}: {imageSlotStatus(selected, slot)}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div>
                    <p className="text-xs font-medium text-slate-700">trace</p>
                    <ul className="mt-1 max-h-[220px] overflow-auto rounded border border-slate-200">
                      {selectedTrace.map((t, idx) => (
                        <li key={`${t.at ?? "na"}-${idx}`} className="border-b border-slate-100 px-2 py-1 text-xs last:border-none">
                          <span className="font-medium">{t.task ?? t.taskType ?? "unknown"}</span>
                          {" · "}
                          <span>{t.status ?? (t.ok === true ? "ok" : t.ok === false ? "failed" : "running")}</span>
                          {" · "}
                          <span>{t.at ?? "-"}</span>
                          {t.error ? <span className="text-rose-700"> · {t.error}</span> : null}
                        </li>
                      ))}
                      {selectedTrace.length === 0 && <li className="px-2 py-1 text-xs text-slate-500">no trace</li>}
                    </ul>
                  </div>

                  <div className="text-xs text-slate-500">packagePath: {selected.packagePath ?? "n/a"}</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
