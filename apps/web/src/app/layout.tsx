import Link from "next/link";
import type { Metadata } from "next";
import { AuthProvider } from "../components/auth-provider";
import { TopbarAuth } from "../components/topbar-auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "Web Admin",
  description: "Minimal Firebase admin surface for sites/articles/metrics"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body>
        <AuthProvider>
          <header className="border-b border-slate-200 bg-white/95 backdrop-blur">
            <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4 md:px-10">
              <div className="flex items-center gap-4">
                <p className="text-sm font-semibold tracking-wide text-slate-900">ADMIN</p>
                <nav className="flex gap-2 text-sm">
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/sites">
                    Sites
                  </Link>
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/articles">
                    Articles
                  </Link>
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/metrics">
                    Metrics
                  </Link>
                  <Link className="rounded-md px-3 py-1.5 hover:bg-slate-100" href="/settings">
                    Settings
                  </Link>
                </nav>
              </div>
              <TopbarAuth />
            </div>
          </header>
          {children}
        </AuthProvider>
      </body>
    </html>
  );
}
