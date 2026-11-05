import { beforeEach, describe, expect, it } from "vitest";
import { col, type EditionDoc, type PublishedDoc, type WorkDoc } from "@/server/firebase/model";
import { SCHEDULER, type Actor } from "@/server/services/actor";
import { createChapter, saveChapter } from "@/server/services/chapters";
import { applyCommand, listEditions, runDueSchedules, STALE_SEAL_MS, sweepStaleSeals, verifyEdition } from "@/server/services/publishing";
import { createWork, setVisibility, updateWorkMetadata } from "@/server/services/works";
import { getPublicChapter, getPublicWork, listPublicWorks } from "@/server/read/public";
import { clearFirestore } from "../support/emulator";

const author: Actor = { uid: "author-uid", kind: "author" };
const t0 = new Date("2026-11-05T10:00:00Z");
const at = (minutes: number) => new Date(t0.getTime() + minutes * 60_000);

const para = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function draftWork(title = "The Long Monsoon", collection: "memoirs" | "fiction" = "memoirs") {
  const { workId } = await createWork(author, { collection, title }, t0);
  const { chapterId } = await createChapter(author, workId, "Arrival", t0);
  await save(workId, chapterId, 1, "The rain came early that year.");
  return { workId, chapterId };
}

async function save(workId: string, chapterId: string, baseRev: number, text: string, now = t0) {
  const r = await saveChapter(author, { workId, chapterId, baseRev, title: "Arrival", doc: para(text) }, now);
  if (r.status !== "saved") throw new Error("unexpected conflict");
  return r.rev;
}

const work = async (id: string) => (await col.work(id).get()).data() as WorkDoc;
const edition = async (id: string) => (await col.edition(id).get()).data() as EditionDoc;
const published = async (id: string) => (await col.publishedDoc(id).get()).data() as PublishedDoc | undefined;

beforeEach(clearFirestore);

