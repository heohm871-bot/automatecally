import { onRequest } from "firebase-functions/v2/https";
import { ENV } from "../lib/env";
import { maybeEnqueueSingleRetry, recordFailure } from "../lib/retryOnce";
import { AnyTaskPayloadSchema, TaskBaseSchema } from "./schema";
import { routeTask } from "./taskRouter";

export const taskHandler = onRequest(async (req, res) => {
  try {
    if (req.get("X-Task-Secret") !== ENV.TASK_SECRET) {
      res.status(403).send("forbidden");
      return;
    }

    const payload = AnyTaskPayloadSchema.parse(req.body);
    await routeTask(payload);

    res.status(200).send("ok");
  } catch (err: unknown) {
    try {
      const raw = (req.body ?? {}) as Record<string, unknown>;
      await recordFailure(raw, err);
      const parsedBase = TaskBaseSchema.safeParse(raw);
      if (parsedBase.success && parsedBase.data.retryCount === 0) {
        await maybeEnqueueSingleRetry(parsedBase.data, "light");
      }
    } catch {
      // ignore secondary errors
    }
    res.status(200).send("handled");
  }
});
