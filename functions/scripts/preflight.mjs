#!/usr/bin/env node

import fs from "node:fs";
import net from "node:net";
import path from "node:path";

function parseArgs(argv) {
  const out = { mode: "default", requirePixabay: false };
  for (const item of argv) {
    if (item.startsWith("--mode=")) out.mode = item.slice("--mode=".length);
    if (item === "--require-pixabay") out.requirePixabay = true;
  }
  return out;
}

function parseEnvFile(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const raw = fs.readFileSync(filePath, "utf8");
  const rows = raw.split(/\r?\n/);
  const env = {};
  for (const row of rows) {
    const trimmed = row.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    let value = trimmed.slice(idx + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function loadEnv() {
  const cwd = process.cwd();
  const local = parseEnvFile(path.join(cwd, ".env.local"));
  const base = parseEnvFile(path.join(cwd, ".env"));
  return { ...base, ...local, ...process.env };
}

function hostPort(raw) {
  if (!raw) return null;
  const value = String(raw).trim();
  const trimmed = value.startsWith("http://") || value.startsWith("https://") ? new URL(value).host : value;
  const idx = trimmed.lastIndexOf(":");
  if (idx <= 0) return null;
  const host = trimmed.slice(0, idx);
  const portNum = Number(trimmed.slice(idx + 1));
  if (!host || Number.isNaN(portNum)) return null;
  return { host, port: portNum };
}

function canConnect(host, port, timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = net.createConnection({ host, port });
    let done = false;
    const finish = (ok) => {
      if (done) return;
      done = true;
      socket.destroy();
      resolve(ok);
    };
    socket.setTimeout(timeoutMs);
    socket.on("connect", () => finish(true));
    socket.on("timeout", () => finish(false));
    socket.on("error", () => finish(false));
  });
}

async function run() {
  const args = parseArgs(process.argv.slice(2));
  const env = loadEnv();
  const errors = [];
  const warnings = [];
  const checks = [];
  const requirePixabay =
    args.requirePixabay ||
    String(env.PREFLIGHT_REQUIRE_PIXABAY ?? "").trim() === "1" ||
    String(env.PREFLIGHT_REQUIRE_PIXABAY ?? "").toLowerCase().trim() === "true";
  const requireOpenAi =
    String(env.PREFLIGHT_REQUIRE_OPENAI ?? "").trim() === "1" ||
    String(env.PREFLIGHT_REQUIRE_OPENAI ?? "").toLowerCase().trim() === "true";

  const requireValue = (key, label = key) => {
    const value = env[key];
    if (typeof value === "string" && value.trim().length > 0) {
      checks.push({ check: label, ok: true, value: value.trim() });
      return value.trim();
    }
    errors.push(`${label} missing`);
    checks.push({ check: label, ok: false, value: null });
    return "";
  };

  if (args.mode === "e2e") {
    requireValue("FIRESTORE_EMULATOR_HOST");
  }

  const firestoreHost = hostPort(env.FIRESTORE_EMULATOR_HOST);
  if (firestoreHost) {
    const ok = await canConnect(firestoreHost.host, firestoreHost.port);
    checks.push({
      check: `port:${firestoreHost.host}:${firestoreHost.port}`,
      ok,
      value: ok ? "open" : "closed"
    });
    if (!ok && args.mode === "e2e") {
      errors.push(`Firestore emulator port is not reachable: ${firestoreHost.host}:${firestoreHost.port}`);
    }
  }

  const tasksInline = String(env.TASKS_EXECUTE_INLINE ?? "").trim() === "1";
  const hasFunctionsHost = Boolean(String(env.FUNCTIONS_EMULATOR_HOST ?? "").trim());
  const hasTaskUrl = Boolean(String(env.TASKS_HANDLER_URL ?? "").trim());
  if (!tasksInline && !hasFunctionsHost && !hasTaskUrl) {
    errors.push("Either FUNCTIONS_EMULATOR_HOST or TASKS_HANDLER_URL must be set");
    checks.push({ check: "task-endpoint", ok: false, value: null });
  } else {
    const endpointLabel = tasksInline ? "inline" : hasTaskUrl ? "TASKS_HANDLER_URL" : "FUNCTIONS_EMULATOR_HOST";
    checks.push({ check: "task-endpoint", ok: true, value: endpointLabel });
  }

  requireValue("TASK_SECRET");

  const openaiKey = String(env.OPENAI_API_KEY ?? "").trim();
  if (!openaiKey) {
    if (requireOpenAi) {
      errors.push("OPENAI_API_KEY missing (required by preflight policy)");
      checks.push({ check: "OPENAI_API_KEY", ok: false, value: "required-missing" });
    } else {
      warnings.push("OPENAI_API_KEY missing (LLM generation/moderation will use fallback path)");
      checks.push({ check: "OPENAI_API_KEY", ok: true, value: "optional-missing" });
    }
  } else {
    checks.push({ check: "OPENAI_API_KEY", ok: true, value: "set" });
  }

  const pixabay = String(env.PIXABAY_API_KEY ?? "").trim();
  if (!pixabay) {
    if (requirePixabay) {
      errors.push("PIXABAY_API_KEY missing (required by preflight policy)");
      checks.push({ check: "PIXABAY_API_KEY", ok: false, value: "required-missing" });
    } else {
      warnings.push("PIXABAY_API_KEY missing (image_generate will skip external image fetch)");
      checks.push({ check: "PIXABAY_API_KEY", ok: true, value: "optional-missing" });
    }
  } else {
    checks.push({ check: "PIXABAY_API_KEY", ok: true, value: "set" });
  }

  const maybePorts = ["FUNCTIONS_EMULATOR_HOST", "FIREBASE_AUTH_EMULATOR_HOST", "FIRESTORE_EMULATOR_HOST"];
  for (const key of maybePorts) {
    const hp = hostPort(env[key]);
    if (!hp) continue;
    const ok = await canConnect(hp.host, hp.port);
    checks.push({ check: `port:${key}`, ok, value: `${hp.host}:${hp.port}` });
    if (!ok && args.mode === "e2e" && key === "FIRESTORE_EMULATOR_HOST") {
      errors.push(`${key} is set but not reachable at ${hp.host}:${hp.port}`);
    }
  }

  const result = {
    ok: errors.length === 0,
    mode: args.mode,
    policy: { requirePixabay },
    errors,
    warnings,
    checks
  };
  if (!result.ok) {
    console.error(JSON.stringify(result, null, 2));
    process.exit(1);
  }
  console.log(JSON.stringify(result, null, 2));
}

run().catch((err) => {
  console.error(JSON.stringify({ ok: false, code: "PREFLIGHT_EXCEPTION", message: String(err?.message ?? err) }, null, 2));
  process.exit(1);
});