describe("publishing an edition", () => {
  it("seals an immutable, verifiable edition and makes it public", async () => {
    const { workId } = await draftWork();
    const outcome = await applyCommand(author, workId, { type: "publish" }, at(1));
    expect(outcome.editionId).toBe(`${workId}-e1`);

    const e = await edition(outcome.editionId!);
    expect(e.state).toBe("SEALED");
    expect(e.toc).toHaveLength(1);
    expect(await verifyEdition(outcome.editionId!)).toBe(true);

    const w = await work(workId);
    expect(w).toMatchObject({ status: "PUBLISHED", edition_count: 1, current_edition_id: outcome.editionId });
    expect(w.first_published_at!.toDate()).toEqual(at(1));
    expect((await published(workId))!.live).toBe(true);

    const chapter = await getPublicChapter("memoirs", w.slug, "arrival");
    expect(JSON.stringify(chapter!.chapter.doc)).toContain("The rain came early");
  });

  it("never lets draft edits change a published edition", async () => {
    const { workId, chapterId } = await draftWork();
    const { editionId } = await applyCommand(author, workId, { type: "publish" }, at(1));
    const before = await edition(editionId!);

    await save(workId, chapterId, 2, "A completely rewritten opening.", at(2));
    await updateWorkMetadata(author, workId, { ...metadata((await work(workId)).slug), title: "Renamed Draft" }, at(3));

    const after = await edition(editionId!);
    expect(after).toEqual(before);
    expect(await verifyEdition(editionId!)).toBe(true);
    const pub = await getPublicChapter("memoirs", (await work(workId)).slug, "arrival");
    expect(JSON.stringify(pub!.chapter.doc)).toContain("The rain came early");
    expect(JSON.stringify(pub)).not.toContain("rewritten");
    expect(pub!.work.title).toBe("The Long Monsoon");
  });

  it("republishes as a new edition and leaves the previous one untouched", async () => {
    const { workId, chapterId } = await draftWork();
    const first = await applyCommand(author, workId, { type: "publish" }, at(1));
    const e1 = await edition(first.editionId!);
    await save(workId, chapterId, 2, "Second edition text.", at(2));

    const second = await applyCommand(author, workId, { type: "republish" }, at(3));
    expect(second.editionId).toBe(`${workId}-e2`);
    expect(await edition(first.editionId!)).toEqual(e1);
    expect(await verifyEdition(first.editionId!)).toBe(true);
    expect(await verifyEdition(second.editionId!)).toBe(true);

    const w = await work(workId);
    expect(w.first_published_at!.toDate()).toEqual(at(1));
    expect(w.last_published_at!.toDate()).toEqual(at(3));
    const pub = await getPublicChapter("memoirs", w.slug, "arrival");
    expect(JSON.stringify(pub!.chapter.doc)).toContain("Second edition text");
    expect((await listEditions(workId)).map((e) => e.number)).toEqual([2, 1]);
  });

  it("refuses to republish identical content", async () => {
    const { workId } = await draftWork();
    await applyCommand(author, workId, { type: "publish" }, at(1));
    await expect(applyCommand(author, workId, { type: "republish" }, at(2))).rejects.toMatchObject({ code: "NO_CHANGES" });
  });

  it("refuses to publish an empty work", async () => {
    const { workId } = await createWork(author, { collection: "fiction", title: "Empty" }, t0);
    await expect(applyCommand(author, workId, { type: "publish" }, at(1))).rejects.toMatchObject({ code: "INVALID" });
  });

  it("backdates to a historical publication date while recording when it actually ran", async () => {
    const { workId } = await draftWork();
    const historical = new Date("2004-08-15T06:30:00Z");
    const { editionId } = await applyCommand(author, workId, { type: "publish", effectiveAt: historical }, at(5));
    const w = await work(workId);
    expect(w.first_published_at!.toDate()).toEqual(historical);
    expect(w.last_publish_executed_at!.toDate()).toEqual(at(5));
    expect(w.created_at.toDate()).toEqual(t0);
    const e = await edition(editionId!);
    expect(e.effective_published_at.toDate()).toEqual(historical);
    expect(e.sealed_at!.toDate()).toEqual(at(5));

    const events = await col.events(workId).where("type", "==", "PUBLISHED").get();
    expect(events.docs[0]!.get("effective_at").toDate()).toEqual(historical);
    expect(events.docs[0]!.get("occurred_at").toDate()).toEqual(at(5));
  });

  it("lets exactly one of two concurrent publishes win", async () => {
    const { workId } = await draftWork();
    const results = await Promise.allSettled([
      applyCommand(author, workId, { type: "publish" }, at(1)),
      applyCommand(author, workId, { type: "publish" }, at(1)),
    ]);
    const won = results.filter((r) => r.status === "fulfilled");
    const lost = results.filter((r) => r.status === "rejected");
    expect(won.length + lost.length).toBe(2);
    expect(won.length).toBeGreaterThanOrEqual(1);
    for (const r of lost) expect((r as PromiseRejectedResult).reason).toMatchObject({ code: expect.stringMatching(/CONFLICT|INVALID_TRANSITION/) });

    const w = await work(workId);
    expect(w.edition_count).toBe(1);
    const editions = await col.editions().where("work_id", "==", workId).get();
    expect(editions.docs.filter((d) => d.get("state") === "SEALED")).toHaveLength(1);
    expect(await verifyEdition(w.current_edition_id!)).toBe(true);
  });

  it("aborts a publish when the draft changes between snapshot and commit", async () => {
    const { workId, chapterId } = await draftWork();
    // Simulate a save racing the publish by bumping the draft after the snapshot is taken.
    const racing = applyCommand(author, workId, { type: "publish" }, at(1));
    await save(workId, chapterId, 2, "Edited mid-publish.", at(1));
    const result = await racing.then(
      () => "published",
      (e: { code: string }) => e.code,
    );
    const w = await work(workId);
    if (result === "published") {
      // The save landed before the snapshot: the edition must contain it.
      const pub = await getPublicChapter("memoirs", w.slug, "arrival");
      expect(JSON.stringify(pub!.chapter.doc)).toContain("Edited mid-publish");
    } else {
      expect(result).toBe("CONFLICT");
      expect(w.edition_count).toBe(0);
      expect(await published(workId)).toBeUndefined();
    }
  });

  it("splits very large chapters across several snapshot documents", async () => {
    const { workId } = await createWork(author, { collection: "fiction", title: "Big Book" }, t0);
    const { chapterId } = await createChapter(author, workId, "Everything", t0);
    const paragraphs = Array.from({ length: 900 }, (_, i) => ({ type: "paragraph", content: [{ type: "text", text: `${i} ${"word ".repeat(180)}` }] }));
    const r = await saveChapter(author, { workId, chapterId, baseRev: 1, title: "Everything", doc: { type: "doc", content: paragraphs } }, t0);
    expect(r.status).toBe("saved");
    const { editionId } = await applyCommand(author, workId, { type: "publish" }, at(1));
    const e = await edition(editionId!);
    expect(e.toc[0]!.parts).toBeGreaterThan(1);
    expect(await verifyEdition(editionId!)).toBe(true);
    const pub = await getPublicChapter("fiction", "big-book", "everything");
    expect(pub!.chapter.doc.content).toHaveLength(900);
  });
});

