"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, doc, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { AuthGuard } from "../../components/auth-guard";
import { useAuth } from "../../components/auth-provider";
import { getFirebaseDb } from "../../lib/firebaseClient";

type SiteRow = { id: string; name?: string };

type TaskRunRow = {
  id: string;
  siteId?: string;
  runDate?: string;
  taskType?: string;
  status?: string; // queued/running/success/failed
  state?: string; // queued/running/succeeded/failed (preferred)
  attemptCount?: number;
  traceId?: string;
  lastErrorCode?: string | null;
  lastErrorMessage?: string | null;
  error?: string | null;
  updatedAt?: { seconds?: number };
  startedAt?: { seconds?: number };
  queuedAt?: { seconds?: number };
};

type CostDailyDoc = {
  estimatedTokens?: number;
  estimatedCostUsd?: number;
  llmCallCount?: number;
  updatedAt?: { seconds?: number };
};

function todayIsoDate() {
  // Good enough for ops filter; server uses KST runDate.
  return new Date().toISOString().slice(0, 10);
}

function isoDayAdd(dayKey: string, deltaDays: number) {
  const [y, m, d] = String(dayKey ?? "").split("-").map((x) => Number(x));
  if (!y || !m || !d) return "";
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + deltaDays);
  return dt.toISOString().slice(0, 10);
}

function tsSeconds(v: { seconds?: number } | undefined) {
  return typeof v?.seconds === "number" ? v.seconds : 0;
}

function stateOf(r: TaskRunRow) {
  if (typeof r.state === "string" && r.state) return r.state;
  if (typeof r.status === "string" && r.status) {
    if (r.status === "success") return "succeeded";
    return r.status;
  }
  return "unknown";
}

