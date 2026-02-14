import { getApps, initializeApp } from "firebase/app";
import { connectAuthEmulator, getAuth, type Auth } from "firebase/auth";
import { connectFirestoreEmulator, getFirestore, type Firestore } from "firebase/firestore";

function useEmulators() {
  return String(process.env.NEXT_PUBLIC_USE_EMULATORS ?? "").trim() === "1";
}

function buildConfig() {
  const projectId = String(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ?? "").trim() || "blog-native-260212";
  const apiKey = String(process.env.NEXT_PUBLIC_FIREBASE_API_KEY ?? "").trim();
  const appId = String(process.env.NEXT_PUBLIC_FIREBASE_APP_ID ?? "").trim();
  const authDomain = String(process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN ?? "").trim();
  const storageBucket = String(process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ?? "").trim();

  // In emulator mode, allow minimal/dummy config so local dev can run without real Firebase keys.
  if (useEmulators()) {
    return {
      projectId,
      apiKey: apiKey || "fake-api-key",
      appId: appId || "fake-app-id",
      authDomain: authDomain || "localhost",
      storageBucket: storageBucket || `${projectId}.appspot.com`
    };
  }

  return { projectId, apiKey, appId, authDomain, storageBucket };
}

export function getFirebaseApp() {
  if (typeof window === "undefined") return null;
  const cfg = buildConfig();
  if (!cfg.apiKey) return null;
  if (!getApps().length) initializeApp(cfg);
  return getApps()[0]!;
}

export function getFirebaseAuth(): Auth | null {
  const app = getFirebaseApp();
  if (!app) return null;
  const auth = getAuth(app);
  if (useEmulators()) {
    try {
      connectAuthEmulator(auth, "http://127.0.0.1:9099", { disableWarnings: true });
    } catch {
      // ignore double-connect
    }
  }
  return auth;
}

export function getFirebaseDb(): Firestore | null {
  const app = getFirebaseApp();
  if (!app) return null;
  const db = getFirestore(app);
  if (useEmulators()) {
    try {
      connectFirestoreEmulator(db, "127.0.0.1", 8080);
    } catch {
      // ignore double-connect
    }
  }
  return db;
}
