import "server-only";
import { AggregateField, FieldValue, Timestamp, type DocumentReference, type Transaction } from "@google-cloud/firestore";
import { slugify } from "@/domain/publication/slug";
import type { Collection, Status, Visibility } from "@/domain/types";
import { createWorkSchema, visibilitySchema, workMetadataSchema, type WorkMetadataInput } from "@/lib/validation/work";
import { AppError } from "../errors";
import { db } from "../firebase/admin";
import { col, type ChapterDoc, type PublishedDoc, type WorkDoc, type WorkEventDoc } from "../firebase/model";
import type { Actor } from "./actor";

export const DEFAULT_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_AUTHOR_NAME = "Shravan Revanna";

export function parseInput<T>(schema: { safeParse: (v: unknown) => { success: true; data: T } | { success: false; error: { issues: { message: string }[] } } }, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new AppError("INVALID", parsed.error.issues[0]?.message ?? "Invalid input.");
  return parsed.data;
}

export function event(
  actor: Actor,
  type: WorkEventDoc["type"],
  now: Timestamp,
  extra: Partial<Omit<WorkEventDoc, "type" | "occurred_at" | "actor_uid">> = {},
): WorkEventDoc {
  return {
    type,
    occurred_at: now,
    effective_at: extra.effective_at ?? null,
    actor_uid: actor.uid,
    from_status: extra.from_status ?? null,
    to_status: extra.to_status ?? null,
    edition_id: extra.edition_id ?? null,
    note: extra.note ?? null,
  };
}

export async function getWorkOrThrow(tx: Transaction, workId: string): Promise<{ ref: DocumentReference; work: WorkDoc }> {
  const ref = col.work(workId);
  const snap = await tx.get(ref);
  if (!snap.exists) throw new AppError("NOT_FOUND", "That publication doesn't exist.");
  return { ref, work: snap.data() as WorkDoc };
}

/** Reserves a globally unique slug inside a transaction, trying base, base-2, … */
async function reserveSlug(tx: Transaction, base: string, workId: string): Promise<string> {
  const root = slugify(base) || "untitled";
  for (let n = 1; n <= 25; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const snap = await tx.get(col.slug(candidate));
    if (!snap.exists) {
      tx.create(col.slug(candidate), { work_id: workId });
      return candidate;
    }
  }
  throw new AppError("CONFLICT", "Couldn't find a free URL for that title. Choose a slug manually.");
}

export async function createWork(actor: Actor, input: unknown, now = new Date()): Promise<{ workId: string }> {
  const { collection, title } = parseInput(createWorkSchema, input);
  const ref = col.works().doc();
  const ts = Timestamp.fromDate(now);
  await db().runTransaction(async (tx) => {
    const slug = await reserveSlug(tx, title, ref.id);
    tx.create(ref, newWork(actor, collection, title, slug, ts));
    tx.create(col.events(ref.id).doc(), event(actor, "CREATED", ts, { to_status: "DRAFT" }));
  });
  return { workId: ref.id };
}

function newWork(actor: Actor, collection: Collection, title: string, slug: string, now: Timestamp): WorkDoc {
  return {
    collection,
    slug,
    title,
    subtitle: "",
    description: "",
    author_name: DEFAULT_AUTHOR_NAME,
    content_warnings: [],
    seo_title: "",
    seo_description: "",
    status: "DRAFT",
    visibility: "PUBLIC",
    scheduled_for: null,
    archived_from: null,
    timezone: DEFAULT_TIMEZONE,
    original_written_at: null,
    digitized_at: null,
    created_at: now,
    last_edited_at: now,
    last_edited_by: actor.uid,
    first_published_at: null,
    last_published_at: null,
    last_publish_executed_at: null,
    current_edition_id: null,
    edition_count: 0,
    draft_version: 1,
    chapter_order: [],
    word_count: 0,
    reading_minutes: 0,
    duplicated_from: null,
  };
}

/**
 * Updates the draft metadata. Never touches published editions: readers keep seeing
 * the sealed metadata until the next publish.
 */
export async function updateWorkMetadata(actor: Actor, workId: string, input: unknown, now = new Date()): Promise<void> {
  const data: WorkMetadataInput = parseInput(workMetadataSchema, input);
  const ts = Timestamp.fromDate(now);
  await db().runTransaction(async (tx) => {
    const { ref, work } = await getWorkOrThrow(tx, workId);
    if (work.status === "ARCHIVED") throw new AppError("INVALID_TRANSITION", "Restore this publication before editing it.");

    if (data.slug !== work.slug) {
      if (work.edition_count > 0) {
        throw new AppError("INVALID", "The URL can't change after publication; links to it would break.");
      }
      const taken = await tx.get(col.slug(data.slug));
      if (taken.exists) throw new AppError("CONFLICT", "That URL is already in use.");
      tx.delete(col.slug(work.slug));
      tx.create(col.slug(data.slug), { work_id: workId });
    }

    tx.update(ref, {
      ...data,
      content_warnings: [...new Set(data.content_warnings)],
      digitized_at: data.digitized_at ? Timestamp.fromDate(new Date(data.digitized_at)) : null,
      last_edited_at: ts,
      last_edited_by: actor.uid,
      draft_version: FieldValue.increment(1),
    });
    tx.create(col.events(workId).doc(), event(actor, "METADATA_UPDATED", ts));
  });
}

