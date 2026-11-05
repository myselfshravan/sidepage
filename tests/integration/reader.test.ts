import { beforeEach, describe, expect, it } from "vitest";
import { col } from "@/server/firebase/model";
import type { Actor } from "@/server/services/actor";
import { createChapter, saveChapter } from "@/server/services/chapters";
import { applyCommand } from "@/server/services/publishing";
import { addBookmark, libraryView, readerState, removeBookmark, saveProgress, setFollowing, setSaved } from "@/server/services/reader";
import { ensureUser } from "@/server/services/users";
import { createWork, setVisibility } from "@/server/services/works";
import { clearFirestore } from "../support/emulator";

const t0 = new Date("2026-11-06T10:00:00Z");
const author: Actor = { uid: "alice", kind: "user", role: "author" };
const rae: Actor = { uid: "rae", kind: "user", role: "reader" };
const sam: Actor = { uid: "sam", kind: "user", role: "reader" };
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function published(title = "Open Book") {
  const { workId } = await createWork(author, { collection: "fiction", title }, t0);
  const { chapterId } = await createChapter(author, workId, "One", t0);
  await saveChapter(author, { workId, chapterId, baseRev: 1, title: "One", doc: doc("words") }, t0);
  await applyCommand(author, workId, { type: "publish" }, t0);
  return workId;
}

beforeEach(async () => {
  await clearFirestore();
  await ensureUser({ uid: "alice", email: "alice@example.test", name: "Alice" }, t0);
  await col.user("alice").update({ role: "author" });
  await ensureUser({ uid: "rae", email: "rae@example.test", name: "Rae" }, t0);
  await ensureUser({ uid: "sam", email: "sam@example.test", name: "Sam" }, t0);
});

describe("reader data", () => {
  it("keeps progress, bookmarks and saves per reader", async () => {
    const workId = await published();
    await saveProgress(rae, { workId, chapterSlug: "one", chapterTitle: "One", fraction: 0.4 }, t0);
    const { id } = await addBookmark(rae, { workId, chapterSlug: "one", chapterTitle: "One", block: "b-0", excerpt: "words" }, t0);
    await setSaved(rae, workId, true, t0);

    const mine = await readerState(rae, workId);
    expect(mine).toMatchObject({ progress: { chapter: "one", fraction: 0.4 }, saved: true });
    expect(mine.bookmarks.map((b) => b.id)).toEqual([id]);

    const theirs = await readerState(sam, workId);
    expect(theirs).toMatchObject({ progress: null, bookmarks: [], saved: false });

    // Sam can't remove Rae's bookmark: removal only ever touches the actor's own documents.
    await removeBookmark(sam, id);
    expect((await readerState(rae, workId)).bookmarks).toHaveLength(1);
    await removeBookmark(rae, id);
    expect((await readerState(rae, workId)).bookmarks).toHaveLength(0);
  });

  it("refuses reader writes for works that aren't publicly readable", async () => {
    const workId = await published();
    await setVisibility(author, workId, "PRIVATE", t0);
    await expect(saveProgress(rae, { workId, chapterSlug: "one", chapterTitle: "One", fraction: 0.1 }, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setSaved(rae, workId, true, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    const { workId: draftId } = await createWork(author, { collection: "memoirs", title: "Draft" }, t0);
    await expect(addBookmark(rae, { workId: draftId, chapterSlug: "x", chapterTitle: "X", block: "b-0", excerpt: "" }, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("validates progress input", async () => {
    const workId = await published();
    await expect(saveProgress(rae, { workId, chapterSlug: "one", chapterTitle: "One", fraction: 3 }, t0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(addBookmark(rae, { workId, chapterSlug: "one", chapterTitle: "One", block: "<script>", excerpt: "" }, t0)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("follows authors only, and builds the library from readable works", async () => {
    const workId = await published("First");
    await expect(setFollowing(rae, "sam", true, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(setFollowing(rae, "rae", true, t0)).rejects.toMatchObject({ code: "INVALID" });
    await setFollowing(rae, "alice", true, t0);
    await saveProgress(rae, { workId, chapterSlug: "one", chapterTitle: "One", fraction: 0.5 }, t0);
    await setSaved(rae, workId, true, t0);

    let view = await libraryView(rae);
    expect(view.reading.map((w) => w.workId)).toEqual([workId]);
    expect(view.saved.map((w) => w.workId)).toEqual([workId]);
    expect(view.fromFollowed.map((w) => w.workId)).toEqual([workId]);
    expect(view.following.map((a) => a.handle)).toEqual(["alice"]);

    // Withdrawn work disappears from the library everywhere.
    await applyCommand(author, workId, { type: "withdraw" }, t0);
    view = await libraryView(rae);
    expect(view.reading).toHaveLength(0);
    expect(view.saved).toHaveLength(0);
    expect(view.fromFollowed).toHaveLength(0);
  });
});
