"use client";

import { useAuth } from "./auth-provider";

export function TopbarAuth() {
  const { user, loading, signIn, signOutUser } = useAuth();

  if (loading) return <p className="text-xs text-slate-500">auth loading...</p>;

  if (!user) {
    return (
      <button onClick={() => void signIn()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">
        익명 로그인
      </button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <p className="text-xs text-slate-600">{user.uid.slice(0, 10)}...</p>
      <button onClick={() => void signOutUser()} className="rounded-md border border-slate-300 px-3 py-1.5 text-xs">
        로그아웃
      </button>
    </div>
  );
}
