import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { docToMarkdown, markdownToDoc } from "@/domain/manuscript/markdown";
import type { Command } from "@/domain/lifecycle/machine";
import { site } from "@/lib/site";
import { AppError, type ErrorCode } from "@/server/errors";
import { LIMITS, rateLimit } from "@/server/http/rate-limit";
import { authenticateApiToken } from "@/server/services/api-tokens";
import type { Actor } from "@/server/services/actor";
import * as chapters from "@/server/services/chapters";
import { applyCommand, listEditions, tagsFor } from "@/server/services/publishing";
import * as shareLinks from "@/server/services/share-links";
import * as works from "@/server/services/works";

// The agent API. Bearer-token only (personal access tokens, see api-tokens.ts); no
// cookies are read, so cross-site request forgery doesn't apply. Every operation goes
// through the same services, ownership checks and validation as the studio.

const STATUS: Partial<Record<ErrorCode, number>> = {
  UNAUTHENTICATED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  NO_CHANGES: 409,
  INVALID_TRANSITION: 409,
  INVALID_TIME: 422,
  INVALID: 422,
  RATE_LIMITED: 429,
};

type Ctx = { actor: Actor; segments: string[]; request: NextRequest };

async function body<T>(request: NextRequest): Promise<T> {
  const parsed = (await request.json().catch(() => null)) as T | null;
  if (parsed === null || typeof parsed !== "object") throw new AppError("INVALID", "Send a JSON object body.");
  return parsed;
}

function invalidate(tags: string[]) {
  for (const tag of new Set(tags)) revalidateTag(tag, { expire: 0 });
}

async function publicationView(actor: Actor, id: string) {
  const work = await works.requireManagedWork(actor, id);
  const [list, editions] = await Promise.all([chapters.listChapters(actor, id), listEditions(actor, id)]);
  return {
    id,
    collection: work.collection,
    title: work.title,
    subtitle: work.subtitle,
    description: work.description,
    slug: work.slug,
    byline: work.byline ?? "profile",
    author_name: work.author_name,
    status: work.status,
    visibility: work.visibility,
    content_warnings: work.content_warnings,
    original_written_at: work.original_written_at,
    scheduled_for: work.scheduled_for?.toDate().toISOString() ?? null,
    first_published_at: work.first_published_at?.toDate().toISOString() ?? null,
    word_count: work.word_count,
    public_url: work.status === "PUBLISHED" && work.visibility === "PUBLIC" ? `${site.url}/${work.collection}/${work.slug}` : null,
    chapters: list.map((c) => ({ id: c.id, slug: c.slug, title: c.title, words: c.words })),
    editions: editions.map((e) => ({ number: e.number, dated: e.effectivePublishedAt, words: e.words })),
  };
}

const metadataPatch = z
  .object({
    title: z.string(),
    subtitle: z.string(),
    description: z.string(),
    byline: z.enum(["profile", "pen_name", "anonymous"]),
    pen_name: z.string(),
    slug: z.string(),
    content_warnings: z.array(z.string()),
    seo_title: z.string(),
    seo_description: z.string(),
    timezone: z.string(),
    original_written_at: z.object({ year: z.number(), month: z.number().optional(), day: z.number().optional(), approximate: z.boolean() }).nullable(),
    digitized_at: z.string().nullable(),
  })
  .partial()
  .strict();

async function patchMetadata(actor: Actor, id: string, input: unknown) {
  const parsed = metadataPatch.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID", parsed.error.issues[0]?.message ?? "Invalid metadata.");
  const patch = parsed.data;
  if (Object.keys(patch).length === 0) return;
  const w = await works.requireManagedWork(actor, id);
  const { pen_name, ...rest } = patch;
  await works.updateWorkMetadata(actor, id, {
    title: w.title,
    subtitle: w.subtitle,
    description: w.description,
    byline: w.byline ?? "profile",
    author_name: w.byline === "pen_name" ? w.author_name : "",
    slug: w.slug,
    content_warnings: w.content_warnings,
    seo_title: w.seo_title,
    seo_description: w.seo_description,
    timezone: w.timezone,
    original_written_at: w.original_written_at,
    digitized_at: w.digitized_at?.toDate().toISOString() ?? null,
    ...rest,
    ...(pen_name !== undefined ? { author_name: pen_name } : {}),
  });
}

const commandInput = z.object({
  command: z.enum(["submit", "reject", "returnToDraft", "schedule", "cancelSchedule", "publish", "republish", "withdraw", "archive", "restore"]),
  at: z.iso.datetime({ offset: true }).optional(),
  effective_at: z.iso.datetime({ offset: true }).optional(),
  note: z.string().max(500).optional(),
});

function toCommand(input: z.infer<typeof commandInput>): Command {
  switch (input.command) {
    case "schedule":
      if (!input.at) throw new AppError("INVALID", "schedule needs `at` (an ISO date-time).");
      return { type: "schedule", at: new Date(input.at) };
    case "publish":
    case "republish":
      return input.effective_at ? { type: input.command, effectiveAt: new Date(input.effective_at) } : { type: input.command };
    case "reject":
      return { type: "reject", note: input.note };
    default:
      return { type: input.command };
  }
}

