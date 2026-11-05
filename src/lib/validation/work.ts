import { z } from "zod";
import { checkPartialDate, isValidTimeZone } from "@/domain/dates/partial-date";
import { checkSlug } from "@/domain/publication/slug";
import { BYLINES, COLLECTIONS, VISIBILITIES } from "@/domain/types";

// Validation for every author-supplied input. Shared by server actions (authoritative)
// and forms (for early feedback).

const text = (max: number) => z.string().trim().max(max);

export const partialDateSchema = z
  .object({
    year: z.number().int(),
    month: z.number().int().optional(),
    day: z.number().int().optional(),
    approximate: z.boolean(),
  })
  .superRefine((d, ctx) => {
    const problem = checkPartialDate(d);
    if (problem) ctx.addIssue({ code: "custom", message: problem });
  });

export const slugSchema = z.string().superRefine((s, ctx) => {
  const problem = checkSlug(s);
  if (problem) ctx.addIssue({ code: "custom", message: problem });
});

export const timeZoneSchema = z.string().refine(isValidTimeZone, "Unknown time zone.");

export const createWorkSchema = z.object({
  collection: z.enum(COLLECTIONS),
  title: text(200).min(1, "Give it a title."),
});

export const workMetadataSchema = z.object({
  title: text(200).min(1, "Give it a title."),
  subtitle: text(300),
  description: text(2000),
  byline: z.enum(BYLINES).default("profile"),
  /** The pen name when byline is "pen_name"; ignored otherwise. */
  author_name: text(120),
  slug: slugSchema,
  content_warnings: z.array(text(80).min(1)).max(20),
  seo_title: text(120),
  seo_description: text(300),
  timezone: timeZoneSchema,
  original_written_at: partialDateSchema.nullable(),
  /** ISO instant, or null. When the physical work was digitised. */
  digitized_at: z.iso.datetime({ offset: true }).nullable(),
}).refine((d) => d.byline !== "pen_name" || d.author_name.length > 0, { message: "Add the pen name.", path: ["author_name"] });

export const visibilitySchema = z.enum(VISIBILITIES);

export const chapterTitleSchema = text(200).min(1, "Give the chapter a title.");

export type WorkMetadataInput = z.infer<typeof workMetadataSchema>;