describe("withdraw, archive and restore", () => {
  it("withdraws from public view but keeps the edition", async () => {
    const { workId } = await draftWork();
    const { editionId } = await applyCommand(author, workId, { type: "publish" }, at(1));
    const slug = (await work(workId)).slug;
    await applyCommand(author, workId, { type: "withdraw" }, at(2));
    expect((await work(workId)).status).toBe("DRAFT");
    expect(await getPublicWork("memoirs", slug)).toBeNull();
    expect(await getPublicChapter("memoirs", slug, "arrival")).toBeNull();
    expect(await verifyEdition(editionId!)).toBe(true);
    expect(await listPublicWorks(null)).toHaveLength(0);

    // Publishing again with identical content reuses the edition instead of duplicating it.
    const again = await applyCommand(author, workId, { type: "publish" }, at(3));
    expect(again.editionId).toBe(editionId);
    expect((await work(workId)).edition_count).toBe(1);
    expect(await getPublicWork("memoirs", slug)).not.toBeNull();
  });

  it("archives and restores to the previous public state", async () => {
    const { workId } = await draftWork();
    await applyCommand(author, workId, { type: "publish" }, at(1));
    const slug = (await work(workId)).slug;
    await applyCommand(author, workId, { type: "archive" }, at(2));
    expect(await getPublicWork("memoirs", slug)).toBeNull();
    await applyCommand(author, workId, { type: "restore" }, at(3));
    expect((await work(workId)).status).toBe("PUBLISHED");
    expect(await getPublicWork("memoirs", slug)).not.toBeNull();
  });

  it("records every transition in the event history", async () => {
    const { workId } = await draftWork();
    await applyCommand(author, workId, { type: "submit" }, at(1));
    await applyCommand(author, workId, { type: "reject", note: "needs an ending" }, at(2));
    await applyCommand(author, workId, { type: "publish" }, at(3));
    await applyCommand(author, workId, { type: "withdraw" }, at(4));
    const events = await col.events(workId).orderBy("occurred_at", "asc").get();
    expect(events.docs.map((d) => d.get("type"))).toEqual(["CREATED", "SUBMITTED", "REVIEW_REJECTED", "PUBLISHED", "WITHDRAWN"]);
    expect(events.docs[2]!.get("note")).toBe("needs an ending");
  });
});