export default function OpsPage() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");
  const [runDate, setRunDate] = useState(todayIsoDate());
  const [status, setStatus] = useState("all");
  const [rows, setRows] = useState<TaskRunRow[]>([]);
  const [costToday, setCostToday] = useState<CostDailyDoc | null>(null);
  const [costTodaySite, setCostTodaySite] = useState<CostDailyDoc | null>(null);
  const [costPrev, setCostPrev] = useState<CostDailyDoc | null>(null);
  const [costPrevSite, setCostPrevSite] = useState<CostDailyDoc | null>(null);

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user) return;
    const q = query(collection(db, "sites"), orderBy("createdAt", "desc"), limit(30));
    return onSnapshot(q, (snap) => {
      const siteRows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SiteRow, "id">) }));
      setSites(siteRows);
      if (!siteId && siteRows[0]?.id) setSiteId(siteRows[0].id);
    });
  }, [user, siteId]);

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user || !siteId || !runDate) return;
    const q = query(
      collection(db, "taskRuns"),
      where("siteId", "==", siteId),
      where("runDate", "==", runDate),
      orderBy("updatedAt", "desc"),
      limit(200)
    );
    return onSnapshot(q, (snap) => {
      const taskRuns = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<TaskRunRow, "id">) }));
      setRows(taskRuns);
    });
  }, [user, siteId, runDate]);

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user || !siteId || !runDate) return;
    const prev = isoDayAdd(runDate, -7);
    const unsub: Array<() => void> = [];

    unsub.push(
      onSnapshot(doc(db, "costDaily", runDate), (snap) => {
        setCostToday(snap.exists() ? (snap.data() as CostDailyDoc) : null);
      })
    );
    unsub.push(
      onSnapshot(doc(db, "costDaily", runDate, "sites", siteId), (snap) => {
        setCostTodaySite(snap.exists() ? (snap.data() as CostDailyDoc) : null);
      })
    );
    if (prev) {
      unsub.push(
        onSnapshot(doc(db, "costDaily", prev), (snap) => {
          setCostPrev(snap.exists() ? (snap.data() as CostDailyDoc) : null);
        })
      );
      unsub.push(
        onSnapshot(doc(db, "costDaily", prev, "sites", siteId), (snap) => {
          setCostPrevSite(snap.exists() ? (snap.data() as CostDailyDoc) : null);
        })
      );
    } else {
      setCostPrev(null);
      setCostPrevSite(null);
    }
    return () => unsub.forEach((fn) => fn());
  }, [user, siteId, runDate]);

  const filtered = useMemo(() => {
    if (status === "all") return rows;
    const want = status.trim().toLowerCase();
    return rows.filter((r) => stateOf(r) === want || String(r.status ?? "").toLowerCase() === want);
  }, [rows, status]);

  const summary = useMemo(() => {
    const counts: Record<string, number> = {};
    const errorCounts = new Map<string, number>();
    let retried = 0;
    for (const r of rows) {
      const s = stateOf(r);
      counts[s] = (counts[s] ?? 0) + 1;
      const attempts = typeof r.attemptCount === "number" ? r.attemptCount : 0;
      if (attempts >= 2) retried += 1;
      const code = String(r.lastErrorCode ?? "").trim();
      if (s === "failed" && code) errorCounts.set(code, (errorCounts.get(code) ?? 0) + 1);
    }
    const topErrors = Array.from(errorCounts.entries())
      .map(([code, count]) => ({ code, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
    return { counts, topErrors, retried };
  }, [rows]);

  const costWidget = useMemo(() => {
    const curTotal = typeof costToday?.estimatedCostUsd === "number" ? costToday.estimatedCostUsd : 0;
    const curSite = typeof costTodaySite?.estimatedCostUsd === "number" ? costTodaySite.estimatedCostUsd : 0;
    const prevTotal = typeof costPrev?.estimatedCostUsd === "number" ? costPrev.estimatedCostUsd : 0;
    const prevSite = typeof costPrevSite?.estimatedCostUsd === "number" ? costPrevSite.estimatedCostUsd : 0;

    const totalDelta = curTotal - prevTotal;
    const siteDelta = curSite - prevSite;
    return {
      curTotal,
      curSite,
      totalDelta,
      siteDelta,
      curCalls: typeof costToday?.llmCallCount === "number" ? costToday.llmCallCount : 0,
      curTokens: typeof costToday?.estimatedTokens === "number" ? costToday.estimatedTokens : 0
    };
  }, [costToday, costTodaySite, costPrev, costPrevSite]);

  return (
    <AuthGuard title="Ops">
      <div className="mx-auto max-w-6xl px-6 py-8 md:px-10">
        <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="text-xl font-semibold">Ops</h1>
            <p className="text-sm text-slate-600">Task runs (by siteId/runDate). Read-only.</p>
          </div>
          <div className="flex flex-wrap gap-2 text-sm">
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2"
              value={siteId}
              onChange={(e) => setSiteId(e.target.value)}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name ? `${s.name} (${s.id})` : s.id}
                </option>
              ))}
            </select>
            <input
              className="rounded-md border border-slate-200 bg-white px-3 py-2"
              type="date"
              value={runDate}
              onChange={(e) => setRunDate(e.target.value)}
            />
            <select
              className="rounded-md border border-slate-200 bg-white px-3 py-2"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="all">all</option>
              <option value="queued">queued</option>
              <option value="running">running</option>
              <option value="succeeded">succeeded</option>
              <option value="failed">failed</option>
            </select>
          </div>
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-medium text-slate-500">Counts</p>
            <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
              {["queued", "running", "succeeded", "failed"].map((k) => (
                <div key={k} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                  <span className="text-slate-600">{k}</span>
                  <span className="font-semibold text-slate-900">{summary.counts[k] ?? 0}</span>
                </div>
              ))}
            </div>
            <p className="mt-2 text-xs text-slate-600">retried(attemptCount&gt;=2): {summary.retried}</p>
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-2">
            <p className="text-xs font-medium text-slate-500">Top failure codes</p>
            <div className="mt-2 grid gap-2 text-sm">
              {summary.topErrors.length === 0 ? (
                <p className="text-sm text-slate-600">No failures for this filter.</p>
              ) : (
                summary.topErrors.map((e) => (
                  <div key={e.code} className="flex items-center justify-between rounded-md bg-slate-50 px-3 py-2">
                    <span className="font-mono text-xs text-slate-700">{e.code}</span>
                    <span className="font-semibold">{e.count}</span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 md:col-span-3">
            <p className="text-xs font-medium text-slate-500">Estimated LLM cost</p>
            <div className="mt-2 grid gap-2 md:grid-cols-3">
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-600">today(total)</p>
                <p className="font-mono text-sm text-slate-900">${costWidget.curTotal.toFixed(4)}</p>
                <p className={"text-xs " + (costWidget.totalDelta >= 0 ? "text-rose-700" : "text-emerald-700")}>
                  vs -7d: {costWidget.totalDelta >= 0 ? "+" : ""}
                  {costWidget.totalDelta.toFixed(4)}
                </p>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-600">today(site)</p>
                <p className="font-mono text-sm text-slate-900">${costWidget.curSite.toFixed(4)}</p>
                <p className={"text-xs " + (costWidget.siteDelta >= 0 ? "text-rose-700" : "text-emerald-700")}>
                  vs -7d: {costWidget.siteDelta >= 0 ? "+" : ""}
                  {costWidget.siteDelta.toFixed(4)}
                </p>
              </div>
              <div className="rounded-md bg-slate-50 px-3 py-2">
                <p className="text-xs text-slate-600">today(activity)</p>
                <p className="font-mono text-xs text-slate-700">llmCallCount: {costWidget.curCalls}</p>
                <p className="font-mono text-xs text-slate-700">estimatedTokens: {costWidget.curTokens}</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-slate-600">
              This is an estimate based on model token usage (no billing API).
            </p>
          </div>
        </div>

        <div className="mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs text-slate-600">
              <tr>
                <th className="px-4 py-3">updated</th>
                <th className="px-4 py-3">taskType</th>
                <th className="px-4 py-3">state</th>
                <th className="px-4 py-3">attempt</th>
                <th className="px-4 py-3">error</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r) => {
                const updated = tsSeconds(r.updatedAt);
                const updatedIso = updated ? new Date(updated * 1000).toISOString().slice(11, 19) : "-";
                const s = stateOf(r);
                const err = String(r.lastErrorCode ?? r.error ?? "").trim();
                const attempt = typeof r.attemptCount === "number" ? r.attemptCount : (r as any).retryCount + 1 || 1;
                return (
                  <tr key={r.id} className="border-t border-slate-100">
                    <td className="px-4 py-3 font-mono text-xs text-slate-600">{updatedIso}</td>
                    <td className="px-4 py-3 font-mono text-xs">{String(r.taskType ?? "-")}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          "rounded px-2 py-1 text-xs " +
                          (s === "failed"
                            ? "bg-red-50 text-red-700"
                            : s === "succeeded"
                              ? "bg-emerald-50 text-emerald-700"
                              : s === "running"
                                ? "bg-blue-50 text-blue-700"
                                : "bg-slate-100 text-slate-700")
                        }
                      >
                        {s}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs">{attempt}</td>
                    <td className="px-4 py-3 font-mono text-xs text-slate-700">{err ? err.slice(0, 60) : "-"}</td>
                  </tr>
                );
              })}
              {filtered.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-sm text-slate-600" colSpan={5}>
                    No task runs.
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </div>
    </AuthGuard>
  );
}