async function route({ actor, segments, request }: Ctx): Promise<unknown> {
  const method = request.method;
  const [root, id, sub, subId] = segments;

  if (root === "me" && segments.length === 1 && method === "GET") return { uid: actor.uid, role: actor.role };

  if (root !== "publications") throw new AppError("NOT_FOUND", "Unknown endpoint.");

  if (!id) {
    if (method === "GET") {
      const status = request.nextUrl.searchParams.get("status") ?? undefined;
      const after = request.nextUrl.searchParams.get("after") ?? undefined;
      return works.listWorks(actor, { status: status as never, after });
    }
    if (method === "POST") {
      const input = await body<{ collection?: string; title?: string } & Record<string, unknown>>(request);
      const { collection, title, ...metadata } = input;
      const { workId } = await works.createWork(actor, { collection, title });
      if (Object.keys(metadata).length) await patchMetadata(actor, workId, metadata);
      return publicationView(actor, workId);
    }
  }

  if (id && !sub) {
    if (method === "GET") return publicationView(actor, id);
    if (method === "PATCH") {
      await patchMetadata(actor, id, await body(request));
      return publicationView(actor, id);
    }
  }

  if (id && sub === "chapters") {
    if (!subId && method === "POST") {
      const input = await body<{ title?: string; markdown?: string }>(request);
      const { chapterId } = await chapters.createChapter(actor, id, input.title ?? "");
      if (input.markdown) {
        await chapters.saveChapter(actor, { workId: id, chapterId, baseRev: 1, title: input.title ?? "", doc: markdownToDoc(input.markdown) });
      }
      const chapter = await chapters.getChapter(actor, id, chapterId);
      return { id: chapterId, slug: chapter!.slug, title: chapter!.title, rev: chapter!.rev, words: chapter!.word_count };
    }
    if (subId === "reorder" && method === "POST") {
      await chapters.reorderChapters(actor, id, (await body<{ order?: unknown }>(request)).order);
      return publicationView(actor, id);
    }
    if (subId) {
      const chapter = await chapters.getChapter(actor, id, subId);
      if (!chapter) throw new AppError("NOT_FOUND", "That chapter doesn't exist.");
      if (method === "GET") return { id: subId, slug: chapter.slug, title: chapter.title, rev: chapter.rev, words: chapter.word_count, markdown: docToMarkdown(chapter.doc) };
      if (method === "PUT") {
        const input = await body<{ title?: string; markdown?: string; base_rev?: number }>(request);
        const result = await chapters.saveChapter(actor, {
          workId: id,
          chapterId: subId,
          baseRev: input.base_rev ?? chapter.rev,
          title: input.title ?? chapter.title,
          doc: input.markdown !== undefined ? markdownToDoc(input.markdown) : chapter.doc,
        });
        if (result.status === "conflict") throw new AppError("CONFLICT", `The chapter changed (now rev ${result.serverRev}). Re-read it and retry.`);
        return { id: subId, rev: result.rev, words: result.words };
      }
      if (method === "DELETE") {
        await chapters.deleteChapter(actor, id, subId);
        return { deleted: subId };
      }
    }
  }

  if (id && sub === "lifecycle" && method === "POST") {
    const parsed = commandInput.safeParse(await body(request));
    if (!parsed.success) throw new AppError("INVALID", parsed.error.issues[0]?.message ?? "Invalid command.");
    const outcome = await applyCommand(actor, id, toCommand(parsed.data));
    invalidate(outcome.tags);
    return { status: outcome.status, edition_id: outcome.editionId, publication: await publicationView(actor, id) };
  }

  if (id && sub === "visibility" && method === "PUT") {
    const { slug } = await works.setVisibility(actor, id, (await body<{ visibility?: unknown }>(request)).visibility);
    invalidate(tagsFor(id, slug));
    return publicationView(actor, id);
  }

  if (id && sub === "share-links") {
    if (!subId && method === "GET") return shareLinks.listShareLinks(actor, id);
    if (!subId && method === "POST") {
      const { token, id: linkId, expiresAt } = await shareLinks.createShareLink(actor, id, await body(request).catch(() => ({})));
      return { id: linkId, url: `${site.url}/r/${token}`, expires_at: expiresAt };
    }
    if (subId && method === "DELETE") {
      await shareLinks.revokeShareLink(actor, id, subId);
      return { revoked: subId };
    }
  }

  throw new AppError("NOT_FOUND", `No ${method} handler for /${segments.join("/")}.`);
}

async function handle(request: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const header = request.headers.get("authorization") ?? "";
    const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
    const actor = token ? await authenticateApiToken(token) : null;
    if (!actor) throw new AppError("UNAUTHENTICATED", "Send a valid API token as `Authorization: Bearer sp_…`.");
    await rateLimit(LIMITS.api, actor.uid);
    const data = await route({ actor, segments: (await params).path, request });
    return NextResponse.json(data, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof AppError) {
      return NextResponse.json({ error: { code: error.code, message: error.message } }, { status: STATUS[error.code] ?? 400, headers: { "Cache-Control": "no-store" } });
    }
    console.error(JSON.stringify({ level: "error", msg: "api v1 failed", name: (error as Error)?.name, message: (error as Error)?.message }));
    return NextResponse.json({ error: { code: "INTERNAL", message: "Something went wrong." } }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
export const PUT = handle;
export const PATCH = handle;
export const DELETE = handle;
