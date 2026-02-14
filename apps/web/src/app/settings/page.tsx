"use client";

import { useEffect, useMemo, useState } from "react";
import { doc, onSnapshot, serverTimestamp, setDoc } from "firebase/firestore";
import { AuthGuard } from "../../components/auth-guard";
import { useAuth } from "../../components/auth-provider";
import { getFirebaseDb } from "../../lib/firebaseClient";

type PublishDefault = "scheduled" | "manual";

type PipelineSettings = {
  enqueueJitterSecMin: number;
  enqueueJitterSecMax: number;
  retrySameDayMax: number;
  retryDelaySec: number;
  publishDefault: PublishDefault;
  publishMinIntervalMin: number;
};

type CapsSettings = {
  titleLLMMax: number;
  bodyLLMMax: number;
  qaFixMax: number;
  generateImagesOnlyOnQaPass: boolean;
};

type GrowthSettings = {
  minTrend30: number;
  minTrend7: number;
  hotMomentumMin: number;
  evergreenStabilityMin: number;
  lowBlogDocsMax: number;
  lowCompRatioMax: number;
  midBlogDocsMax: number;
  midCompRatioMax: number;
  hardBlogDocsMax: number;
  hardCompRatioMax: number;
  midCompetitionShare: number;
};

type GlobalSettings = {
  pipeline?: {
    enqueueJitterSecMin?: number;
    enqueueJitterSecMax?: number;
    retrySameDayMax?: number;
    retryDelaySec?: number;
    publishDefault?: PublishDefault;
    publishMinIntervalMin?: number;
  };
  caps?: {
    titleLLMMax?: number;
    bodyLLMMax?: number;
    qaFixMax?: number;
    generateImagesOnlyOnQaPass?: boolean;
  };
  growth?: {
    minTrend30?: number;
    minTrend7?: number;
    hotMomentumMin?: number;
    evergreenStabilityMin?: number;
    lowBlogDocsMax?: number;
    lowCompRatioMax?: number;
    midBlogDocsMax?: number;
    midCompRatioMax?: number;
    hardBlogDocsMax?: number;
    hardCompRatioMax?: number;
    midCompetitionShare?: number;
  };
};

const DEFAULTS: { pipeline: PipelineSettings; caps: CapsSettings; growth: GrowthSettings } = {
  pipeline: {
    enqueueJitterSecMin: 120,
    enqueueJitterSecMax: 300,
    retrySameDayMax: 1,
    retryDelaySec: 1800,
    publishDefault: "scheduled",
    publishMinIntervalMin: 60
  },
  caps: {
    titleLLMMax: 1,
    bodyLLMMax: 1,
    qaFixMax: 1,
    generateImagesOnlyOnQaPass: true
  },
  growth: {
    minTrend30: 20,
    minTrend7: 15,
    hotMomentumMin: 1.1,
    evergreenStabilityMin: 0.9,
    lowBlogDocsMax: 50_000,
    lowCompRatioMax: 40,
    midBlogDocsMax: 150_000,
    midCompRatioMax: 90,
    hardBlogDocsMax: 300_000,
    hardCompRatioMax: 140,
    midCompetitionShare: 0.15
  }
};

