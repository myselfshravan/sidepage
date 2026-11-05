import "server-only";
import { FieldPath, Timestamp } from "@google-cloud/firestore";
import { z } from "zod";
import { AppError } from "../errors";
import { db } from "../firebase/admin";
import { col, type PublishedDoc, type UserDoc } from "../firebase/model";
import type { Actor } from "./actor";
import { parseInput } from "./works";

// A signed-in reader's own data: reading progress, bookmarks, saved publications and
// followed authors, all under users/{uid}. Writes are accepted only for works the
// reader can currently read, and only ever touch the actor's own documents.

const MAX_BOOKMARKS_PER_WORK = 200;
const MAX_FOLLOWING = 500;

const sub = (uid: string, name: "progress" | "bookmarks" | "library" | "following") => col.user(uid).collection(name);

const workId = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const chapterSlug = z.string().min(1).max(120);
const progressInput = z.object({ workId, chapterSlug, chapterTitle: z.string().max(200), fraction: z.number().min(0).max(1) });
const bookmarkInput = z.object({
  workId,
  chapterSlug,
  chapterTitle: z.string().max(200),
  block: z.string().regex(/^b-\d{1,5}$/),
  excerpt: z.string().max(160),
});

/** Readable means live and public today; invited access is checked here once sharing lands. */
async function assertReadable(id: string): Promise<PublishedDoc> {
  const snap = await col.publishedDoc(id).get();
  const pub = snap.data() as PublishedDoc | undefined;
  if (!pub || !pub.live || pub.visibility !== "PUBLIC") throw new AppError("NOT_FOUND", "That publication isn't available.");
  return pub;
}

function user(actor: Actor): string {
  if (actor.kind !== "user") throw new AppError("FORBIDDEN", "Readers only.");
  return actor.uid;
}

export type ReaderBookmark = { id: string; chapter: string; title: string; block: string; excerpt: string; at: number };
export type ReaderState = {
  progress: { chapter: string; title: string; fraction: number; at: number } | null;
  bookmarks: ReaderBookmark[];
  saved: boolean;
};

export async function readerState(actor: Actor, id: string): Promise<ReaderState> {
  const uid = user(actor);
  const wid = parseInput(workId, id);
  const [progress, bookmarks, saved] = await Promise.all([
    sub(uid, "progress").doc(wid).get(),
    sub(uid, "bookmarks").where("work_id", "==", wid).orderBy("created_at", "desc").limit(MAX_BOOKMARKS_PER_WORK).get(),
    sub(uid, "library").doc(wid).get(),
  ]);
  const p = progress.data();
  return {
    progress: p ? { chapter: p.chapter_slug, title: p.chapter_title, fraction: p.fraction, at: (p.updated_at as Timestamp).toMillis() } : null,
    bookmarks: bookmarks.docs.map((d) => ({
      id: d.id,
      chapter: d.get("chapter_slug"),
      title: d.get("chapter_title"),
      block: d.get("block"),
      excerpt: d.get("excerpt"),
      at: (d.get("created_at") as Timestamp).toMillis(),
    })),
    saved: saved.exists,
  };
}

export async function saveProgress(actor: Actor, input: unknown, now = new Date()): Promise<void> {
  const uid = user(actor);
  const data = parseInput(progressInput, input);
  await assertReadable(data.workId);
  await sub(uid, "progress").doc(data.workId).set({
    work_id: data.workId,
    chapter_slug: data.chapterSlug,
    chapter_title: data.chapterTitle,
    fraction: data.fraction,
    updated_at: Timestamp.fromDate(now),
  });
}

export async function addBookmark(actor: Actor, input: unknown, now = new Date()): Promise<{ id: string }> {
  const uid = user(actor);
  const data = parseInput(bookmarkInput, input);
  await assertReadable(data.workId);
  const existing = await sub(uid, "bookmarks").where("work_id", "==", data.workId).count().get();
  if (existing.data().count >= MAX_BOOKMARKS_PER_WORK) throw new AppError("INVALID", "You have too many bookmarks in this publication.");
  // One bookmark per block: the id is deterministic, so re-adding is a no-op.
  const id = `${data.workId}_${data.chapterSlug}_${data.block}`.slice(0, 300);
  await sub(uid, "bookmarks").doc(id).set({
    work_id: data.workId,
    chapter_slug: data.chapterSlug,
    chapter_title: data.chapterTitle,
    block: data.block,
    excerpt: data.excerpt,
    created_at: Timestamp.fromDate(now),
  });
  return { id };
}

