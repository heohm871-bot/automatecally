"use client";

import { useMemo, useState } from "react";
import {
  evaluateGrowthScore,
  type CompetitionBand,
  type GrowthInput,
  type GrowthLane,
} from "../../packages/shared/growthScore";

const laneLabel: Record<GrowthLane, string> = {
  hot: "Hot Momentum",
  evergreen: "Evergreen",
  watch: "Watchlist",
};

const competitionLabel: Record<CompetitionBand, string> = {
  low: "Low",
  mid: "Medium",
  hard: "Hard",
  extreme: "Extreme",
};

const defaults: GrowthInput = {
  trend3: 35,
  trend7: 40,
  trend30: 42,
  blogDocs: 32000,
};

type FormState = Record<keyof GrowthInput, string>;

function toNumber(value: string) {
  const next = Number(value);
  return Number.isFinite(next) ? Math.max(0, next) : 0;
}

export default function Home() {
  const [form, setForm] = useState<FormState>({
    trend3: String(defaults.trend3),
    trend7: String(defaults.trend7),
    trend30: String(defaults.trend30),
    blogDocs: String(defaults.blogDocs),
  });

  const input = useMemo<GrowthInput>(
    () => ({
      trend3: toNumber(form.trend3),
      trend7: toNumber(form.trend7),
      trend30: toNumber(form.trend30),
      blogDocs: toNumber(form.blogDocs),
    }),
    [form]
  );

  const result = useMemo(() => evaluateGrowthScore(input), [input]);

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_15%_15%,#ffecd2,transparent_34%),radial-gradient(circle_at_85%_10%,#fcb69f,transparent_36%),linear-gradient(150deg,#faf7f0_0%,#f7f8ff_44%,#eaf4ff_100%)] px-6 py-12 text-slate-900">
      <div className="mx-auto grid w-full max-w-5xl gap-8 lg:grid-cols-[1.05fr_1fr]">
        <section className="rounded-3xl border border-white/70 bg-white/75 p-7 shadow-[0_20px_50px_rgba(26,51,83,0.14)] backdrop-blur">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-500">
            Growth Keyword Scorer
          </p>
          <h1 className="mt-2 text-3xl font-semibold leading-tight text-slate-900">
            검색 수요와 경쟁 강도를 한 번에 점수화
          </h1>
          <p className="mt-3 text-sm leading-6 text-slate-600">
            3일/7일/30일 트렌드와 블로그 문서량을 입력하면 성장형 키워드 적합도를
            계산합니다.
          </p>

          <div className="mt-8 grid gap-4 sm:grid-cols-2">
            {(
              [
                ["trend3", "Trend (3d)"],
                ["trend7", "Trend (7d)"],
                ["trend30", "Trend (30d)"],
                ["blogDocs", "Blog Documents"],
              ] as const
            ).map(([field, label]) => (
              <label key={field} className="flex flex-col gap-2">
                <span className="text-sm font-medium text-slate-700">{label}</span>
                <input
                  type="number"
                  min={0}
                  inputMode="numeric"
                  value={form[field]}
                  onChange={(event) =>
                    setForm((prev) => ({ ...prev, [field]: event.target.value }))
                  }
                  className="h-11 rounded-xl border border-slate-300 bg-white px-3 text-base outline-none transition focus:border-slate-900"
                />
              </label>
            ))}
          </div>
        </section>

        <section className="rounded-3xl border border-slate-900/10 bg-slate-950 p-7 text-slate-100 shadow-[0_18px_45px_rgba(2,6,23,0.35)]">
          <p className="text-xs uppercase tracking-[0.16em] text-slate-400">Score Result</p>
          <div className="mt-4 flex items-end justify-between border-b border-slate-800 pb-5">
            <p className="text-5xl font-semibold">{result.score}</p>
            <p className="text-sm text-slate-400">/ 100</p>
          </div>

          <div className="mt-5 grid grid-cols-2 gap-3 text-sm">
            <Stat label="Lane" value={laneLabel[result.lane]} />
            <Stat label="Competition" value={competitionLabel[result.competition]} />
            <Stat label="Comp Ratio" value={result.compRatio.toFixed(1)} />
            <Stat label="Eligible" value={result.eligible ? "Yes" : "No"} />
          </div>

          <ul className="mt-5 space-y-2 text-sm leading-6 text-slate-300">
            {result.notes.map((note) => (
              <li key={note} className="rounded-lg bg-slate-900/80 px-3 py-2">
                {note}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2">
      <p className="text-xs uppercase tracking-[0.11em] text-slate-500">{label}</p>
      <p className="mt-1 text-base font-medium text-slate-100">{value}</p>
    </div>
  );
}
