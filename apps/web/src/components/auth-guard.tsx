"use client";

import { useAuth } from "./auth-provider";

export function AuthGuard({ children, title }: { children: React.ReactNode; title: string }) {
  const { user, loading, error, signIn } = useAuth();

  if (loading) {
    return (
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <p className="text-sm text-slate-600">auth loading...</p>
        </div>
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen p-6 md:p-10">
        <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="mt-2 text-sm text-slate-600">이 페이지는 인증 후 사용할 수 있습니다.</p>
          <button onClick={() => void signIn()} className="mt-4 rounded-md bg-slate-900 px-4 py-2 text-sm font-medium text-white">
            익명 로그인
          </button>
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
