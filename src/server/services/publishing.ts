import "server-only";
import { randomBytes } from "node:crypto";
import { Timestamp, type Transaction } from "@google-cloud/firestore";
import { transition, type Command, type LifecycleState } from "@/domain/lifecycle/machine";
import { contentHash } from "@/domain/manuscript/canonical";
import { readingMinutes } from "@/domain/manuscript/metrics";
import { SCHEMA_VERSION } from "@/domain/manuscript/schema";
import { splitDoc } from "@/domain/manuscript/split";
import { AppError } from "../errors";
import { db } from "../firebase/admin";
import {
  col,
  editionId as makeEditionId,
  partId,
  type ChapterDoc,
  type EditionDoc,
  type EditionMetadata,
  type EditionPartDoc,
  type PublishedDoc,
  type TocEntry,
  type WorkDoc,
} from "../firebase/model";
import type { Actor } from "./actor";
import { assertManages, event, getWorkOrThrow, requireManagedWork } from "./works";

// Publishing in two phases:
//
//   1. Seal. Claim the next edition id in a transaction (state SEALING, random
//      seal_token), then write the chapter snapshots as `parts` namespaced by that
//      token, in batches. Nothing public points at a SEALING edition.
//   2. Commit. One transaction re-reads the work, re-runs the state machine and
//      checks that (a) our token still owns the claim, (b) the draft did not change
//      since we snapshotted it and (c) no other edition was committed meanwhile. Only
//      then is the edition marked SEALED and the public read model switched to it.
//
// A SEALED edition is never written again. Losing attempts leave SEALING claims or
// parts with a stale token behind; readers ignore them and `sweepStaleSeals` deletes them.

/** Firestore allows 500 writes per batch and 10 MiB per request; stay well inside both. */
const BATCH_MAX_WRITES = 400;
const BATCH_MAX_BYTES = 8 * 1024 * 1024;
/** A claim older than this is abandoned and may be swept. */
export const STALE_SEAL_MS = 60 * 60 * 1000;

export type TransitionOutcome = {
  status: WorkDoc["status"];
  editionId: string | null;
  /** Cache tags whose public content changed. */
  tags: string[];
};

type Snapshot = {
  metadata: EditionMetadata;
  chapters: { id: string; ordinal: number; slug: string; title: string; doc: ChapterDoc["doc"]; words: number }[];
  hash: string;
  draftVersion: number;
  words: number;
};

function lifecycleOf(work: WorkDoc): LifecycleState {
  return {
    status: work.status,
    scheduledFor: work.scheduled_for?.toDate() ?? null,
    archivedFrom: work.archived_from,
    hasEdition: work.current_edition_id !== null,
  };
}

function runMachine(work: WorkDoc, command: Command, now: Date) {
  const result = transition(lifecycleOf(work), command, now);
  if (!result.ok) throw new AppError(result.error.code, result.error.message);
  return result.value;
}

export function tagsFor(workId: string, slug: string): string[] {
  return [`work:${workId}`, `slug:${slug}`, "catalog"];
}

/** Hash of exactly what readers will see: edition metadata plus ordered chapters. */
export function editionHash(metadata: EditionMetadata, chapters: { slug: string; title: string; doc: unknown }[]): string {
  return contentHash({ metadata, chapters: chapters.map((c) => ({ slug: c.slug, title: c.title, doc: c.doc })) });
}

async function snapshotDraft(workId: string, work: WorkDoc): Promise<Snapshot> {
  if (work.chapter_order.length === 0) throw new AppError("INVALID", "Add at least one chapter before publishing.");
  const refs = work.chapter_order.map((id) => col.chapter(workId, id));
  const snaps = await db().getAll(...refs);
  const chapters = snaps.map((s, i) => {
    if (!s.exists) throw new AppError("CONFLICT", "A chapter changed while publishing. Try again.");
    const c = s.data() as ChapterDoc;
    return { id: s.id, ordinal: i + 1, slug: c.slug, title: c.title, doc: c.doc, words: c.word_count };
  });
  const metadata: EditionMetadata = {
    collection: work.collection,
    slug: work.slug,
    title: work.title,
    subtitle: work.subtitle,
    description: work.description,
    author_name: work.author_name,
    byline: work.byline ?? "profile",
    content_warnings: work.content_warnings,
    seo_title: work.seo_title,
    seo_description: work.seo_description,
    original_written_at: work.original_written_at,
    timezone: work.timezone,
  };
  return {
    metadata,
    chapters,
    hash: editionHash(metadata, chapters),
    draftVersion: work.draft_version,
    words: chapters.reduce((n, c) => n + c.words, 0),
  };
}