function toNum(v: string, fallback: number) {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export default function SettingsPage() {
  const { user } = useAuth();
  const [remote, setRemote] = useState<GlobalSettings | null>(null);
  const [msg, setMsg] = useState("");

  // Form state (strings for easier inputs)
  const [enqueueJitterSecMin, setEnqueueJitterSecMin] = useState(String(DEFAULTS.pipeline.enqueueJitterSecMin));
  const [enqueueJitterSecMax, setEnqueueJitterSecMax] = useState(String(DEFAULTS.pipeline.enqueueJitterSecMax));
  const [retrySameDayMax, setRetrySameDayMax] = useState(String(DEFAULTS.pipeline.retrySameDayMax));
  const [retryDelaySec, setRetryDelaySec] = useState(String(DEFAULTS.pipeline.retryDelaySec));
  const [publishDefault, setPublishDefault] = useState<PublishDefault>(DEFAULTS.pipeline.publishDefault);
  const [publishMinIntervalMin, setPublishMinIntervalMin] = useState(String(DEFAULTS.pipeline.publishMinIntervalMin));

  const [titleLLMMax, setTitleLLMMax] = useState(String(DEFAULTS.caps.titleLLMMax));
  const [bodyLLMMax, setBodyLLMMax] = useState(String(DEFAULTS.caps.bodyLLMMax));
  const [qaFixMax, setQaFixMax] = useState(String(DEFAULTS.caps.qaFixMax));
  const [generateImagesOnlyOnQaPass, setGenerateImagesOnlyOnQaPass] = useState(DEFAULTS.caps.generateImagesOnlyOnQaPass);

  const [minTrend30, setMinTrend30] = useState(String(DEFAULTS.growth.minTrend30));
  const [minTrend7, setMinTrend7] = useState(String(DEFAULTS.growth.minTrend7));
  const [hotMomentumMin, setHotMomentumMin] = useState(String(DEFAULTS.growth.hotMomentumMin));
  const [evergreenStabilityMin, setEvergreenStabilityMin] = useState(String(DEFAULTS.growth.evergreenStabilityMin));
  const [lowBlogDocsMax, setLowBlogDocsMax] = useState(String(DEFAULTS.growth.lowBlogDocsMax));
  const [lowCompRatioMax, setLowCompRatioMax] = useState(String(DEFAULTS.growth.lowCompRatioMax));
  const [midBlogDocsMax, setMidBlogDocsMax] = useState(String(DEFAULTS.growth.midBlogDocsMax));
  const [midCompRatioMax, setMidCompRatioMax] = useState(String(DEFAULTS.growth.midCompRatioMax));
  const [hardBlogDocsMax, setHardBlogDocsMax] = useState(String(DEFAULTS.growth.hardBlogDocsMax));
  const [hardCompRatioMax, setHardCompRatioMax] = useState(String(DEFAULTS.growth.hardCompRatioMax));
  const [midCompetitionShare, setMidCompetitionShare] = useState(String(DEFAULTS.growth.midCompetitionShare));

  useEffect(() => {
    const db = getFirebaseDb();
    if (!db || !user) return;
    const ref = doc(db, "settings", "global");
    return onSnapshot(ref, (snap) => {
      const data = (snap.data() ?? {}) as GlobalSettings;
      setRemote(data);

      const p = data.pipeline ?? {};
      const c = data.caps ?? {};
      const g = data.growth ?? {};

      setEnqueueJitterSecMin(String(p.enqueueJitterSecMin ?? DEFAULTS.pipeline.enqueueJitterSecMin));
      setEnqueueJitterSecMax(String(p.enqueueJitterSecMax ?? DEFAULTS.pipeline.enqueueJitterSecMax));
      setRetrySameDayMax(String(p.retrySameDayMax ?? DEFAULTS.pipeline.retrySameDayMax));
      setRetryDelaySec(String(p.retryDelaySec ?? DEFAULTS.pipeline.retryDelaySec));
      setPublishDefault((p.publishDefault ?? DEFAULTS.pipeline.publishDefault) as PublishDefault);
      setPublishMinIntervalMin(String(p.publishMinIntervalMin ?? DEFAULTS.pipeline.publishMinIntervalMin));

      setTitleLLMMax(String(c.titleLLMMax ?? DEFAULTS.caps.titleLLMMax));
      setBodyLLMMax(String(c.bodyLLMMax ?? DEFAULTS.caps.bodyLLMMax));
      setQaFixMax(String(c.qaFixMax ?? DEFAULTS.caps.qaFixMax));
      setGenerateImagesOnlyOnQaPass(Boolean(c.generateImagesOnlyOnQaPass ?? DEFAULTS.caps.generateImagesOnlyOnQaPass));

      setMinTrend30(String(g.minTrend30 ?? DEFAULTS.growth.minTrend30));
      setMinTrend7(String(g.minTrend7 ?? DEFAULTS.growth.minTrend7));
      setHotMomentumMin(String(g.hotMomentumMin ?? DEFAULTS.growth.hotMomentumMin));
      setEvergreenStabilityMin(String(g.evergreenStabilityMin ?? DEFAULTS.growth.evergreenStabilityMin));
      setLowBlogDocsMax(String(g.lowBlogDocsMax ?? DEFAULTS.growth.lowBlogDocsMax));
      setLowCompRatioMax(String(g.lowCompRatioMax ?? DEFAULTS.growth.lowCompRatioMax));
      setMidBlogDocsMax(String(g.midBlogDocsMax ?? DEFAULTS.growth.midBlogDocsMax));
      setMidCompRatioMax(String(g.midCompRatioMax ?? DEFAULTS.growth.midCompRatioMax));
      setHardBlogDocsMax(String(g.hardBlogDocsMax ?? DEFAULTS.growth.hardBlogDocsMax));
      setHardCompRatioMax(String(g.hardCompRatioMax ?? DEFAULTS.growth.hardCompRatioMax));
      setMidCompetitionShare(String(g.midCompetitionShare ?? DEFAULTS.growth.midCompetitionShare));
    });
  }, [user]);

  const preview = useMemo(() => {
    const jitterMin = Math.max(0, Math.floor(toNum(enqueueJitterSecMin, DEFAULTS.pipeline.enqueueJitterSecMin)));
    const jitterMax = Math.max(jitterMin, Math.floor(toNum(enqueueJitterSecMax, DEFAULTS.pipeline.enqueueJitterSecMax)));
    const retryMax = Math.max(0, Math.floor(toNum(retrySameDayMax, DEFAULTS.pipeline.retrySameDayMax)));
    const retryDelay = Math.max(0, Math.floor(toNum(retryDelaySec, DEFAULTS.pipeline.retryDelaySec)));

    const out: GlobalSettings = {
      pipeline: {
        enqueueJitterSecMin: jitterMin,
        enqueueJitterSecMax: jitterMax,
        retrySameDayMax: Math.min(1, retryMax),
        retryDelaySec: retryDelay,
        publishDefault,
        publishMinIntervalMin: Math.max(0, Math.floor(toNum(publishMinIntervalMin, DEFAULTS.pipeline.publishMinIntervalMin)))
      },
      caps: {
        titleLLMMax: Math.max(0, Math.floor(toNum(titleLLMMax, DEFAULTS.caps.titleLLMMax))),
        bodyLLMMax: Math.max(0, Math.floor(toNum(bodyLLMMax, DEFAULTS.caps.bodyLLMMax))),
        qaFixMax: Math.max(0, Math.floor(toNum(qaFixMax, DEFAULTS.caps.qaFixMax))),
        generateImagesOnlyOnQaPass
      },
      growth: {
        minTrend30: Math.max(0, Math.floor(toNum(minTrend30, DEFAULTS.growth.minTrend30))),
        minTrend7: Math.max(0, Math.floor(toNum(minTrend7, DEFAULTS.growth.minTrend7))),
        hotMomentumMin: toNum(hotMomentumMin, DEFAULTS.growth.hotMomentumMin),
        evergreenStabilityMin: toNum(evergreenStabilityMin, DEFAULTS.growth.evergreenStabilityMin),
        lowBlogDocsMax: Math.max(0, Math.floor(toNum(lowBlogDocsMax, DEFAULTS.growth.lowBlogDocsMax))),
        lowCompRatioMax: Math.max(0, Math.floor(toNum(lowCompRatioMax, DEFAULTS.growth.lowCompRatioMax))),
        midBlogDocsMax: Math.max(0, Math.floor(toNum(midBlogDocsMax, DEFAULTS.growth.midBlogDocsMax))),
        midCompRatioMax: Math.max(0, Math.floor(toNum(midCompRatioMax, DEFAULTS.growth.midCompRatioMax))),
        hardBlogDocsMax: Math.max(0, Math.floor(toNum(hardBlogDocsMax, DEFAULTS.growth.hardBlogDocsMax))),
        hardCompRatioMax: Math.max(0, Math.floor(toNum(hardCompRatioMax, DEFAULTS.growth.hardCompRatioMax))),
        midCompetitionShare: Math.max(0, Math.min(1, toNum(midCompetitionShare, DEFAULTS.growth.midCompetitionShare)))
      }
    };
    return out;
  }, [
    enqueueJitterSecMin,
    enqueueJitterSecMax,
    retrySameDayMax,
    retryDelaySec,
    publishDefault,
    publishMinIntervalMin,
    titleLLMMax,
    bodyLLMMax,
    qaFixMax,
    generateImagesOnlyOnQaPass,
    minTrend30,
    minTrend7,
    hotMomentumMin,
    evergreenStabilityMin,
    lowBlogDocsMax,
    lowCompRatioMax,
    midBlogDocsMax,
    midCompRatioMax,
    hardBlogDocsMax,
    hardCompRatioMax,
    midCompetitionShare
  ]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const db = getFirebaseDb();
    if (!db) return;
    await setDoc(
      doc(db, "settings", "global"),
      {
        ...preview,
        updatedAt: serverTimestamp(),
        updatedBy: user.uid,
        createdAt: remote ? (remote as unknown as Record<string, unknown>).createdAt ?? serverTimestamp() : serverTimestamp(),
        createdBy: remote ? (remote as unknown as Record<string, unknown>).createdBy ?? user.uid : user.uid
      },
      { merge: true }
    );
    setMsg("saved");
    setTimeout(() => setMsg(""), 1200);
  }

  return (
    <AuthGuard title="Settings">
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-6xl rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <h1 className="text-xl font-semibold">Settings</h1>
          <p className="mt-2 text-sm text-slate-600">Firestore: settings/global</p>

          <form onSubmit={save} className="mt-4 grid gap-4">
            <section className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">pipeline</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={enqueueJitterSecMin} onChange={(e) => setEnqueueJitterSecMin(e.target.value)} placeholder="enqueueJitterSecMin (120)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={enqueueJitterSecMax} onChange={(e) => setEnqueueJitterSecMax(e.target.value)} placeholder="enqueueJitterSecMax (300)" />
                <select className="h-10 rounded-md border border-slate-300 px-3 text-sm" value={publishDefault} onChange={(e) => setPublishDefault(e.target.value as PublishDefault)}>
                  <option value="scheduled">publishDefault: scheduled</option>
                  <option value="manual">publishDefault: manual</option>
                </select>
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={retrySameDayMax} onChange={(e) => setRetrySameDayMax(e.target.value)} placeholder="retrySameDayMax (1)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={retryDelaySec} onChange={(e) => setRetryDelaySec(e.target.value)} placeholder="retryDelaySec (1800)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={publishMinIntervalMin} onChange={(e) => setPublishMinIntervalMin(e.target.value)} placeholder="publishMinIntervalMin (60)" />
              </div>
              <p className="mt-2 text-xs text-slate-500">retrySameDayMax는 코드에서 0~1로 강제됩니다.</p>
            </section>

            <section className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">caps</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={titleLLMMax} onChange={(e) => setTitleLLMMax(e.target.value)} placeholder="titleLLMMax (1)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={bodyLLMMax} onChange={(e) => setBodyLLMMax(e.target.value)} placeholder="bodyLLMMax (1)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={qaFixMax} onChange={(e) => setQaFixMax(e.target.value)} placeholder="qaFixMax (1)" />
                <label className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-300 px-3 text-sm">
                  <input type="checkbox" checked={generateImagesOnlyOnQaPass} onChange={(e) => setGenerateImagesOnlyOnQaPass(e.target.checked)} />
                  generateImagesOnlyOnQaPass
                </label>
              </div>
            </section>

            <section className="rounded-xl border border-slate-200 p-4">
              <h2 className="text-sm font-semibold text-slate-900">growth</h2>
              <div className="mt-3 grid gap-2 md:grid-cols-3">
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={minTrend30} onChange={(e) => setMinTrend30(e.target.value)} placeholder="minTrend30 (20)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={minTrend7} onChange={(e) => setMinTrend7(e.target.value)} placeholder="minTrend7 (15)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="decimal" value={hotMomentumMin} onChange={(e) => setHotMomentumMin(e.target.value)} placeholder="hotMomentumMin (1.10)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="decimal" value={evergreenStabilityMin} onChange={(e) => setEvergreenStabilityMin(e.target.value)} placeholder="evergreenStabilityMin (0.90)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={lowBlogDocsMax} onChange={(e) => setLowBlogDocsMax(e.target.value)} placeholder="lowBlogDocsMax (50000)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={lowCompRatioMax} onChange={(e) => setLowCompRatioMax(e.target.value)} placeholder="lowCompRatioMax (40)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={midBlogDocsMax} onChange={(e) => setMidBlogDocsMax(e.target.value)} placeholder="midBlogDocsMax (150000)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={midCompRatioMax} onChange={(e) => setMidCompRatioMax(e.target.value)} placeholder="midCompRatioMax (90)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={hardBlogDocsMax} onChange={(e) => setHardBlogDocsMax(e.target.value)} placeholder="hardBlogDocsMax (300000)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="numeric" value={hardCompRatioMax} onChange={(e) => setHardCompRatioMax(e.target.value)} placeholder="hardCompRatioMax (140)" />
                <input className="h-10 rounded-md border border-slate-300 px-3 text-sm" inputMode="decimal" value={midCompetitionShare} onChange={(e) => setMidCompetitionShare(e.target.value)} placeholder="midCompetitionShare (0.15)" />
              </div>
            </section>

            <div className="flex items-center justify-between gap-3">
              <button type="submit" className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white" disabled={!user}>
                저장
              </button>
              {msg && <p className="text-sm text-emerald-700">{msg}</p>}
            </div>
          </form>

          <details className="mt-6 rounded-xl border border-slate-200 p-4">
            <summary className="cursor-pointer text-sm font-semibold text-slate-900">preview JSON</summary>
            <pre className="mt-3 overflow-auto rounded-md bg-slate-950 p-3 text-xs text-slate-50">
              {JSON.stringify(preview, null, 2)}
            </pre>
          </details>
        </div>
      </main>
    </AuthGuard>
  );
}
