"use client";

import { useEffect, useState } from "react";
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "firebase/firestore";
import { AuthGuard } from "../../components/auth-guard";
import { useAuth } from "../../components/auth-provider";
import { getFirebaseDb } from "../../lib/firebaseClient";

type Platform = "naver" | "tistory";
type PublishMode = "scheduled" | "manual";
type SiteRow = {
  id: string;
  siteId?: string;
  name?: string;
  platform?: Platform;
  topic?: string;
  growthOverride?: number;
  isEnabled?: boolean;
  dailyTarget?: number;
  publishWindows?: string[];
  publishMode?: PublishMode;
  publishMinIntervalMin?: number;
};

export default function SitesPage() {
  const { user } = useAuth();
  const [sites, setSites] = useState<SiteRow[]>([]);
  const [siteIdInput, setSiteIdInput] = useState("");
  const [name, setName] = useState("");
  const [platform, setPlatform] = useState<Platform>("naver");
  const [topic, setTopic] = useState("");
  const [growthOverride, setGrowthOverride] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [dailyTarget, setDailyTarget] = useState("3");
  const [publishWindows, setPublishWindows] = useState("09:30,13:30,20:30");
  const [publishMode, setPublishMode] = useState<PublishMode>("scheduled");
  const [publishMinIntervalMin, setPublishMinIntervalMin] = useState("60");
  const [selectedSiteId, setSelectedSiteId] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user) return;
    const q = query(collection(db, "sites"), orderBy("createdAt", "desc"), limit(50));
    return onSnapshot(q, (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<SiteRow, "id">) }));
      setSites(rows);
      if (!selectedSiteId && rows[0]?.id) setSelectedSiteId(rows[0].id);
    });
  }, [user, selectedSiteId]);

  async function createSite(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !siteIdInput.trim() || !name.trim()) return;
    const db = getFirebaseDb();
    if (!db) return;
    const siteId = siteIdInput.trim();

    await setDoc(doc(db, "sites", siteId), {
      siteId,
      name: name.trim(),
      platform,
      topic: topic.trim(),
      growthOverride: Number(growthOverride) || 0,
      isEnabled,
      dailyTarget: Math.max(1, Number(dailyTarget) || 3),
      publishMode,
      publishMinIntervalMin: Math.max(0, Number(publishMinIntervalMin) || 60),
      publishWindows: publishWindows
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 6),
      createdAt: serverTimestamp(),
      createdBy: user.uid,
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    });

    setSiteIdInput("");
    setName("");
    setTopic("");
    setGrowthOverride("");
    setIsEnabled(true);
    setDailyTarget("3");
    setPublishWindows("09:30,13:30,20:30");
    setPublishMode("scheduled");
    setPublishMinIntervalMin("60");
    setMsg("site created");
    setTimeout(() => setMsg(""), 1200);
  }

  async function quickToggle(site: SiteRow) {
    const db = getFirebaseDb();
    if (!db || !user) return;
    await updateDoc(doc(db, "sites", site.id), {
      isEnabled: !(site.isEnabled ?? true),
      updatedAt: serverTimestamp(),
      updatedBy: user.uid
    });
  }

  return (
    <AuthGuard title="Sites">
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Sites</h1>
          <p className="mt-2 text-sm text-slate-600">site 운영 필드 관리</p>

          <form onSubmit={createSite} className="mt-4 grid gap-2 md:grid-cols-2">
            <input
              value={siteIdInput}
              onChange={(e) => setSiteIdInput(e.target.value)}
              placeholder="siteId (예: site-naver-01)"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="site name"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <select
              value={platform}
              onChange={(e) => setPlatform(e.target.value as Platform)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="naver">naver</option>
              <option value="tistory">tistory</option>
            </select>
            <input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="topic (예: 생활 꿀팁)"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <input
              value={growthOverride}
              onChange={(e) => setGrowthOverride(e.target.value)}
              placeholder="growthOverride (number)"
              inputMode="decimal"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <input
              value={dailyTarget}
              onChange={(e) => setDailyTarget(e.target.value)}
              placeholder="dailyTarget (default 3)"
              inputMode="numeric"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <select
              value={publishMode}
              onChange={(e) => setPublishMode(e.target.value as PublishMode)}
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            >
              <option value="scheduled">publish scheduled</option>
              <option value="manual">publish manual</option>
            </select>
            <input
              value={publishMinIntervalMin}
              onChange={(e) => setPublishMinIntervalMin(e.target.value)}
              placeholder="publishMinIntervalMin (default 60)"
              inputMode="numeric"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <input
              value={publishWindows}
              onChange={(e) => setPublishWindows(e.target.value)}
              placeholder="publish windows (HH:mm,comma)"
              className="h-10 rounded-md border border-slate-300 px-3 text-sm"
            />
            <label className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm">
              <input type="checkbox" checked={isEnabled} onChange={(e) => setIsEnabled(e.target.checked)} />
              isEnabled
            </label>
            <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white" disabled={!user}>
              생성
            </button>
          </form>
          {msg && <p className="mt-2 text-sm text-emerald-700">{msg}</p>}

          <ul className="mt-4 max-h-[560px] overflow-auto rounded-md border border-slate-200">
            {sites.map((s) => (
              <li key={s.id} className={`border-b border-slate-100 px-3 py-3 text-sm last:border-none ${selectedSiteId === s.id ? "bg-slate-50" : "bg-white"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="font-medium">{s.name ?? "(no name)"}</p>
                    <p className="text-xs text-slate-500">id: {s.id}</p>
                    <p className="text-xs text-slate-600">
                      {s.platform ?? "n/a"} · topic: {s.topic ?? "-"} · growthOverride: {typeof s.growthOverride === "number" ? s.growthOverride : 0}
                    </p>
                    <p className="text-xs text-slate-600">
                      target/day: {s.dailyTarget ?? 3} · publish: {(s.publishWindows ?? []).join(", ") || "-"}
                    </p>
                    <p className="text-xs text-slate-600">
                      mode: {s.publishMode ?? "scheduled"} · minInterval: {s.publishMinIntervalMin ?? 60}m
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => quickToggle(s)}
                    className={`rounded px-2.5 py-1 text-xs font-medium ${s.isEnabled ?? true ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}
                  >
                    {s.isEnabled ?? true ? "enabled" : "disabled"}
                  </button>
                </div>
              </li>
            ))}
            {sites.length === 0 && <li className="px-3 py-2 text-sm text-slate-500">no sites</li>}
          </ul>
        </div>
      </main>
    </AuthGuard>
  );
}