/** Visibility applies to the live read model immediately; it does not create an edition. */
export async function setVisibility(actor: Actor, workId: string, input: unknown, now = new Date()): Promise<{ slug: string }> {
  const visibility: Visibility = parseInput(visibilitySchema, input);
  const ts = Timestamp.fromDate(now);
  return db().runTransaction(async (tx) => {
    const { ref, work } = await getWorkOrThrow(tx, workId);
    const pubRef = col.publishedDoc(workId);
    const pub = await tx.get(pubRef);
    tx.update(ref, { visibility, last_edited_at: ts, last_edited_by: actor.uid });
    if (pub.exists) {
      const live = (pub.data() as PublishedDoc).live;
      tx.update(pubRef, { visibility, listed: live && visibility === "PUBLIC", updated_at: ts });
    }
    tx.create(col.events(workId).doc(), event(actor, "VISIBILITY_CHANGED", ts, { note: `${work.visibility} → ${visibility}` }));
    return { slug: work.slug };
  });
}

/** Copies the current draft (metadata + chapters) into a new, unpublished work. */
export async function duplicateWork(actor: Actor, workId: string, now = new Date()): Promise<{ workId: string }> {
  const source = await col.work(workId).get();
  if (!source.exists) throw new AppError("NOT_FOUND", "That publication doesn't exist.");
  const work = source.data() as WorkDoc;
  const chapters = await col.chapters(workId).get();
  const ts = Timestamp.fromDate(now);
  const ref = col.works().doc();

  // Chapter ids are preserved so chapter_order stays valid. Chapters are written first;
  // the work document (which makes them visible in the studio) is created last.
  const writer = db().bulkWriter();
  for (const ch of chapters.docs) {
    const c = ch.data() as ChapterDoc;
    writer.create(col.chapter(ref.id, ch.id), { ...c, rev: 1, created_at: ts, updated_at: ts, last_revision_at: null, last_revision_words: 0 });
  }
  await writer.close();

  await db().runTransaction(async (tx) => {
    const slug = await reserveSlug(tx, `${work.slug}-copy`, ref.id);
    tx.create(ref, {
      ...newWork(actor, work.collection, `${work.title} (copy)`, slug, ts),
      subtitle: work.subtitle,
      description: work.description,
      author_name: work.author_name,
      content_warnings: work.content_warnings,
      seo_title: work.seo_title,
      seo_description: work.seo_description,
      timezone: work.timezone,
      original_written_at: work.original_written_at,
      digitized_at: work.digitized_at,
      chapter_order: work.chapter_order,
      word_count: work.word_count,
      reading_minutes: work.reading_minutes,
      duplicated_from: workId,
    } satisfies WorkDoc);
    tx.create(col.events(ref.id).doc(), event(actor, "DUPLICATED", ts, { to_status: "DRAFT", note: `from ${workId}` }));
  });
  return { workId: ref.id };
}

export type WorkSummary = {
  id: string;
  title: string;
  collection: Collection;
  status: Status;
  visibility: Visibility;
  slug: string;
  word_count: number;
  chapter_count: number;
  edition_count: number;
  last_edited_at: string;
  scheduled_for: string | null;
};

export const PAGE_SIZE = 20;

/** Studio list, newest edit first, cursor-paginated. */
export async function listWorks(opts: { status?: Status; after?: string } = {}): Promise<{ items: WorkSummary[]; next: string | null }> {
  let query = col.works().orderBy("last_edited_at", "desc");
  if (opts.status) query = col.works().where("status", "==", opts.status).orderBy("last_edited_at", "desc");
  if (opts.after) {
    const cursor = await col.work(opts.after).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snap = await query.limit(PAGE_SIZE + 1).get();
  const docs = snap.docs.slice(0, PAGE_SIZE);
  return {
    items: docs.map((d) => toSummary(d.id, d.data() as WorkDoc)),
    next: snap.docs.length > PAGE_SIZE ? docs[docs.length - 1]!.id : null,
  };
}

export function toSummary(id: string, w: WorkDoc): WorkSummary {
  return {
    id,
    title: w.title,
    collection: w.collection,
    status: w.status,
    visibility: w.visibility,
    slug: w.slug,
    word_count: w.word_count,
    chapter_count: w.chapter_order.length,
    edition_count: w.edition_count,
    last_edited_at: w.last_edited_at.toDate().toISOString(),
    scheduled_for: w.scheduled_for?.toDate().toISOString() ?? null,
  };
}

export async function getWork(workId: string): Promise<WorkDoc | null> {
  const snap = await col.work(workId).get();
  return snap.exists ? (snap.data() as WorkDoc) : null;
}

export async function dashboardStats() {
  const works = col.works();
  const [total, drafts, review, scheduled, published, archived, recent, upcoming] = await Promise.all([
    works.count().get(),
    works.where("status", "==", "DRAFT").count().get(),
    works.where("status", "==", "REVIEW").count().get(),
    works.where("status", "==", "SCHEDULED").count().get(),
    works.where("status", "==", "PUBLISHED").count().get(),
    works.where("status", "==", "ARCHIVED").count().get(),
    works.orderBy("last_edited_at", "desc").limit(5).get(),
    works.where("status", "==", "SCHEDULED").orderBy("scheduled_for", "asc").limit(5).get(),
  ]);
  const totals = await works.aggregate({ words: AggregateField.sum("word_count") }).get();
  return {
    total: total.data().count,
    drafts: drafts.data().count,
    review: review.data().count,
    scheduled: scheduled.data().count,
    published: published.data().count,
    archived: archived.data().count,
    words: totals.data().words ?? 0,
    recent: recent.docs.map((d) => toSummary(d.id, d.data() as WorkDoc)),
    upcoming: upcoming.docs.map((d) => toSummary(d.id, d.data() as WorkDoc)),
  };
}
