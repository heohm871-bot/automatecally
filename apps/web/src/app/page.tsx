import Link from "next/link";

export default function HomePage() {
  return (
    <main className="min-h-screen p-6 md:p-10">
      <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h1 className="text-2xl font-semibold text-slate-900">Web Admin</h1>
        <p className="mt-2 text-sm text-slate-600">기능별 페이지로 이동해서 sites/articles/metrics를 관리합니다.</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <Link className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/sites">
            /sites
          </Link>
          <Link className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/articles">
            /articles
          </Link>
          <Link className="rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white" href="/metrics">
            /metrics
          </Link>
        </div>
      </div>
    </main>
  );
}
