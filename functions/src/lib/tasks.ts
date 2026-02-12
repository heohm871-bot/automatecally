import { CloudTasksClient } from "@google-cloud/tasks";
import { createHash } from "node:crypto";

const client = new CloudTasksClient();

export type EnqueueArgs = {
  queue: "light" | "heavy";
  scheduleTimeSecFromNow?: number;
  payload: unknown;
  ignoreAlreadyExists?: boolean;
};

function getPayloadMeta(payload: unknown) {
  const raw = (payload ?? {}) as Record<string, unknown>;
  const idempotencyKey = typeof raw.idempotencyKey === "string" ? raw.idempotencyKey : "";
  const retryCount =
    typeof raw.retryCount === "number" && Number.isFinite(raw.retryCount) ? Math.max(0, Math.floor(raw.retryCount)) : 0;
  return { idempotencyKey, retryCount };
}

function makeTaskId(idempotencyKey: string, retryCount: number) {
  const seed = `${idempotencyKey}:r${retryCount}`;
  return `t_${createHash("sha256").update(seed).digest("hex").slice(0, 48)}`;
}

async function withTimeout<T>(promise: Promise<T>, ms: number, code: string, taskType: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`${code}:${taskType}:${ms}ms`)), ms);
      })
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function isAlreadyExistsError(err: unknown) {
  const code = Number((err as { code?: unknown })?.code);
  if (code === 6) return true;

  const message = String((err as { message?: unknown })?.message ?? "");
  return message.includes("ALREADY_EXISTS");
}

export async function enqueueTask(args: EnqueueArgs) {
  if (process.env.TASKS_EXECUTE_INLINE === "1") {
    const [{ AnyTaskPayloadSchema }, { routeTask }] = await Promise.all([
      import("../handlers/schema"),
      import("../handlers/taskRouter")
    ]);
    const payload = AnyTaskPayloadSchema.parse(args.payload);
    const timeoutMs = Number(process.env.INLINE_TASK_TIMEOUT_MS ?? 45_000);
    await withTimeout(routeTask(payload), timeoutMs, "E2E_TASK_TIMEOUT", payload.taskType);
    return;
  }

  const { getEnv } = await import("./env");
  const ENV = getEnv();
  const queueName = args.queue === "heavy" ? ENV.QUEUE_HEAVY : ENV.QUEUE_LIGHT;
  const parent = client.queuePath(ENV.GCP_PROJECT, ENV.TASKS_LOCATION, queueName);

  const body = Buffer.from(JSON.stringify(args.payload)).toString("base64");
  const meta = getPayloadMeta(args.payload);
  const taskId = meta.idempotencyKey ? makeTaskId(meta.idempotencyKey, meta.retryCount) : "";

  const task: {
    name?: string;
    httpRequest: {
      httpMethod: "POST";
      url: string;
      headers: Record<string, string>;
      body: string;
    };
    scheduleTime?: { seconds: number };
  } = {
    httpRequest: {
      httpMethod: "POST",
      url: ENV.TASKS_HANDLER_URL,
      headers: {
        "Content-Type": "application/json",
        "X-Task-Secret": ENV.TASK_SECRET
      },
      body
    }
  };
  if (taskId) {
    task.name = client.taskPath(ENV.GCP_PROJECT, ENV.TASKS_LOCATION, queueName, taskId);
  }

  if (args.scheduleTimeSecFromNow && args.scheduleTimeSecFromNow > 0) {
    const scheduleTime = new Date(Date.now() + args.scheduleTimeSecFromNow * 1000);
    task.scheduleTime = { seconds: Math.floor(scheduleTime.getTime() / 1000) };
  }

  try {
    await client.createTask({ parent, task });
  } catch (err: unknown) {
    if (args.ignoreAlreadyExists && isAlreadyExistsError(err)) return;
    throw err;
  }
}
