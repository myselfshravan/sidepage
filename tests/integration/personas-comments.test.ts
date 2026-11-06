import { beforeEach, describe, expect, it } from "vitest";
import { col, type CommentDoc, type PublishedDoc } from "@/server/firebase/model";
import type { Actor } from "@/server/services/actor";
import { createChapter, saveChapter } from "@/server/services/chapters";
import { listComments, listWorkComments, postAuthorNote, postComment, removeComment } from "@/server/services/comments";
import { createPersona, listPersonas, updatePersona } from "@/server/services/personas";
import { applyCommand } from "@/server/services/publishing";
import { libraryView, setFollowing } from "@/server/services/reader";
import { ensureUser } from "@/server/services/users";
import { createWork, setVisibility, updateWorkMetadata } from "@/server/services/works";
import { getPublicAuthor, getPublicWork, listPublicWorks, listPublicWorksByAuthor } from "@/server/read/public";
import { clearFirestore } from "../support/emulator";

const t0 = new Date("2026-11-06T10:00:00Z");
const shravan: Actor = { uid: "shravan", kind: "user", role: "admin" };
const bob: Actor = { uid: "bob", kind: "user", role: "author" };
const rae: Actor = { uid: "rae", kind: "user", role: "reader" };
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const meta = (slug: string, extra: Record<string, unknown>) => ({
  title: "Thorns",
  subtitle: "",
  description: "",
  byline: "profile",
  author_name: "",
  persona_id: null,
  slug,
  content_warnings: [],
  seo_title: "",
  seo_description: "",
  timezone: "UTC",
  original_written_at: null,
  digitized_at: null,
  ...extra,
});

async function personaWork(actor: Actor, personaId: string, title: string, effectiveAt?: Date) {
  const { workId } = await createWork(actor, { collection: "fiction", title }, t0);
  const slug = (await col.work(workId).get()).get("slug") as string;
  await updateWorkMetadata(actor, workId, meta(slug, { title, byline: "persona", persona_id: personaId }), t0);
  const { chapterId } = await createChapter(actor, workId, "One", t0);
  await saveChapter(actor, { workId, chapterId, baseRev: 1, title: "One", doc: doc(`${title} words`) }, t0);
  await applyCommand(actor, workId, { type: "publish", ...(effectiveAt ? { effectiveAt } : {}) }, t0);
  return { workId, slug };
}

beforeEach(async () => {
  await clearFirestore();
  for (const [uid, role, name] of [["shravan", "admin", "Shravan Revanna"], ["bob", "author", "Bob Writer"], ["rae", "reader", "Rae Reader"]] as const) {
    await ensureUser({ uid, email: `${uid}@example.test`, name }, t0);
    await col.user(uid).update({ role });
  }
});

