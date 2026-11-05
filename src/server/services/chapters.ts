import "server-only";
import { FieldValue, Timestamp } from "@google-cloud/firestore";
import { contentHash } from "@/domain/manuscript/canonical";
import { readingMinutes, wordCount } from "@/domain/manuscript/metrics";
import { emptyDoc, SCHEMA_VERSION, type ManuscriptDoc } from "@/domain/manuscript/schema";
import { validateManuscript } from "@/domain/manuscript/validate";
import { slugify, uniqueSlug } from "@/domain/publication/slug";
import { chapterTitleSchema, slugSchema } from "@/lib/validation/work";
import { AppError } from "../errors";
import { db } from "../firebase/admin";
import { col, type ChapterDoc, type RevisionDoc, type RevisionKind, type WorkDoc } from "../firebase/model";
import type { Actor } from "./actor";
import { getWorkOrThrow, parseInput } from "./works";

/** A chapter draft is a single Firestore document (1 MiB cap); leave headroom. */
export const MAX_CHAPTER_BYTES = 900 * 1024;
export const MAX_CHAPTERS = 400;
/** An automatic revision is kept at most this often, or after this many words change. */
export const AUTO_REVISION_INTERVAL_MS = 10 * 60 * 1000;
export const AUTO_REVISION_WORD_DELTA = 200;

function assertEditable(work: WorkDoc) {
  if (work.status === "ARCHIVED") throw new AppError("INVALID_TRANSITION", "Restore this publication before editing it.");
  if (work.status === "SCHEDULED") {
    throw new AppError("INVALID_TRANSITION", "Cancel the schedule before editing; the scheduled content is what will publish.");
  }
}

export async function createChapter(actor: Actor, workId: string, titleInput: unknown, now = new Date()): Promise<{ chapterId: string }> {
  const title = parseInput(chapterTitleSchema, titleInput);
  const ts = Timestamp.fromDate(now);
  return db().runTransaction(async (tx) => {
    const { ref, work } = await getWorkOrThrow(tx, workId);
    assertEditable(work);
    if (work.chapter_order.length >= MAX_CHAPTERS) throw new AppError("INVALID", `A publication can have at most ${MAX_CHAPTERS} chapters.`);
    const existing = await tx.get(col.chapters(workId).select("slug"));
    const taken = new Set(existing.docs.map((d) => d.get("slug") as string));
    const chapterRef = col.chapters(workId).doc();
    const chapter: ChapterDoc = {
      title,
      slug: uniqueSlug(slugify(title) || `chapter-${work.chapter_order.length + 1}`, taken),
      doc: emptyDoc(),
      schema_version: SCHEMA_VERSION,
      word_count: 0,
      rev: 1,
      created_at: ts,
      updated_at: ts,
      last_revision_at: null,
      last_revision_words: 0,
    };
    tx.create(chapterRef, chapter);
    tx.update(ref, {
      chapter_order: [...work.chapter_order, chapterRef.id],
      draft_version: FieldValue.increment(1),
      last_edited_at: ts,
      last_edited_by: actor.uid,
    });
    return { chapterId: chapterRef.id };
  });
}

export type SaveInput = { workId: string; chapterId: string; baseRev: number; title: string; doc: unknown };

export type SaveResult =
  | { status: "saved"; rev: number; savedAt: string; words: number; workWords: number; revisionCreated: boolean }
  | { status: "conflict"; serverRev: number; updatedAt: string };

/**
 * Autosave. Optimistic concurrency on `rev`: if another tab saved since this editor
 * loaded, nothing is written and the caller is told about the conflict.
 */