/**
 * Applies a lifecycle command. Commands that publish content seal a new edition;
 * the rest are a single transaction.
 */
export async function applyCommand(actor: Actor, workId: string, command: Command, now = new Date()): Promise<TransitionOutcome> {
  const first = await col.work(workId).get();
  if (!first.exists) throw new AppError("NOT_FOUND", "That publication doesn't exist.");
  const work = first.data() as WorkDoc;
  assertManages(actor, work);
  const preview = runMachine(work, command, now);
  if (!preview.seal) return commitWithoutSeal(actor, workId, command, now);

  const snapshot = await snapshotDraft(workId, work);
  if (work.current_edition_id) {
    const current = await col.edition(work.current_edition_id).get();
    if ((current.data() as EditionDoc | undefined)?.content_hash === snapshot.hash) {
      if (command.type === "republish") {
        throw new AppError("NO_CHANGES", "Nothing has changed since the current edition. Edit the draft first.");
      }
      // Publishing again after a withdrawal with identical content reuses the existing edition.
      return commitWithoutSeal(actor, workId, command, now, work.current_edition_id);
    }
  }

  const number = work.edition_count + 1;
  const id = makeEditionId(workId, number);
  const token = randomBytes(12).toString("hex");
  await claimEdition(actor, workId, id, number, token, snapshot, preview.seal.effectiveAt, now);
  await writeParts(id, token, snapshot);
  const outcome = await commitSeal(actor, workId, id, number, token, snapshot, command, now);
  await deleteLosingParts(id, token).catch(() => undefined);
  return outcome;
}

async function claimEdition(actor: Actor, workId: string, id: string, number: number, token: string, snapshot: Snapshot, effectiveAt: Date, now: Date) {
  const ts = Timestamp.fromDate(now);
  await db().runTransaction(async (tx) => {
    const { work } = await getWorkOrThrow(tx, workId, actor);
    const existing = await tx.get(col.edition(id));
    if ((existing.data() as EditionDoc | undefined)?.state === "SEALED" || work.edition_count >= number) {
      throw new AppError("CONFLICT", "Another publish finished first. Reload to see it.");
    }
    if (work.draft_version !== snapshot.draftVersion) {
      throw new AppError("CONFLICT", "The draft changed while publishing. Try again.");
    }
    const toc: TocEntry[] = snapshot.chapters.map((c) => ({
      chapter_id: c.id,
      slug: c.slug,
      title: c.title,
      ordinal: c.ordinal,
      word_count: c.words,
      parts: splitDoc(c.doc).length,
    }));
    const edition: EditionDoc = {
      work_id: workId,
      number,
      state: "SEALING",
      seal_token: token,
      claimed_at: ts,
      sealed_at: null,
      effective_published_at: Timestamp.fromDate(effectiveAt),
      draft_version: snapshot.draftVersion,
      metadata: snapshot.metadata,
      toc,
      word_count: snapshot.words,
      reading_minutes: readingMinutes(snapshot.words),
      content_hash: snapshot.hash,
    };
    tx.set(col.edition(id), edition);
  });
}

async function writeParts(id: string, token: string, snapshot: Snapshot) {
  let batch = db().batch();
  let writes = 0;
  let bytes = 0;
  for (const chapter of snapshot.chapters) {
    const parts = splitDoc(chapter.doc);
    for (const [index, doc] of parts.entries()) {
      const part: EditionPartDoc = { seal_token: token, chapter_id: chapter.id, ordinal: chapter.ordinal, part: index, doc, schema_version: SCHEMA_VERSION };
      const size = Buffer.byteLength(JSON.stringify(part), "utf8");
      if (writes + 1 > BATCH_MAX_WRITES || bytes + size > BATCH_MAX_BYTES) {
        await batch.commit();
        batch = db().batch();
        writes = 0;
        bytes = 0;
      }
      // `create` would fail on retry; ids are token-scoped, so `set` can only ever
      // touch this attempt's own parts.
      batch.set(col.parts(id).doc(partId(token, chapter.ordinal, index)), part);
      writes += 1;
      bytes += size;
    }
  }
  if (writes > 0) await batch.commit();
}

