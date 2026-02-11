"use client";

import { useEffect, useMemo, useState } from "react";
import {
  addDoc,
  collection,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where
} from "firebase/firestore";
import { AuthGuard } from "../../components/auth-guard";
import { useAuth } from "../../components/auth-provider";
import { getFirebaseDb } from "../../lib/firebaseClient";

type SiteRow = { id: string; name?: string };
type MetricRow = {
  id: string;
  siteId?: string;
  keyword?: string;
  clusterId?: string;
  templateId?: string;
  pv_24h?: number;
  pv_72h?: number;
  comments?: number;
  likes?: number;
  avgTimeSec?: number | null;
  searchRatio?: number | null;
  ctrProxy?: number | null;
  dwellProxy?: number | null;
  score?: number;
  createdAt?: { seconds?: number };
};

function num(v: string) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export default function MetricsPage() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteId, setSiteId] = useState("");

  const [keyword, setKeyword] = useState("");
  const [clusterId, setClusterId] = useState("cluster-a");
  const [templateId, setTemplateId] = useState("template-a");
  const [pv24h, setPv24h] = useState("0");
  const [pv72h, setPv72h] = useState("0");
  const [comments, setComments] = useState("0");
  const [likes, setLikes] = useState("0");
  const [avgTimeSec, setAvgTimeSec] = useState("");
  const [searchRatio, setSearchRatio] = useState("");
  const [ctrProxy, setCtrProxy] = useState("");
  const [dwellProxy, setDwellProxy] = useState("");

  const [rows, setRows] = useState<MetricRow[]>([]);
  const [msg, setMsg] = useState("");

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
    if (!db || !user || !siteId) return;
    const q = query(
      collection(db, "postMetrics"),
      where("siteId", "==", siteId),
      orderBy("createdAt", "desc"),
      limit(120)
    );
    return onSnapshot(q, (snap) => {
      const metrics = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MetricRow, "id">) }));
      setRows(metrics);
    });
  }, [user, siteId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !siteId || !keyword.trim()) return;
    const db = getFirebaseDb();
    if (!db) return;

    const pv24 = num(pv24h);
    const pv72 = num(pv72h);
    const c = num(comments);
    const l = num(likes);
    const ctrP = ctrProxy.trim() ? num(ctrProxy) : pv24 > 0 ? Math.min(1, l / pv24) : 0;
    const dwellP = dwellProxy.trim() ? num(dwellProxy) : avgTimeSec.trim() ? Math.min(1, num(avgTimeSec) / 180) : 0;
    const commentRate = pv24 > 0 ? c / pv24 : 0;
    const score = 0.45 * ctrP + 0.35 * dwellP + 0.2 * commentRate;

    await addDoc(collection(db, "postMetrics"), {
      siteId,
      keyword: keyword.trim(),
      clusterId: clusterId.trim(),
      templateId: templateId.trim(),
      pv_24h: pv24,
      pv_72h: pv72,
      comments: c,
      likes: l,
      avgTimeSec: avgTimeSec.trim() ? num(avgTimeSec) : null,
      searchRatio: searchRatio.trim() ? num(searchRatio) : null,
      ctrProxy: ctrP,
      dwellProxy: dwellP,
      commentRate,
      score,
      createdAt: serverTimestamp(),
      createdBy: user.uid
    });

    setKeyword("");
    setPv24h("0");
    setPv72h("0");
    setComments("0");
    setLikes("0");
    setAvgTimeSec("");
    setSearchRatio("");
    setCtrProxy("");
    setDwellProxy("");
    setMsg("saved");
    setTimeout(() => setMsg(""), 1200);
  }

  const stats = useMemo(() => {
    const nowSec = Date.now() / 1000;
    const in7d = rows.filter((r) => (r.createdAt?.seconds ?? 0) >= nowSec - 7 * 24 * 3600);
    const prev7d = rows.filter(
      (r) =>
        (r.createdAt?.seconds ?? 0) < nowSec - 7 * 24 * 3600 &&
        (r.createdAt?.seconds ?? 0) >= nowSec - 14 * 24 * 3600
    );
    const avg = (arr: MetricRow[], key: keyof MetricRow) =>
      arr.length
        ? arr.reduce((s, r) => s + (typeof r[key] === "number" ? Number(r[key]) : 0), 0) / arr.length
        : 0;
    const prevAvg = avg(prev7d, "pv_24h");
    const wowPv24 = prevAvg > 0 ? ((avg(in7d, "pv_24h") - prevAvg) / prevAvg) * 100 : 0;

    const clusterAvg = Object.values(
      rows.reduce<Record<string, { clusterId: string; count: number; pv24: number; likes: number }>>((acc, r) => {
        const c = r.clusterId ?? "unknown";
        acc[c] = acc[c] ?? { clusterId: c, count: 0, pv24: 0, likes: 0 };
        acc[c].count += 1;
        acc[c].pv24 += r.pv_24h ?? 0;
        acc[c].likes += r.likes ?? 0;
        return acc;
      }, {})
    ).map((x) => ({ ...x, pv24Avg: x.count > 0 ? x.pv24 / x.count : 0, likesAvg: x.count > 0 ? x.likes / x.count : 0 }));

    const templateWinner = Object.values(
      rows.reduce<Record<string, { templateId: string; count: number; score: number }>>((acc, r) => {
        const t = r.templateId ?? "unknown";
        acc[t] = acc[t] ?? { templateId: t, count: 0, score: 0 };
        acc[t].count += 1;
        acc[t].score += r.score ?? 0;
        return acc;
      }, {})
    )
      .map((x) => ({ ...x, scoreAvg: x.count > 0 ? x.score / x.count : 0 }))
      .sort((a, b) => b.scoreAvg - a.scoreAvg)[0];

    return { wowPv24, clusterAvg, templateWinner };
  }, [rows]);

  return (
    <AuthGuard title="Metrics">
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Metrics</h1>
          <p className="mt-2 text-sm text-slate-600">프록시 지표 입력 + 자동 계산</p>

          <form onSubmit={submit} className="mt-4 grid gap-3 md:grid-cols-3">
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
            <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="keyword" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={clusterId} onChange={(e) => setClusterId(e.target.value)} placeholder="clusterId" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={templateId} onChange={(e) => setTemplateId(e.target.value)} placeholder="templateId" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={pv24h} onChange={(e) => setPv24h(e.target.value)} placeholder="pv_24h" inputMode="numeric" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={pv72h} onChange={(e) => setPv72h(e.target.value)} placeholder="pv_72h" inputMode="numeric" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={comments} onChange={(e) => setComments(e.target.value)} placeholder="comments" inputMode="numeric" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={likes} onChange={(e) => setLikes(e.target.value)} placeholder="likes" inputMode="numeric" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={avgTimeSec} onChange={(e) => setAvgTimeSec(e.target.value)} placeholder="avgTimeSec (optional)" inputMode="numeric" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={searchRatio} onChange={(e) => setSearchRatio(e.target.value)} placeholder="searchRatio (optional 0~1)" inputMode="decimal" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={ctrProxy} onChange={(e) => setCtrProxy(e.target.value)} placeholder="ctrProxy (optional)" inputMode="decimal" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <input value={dwellProxy} onChange={(e) => setDwellProxy(e.target.value)} placeholder="dwellProxy (optional)" inputMode="decimal" className="h-10 rounded-md border border-slate-300 px-3 text-sm" />
            <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white" disabled={!user}>
              저장
            </button>
          </form>
          {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}

          <div className="mt-6 grid gap-3 md:grid-cols-3">
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">전주 대비 pv_24h</p>
              <p className={`text-lg font-semibold ${stats.wowPv24 >= 0 ? "text-emerald-700" : "text-rose-700"}`}>
                {stats.wowPv24.toFixed(1)}%
              </p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">템플릿 승자</p>
              <p className="text-lg font-semibold text-slate-900">{stats.templateWinner?.templateId ?? "n/a"}</p>
              <p className="text-xs text-slate-600">scoreAvg: {(stats.templateWinner?.scoreAvg ?? 0).toFixed(4)}</p>
            </div>
            <div className="rounded-md border border-slate-200 p-3">
              <p className="text-xs text-slate-500">최근 입력 수</p>
              <p className="text-lg font-semibold text-slate-900">{rows.length}</p>
            </div>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 p-3">
            <p className="text-sm font-medium">클러스터 평균</p>
            <ul className="mt-2 space-y-1">
              {stats.clusterAvg.slice(0, 6).map((c) => (
                <li key={c.clusterId} className="text-xs text-slate-700">
                  {c.clusterId}: pv24Avg {c.pv24Avg.toFixed(1)}, likesAvg {c.likesAvg.toFixed(1)} ({c.count}건)
                </li>
              ))}
              {stats.clusterAvg.length === 0 && <li className="text-xs text-slate-500">no data</li>}
            </ul>
          </div>
        </div>
      </main>
    </AuthGuard>
  );
}