export async function saveChapter(actor: Actor, input: SaveInput, now = new Date()): Promise<SaveResult> {
  const title = parseInput(chapterTitleSchema, input.title);
  const doc = validateManuscript(input.doc);
  if (Buffer.byteLength(JSON.stringify(doc), "utf8") > MAX_CHAPTER_BYTES) {
    throw new AppError("INVALID", "This chapter is too long to save as one chapter. Split it into two.");
  }
  const words = wordCount(doc);
  const ts = Timestamp.fromDate(now);

  return db().runTransaction(async (tx) => {
    const { ref: workRef, work } = await getWorkOrThrow(tx, input.workId);
    const chRef = col.chapter(input.workId, input.chapterId);
    const snap = await tx.get(chRef);
    if (!snap.exists) throw new AppError("NOT_FOUND", "That chapter no longer exists.");
    assertEditable(work);
    const current = snap.data() as ChapterDoc;
    if (current.rev !== input.baseRev) {
      return { status: "conflict", serverRev: current.rev, updatedAt: current.updated_at.toDate().toISOString() } as const;
    }

    const lastRevAt = current.last_revision_at?.toMillis() ?? 0;
    const due =
      now.getTime() - lastRevAt >= AUTO_REVISION_INTERVAL_MS || Math.abs(words - current.last_revision_words) >= AUTO_REVISION_WORD_DELTA;
    const rev = current.rev + 1;
    if (due) {
      tx.create(col.revisions(input.workId, input.chapterId).doc(), revision(actor, doc, title, rev, "AUTO", words, ts));
    }
    tx.update(chRef, {
      title,
      doc,
      schema_version: SCHEMA_VERSION,
      word_count: words,
      rev,
      updated_at: ts,
      ...(due ? { last_revision_at: ts, last_revision_words: words } : {}),
    });
    const workWords = Math.max(0, work.word_count - current.word_count + words);
    tx.update(workRef, {
      word_count: workWords,
      reading_minutes: readingMinutes(workWords),
      draft_version: FieldValue.increment(1),
      last_edited_at: ts,
      last_edited_by: actor.uid,
    });
    return { status: "saved", rev, savedAt: ts.toDate().toISOString(), words, workWords, revisionCreated: due } as const;
  });
}

function revision(actor: Actor, doc: ManuscriptDoc, title: string, rev: number, kind: RevisionKind, words: number, ts: Timestamp): RevisionDoc {
  return { doc, title, rev, kind, word_count: words, content_hash: contentHash({ title, doc }), created_at: ts, created_by: actor.uid };
}

/** An explicit, named point the author can return to (Cmd/Ctrl+S). */
export async function checkpointChapter(actor: Actor, workId: string, chapterId: string, now = new Date()): Promise<void> {
  const ts = Timestamp.fromDate(now);
  await db().runTransaction(async (tx) => {
    const chRef = col.chapter(workId, chapterId);
    const snap = await tx.get(chRef);
    if (!snap.exists) throw new AppError("NOT_FOUND", "That chapter no longer exists.");
    const c = snap.data() as ChapterDoc;
    tx.create(col.revisions(workId, chapterId).doc(), revision(actor, c.doc, c.title, c.rev, "CHECKPOINT", c.word_count, ts));
    tx.update(chRef, { last_revision_at: ts, last_revision_words: c.word_count });
  });
}

export type RevisionSummary = { id: string; kind: RevisionKind; rev: number; words: number; createdAt: string; title: string };

export async function listRevisions(workId: string, chapterId: string, limit = 50): Promise<RevisionSummary[]> {
  const snap = await col.revisions(workId, chapterId).orderBy("created_at", "desc").limit(limit).select("kind", "rev", "word_count", "created_at", "title").get();
  return snap.docs.map((d) => ({
    id: d.id,
    kind: d.get("kind"),
    rev: d.get("rev"),
    words: d.get("word_count"),
    createdAt: (d.get("created_at") as Timestamp).toDate().toISOString(),
    title: d.get("title"),
  }));
}

export async function getRevision(workId: string, chapterId: string, revisionId: string): Promise<RevisionDoc | null> {
  const snap = await col.revisions(workId, chapterId).doc(revisionId).get();
  return snap.exists ? (snap.data() as RevisionDoc) : null;
}

/** Restores a revision as the new draft. The draft being replaced is kept as a revision first. */
export async function restoreRevision(
  actor: Actor,
  input: { workId: string; chapterId: string; revisionId: string; baseRev: number },
  now = new Date(),
): Promise<{ rev: number }> {
  const ts = Timestamp.fromDate(now);
  return db().runTransaction(async (tx) => {
    const { ref: workRef, work } = await getWorkOrThrow(tx, input.workId);
    assertEditable(work);
    const chRef = col.chapter(input.workId, input.chapterId);
    const [chSnap, revSnap] = await Promise.all([tx.get(chRef), tx.get(col.revisions(input.workId, input.chapterId).doc(input.revisionId))]);
    if (!chSnap.exists || !revSnap.exists) throw new AppError("NOT_FOUND", "That revision no longer exists.");
    const current = chSnap.data() as ChapterDoc;
    if (current.rev !== input.baseRev) throw new AppError("CONFLICT", "This chapter changed in another tab. Reload before restoring.");
    const target = revSnap.data() as RevisionDoc;
    const rev = current.rev + 1;
    tx.create(col.revisions(input.workId, input.chapterId).doc(), revision(actor, current.doc, current.title, current.rev, "BEFORE_RESTORE", current.word_count, ts));
    tx.update(chRef, {
      doc: target.doc,
      title: target.title,
      word_count: target.word_count,
      rev,
      updated_at: ts,
      last_revision_at: ts,
      last_revision_words: target.word_count,
    });
    const workWords = Math.max(0, work.word_count - current.word_count + target.word_count);
    tx.update(workRef, { word_count: workWords, reading_minutes: readingMinutes(workWords), draft_version: FieldValue.increment(1), last_edited_at: ts, last_edited_by: actor.uid });
    return { rev };
  });
}