async function commitSeal(
  actor: Actor,
  workId: string,
  id: string,
  number: number,
  token: string,
  snapshot: Snapshot,
  command: Command,
  now: Date,
): Promise<TransitionOutcome> {
  const ts = Timestamp.fromDate(now);
  return db().runTransaction(async (tx) => {
    const { ref, work } = await getWorkOrThrow(tx, workId, actor);
    const editionSnap = await tx.get(col.edition(id));
    const edition = editionSnap.data() as EditionDoc | undefined;
    if (!edition || edition.state !== "SEALING" || edition.seal_token !== token) {
      throw new AppError("CONFLICT", "Another publish attempt took over. Reload to see the result.");
    }
    if (work.draft_version !== snapshot.draftVersion || work.edition_count !== number - 1) {
      throw new AppError("CONFLICT", "The draft changed while publishing. Try again.");
    }
    const credited = (work.byline ?? "profile") === "profile";
    const owner = credited ? await tx.get(col.user(work.owner_uid)) : null;
    const t = runMachine(work, command, now);
    if (!t.seal) throw new AppError("CONFLICT", "The publication changed state while publishing.");

    const effective = Timestamp.fromDate(t.seal.effectiveAt);
    const first = work.first_published_at && work.first_published_at.toMillis() <= effective.toMillis() ? work.first_published_at : effective;

    tx.update(col.edition(id), { state: "SEALED", sealed_at: ts });
    tx.update(ref, {
      status: t.next.status,
      scheduled_for: null,
      archived_from: null,
      current_edition_id: id,
      edition_count: number,
      first_published_at: first,
      last_published_at: effective,
      last_publish_executed_at: ts,
    });
    writePublished(tx, workId, work, { editionId: id, first, last: effective, now: ts, snapshot, authorHandle: (owner?.get("handle") as string | undefined) ?? "" });
    tx.create(col.events(workId).doc(), event(actor, t.event, ts, { from_status: work.status, to_status: t.next.status, edition_id: id, effective_at: effective }));
    return { status: t.next.status, editionId: id, tags: tagsFor(workId, work.slug) };
  });
}

function writePublished(
  tx: Transaction,
  workId: string,
  work: WorkDoc,
  p: { editionId: string; first: Timestamp; last: Timestamp; now: Timestamp; snapshot: Snapshot; authorHandle: string },
) {
  const m = p.snapshot.metadata;
  const doc: PublishedDoc = {
    work_id: workId,
    owner_uid: work.owner_uid,
    public_author_uid: m.byline === "profile" ? work.owner_uid : null,
    author_handle: m.byline === "profile" ? p.authorHandle : "",
    collection: m.collection,
    slug: m.slug,
    visibility: work.visibility,
    live: true,
    listed: work.visibility === "PUBLIC",
    current_edition_id: p.editionId,
    title: m.title,
    subtitle: m.subtitle,
    description: m.description,
    author_name: m.author_name,
    content_warnings: m.content_warnings,
    word_count: p.snapshot.words,
    reading_minutes: readingMinutes(p.snapshot.words),
    chapter_count: p.snapshot.chapters.length,
    original_written_at: m.original_written_at,
    first_published_at: p.first,
    last_published_at: p.last,
    sort_at: p.first,
    updated_at: p.now,
  };
  tx.set(col.publishedDoc(workId), doc);
}

/** Transitions that don't create an edition: review, schedule, withdraw, archive, restore. */
async function commitWithoutSeal(actor: Actor, workId: string, command: Command, now: Date, reuseEdition?: string): Promise<TransitionOutcome> {
  const ts = Timestamp.fromDate(now);
  return db().runTransaction(async (tx) => {
    const { ref, work } = await getWorkOrThrow(tx, workId, actor);
    const pubRef = col.publishedDoc(workId);
    const pubSnap = await tx.get(pubRef);
    const t = runMachine(work, command, now);
    if (t.seal && !reuseEdition) throw new AppError("CONFLICT", "The publication changed. Try again.");
    if (reuseEdition && work.current_edition_id !== reuseEdition) throw new AppError("CONFLICT", "The publication changed. Try again.");

    tx.update(ref, {
      status: t.next.status,
      scheduled_for: t.next.scheduledFor ? Timestamp.fromDate(t.next.scheduledFor) : null,
      archived_from: t.next.archivedFrom,
      ...(reuseEdition ? { last_publish_executed_at: ts } : {}),
    });

    let tags: string[] = [];
    if (pubSnap.exists) {
      tx.update(pubRef, { live: t.live, listed: t.live && work.visibility === "PUBLIC", updated_at: ts });
      tags = tagsFor(workId, work.slug);
    } else if (t.live) {
      throw new AppError("CONFLICT", "There is no edition to make public.");
    }

    tx.create(
      col.events(workId).doc(),
      event(actor, t.event, ts, {
        from_status: work.status,
        to_status: t.next.status,
        effective_at: t.next.scheduledFor ? Timestamp.fromDate(t.next.scheduledFor) : null,
        edition_id: reuseEdition ?? null,
        note: command.type === "reject" ? (command.note ?? null) : null,
      }),
    );
    return { status: t.next.status, editionId: reuseEdition ?? null, tags };
  });
}

