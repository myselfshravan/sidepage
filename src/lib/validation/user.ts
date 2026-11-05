import { z } from "zod";
import { checkSlug } from "@/domain/publication/slug";

export const handleSchema = z
  .string()
  .trim()
  .max(30, "Handles are at most 30 characters.")
  .superRefine((s, ctx) => {
    const problem = checkSlug(s);
    if (problem) ctx.addIssue({ code: "custom", message: problem.replace("Slug", "Handle") });
  });

export const profileSchema = z.object({
  handle: handleSchema,
  display_name: z.string().trim().min(1, "Add a name.").max(80),
  bio: z.string().trim().max(600),
});

export const authorRequestSchema = z.object({
  pitch: z.string().trim().min(20, "Tell us a little more (at least 20 characters).").max(1500),
});