describe("personas", () => {
  it("credit works to a persona page that reveals nothing about the account", async () => {
    const vale = await createPersona(shravan, { display_name: "Mara Vale", bio: "Writes in the dark." }, t0);
    const ink = await createPersona(shravan, { display_name: "Ink Hollow" }, t0);
    const first = await personaWork(shravan, vale.id, "Thorns", new Date("2009-02-14T00:00:00Z"));
    const second = await personaWork(shravan, vale.id, "Velvet Debt", new Date("2011-06-01T00:00:00Z"));
    await personaWork(shravan, ink.id, "Other Name", new Date("2015-01-01T00:00:00Z"));

    const author = await getPublicAuthor("mara-vale");
    expect(author).toEqual({ kind: "persona", followKey: `persona:${vale.id}`, handle: "mara-vale", displayName: "Mara Vale", bio: "Writes in the dark." });
    const works = await listPublicWorksByAuthor(author!.followKey);
    expect(works.map((w) => w.workId)).toEqual([second.workId, first.workId]); // backdated catalogue, newest first
    expect(works[1]!.firstPublishedAt).toBe("2009-02-14T00:00:00.000Z");

    // Nothing public mentions the account.
    const surfaces = JSON.stringify([author, works, await getPublicWork("fiction", first.slug), await listPublicWorks(null)]);
    for (const leak of ["shravan", "Shravan", "Revanna"]) expect(surfaces).not.toContain(leak);
    const pub = (await col.publishedDoc(first.workId).get()).data() as PublishedDoc;
    expect(pub).toMatchObject({ public_author_uid: null, public_persona_id: vale.id, author_handle: "mara-vale", author_name: "Mara Vale" });

    // The account's own author page shows none of the persona's work.
    expect(await listPublicWorksByAuthor("shravan")).toHaveLength(0);
    // And personas don't list each other's work.
    expect((await listPublicWorksByAuthor(`persona:${ink.id}`)).map((w) => w.title)).toEqual(["Other Name"]);
  });

  it("are private to their owner", async () => {
    const vale = await createPersona(shravan, { display_name: "Mara Vale" }, t0);
    expect((await listPersonas(bob)).length).toBe(0);
    await expect(updatePersona(bob, vale.id, { display_name: "Stolen" }, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { workId } = await createWork(bob, { collection: "fiction", title: "Bob's" }, t0);
    const slug = (await col.work(workId).get()).get("slug") as string;
    await expect(updateWorkMetadata(bob, workId, meta(slug, { byline: "persona", persona_id: vale.id }), t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(createPersona(rae, { display_name: "Reader persona" }, t0)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("rename everywhere they are credited, and keep handles unique", async () => {
    const vale = await createPersona(shravan, { display_name: "Mara Vale" }, t0);
    const { workId } = await personaWork(shravan, vale.id, "Thorns");
    await expect(createPersona(shravan, { display_name: "Copy", handle: "mara-vale" }, t0)).rejects.toMatchObject({ code: "CONFLICT" });
    await updatePersona(shravan, vale.id, { display_name: "M. Vale", handle: "m-vale" }, t0);
    expect((await col.publishedDoc(workId).get()).data()).toMatchObject({ author_name: "M. Vale", author_handle: "m-vale" });
    expect(await getPublicAuthor("m-vale")).toMatchObject({ displayName: "M. Vale" });
    expect((await col.handle("mara-vale").get()).exists).toBe(false);
  });

  it("can be followed, feeding the reader's library", async () => {
    const vale = await createPersona(shravan, { display_name: "Mara Vale" }, t0);
    const { workId } = await personaWork(shravan, vale.id, "Thorns");
    await setFollowing(rae, `persona:${vale.id}`, true, t0);
    const view = await libraryView(rae);
    expect(view.fromFollowed.map((w) => w.workId)).toEqual([workId]);
    expect(view.following).toEqual([{ uid: `persona:${vale.id}`, handle: "mara-vale", displayName: "Mara Vale" }]);
    await expect(setFollowing(rae, "persona:nope", true, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("comments", () => {
  it("show readers under their profile and the owner under the work's byline", async () => {
    const vale = await createPersona(shravan, { display_name: "Mara Vale" }, t0);
    const { workId } = await personaWork(shravan, vale.id, "Thorns");
    const { id: readerComment } = await postComment(rae, { workId, chapterSlug: "one", body: "This wrecked me." }, t0);
    await postComment(shravan, { workId, chapterSlug: "one", body: "Thank you for reading.", parentId: readerComment }, new Date(t0.getTime() + 60_000));
    await postAuthorNote(shravan, { workId, chapterSlug: "one", body: "Written when I was fourteen." }, new Date(t0.getTime() + 120_000));

    const { comments } = await listComments(null, workId, "one");
    expect(comments.map((c) => [c.name, c.handle, c.isAuthor, c.pinned])).toEqual([
      ["Mara Vale", "mara-vale", true, true],
      ["Rae Reader", "rae-reader", false, false],
      ["Mara Vale", "mara-vale", true, false],
    ]);
    const exposed = JSON.stringify(comments);
    for (const leak of ["shravan", "Shravan", "author_uid", '"rae"']) expect(exposed).not.toContain(leak);
    // Stored with the real account, server-side only.
    const stored = (await col.comment(readerComment).get()).data() as CommentDoc;
    expect(stored.author_uid).toBe("rae");
  });

  it("show 'Author' on anonymous works", async () => {
    const { workId } = await createWork(shravan, { collection: "fiction", title: "Unsigned" }, t0);
    const slug = (await col.work(workId).get()).get("slug") as string;
    await updateWorkMetadata(shravan, workId, meta(slug, { title: "Unsigned", byline: "anonymous" }), t0);
    const { chapterId } = await createChapter(shravan, workId, "One", t0);
    await saveChapter(shravan, { workId, chapterId, baseRev: 1, title: "One", doc: doc("words") }, t0);
    await applyCommand(shravan, workId, { type: "publish" }, t0);
    await postComment(shravan, { workId, chapterSlug: "one", body: "Hello." }, t0);
    expect((await listComments(null, workId, "one")).comments[0]).toMatchObject({ name: "Author", handle: "", isAuthor: true });
  });

  it("are only allowed on public chapters, by signed-in people, within limits", async () => {
    const vale = await createPersona(shravan, { display_name: "Mara Vale" }, t0);
    const { workId } = await personaWork(shravan, vale.id, "Thorns");
    await expect(postComment(rae, { workId, chapterSlug: "nope", body: "x" }, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(postComment(rae, { workId, chapterSlug: "one", body: "   " }, t0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(postComment(rae, { workId, chapterSlug: "one", body: "x".repeat(2001) }, t0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(postComment({ uid: "system:scheduler", kind: "system", role: null }, { workId, chapterSlug: "one", body: "x" }, t0)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const { id } = await postComment(rae, { workId, chapterSlug: "one", body: "first" }, t0);
    const { id: reply } = await postComment(bob, { workId, chapterSlug: "one", body: "reply", parentId: id }, t0);
    await expect(postComment(rae, { workId, chapterSlug: "one", body: "nested", parentId: reply }, t0)).rejects.toMatchObject({ code: "INVALID" });

    await setVisibility(shravan, workId, "PRIVATE", t0);
    await expect(postComment(rae, { workId, chapterSlug: "one", body: "x" }, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await listComments(null, workId, "one")).toMatchObject({ comments: [], open: false });
  });

  it("are moderated by the owner or an admin; readers delete only their own", async () => {
    const vale = await createPersona(shravan, { display_name: "Mara Vale" }, t0);
    const { workId } = await personaWork(shravan, vale.id, "Thorns");
    const { id: a } = await postComment(rae, { workId, chapterSlug: "one", body: "mine" }, t0);
    const { id: b } = await postComment(bob, { workId, chapterSlug: "one", body: "bob's" }, t0);
    await expect(removeComment(rae, b)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(postAuthorNote(bob, { workId, chapterSlug: "one", body: "not my work" }, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await removeComment(rae, a);
    await removeComment(shravan, b);
    expect((await listComments(null, workId, "one")).comments).toHaveLength(0);
    const all = await listWorkComments(shravan, workId);
    expect(all.map((c) => c.status).sort()).toEqual(["deleted", "hidden"]);
    await expect(listWorkComments(bob, workId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
