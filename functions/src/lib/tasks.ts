import { CloudTasksClient } from "@google-cloud/tasks";

const client = new CloudTasksClient();

export type EnqueueArgs = {
  queue: "light" | "heavy";
  scheduleTimeSecFromNow?: number;
  payload: unknown;
};

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

  const { ENV } = await import("./env");
  const queueName = args.queue === "heavy" ? ENV.QUEUE_HEAVY : ENV.QUEUE_LIGHT;
  const parent = client.queuePath(ENV.GCP_PROJECT, ENV.TASKS_LOCATION, queueName);

  const body = Buffer.from(JSON.stringify(args.payload)).toString("base64");

  const task: {
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

  if (args.scheduleTimeSecFromNow && args.scheduleTimeSecFromNow > 0) {
    const scheduleTime = new Date(Date.now() + args.scheduleTimeSecFromNow * 1000);
    task.scheduleTime = { seconds: Math.floor(scheduleTime.getTime() / 1000) };
  }

  await client.createTask({ parent, task });
}