export async function removeBookmark(actor: Actor, id: unknown): Promise<void> {
  const uid = user(actor);
  const bid = parseInput(z.string().min(1).max(300).regex(/^[A-Za-z0-9_-]+$/), id);
  await sub(uid, "bookmarks").doc(bid).delete();
}

export async function setSaved(actor: Actor, id: unknown, saved: boolean, now = new Date()): Promise<void> {
  const uid = user(actor);
  const wid = parseInput(workId, id);
  if (!saved) return void (await sub(uid, "library").doc(wid).delete());
  await assertReadable(wid);
  await sub(uid, "library").doc(wid).set({ work_id: wid, saved_at: Timestamp.fromDate(now) });
}

export async function setFollowing(actor: Actor, authorUid: unknown, following: boolean, now = new Date()): Promise<void> {
  const uid = user(actor);
  const target = parseInput(z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/), authorUid);
  if (!following) return void (await sub(uid, "following").doc(target).delete());
  if (target === uid) throw new AppError("INVALID", "You can't follow yourself.");
  const author = (await col.user(target).get()).data() as UserDoc | undefined;
  if (!author || author.role === "reader") throw new AppError("NOT_FOUND", "That author doesn't exist.");
  const count = await sub(uid, "following").count().get();
  if (count.data().count >= MAX_FOLLOWING) throw new AppError("INVALID", "You follow the maximum number of authors.");
  await sub(uid, "following").doc(target).set({ author_uid: target, followed_at: Timestamp.fromDate(now) });
}

export async function isFollowing(actor: Actor, authorUid: string): Promise<boolean> {
  return (await sub(user(actor), "following").doc(authorUid).get()).exists;
}

export type LibraryItem = {
  workId: string;
  collection: PublishedDoc["collection"];
  slug: string;
  title: string;
  authorName: string;
  authorHandle: string;
  progress: { chapter: string; title: string; fraction: number } | null;
};

export type LibraryView = { reading: LibraryItem[]; saved: LibraryItem[]; fromFollowed: LibraryItem[]; following: { uid: string; handle: string; displayName: string }[] };

/** The reader's library page. Only currently readable works are shown. */
export async function libraryView(actor: Actor): Promise<LibraryView> {
  const uid = user(actor);
  const [progressSnap, savedSnap, followingSnap] = await Promise.all([
    sub(uid, "progress").orderBy("updated_at", "desc").limit(12).get(),
    sub(uid, "library").orderBy("saved_at", "desc").limit(60).get(),
    sub(uid, "following").orderBy("followed_at", "desc").limit(30).get(),
  ]);
  const progressById = new Map(progressSnap.docs.map((d) => [d.id, { chapter: d.get("chapter_slug") as string, title: d.get("chapter_title") as string, fraction: d.get("fraction") as number }]));
  const ids = [...new Set([...progressSnap.docs.map((d) => d.id), ...savedSnap.docs.map((d) => d.id)])];
  const pubs = ids.length ? await db().getAll(...ids.map((id) => col.publishedDoc(id))) : [];
  const readable = new Map(
    pubs.flatMap((s) => {
      const p = s.data() as PublishedDoc | undefined;
      return p && p.live && p.visibility === "PUBLIC" ? [[s.id, p] as const] : [];
    }),
  );
  const item = (id: string, p: PublishedDoc): LibraryItem => ({
    workId: id,
    collection: p.collection,
    slug: p.slug,
    title: p.title,
    authorName: p.author_name,
    authorHandle: p.author_handle,
    progress: progressById.get(id) ?? null,
  });

  const followedUids = followingSnap.docs.map((d) => d.id);
  const [fromFollowedSnap, followedProfiles] = await Promise.all([
    followedUids.length
      ? col.published().where("listed", "==", true).where("owner_uid", "in", followedUids).orderBy("sort_at", "desc").limit(20).get()
      : null,
    followedUids.length ? col.users().where(FieldPath.documentId(), "in", followedUids).get() : null,
  ]);

  return {
    reading: progressSnap.docs.flatMap((d) => (readable.has(d.id) && (progressById.get(d.id)?.fraction ?? 0) < 0.98 ? [item(d.id, readable.get(d.id)!)] : [])),
    saved: savedSnap.docs.flatMap((d) => (readable.has(d.id) ? [item(d.id, readable.get(d.id)!)] : [])),
    fromFollowed: (fromFollowedSnap?.docs ?? []).map((d) => item(d.id, d.data() as PublishedDoc)).filter((w) => !!w),
    following: (followedProfiles?.docs ?? []).map((d) => ({ uid: d.id, handle: d.get("handle") as string, displayName: d.get("display_name") as string })),
  };
}
