import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { formatPartialDate } from "@/domain/dates/partial-date";
import type { ManuscriptDoc } from "@/domain/manuscript/schema";
import type { Collection } from "@/domain/types";
import { col, type HandleDoc, type PublishedDoc, type SlugDoc, type UserDoc } from "../firebase/model";
import { loadChapter, loadEdition } from "./editions";

// Public reads. Everything here is cacheable and shared between all visitors, so it
// may only return content that is PUBLISHED and PUBLIC. It reads `slugs`,
// `published` and SEALED `editions` — never `works` or draft chapters (enforced by
// tests/unit/read-boundaries.test.ts).
//
// Exported functions resolve access themselves; the edition-level loaders are not
// exported, so nobody can fetch an edition by id without going through the
// visibility check.

export type PublicWork = {
  workId: string;
  /** Empty when the work is under a pen name or anonymous: then there is no author page to link. */
  authorHandle: string;
  editionId: string;
  collection: Collection;
  slug: string;
  title: string;
  subtitle: string;
  description: string;
  authorName: string;
  contentWarnings: string[];
  wordCount: number;
  readingMinutes: number;
  chapterCount: number;
  writtenLabel: string | null;
  firstPublishedAt: string;
  lastPublishedAt: string;
};

export type PublicToc = { slug: string; title: string; ordinal: number; wordCount: number }[];

export type PublicChapter = {
  work: PublicWork;
  toc: PublicToc;
  chapter: { slug: string; title: string; ordinal: number; wordCount: number; doc: ManuscriptDoc };
  prev: { slug: string; title: string } | null;
  next: { slug: string; title: string } | null;
};

function isPublic(p: PublishedDoc | undefined): p is PublishedDoc {
  return !!p && p.live && p.visibility === "PUBLIC";
}

export function toPublicWork(p: PublishedDoc): PublicWork {
  return {
    workId: p.work_id,
    authorHandle: p.author_handle,
    editionId: p.current_edition_id,
    collection: p.collection,
    slug: p.slug,
    title: p.title,
    subtitle: p.subtitle,
    description: p.description,
    authorName: p.author_name,
    contentWarnings: p.content_warnings,
    wordCount: p.word_count,
    readingMinutes: p.reading_minutes,
    chapterCount: p.chapter_count,
    writtenLabel: p.original_written_at ? formatPartialDate(p.original_written_at) : null,
    firstPublishedAt: p.first_published_at.toDate().toISOString(),
    lastPublishedAt: p.last_published_at.toDate().toISOString(),
  };
}

/** A public publication by its URL, or null if it isn't publicly readable. */
export async function getPublicWork(collection: Collection, slug: string): Promise<PublicWork | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`slug:${slug}`);
  const slugSnap = await col.slug(slug).get();
  const workId = (slugSnap.data() as SlugDoc | undefined)?.work_id;
  if (!workId) return null;
  cacheTag(`work:${workId}`);
  const pub = (await col.publishedDoc(workId).get()).data() as PublishedDoc | undefined;
  if (!isPublic(pub) || pub.collection !== collection) return null;
  return toPublicWork(pub);
}

export async function getPublicToc(collection: Collection, slug: string): Promise<{ work: PublicWork; toc: PublicToc } | null> {
  const work = await getPublicWork(collection, slug);
  if (!work) return null;
  const edition = await loadEdition(work.editionId);
  if (!edition) return null;
  return { work, toc: edition.toc.map((t) => ({ slug: t.slug, title: t.title, ordinal: t.ordinal, wordCount: t.word_count })) };
}

export async function getPublicChapter(collection: Collection, slug: string, chapterSlug: string): Promise<PublicChapter | null> {
  const found = await getPublicToc(collection, slug);
  if (!found) return null;
  const index = found.toc.findIndex((t) => t.slug === chapterSlug);
  if (index === -1) return null;
  const doc = await loadChapter(found.work.editionId, chapterSlug);
  if (!doc) return null;
  const entry = found.toc[index]!;
  const around = (i: number) => (found.toc[i] ? { slug: found.toc[i]!.slug, title: found.toc[i]!.title } : null);
  return { work: found.work, toc: found.toc, chapter: { ...entry, doc }, prev: around(index - 1), next: around(index + 1) };
}

const PAGE = 24;

/** Listed public works, most recently first-published first. */
export async function listPublicWorks(collection: Collection | null, limit = PAGE): Promise<PublicWork[]> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog");
  let query = col.published().where("listed", "==", true);
  if (collection) query = query.where("collection", "==", collection);
  const snap = await query.orderBy("sort_at", "desc").limit(Math.min(limit, 100)).get();
  return snap.docs.map((d) => d.data() as PublishedDoc).filter(isPublic).map(toPublicWork);
}

export type PublicAuthor = { uid: string; handle: string; displayName: string; bio: string };

/**
 * A writer's public profile by handle. Only accounts that can write have public
 * pages; readers' profiles are never exposed. Email is never returned.
 */
export async function getPublicAuthor(handle: string): Promise<PublicAuthor | null> {
  "use cache";
  cacheLife("hours");
  cacheTag(`author:${handle}`);
  const uid = ((await col.handle(handle).get()).data() as HandleDoc | undefined)?.uid;
  if (!uid) return null;
  const user = (await col.user(uid).get()).data() as UserDoc | undefined;
  if (!user || user.role === "reader" || user.handle !== handle) return null;
  return { uid, handle: user.handle, displayName: user.display_name, bio: user.bio };
}

/** Listed public works by one author, newest first. */
export async function listPublicWorksByAuthor(ownerUid: string, limit = 48): Promise<PublicWork[]> {
  "use cache";
  cacheLife("max");
  cacheTag("catalog", `owner:${ownerUid}`);
  // Only works credited to the profile: pen-name and anonymous works never appear here.
  const snap = await col.published().where("listed", "==", true).where("public_author_uid", "==", ownerUid).orderBy("sort_at", "desc").limit(Math.min(limit, 100)).get();
  return snap.docs.map((d) => d.data() as PublishedDoc).filter(isPublic).map(toPublicWork);
}
