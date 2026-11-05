"use server";

import { refresh, updateTag } from "next/cache";
import { headers } from "next/headers";
import { z } from "zod";
import { zonedWallTimeToInstant } from "@/domain/dates/partial-date";
import type { Command } from "@/domain/lifecycle/machine";
import { requireAuthor } from "@/server/auth/session";
import { AppError, asResult, type ActionResult } from "@/server/errors";
import { assertSameOrigin } from "@/server/http/origin";
import { LIMITS, rateLimit, type Limit } from "@/server/http/rate-limit";
import { authorActor, type Actor } from "@/server/services/actor";
import * as chapters from "@/server/services/chapters";
import { applyCommand, tagsFor } from "@/server/services/publishing";
import * as works from "@/server/services/works";
import { timeZoneSchema } from "@/lib/validation/work";

// Every action authorises itself: same-origin check, a live (revocation-checked)
// author session, and a per-author rate limit. UI restrictions are never trusted.

async function guard(limit: Limit = LIMITS.write): Promise<Actor> {
  assertSameOrigin(await headers());
  const viewer = await requireAuthor();
  await rateLimit(limit, viewer.uid);
  return authorActor(viewer);
}

const id = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);

function parseId(value: unknown): string {
  const parsed = id.safeParse(value);
  if (!parsed.success) throw new AppError("INVALID", "Invalid identifier.");
  return parsed.data;
}

function invalidate(tags: string[]) {
  for (const tag of new Set(tags)) updateTag(tag);
}

export async function createWorkAction(input: { collection: string; title: string }): Promise<ActionResult<{ workId: string }>> {
  return asResult(async () => works.createWork(await guard(), input));
}

export async function updateMetadataAction(workId: string, input: unknown): Promise<ActionResult> {
  return asResult(async () => {
    await works.updateWorkMetadata(await guard(), parseId(workId), input);
    refresh();
    return undefined;
  });
}

export async function setVisibilityAction(workId: string, visibility: string): Promise<ActionResult> {
  return asResult(async () => {
    const wid = parseId(workId);
    const { slug } = await works.setVisibility(await guard(), wid, visibility);
    invalidate(tagsFor(wid, slug));
    refresh();
    return undefined;
  });
}

export async function duplicateWorkAction(workId: string): Promise<ActionResult<{ workId: string }>> {
  return asResult(async () => works.duplicateWork(await guard(), parseId(workId)));
}

const wallTime = z.object({ wall: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/), timeZone: timeZoneSchema });

const commandInput = z.discriminatedUnion("type", [
  z.object({ type: z.literal("submit") }),
  z.object({ type: z.literal("reject"), note: z.string().trim().max(500).optional() }),
  z.object({ type: z.literal("returnToDraft") }),
  z.object({ type: z.literal("schedule"), at: wallTime }),
  z.object({ type: z.literal("cancelSchedule") }),
  z.object({ type: z.literal("publish"), effectiveAt: wallTime.optional() }),
  z.object({ type: z.literal("republish"), effectiveAt: wallTime.optional() }),
  z.object({ type: z.literal("withdraw") }),
  z.object({ type: z.literal("archive") }),
  z.object({ type: z.literal("restore") }),
]);

export type CommandInput = z.input<typeof commandInput>;

function toCommand(input: z.output<typeof commandInput>): Command {
  const instant = (w: { wall: string; timeZone: string }) => zonedWallTimeToInstant(w.wall, w.timeZone);
  switch (input.type) {
    case "schedule":
      return { type: "schedule", at: instant(input.at) };
    case "publish":
    case "republish":
      return input.effectiveAt ? { type: input.type, effectiveAt: instant(input.effectiveAt) } : { type: input.type };
    default:
      return input;
  }
}

export async function lifecycleAction(workId: string, input: CommandInput): Promise<ActionResult<{ editionId: string | null }>> {
  return asResult(async () => {
    const wid = parseId(workId);
    const parsed = commandInput.safeParse(input);
    if (!parsed.success) throw new AppError("INVALID", parsed.error.issues[0]?.message ?? "Invalid command.");
    const publishing = ["publish", "republish"].includes(parsed.data.type);
    const outcome = await applyCommand(await guard(publishing ? LIMITS.publish : LIMITS.write), wid, toCommand(parsed.data));
    invalidate(outcome.tags);
    refresh();
    return { editionId: outcome.editionId };
  });
}

export async function createChapterAction(workId: string, title: string): Promise<ActionResult<{ chapterId: string }>> {
  return asResult(async () => {
    const result = await chapters.createChapter(await guard(), parseId(workId), title);
    refresh();
    return result;
  });
}

export async function saveChapterAction(input: chapters.SaveInput): Promise<ActionResult<chapters.SaveResult>> {
  return asResult(async () => {
    const baseRev = z.number().int().positive().parse(input.baseRev);
    return chapters.saveChapter(await guard(LIMITS.save), { ...input, workId: parseId(input.workId), chapterId: parseId(input.chapterId), baseRev });
  });
}

export async function checkpointAction(workId: string, chapterId: string): Promise<ActionResult> {
  return asResult(async () => {
    await chapters.checkpointChapter(await guard(), parseId(workId), parseId(chapterId));
    return undefined;
  });
}

export async function listRevisionsAction(workId: string, chapterId: string): Promise<ActionResult<chapters.RevisionSummary[]>> {
  return asResult(async () => {
    await guard();
    return chapters.listRevisions(parseId(workId), parseId(chapterId));
  });
}

export async function restoreRevisionAction(workId: string, chapterId: string, revisionId: string, baseRev: number): Promise<ActionResult<{ rev: number }>> {
  return asResult(async () => {
    const result = await chapters.restoreRevision(await guard(), {
      workId: parseId(workId),
      chapterId: parseId(chapterId),
      revisionId: parseId(revisionId),
      baseRev: z.number().int().positive().parse(baseRev),
    });
    refresh();
    return result;
  });
}

export async function reorderChaptersAction(workId: string, order: string[]): Promise<ActionResult> {
  return asResult(async () => {
    await chapters.reorderChapters(await guard(), parseId(workId), order);
    refresh();
    return undefined;
  });
}

export async function deleteChapterAction(workId: string, chapterId: string): Promise<ActionResult> {
  return asResult(async () => {
    await chapters.deleteChapter(await guard(), parseId(workId), parseId(chapterId));
    refresh();
    return undefined;
  });
}

export async function setChapterSlugAction(workId: string, chapterId: string, slug: string): Promise<ActionResult> {
  return asResult(async () => {
    await chapters.setChapterSlug(await guard(), parseId(workId), parseId(chapterId), slug);
    refresh();
    return undefined;
  });
}

export async function getRevisionAction(workId: string, chapterId: string, revisionId: string): Promise<ActionResult<{ title: string; doc: unknown }>> {
  return asResult(async () => {
    await guard();
    const rev = await chapters.getRevision(parseId(workId), parseId(chapterId), parseId(revisionId));
    if (!rev) throw new AppError("NOT_FOUND", "That revision no longer exists.");
    return { title: rev.title, doc: rev.doc };
  });
}
