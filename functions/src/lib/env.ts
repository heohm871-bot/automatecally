function must(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env: ${name}`);
  return v;
}

export const ENV = {
  GCP_PROJECT: must("GCP_PROJECT"),
  TASKS_LOCATION: must("TASKS_LOCATION"),
  TASKS_HANDLER_URL: must("TASKS_HANDLER_URL"),
  TASK_SECRET: must("TASK_SECRET"),
  QUEUE_LIGHT: process.env.QUEUE_LIGHT ?? "light-queue",
  QUEUE_HEAVY: process.env.QUEUE_HEAVY ?? "heavy-queue"
};