export async function setChapterSlug(actor: Actor, workId: string, chapterId: string, slugInput: unknown, now = new Date()): Promise<void> {
  const slug = parseInput(slugSchema, slugInput);
  await db().runTransaction(async (tx) => {
    const { ref, work } = await getWorkOrThrow(tx, workId);
    assertEditable(work);
    const all = await tx.get(col.chapters(workId).select("slug"));
    if (all.docs.some((d) => d.id !== chapterId && d.get("slug") === slug)) throw new AppError("CONFLICT", "Another chapter already uses that URL.");
    if (!all.docs.some((d) => d.id === chapterId)) throw new AppError("NOT_FOUND", "That chapter no longer exists.");
    tx.update(col.chapter(workId, chapterId), { slug, updated_at: Timestamp.fromDate(now) });
    tx.update(ref, { draft_version: FieldValue.increment(1), last_edited_at: Timestamp.fromDate(now), last_edited_by: actor.uid });
  });
}

export async function reorderChapters(actor: Actor, workId: string, order: unknown, now = new Date()): Promise<void> {
  if (!Array.isArray(order) || !order.every((id) => typeof id === "string")) throw new AppError("INVALID", "Invalid chapter order.");
  await db().runTransaction(async (tx) => {
    const { ref, work } = await getWorkOrThrow(tx, workId);
    assertEditable(work);
    const same = order.length === work.chapter_order.length && new Set(order).size === order.length && order.every((id) => work.chapter_order.includes(id));
    if (!same) throw new AppError("CONFLICT", "The chapter list changed. Reload and try again.");
    tx.update(ref, { chapter_order: order, draft_version: FieldValue.increment(1), last_edited_at: Timestamp.fromDate(now), last_edited_by: actor.uid });
  });
}

/** Deletes a draft chapter and its revisions. Published editions keep their own copy. */
export async function deleteChapter(actor: Actor, workId: string, chapterId: string, now = new Date()): Promise<void> {
  await db().runTransaction(async (tx) => {
    const { ref, work } = await getWorkOrThrow(tx, workId);
    assertEditable(work);
    const chSnap = await tx.get(col.chapter(workId, chapterId));
    if (!chSnap.exists) throw new AppError("NOT_FOUND", "That chapter no longer exists.");
    const words = (chSnap.data() as ChapterDoc).word_count;
    const workWords = Math.max(0, work.word_count - words);
    tx.update(ref, {
      chapter_order: work.chapter_order.filter((id) => id !== chapterId),
      word_count: workWords,
      reading_minutes: readingMinutes(workWords),
      draft_version: FieldValue.increment(1),
      last_edited_at: Timestamp.fromDate(now),
      last_edited_by: actor.uid,
    });
    tx.delete(col.chapter(workId, chapterId));
  });
  // Revisions are a subcollection; remove them after the chapter itself is gone.
  await db().recursiveDelete(col.revisions(workId, chapterId));
}

export type ChapterListItem = { id: string; title: string; slug: string; words: number; updatedAt: string };

export async function listChapters(workId: string, order: string[]): Promise<ChapterListItem[]> {
  const snap = await col.chapters(workId).select("title", "slug", "word_count", "updated_at").get();
  const byId = new Map(snap.docs.map((d) => [d.id, d]));
  return order.flatMap((id) => {
    const d = byId.get(id);
    if (!d) return [];
    return [{ id, title: d.get("title"), slug: d.get("slug"), words: d.get("word_count"), updatedAt: (d.get("updated_at") as Timestamp).toDate().toISOString() }];
  });
}

export async function getChapter(workId: string, chapterId: string): Promise<ChapterDoc | null> {
  const snap = await col.chapter(workId, chapterId).get();
  return snap.exists ? (snap.data() as ChapterDoc) : null;
}