/** Best-effort cleanup of parts written by attempts that lost the race for this edition. */
async function deleteLosingParts(id: string, winningToken: string) {
  const stale = await col.parts(id).where("seal_token", "!=", winningToken).select().get();
  if (stale.empty) return;
  const writer = db().bulkWriter();
  for (const d of stale.docs) writer.delete(d.ref);
  await writer.close();
}

/** Deletes abandoned SEALING claims (and their parts). Never touches SEALED editions. */
export async function sweepStaleSeals(now = new Date()): Promise<number> {
  const cutoff = Timestamp.fromMillis(now.getTime() - STALE_SEAL_MS);
  const stale = await col.editions().where("state", "==", "SEALING").where("claimed_at", "<", cutoff).limit(50).get();
  let removed = 0;
  for (const snap of stale.docs) {
    const deleted = await db().runTransaction(async (tx) => {
      const fresh = await tx.get(snap.ref);
      const e = fresh.data() as EditionDoc | undefined;
      if (!e || e.state !== "SEALING" || e.claimed_at.toMillis() >= cutoff.toMillis()) return false;
      tx.delete(snap.ref);
      return true;
    });
    if (deleted) {
      await db().recursiveDelete(col.parts(snap.id));
      removed += 1;
    }
  }
  return removed;
}

export type ScheduleRun = { published: string[]; skipped: { workId: string; reason: string }[]; tags: string[] };

/**
 * Publishes every scheduled work that is due. Safe to run late, twice, or
 * concurrently: each publish re-checks status inside its transaction.
 */
export async function runDueSchedules(actor: Actor, now = new Date(), limit = 25): Promise<ScheduleRun> {
  const due = await col
    .works()
    .where("status", "==", "SCHEDULED")
    .where("scheduled_for", "<=", Timestamp.fromDate(now))
    .orderBy("scheduled_for", "asc")
    .limit(limit)
    .select()
    .get();
  const run: ScheduleRun = { published: [], skipped: [], tags: [] };
  for (const d of due.docs) {
    try {
      const outcome = await applyCommand(actor, d.id, { type: "fireSchedule" }, now);
      run.published.push(d.id);
      run.tags.push(...outcome.tags);
    } catch (error) {
      run.skipped.push({ workId: d.id, reason: error instanceof AppError ? error.code : "ERROR" });
    }
  }
  return run;
}

export type EditionSummary = { id: string; number: number; effectivePublishedAt: string; sealedAt: string; words: number; chapters: number; hash: string };

export async function listEditions(actor: Actor, workId: string): Promise<EditionSummary[]> {
  await requireManagedWork(actor, workId);
  const snap = await col.editions().where("work_id", "==", workId).orderBy("number", "desc").limit(100).get();
  return snap.docs
    .map((d) => [d.id, d.data() as EditionDoc] as const)
    .filter(([, e]) => e.state === "SEALED")
    .map(([id, e]) => ({
      id,
      number: e.number,
      effectivePublishedAt: e.effective_published_at.toDate().toISOString(),
      sealedAt: e.sealed_at!.toDate().toISOString(),
      words: e.word_count,
      chapters: e.toc.length,
      hash: e.content_hash,
    }));
}

/** Recomputes an edition's hash from its stored parts. Used by tests and integrity checks. */
export async function verifyEdition(id: string): Promise<boolean> {
  const snap = await col.edition(id).get();
  const e = snap.data() as EditionDoc | undefined;
  if (!e || e.state !== "SEALED") return false;
  const parts = await col.parts(id).where("seal_token", "==", e.seal_token).get();
  const byChapter = new Map<string, EditionPartDoc[]>();
  for (const p of parts.docs.map((d) => d.data() as EditionPartDoc)) {
    byChapter.set(p.chapter_id, [...(byChapter.get(p.chapter_id) ?? []), p]);
  }
  const chapters = e.toc.map((t) => {
    const ps = (byChapter.get(t.chapter_id) ?? []).sort((a, b) => a.part - b.part);
    if (ps.length !== t.parts) throw new Error(`Edition ${id} is missing parts for ${t.slug}`);
    return { slug: t.slug, title: t.title, doc: { type: "doc", content: ps.flatMap((p) => p.doc.content) } };
  });
  return editionHash(e.metadata, chapters) === e.content_hash;
}
