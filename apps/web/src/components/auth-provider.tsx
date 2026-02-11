"use client";

import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { onAuthStateChanged, signInAnonymously, signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "../lib/firebaseClient";

type AuthContextValue = {
  user: User | null;
  loading: boolean;
  error: string;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuth();
    if (!auth) {
      setLoading(false);
      setError("Firebase .env 설정이 필요합니다.");
      return;
    }

    const unsub = onAuthStateChanged(auth, (next) => {
      setUser(next);
      setLoading(false);
    });

    return unsub;
  }, []);

  async function signIn() {
    setError("");
    const auth = getFirebaseAuth();
    if (!auth) {
      setError("Firebase .env 설정이 필요합니다.");
      return;
    }
    await signInAnonymously(auth);
  }

  async function signOutUser() {
    setError("");
    const auth = getFirebaseAuth();
    if (!auth) return;
    await signOut(auth);
  }

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, error, signIn, signOutUser }),
    [user, loading, error]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
