import "server-only";
import { Timestamp } from "@google-cloud/firestore";
import { z } from "zod";
import { canAdminister } from "@/domain/access/policy";
import { AppError } from "../errors";
import { db } from "../firebase/admin";
import { col, type CommentDoc, type PersonaDoc, type PublishedDoc, type UserDoc, type WorkDoc } from "../firebase/model";
import type { Actor } from "./actor";
import { parseInput } from "./works";

// Comments on chapters of public works. Each one is posted by a signed-in person, at
// the moment they post it.
//
// Identity: readers appear under their own profile. When the work's owner posts, the
// comment appears under the work's *byline*: the persona or pen name, or "Author" for
// anonymous works. That way an author writing under a pen name can never reply as
// themselves by accident. The commenter's account id is stored but never returned.

const MAX_BODY = 2000;
const PAGE = 200;

const bodySchema = z.string().trim().min(1, "Write something first.").max(MAX_BODY, `Keep comments under ${MAX_BODY} characters.`);
const idSchema = z.string().min(1).max(128).regex(/^[A-Za-z0-9_-]+$/);
const chapterSchema = z.string().min(1).max(120);

async function readablePublished(workId: string): Promise<PublishedDoc> {
  const pub = (await col.publishedDoc(workId).get()).data() as PublishedDoc | undefined;
  if (!pub || !pub.live || pub.visibility !== "PUBLIC") throw new AppError("NOT_FOUND", "That publication isn't open for comments.");
  return pub;
}

async function chapterExists(pub: PublishedDoc, chapterSlug: string): Promise<boolean> {
  const edition = await col.edition(pub.current_edition_id).get();
  return ((edition.get("toc") as { slug: string }[] | undefined) ?? []).some((t) => t.slug === chapterSlug);
}

/** How the poster is shown: their profile, or the work's byline when they own the work. */
async function identityFor(actor: Actor & { kind: "user" }, work: WorkDoc): Promise<{ display_name: string; display_handle: string; is_author: boolean }> {
  if (work.owner_uid === actor.uid) {
    if (work.byline === "persona" && work.persona_id) {
      const persona = (await col.persona(work.persona_id).get()).data() as PersonaDoc | undefined;
      return { display_name: persona?.display_name ?? work.author_name, display_handle: persona?.handle ?? "", is_author: true };
    }
    if (work.byline === "pen_name") return { display_name: work.author_name, display_handle: "", is_author: true };
    if (work.byline === "anonymous") return { display_name: "Author", display_handle: "", is_author: true };
  }
  const user = (await col.user(actor.uid).get()).data() as UserDoc | undefined;
  if (!user) throw new AppError("UNAUTHENTICATED", "Your profile no longer exists.");
  return { display_name: user.display_name, display_handle: user.handle, is_author: work.owner_uid === actor.uid };
}

function userActor(actor: Actor): Actor & { kind: "user" } {
  if (actor.kind !== "user") throw new AppError("FORBIDDEN", "Sign in to comment.");
  return actor;
}

export const commentInput = z.object({ workId: idSchema, chapterSlug: chapterSchema, body: bodySchema, parentId: idSchema.nullable().default(null) });

export async function postComment(actorIn: Actor, input: unknown, now = new Date()): Promise<{ id: string }> {
  const actor = userActor(actorIn);
  const data = parseInput(commentInput, input);
  const pub = await readablePublished(data.workId);
  if (!(await chapterExists(pub, data.chapterSlug))) throw new AppError("NOT_FOUND", "That chapter doesn't exist.");
  if (data.parentId) {
    const parent = (await col.comment(data.parentId).get()).data() as CommentDoc | undefined;
    if (!parent || parent.work_id !== data.workId || parent.chapter_slug !== data.chapterSlug || parent.status !== "visible") {
      throw new AppError("NOT_FOUND", "That comment no longer exists.");
    }
    if (parent.parent_id) throw new AppError("INVALID", "Reply to the original comment instead.");
  }
  const work = (await col.work(data.workId).get()).data() as WorkDoc;
  const who = await identityFor(actor, work);
  const ref = col.comments().doc();
  await ref.create({
    work_id: data.workId,
    chapter_slug: data.chapterSlug,
    parent_id: data.parentId,
    body: data.body,
    author_uid: actor.uid,
    ...who,
    pinned: false,
    status: "visible",
    created_at: Timestamp.fromDate(now),
    moderated_by: null,
  } satisfies CommentDoc);
  return { id: ref.id };
}

