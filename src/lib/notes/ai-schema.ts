import { BLOCK_TYPES, CALLOUT_VARIANTS } from "./types";

const nullableString = { type: ["string", "null"] } as const;

/** Strict JSON schema for one lesson's AI output (all fields required, optional = nullable). */
export const LESSON_OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["blocks"],
  properties: {
    blocks: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "level",
          "text",
          "title",
          "variant",
          "items",
          "table",
          "image_id",
          "image_side",
          "caption",
          "source_page",
          "answer",
        ],
        properties: {
          type: { type: "string", enum: [...BLOCK_TYPES] },
          level: { type: ["integer", "null"] },
          text: nullableString,
          title: nullableString,
          variant: { type: ["string", "null"], enum: [...CALLOUT_VARIANTS, null] },
          items: {
            type: ["array", "null"],
            items: {
              type: "object",
              additionalProperties: false,
              required: ["title", "text"],
              properties: { title: nullableString, text: { type: "string" } },
            },
          },
          table: {
            type: ["object", "null"],
            additionalProperties: false,
            required: ["headers", "rows"],
            properties: {
              headers: { type: "array", items: { type: "string" } },
              rows: { type: "array", items: { type: "array", items: { type: "string" } } },
            },
          },
          image_id: nullableString,
          image_side: { type: ["string", "null"], enum: ["left", "right", null] },
          caption: nullableString,
          source_page: { type: ["integer", "null"] },
          answer: nullableString,
        },
      },
    },
  },
} as const;

export interface RawBlock {
  type: string;
  level: number | null;
  text: string | null;
  title: string | null;
  variant: string | null;
  items: { title: string | null; text: string }[] | null;
  table: { headers: string[]; rows: string[][] } | null;
  image_id: string | null;
  image_side: string | null;
  caption: string | null;
  source_page: number | null;
  answer: string | null;
}
