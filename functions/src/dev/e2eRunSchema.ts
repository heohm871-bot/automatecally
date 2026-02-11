import { z } from "zod";

const StepStatSchema = z.object({
  step: z.string(),
  durationMs: z.number().nonnegative()
});

const TaskRunSampleSchema = z.object({
  idempotencyKey: z.string().optional(),
  taskType: z.string().optional(),
  status: z.string().optional(),
  startedAt: z.string().nullable().optional(),
  updatedAt: z.string().nullable().optional(),
  durationMs: z.number().nonnegative().nullable().optional(),
  error: z.string().nullable().optional()
});

const BaseSchema = z.object({
  runId: z.string(),
  siteId: z.string(),
  keywordId: z.string(),
  traceId: z.string(),
  runDate: z.string(),
  retryCount: z.number().int().min(0),
  startedAt: z.string(),
  finishedAt: z.string(),
  durationMs: z.number().nonnegative(),
  stepStats: z.array(StepStatSchema),
  taskRunsSample: z.array(TaskRunSampleSchema).optional()
});

export const E2eRunSuccessSchema = BaseSchema.extend({
  ok: z.literal(true),
  code: z.literal("E2E_OK"),
  articleId: z.string(),
  status: z.string().nullable(),
  qaPass: z.boolean().nullable(),
  packagePath: z.string()
});

export const E2eRunFailureSchema = BaseSchema.extend({
  ok: z.literal(false),
  code: z.string(),
  message: z.string(),
  articleId: z.string().nullable(),
  status: z.string().nullable(),
  qaPass: z.boolean().nullable(),
  packagePath: z.string().nullable()
});

export const E2eRunSchema = z.discriminatedUnion("ok", [E2eRunSuccessSchema, E2eRunFailureSchema]);
export type E2eRun = z.infer<typeof E2eRunSchema>;