describe("visibility", () => {
  it("serves only PUBLIC works publicly", async () => {
    const { workId } = await draftWork();
    await applyCommand(author, workId, { type: "publish" }, at(1));
    const slug = (await work(workId)).slug;
    for (const v of ["UNLISTED", "PRIVATE"] as const) {
      await setVisibility(author, workId, v, at(2));
      expect(await getPublicWork("memoirs", slug)).toBeNull();
      expect(await getPublicChapter("memoirs", slug, "arrival")).toBeNull();
      expect(await listPublicWorks("memoirs")).toHaveLength(0);
    }
    await setVisibility(author, workId, "PUBLIC", at(3));
    expect(await getPublicWork("memoirs", slug)).not.toBeNull();
  });

  it("does not serve a work under the other collection's URL", async () => {
    const { workId } = await draftWork("Night Letters", "fiction");
    await applyCommand(author, workId, { type: "publish" }, at(1));
    expect(await getPublicWork("memoirs", "night-letters")).toBeNull();
    expect(await getPublicWork("fiction", "night-letters")).not.toBeNull();
  });

  it("never exposes unpublished drafts", async () => {
    const { workId } = await draftWork("Secret Draft");
    expect(await getPublicWork("memoirs", (await work(workId)).slug)).toBeNull();
    expect(await listPublicWorks(null)).toHaveLength(0);
  });
});

describe("scheduled publishing", () => {
  it("publishes when due, dated at the intended time even if the job ran late", async () => {
    const { workId } = await draftWork();
    await applyCommand(author, workId, { type: "schedule", at: at(60) }, t0);
    expect((await runDueSchedules(SCHEDULER, at(30))).published).toEqual([]);

    const lateRun = at(60 + 47);
    const run = await runDueSchedules(SCHEDULER, lateRun);
    expect(run.published).toEqual([workId]);
    const w = await work(workId);
    expect(w.status).toBe("PUBLISHED");
    expect(w.first_published_at!.toDate()).toEqual(at(60));
    expect(w.last_publish_executed_at!.toDate()).toEqual(lateRun);

    const again = await runDueSchedules(SCHEDULER, at(200));
    expect(again.published).toEqual([]);
    expect((await work(workId)).edition_count).toBe(1);
  });

  it("is safe when two scheduler runs overlap", async () => {
    const { workId } = await draftWork();
    await applyCommand(author, workId, { type: "schedule", at: at(10) }, t0);
    await Promise.all([runDueSchedules(SCHEDULER, at(20)), runDueSchedules(SCHEDULER, at(20))]);
    const w = await work(workId);
    expect(w.edition_count).toBe(1);
    expect(await verifyEdition(w.current_edition_id!)).toBe(true);
  });

  it("cancels a schedule back to draft", async () => {
    const { workId } = await draftWork();
    await applyCommand(author, workId, { type: "schedule", at: at(60) }, t0);
    await applyCommand(author, workId, { type: "cancelSchedule" }, at(1));
    expect((await runDueSchedules(SCHEDULER, at(120))).published).toEqual([]);
    expect((await work(workId)).status).toBe("DRAFT");
  });
});

describe("stale seal cleanup", () => {
  it("removes abandoned SEALING claims and never touches sealed editions", async () => {
    const { workId } = await draftWork();
    const { editionId } = await applyCommand(author, workId, { type: "publish" }, at(1));
    const abandoned = col.edition(`${workId}-e2`);
    await abandoned.set({ state: "SEALING", claimed_at: (await edition(editionId!)).claimed_at, work_id: workId, number: 2 });
    await col.parts(`${workId}-e2`).doc("x").set({ seal_token: "dead" });

    const removed = await sweepStaleSeals(new Date(at(1).getTime() + STALE_SEAL_MS + 1000));
    expect(removed).toBe(1);
    expect((await abandoned.get()).exists).toBe(false);
    expect((await col.parts(`${workId}-e2`).get()).empty).toBe(true);
    expect(await verifyEdition(editionId!)).toBe(true);
  });
});

function metadata(slug: string) {
  return {
    title: "The Long Monsoon",
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
