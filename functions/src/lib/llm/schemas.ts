import { z } from "zod";

export const SCHEMA_VERSION = "v1" as const;

export const TitleOutZ = z.object({
  title: z.string().min(5).max(120)
});

export const BodyOutZ = z.object({
  html: z.string().min(500),
  hashtags12: z.array(z.string().regex(/^#/)).length(12)
});

export const QaFixOutZ = z.object({
  html: z.string().min(500)
});

export const TitleJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    title: { type: "string", minLength: 5, maxLength: 120 }
  },
  required: ["title"]
} as const;

export const BodyJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    html: { type: "string", minLength: 500 },
    hashtags12: {
      type: "array",
      minItems: 12,
      maxItems: 12,
      items: { type: "string", pattern: "^#" }
    }
  },
  required: ["html", "hashtags12"]
} as const;

export const QaFixJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    html: { type: "string", minLength: 500 }
  },
  required: ["html"]
} as const;
