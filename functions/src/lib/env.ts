export type RuntimeEnv = {
  GCP_PROJECT: string;
  TASKS_LOCATION: string;
  TASKS_HANDLER_URL: string;
  TASK_SECRET: string;
  QUEUE_LIGHT: string;
  QUEUE_HEAVY: string;
};

let cached: RuntimeEnv | null = null;

function must(name: string, value: string | undefined) {
  if (!value || !value.trim()) throw new Error(`Missing env: ${name}`);
  return value.trim();
}

export function getTaskSecret() {
  return process.env.TASK_SECRET ?? "";
}

export function getEnv(): RuntimeEnv {
  if (cached) return cached;
  const gcpProject = process.env.GCP_PROJECT ?? process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
  cached = {
    GCP_PROJECT: must("GCP_PROJECT", gcpProject),
    TASKS_LOCATION: must("TASKS_LOCATION", process.env.TASKS_LOCATION),
    TASKS_HANDLER_URL: must("TASKS_HANDLER_URL", process.env.TASKS_HANDLER_URL),
    TASK_SECRET: must("TASK_SECRET", process.env.TASK_SECRET),
    QUEUE_LIGHT: process.env.QUEUE_LIGHT ?? "light-queue",
    QUEUE_HEAVY: process.env.QUEUE_HEAVY ?? "heavy-queue"
  };
  return cached;
}
