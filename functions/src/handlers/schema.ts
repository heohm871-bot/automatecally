import { z } from "zod";

export const TaskBaseSchema = z.object({
  schemaVersion: z.literal("1.0"),
  taskType: z.string(),
  siteId: z.string(),
  traceId: z.string(),
  idempotencyKey: z.string(),
  createdAt: z.string(),
  requestedByUid: z.string(),
  retryCount: z.union([z.literal(0), z.literal(1)]),
  runDate: z.string()
});

export type TaskBase = z.infer<typeof TaskBaseSchema>;

const BaseWithTaskSchema = TaskBaseSchema.extend({
  taskType: z.literal("kw_collect")
}).passthrough();

export const KwCollectPayloadSchema = BaseWithTaskSchema;
export type KwCollectPayload = z.infer<typeof KwCollectPayloadSchema>;

export const KwScorePayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("kw_score")
}).passthrough();
export type KwScorePayload = z.infer<typeof KwScorePayloadSchema>;

export const ArticleGeneratePayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("article_generate"),
  keywordId: z.string()
}).passthrough();
export type ArticleGeneratePayload = z.infer<typeof ArticleGeneratePayloadSchema>;

export const TitleGeneratePayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("title_generate"),
  keywordId: z.string()
}).passthrough();
export type TitleGeneratePayload = z.infer<typeof TitleGeneratePayloadSchema>;

export const BodyGeneratePayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("body_generate"),
  articleId: z.string()
}).passthrough();
export type BodyGeneratePayload = z.infer<typeof BodyGeneratePayloadSchema>;

export const ArticleQaPayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("article_qa"),
  articleId: z.string()
}).passthrough();
export type ArticleQaPayload = z.infer<typeof ArticleQaPayloadSchema>;

export const ArticleQaFixPayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("article_qa_fix"),
  articleId: z.string()
}).passthrough();
export type ArticleQaFixPayload = z.infer<typeof ArticleQaFixPayloadSchema>;

export const TopcardRenderPayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("topcard_render"),
  articleId: z.string()
}).passthrough();
export type TopcardRenderPayload = z.infer<typeof TopcardRenderPayloadSchema>;

export const ImageGeneratePayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("image_generate"),
  articleId: z.string()
}).passthrough();
export type ImageGeneratePayload = z.infer<typeof ImageGeneratePayloadSchema>;

export const ArticlePackagePayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("article_package"),
  articleId: z.string()
}).passthrough();
export type ArticlePackagePayload = z.infer<typeof ArticlePackagePayloadSchema>;

export const PublishExecutePayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("publish_execute"),
  articleId: z.string(),
  scheduledAt: z.string().optional()
}).passthrough();
export type PublishExecutePayload = z.infer<typeof PublishExecutePayloadSchema>;

export const AnalyzerDailyPayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("analyzer_daily")
}).passthrough();
export type AnalyzerDailyPayload = z.infer<typeof AnalyzerDailyPayloadSchema>;

export const AdvisorWeeklyGlobalPayloadSchema = TaskBaseSchema.extend({
  taskType: z.literal("advisor_weekly_global"),
  weekKey: z.string().optional()
}).passthrough();
export type AdvisorWeeklyGlobalPayload = z.infer<typeof AdvisorWeeklyGlobalPayloadSchema>;

export const AnyTaskPayloadSchema = z.discriminatedUnion("taskType", [
  KwCollectPayloadSchema,
  KwScorePayloadSchema,
  ArticleGeneratePayloadSchema,
  TitleGeneratePayloadSchema,
  BodyGeneratePayloadSchema,
  ArticleQaPayloadSchema,
  ArticleQaFixPayloadSchema,
  TopcardRenderPayloadSchema,
  ImageGeneratePayloadSchema,
  ArticlePackagePayloadSchema,
  PublishExecutePayloadSchema,
  AnalyzerDailyPayloadSchema,
  AdvisorWeeklyGlobalPayloadSchema
]);

export type AnyTaskPayload = z.infer<typeof AnyTaskPayloadSchema>;