/** An author's note pinned to the top of a chapter's comments, posted under the work's byline. */
export async function postAuthorNote(actorIn: Actor, input: unknown, now = new Date()): Promise<{ id: string }> {
  const actor = userActor(actorIn);
  const data = parseInput(commentInput.omit({ parentId: true }), input);
  const work = (await col.work(data.workId).get()).data() as WorkDoc | undefined;
  if (!work || work.owner_uid !== actor.uid) throw new AppError("NOT_FOUND", "That publication doesn't exist.");
  const { id } = await postComment(actor, { ...data, parentId: null }, now);
  await col.comment(id).update({ pinned: true });
  return { id };
}

export type PublicComment = {
  id: string;
  parentId: string | null;
  body: string;
  name: string;
  handle: string;
  isAuthor: boolean;
  pinned: boolean;
  createdAt: string;
  /** Only for the viewer: whether they wrote it / may moderate it. */
  mine: boolean;
  canModerate: boolean;
};

/** Visible comments on a chapter, oldest first, pinned notes on top. Never returns account ids. */
export async function listComments(viewer: Actor | null, workId: unknown, chapterSlug: unknown): Promise<{ comments: PublicComment[]; canModerate: boolean; open: boolean }> {
  const wid = parseInput(idSchema, workId);
  const slug = parseInput(chapterSchema, chapterSlug);
  const pub = (await col.publishedDoc(wid).get()).data() as PublishedDoc | undefined;
  if (!pub || !pub.live || pub.visibility !== "PUBLIC") return { comments: [], canModerate: false, open: false };
  const work = (await col.work(wid).get()).data() as WorkDoc | undefined;
  const moderator = !!viewer && viewer.kind === "user" && !!work && (work.owner_uid === viewer.uid || canAdminister(viewer));
  const snap = await col.comments().where("work_id", "==", wid).where("chapter_slug", "==", slug).orderBy("created_at", "asc").limit(PAGE).get();
  const comments = snap.docs
    .map((d) => [d.id, d.data() as CommentDoc] as const)
    .filter(([, c]) => c.status === "visible")
    .map(([id, c]) => ({
      id,
      parentId: c.parent_id,
      body: c.body,
      name: c.display_name,
      handle: c.display_handle,
      isAuthor: c.is_author,
      pinned: c.pinned,
      createdAt: c.created_at.toDate().toISOString(),
      mine: !!viewer && c.author_uid === viewer.uid,
      canModerate: moderator,
    }))
    .sort((a, b) => Number(b.pinned) - Number(a.pinned));
  return { comments, canModerate: moderator, open: true };
}

/** Hide (moderate) or delete (own) a comment. Replies to it disappear with it. */
export async function removeComment(actorIn: Actor, commentId: unknown): Promise<void> {
  const actor = userActor(actorIn);
  const id = parseInput(idSchema, commentId);
  await db().runTransaction(async (tx) => {
    const ref = col.comment(id);
    const c = (await tx.get(ref)).data() as CommentDoc | undefined;
    if (!c || c.status !== "visible") throw new AppError("NOT_FOUND", "That comment doesn't exist.");
    const work = (await tx.get(col.work(c.work_id))).data() as WorkDoc | undefined;
    const own = c.author_uid === actor.uid;
    const moderator = !!work && (work.owner_uid === actor.uid || canAdminister(actor));
    if (!own && !moderator) throw new AppError("NOT_FOUND", "That comment doesn't exist.");
    tx.update(ref, { status: own ? "deleted" : "hidden", moderated_by: own ? null : actor.uid, pinned: false });
  });
}

export type CommentSummary = PublicComment & { chapterSlug: string; status: CommentDoc["status"] };

/** All comments on a work, newest first, for the owner's moderation view and agents. */
export async function listWorkComments(actorIn: Actor, workId: unknown): Promise<CommentSummary[]> {
  const actor = userActor(actorIn);
  const wid = parseInput(idSchema, workId);
  const work = (await col.work(wid).get()).data() as WorkDoc | undefined;
  if (!work || (work.owner_uid !== actor.uid && !canAdminister(actor))) throw new AppError("NOT_FOUND", "That publication doesn't exist.");
  const snap = await col.comments().where("work_id", "==", wid).orderBy("created_at", "desc").limit(PAGE).get();
  return snap.docs.map((d) => {
    const c = d.data() as CommentDoc;
    return {
      id: d.id,
      parentId: c.parent_id,
      body: c.body,
      name: c.display_name,
      handle: c.display_handle,
      isAuthor: c.is_author,
      pinned: c.pinned,
      createdAt: c.created_at.toDate().toISOString(),
      mine: c.author_uid === actor.uid,
      canModerate: true,
      chapterSlug: c.chapter_slug,
      status: c.status,
    };
  });
}
