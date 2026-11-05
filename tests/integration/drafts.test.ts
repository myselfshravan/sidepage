import { beforeEach, describe, expect, it } from "vitest";
import { col, type WorkDoc } from "@/server/firebase/model";
import type { Actor } from "@/server/services/actor";
import {
  checkpointChapter,
  createChapter,
  deleteChapter,
  getChapter,
  listChapters,
  listRevisions,
  reorderChapters,
  restoreRevision,
  saveChapter,
} from "@/server/services/chapters";
import { applyCommand } from "@/server/services/publishing";
import { createWork, duplicateWork, updateWorkMetadata } from "@/server/services/works";
import { clearFirestore } from "../support/emulator";

const author: Actor = { uid: "author-uid", kind: "author" };
const t0 = new Date("2026-11-05T10:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });
const work = async (id: string) => (await col.work(id).get()).data() as WorkDoc;

beforeEach(clearFirestore);

describe("works", () => {
  it("reserves unique slugs", async () => {
    const a = await createWork(author, { collection: "memoirs", title: "Home" }, t0);
    const b = await createWork(author, { collection: "fiction", title: "Home" }, t0);
    expect((await work(a.workId)).slug).toBe("home");
    expect((await work(b.workId)).slug).toBe("home-2");
    expect((await col.slug("home-2").get()).get("work_id")).toBe(b.workId);
  });

  it("validates input", async () => {
    await expect(createWork(author, { collection: "poetry", title: "x" }, t0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(createWork(author, { collection: "memoirs", title: "   " }, t0)).rejects.toMatchObject({ code: "INVALID" });
  });

  it("stores historical dates independently of record dates", async () => {
    const { workId } = await createWork(author, { collection: "memoirs", title: "Letters Home" }, t0);
    await updateWorkMetadata(
      author,
      workId,
      {
        title: "Letters Home",
        subtitle: "1994–1997",
        description: "",
        author_name: "Shravan Revanna",
        slug: "letters-home",
        content_warnings: ["grief", "grief"],
        seo_title: "",
        seo_description: "",
        timezone: "Asia/Kolkata",
        original_written_at: { year: 1994, month: 6, approximate: true },
        digitized_at: "2026-10-01T08:00:00+05:30",
      },
      at(5),
    );
    const w = await work(workId);
    expect(w.original_written_at).toEqual({ year: 1994, month: 6, approximate: true });
    expect(w.digitized_at!.toDate().toISOString()).toBe("2026-10-01T02:30:00.000Z");
    expect(w.created_at.toDate()).toEqual(t0);
    expect(w.last_edited_at.toDate()).toEqual(at(5));
    expect(w.first_published_at).toBeNull();
    expect(w.content_warnings).toEqual(["grief"]);
  });

  it("rejects impossible historical dates", async () => {
    const { workId } = await createWork(author, { collection: "memoirs", title: "X" }, t0);
    const w = await work(workId);
    await expect(
      updateWorkMetadata(author, workId, { ...meta(w.slug), original_written_at: { year: 1994, month: 2, day: 30, approximate: false } }, at(1)),
    ).rejects.toMatchObject({ code: "INVALID" });
  });

  it("locks the URL once published", async () => {
    const { workId } = await createWork(author, { collection: "memoirs", title: "Fixed" }, t0);
    const { chapterId } = await createChapter(author, workId, "One", t0);
    await saveChapter(author, { workId, chapterId, baseRev: 1, title: "One", doc: doc("text") }, t0);
    await updateWorkMetadata(author, workId, { ...meta("fixed"), slug: "fixed-renamed" }, at(1));
    expect((await col.slug("fixed").get()).exists).toBe(false);
    await applyCommand(author, workId, { type: "publish" }, at(2));
    await expect(updateWorkMetadata(author, workId, { ...meta("fixed-renamed"), slug: "again" }, at(3))).rejects.toMatchObject({ code: "INVALID" });
  });

  it("duplicates a work as a fresh draft with its chapters", async () => {
    const { workId } = await createWork(author, { collection: "fiction", title: "Original" }, t0);
    const { chapterId } = await createChapter(author, workId, "One", t0);
    await saveChapter(author, { workId, chapterId, baseRev: 1, title: "One", doc: doc("copied words") }, t0);
    await applyCommand(author, workId, { type: "publish" }, at(1));

    const copy = await duplicateWork(author, workId, at(2));
    const w = await work(copy.workId);
    expect(w).toMatchObject({ status: "DRAFT", edition_count: 0, current_edition_id: null, duplicated_from: workId, slug: "original-copy" });
    expect(w.first_published_at).toBeNull();
    const chapter = await getChapter(copy.workId, chapterId);
    expect(JSON.stringify(chapter!.doc)).toContain("copied words");
  });
});

describe("chapters and autosave", () => {
  it("saves, counts words and detects conflicting tabs", async () => {
    const { workId } = await createWork(author, { collection: "memoirs", title: "W" }, t0);
    const { chapterId } = await createChapter(author, workId, "One", t0);
    const first = await saveChapter(author, { workId, chapterId, baseRev: 1, title: "One", doc: doc("four words right here") }, t0);
    expect(first).toMatchObject({ status: "saved", rev: 2, words: 4, workWords: 4 });

    const stale = await saveChapter(author, { workId, chapterId, baseRev: 1, title: "One", doc: doc("other tab") }, at(1));
    expect(stale).toMatchObject({ status: "conflict", serverRev: 2 });
    expect(JSON.stringify((await getChapter(workId, chapterId))!.doc)).toContain("four words");
  });

  it("rejects invalid manuscript JSON", async () => {
    const { workId } = await createWork(author, { collection: "memoirs", title: "W" }, t0);
    const { chapterId } = await createChapter(author, workId, "One", t0);
    await expect(
      saveChapter(author, { workId, chapterId, baseRev: 1, title: "One", doc: { type: "doc", content: [{ type: "script" }] } }, t0),
    ).rejects.toThrow(/not allowed/);
  });

  it("keeps automatic revisions on a cadence, plus explicit checkpoints", async () => {
    const { workId } = await createWork(author, { collection: "memoirs", title: "W" }, t0);
    const { chapterId } = await createChapter(author, workId, "One", t0);
    let rev = 1;
    for (const [minute, text] of [[0, "a"], [1, "a b"], [2, "a b c"], [12, "a b c d"]] as const) {
      const r = await saveChapter(author, { workId, chapterId, baseRev: rev, title: "One", doc: doc(text) }, at(minute));
      if (r.status !== "saved") throw new Error("conflict");
      rev = r.rev;
    }
    // First save (no prior revision) and the one 12 minutes later.
    expect((await listRevisions(workId, chapterId)).map((r) => r.kind)).toEqual(["AUTO", "AUTO"]);
    await checkpointChapter(author, workId, chapterId, at(13));
    expect((await listRevisions(workId, chapterId))[0]!.kind).toBe("CHECKPOINT");
  });

  it("restores a revision and keeps the replaced draft", async () => {
    const { workId } = await createWork(author, { collection: "memoirs", title: "W" }, t0);
    const { chapterId } = await createChapter(author, workId, "One", t0);
    await saveChapter(author, { workId, chapterId, baseRev: 1, title: "One", doc: doc("original version") }, t0);
    const [original] = await listRevisions(workId, chapterId);
    await saveChapter(author, { workId, chapterId, baseRev: 2, title: "One", doc: doc("rewritten version") }, at(1));

    const { rev } = await restoreRevision(author, { workId, chapterId, revisionId: original!.id, baseRev: 3 }, at(2));
    expect(rev).toBe(4);
    expect(JSON.stringify((await getChapter(workId, chapterId))!.doc)).toContain("original version");
    const kinds = (await listRevisions(workId, chapterId)).map((r) => r.kind);
    expect(kinds[0]).toBe("BEFORE_RESTORE");
  });

  it("reorders only with a full permutation and deletes cleanly", async () => {
    const { workId } = await createWork(author, { collection: "fiction", title: "W" }, t0);
    const a = await createChapter(author, workId, "Alpha", t0);
    const b = await createChapter(author, workId, "Beta", t0);
    await saveChapter(author, { workId, chapterId: b.chapterId, baseRev: 1, title: "Beta", doc: doc("two words") }, t0);
    await reorderChapters(author, workId, [b.chapterId, a.chapterId], at(1));
    expect((await listChapters(workId, (await work(workId)).chapter_order)).map((c) => c.slug)).toEqual(["beta", "alpha"]);
    await expect(reorderChapters(author, workId, [a.chapterId], at(2))).rejects.toMatchObject({ code: "CONFLICT" });

    await deleteChapter(author, workId, b.chapterId, at(3));
    const w = await work(workId);
    expect(w.chapter_order).toEqual([a.chapterId]);
    expect(w.word_count).toBe(0);
    expect((await col.revisions(workId, b.chapterId).get()).empty).toBe(true);
  });

  it("gives chapters unique slugs", async () => {
    const { workId } = await createWork(author, { collection: "fiction", title: "W" }, t0);
    await createChapter(author, workId, "Interlude", t0);
    const second = await createChapter(author, workId, "Interlude", t0);
    expect((await getChapter(workId, second.chapterId))!.slug).toBe("interlude-2");
  });

  it("blocks editing while scheduled or archived", async () => {
    const { workId } = await createWork(author, { collection: "fiction", title: "W" }, t0);
    const { chapterId } = await createChapter(author, workId, "One", t0);
    await saveChapter(author, { workId, chapterId, baseRev: 1, title: "One", doc: doc("x") }, t0);
    await applyCommand(author, workId, { type: "schedule", at: at(60) }, t0);
    await expect(saveChapter(author, { workId, chapterId, baseRev: 2, title: "One", doc: doc("y") }, at(1))).rejects.toMatchObject({
      code: "INVALID_TRANSITION",
    });
  });
});

function meta(slug: string) {
  return {
    title: "Title",
    subtitle: "",
    description: "",
    author_name: "Shravan Revanna",
    slug,
    content_warnings: [],
    seo_title: "",
    seo_description: "",
    timezone: "Asia/Kolkata",
    original_written_at: null,
    digitized_at: null,
  };
}
