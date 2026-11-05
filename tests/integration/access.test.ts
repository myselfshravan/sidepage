import { beforeEach, describe, expect, it } from "vitest";
import { col, type PublishedDoc, type UserDoc } from "@/server/firebase/model";
import type { Actor } from "@/server/services/actor";
import { checkpointChapter, createChapter, deleteChapter, getChapter, listChapters, listRevisions, saveChapter } from "@/server/services/chapters";
import { applyCommand, listEditions } from "@/server/services/publishing";
import { decideAuthorship, ensureUser, listAuthorRequests, requestAuthorship, setRole, updateProfile } from "@/server/services/users";
import { createWork, dashboardStats, duplicateWork, getManagedWork, listEvents, listWorks, setVisibility, updateWorkMetadata } from "@/server/services/works";
import { clearFirestore } from "../support/emulator";

const t0 = new Date("2026-11-06T10:00:00Z");
const alice: Actor = { uid: "alice", kind: "user", role: "author" };
const bob: Actor = { uid: "bob", kind: "user", role: "author" };
const reader: Actor = { uid: "rae", kind: "user", role: "reader" };
const admin: Actor = { uid: "ada", kind: "user", role: "admin" };
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

async function profiles() {
  await ensureUser({ uid: "alice", email: "alice@example.test", name: "Alice Writer" }, t0);
  await ensureUser({ uid: "bob", email: "bob@example.test", name: "Bob Writer" }, t0);
  await ensureUser({ uid: "rae", email: "rae@example.test", name: "Rae" }, t0);
  await ensureUser({ uid: "ada", email: "ada@example.test", name: "Ada" }, t0);
  await col.user("alice").update({ role: "author" });
  await col.user("bob").update({ role: "author" });
  await col.user("ada").update({ role: "admin" });
}

async function aliceDraft() {
  const { workId } = await createWork(alice, { collection: "memoirs", title: "Alice's Private Draft" }, t0);
  const { chapterId } = await createChapter(alice, workId, "One", t0);
  await saveChapter(alice, { workId, chapterId, baseRev: 1, title: "One", doc: doc("alice's words") }, t0);
  return { workId, chapterId };
}

beforeEach(async () => {
  await clearFirestore();
  await profiles();
});

describe("ownership: an author can't touch another author's work", () => {
  it("hides the work from studio reads", async () => {
    const { workId, chapterId } = await aliceDraft();
    expect(await getManagedWork(bob, workId)).toBeNull();
    await expect(getChapter(bob, workId, chapterId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listChapters(bob, workId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listRevisions(bob, workId, chapterId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listEditions(bob, workId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listEvents(bob, workId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listWorks(bob)).items).toHaveLength(0);
    expect((await dashboardStats(bob)).total).toBe(0);
  });

  it("refuses every write and every lifecycle command", async () => {
    const { workId, chapterId } = await aliceDraft();
    const attempts: [string, () => Promise<unknown>][] = [
      ["save", () => saveChapter(bob, { workId, chapterId, baseRev: 2, title: "One", doc: doc("bob was here") }, t0)],
      ["create chapter", () => createChapter(bob, workId, "Bob's chapter", t0)],
      ["delete chapter", () => deleteChapter(bob, workId, chapterId, t0)],
      ["checkpoint", () => checkpointChapter(bob, workId, chapterId, t0)],
      ["metadata", () => updateWorkMetadata(bob, workId, { title: "Hijacked", subtitle: "", description: "", author_name: "Bob", slug: "x-hijack", content_warnings: [], seo_title: "", seo_description: "", timezone: "UTC", original_written_at: null, digitized_at: null }, t0)],
      ["visibility", () => setVisibility(bob, workId, "PRIVATE", t0)],
      ["duplicate", () => duplicateWork(bob, workId, t0)],
      ["publish", () => applyCommand(bob, workId, { type: "publish" }, t0)],
      ["archive", () => applyCommand(bob, workId, { type: "archive" }, t0)],
    ];
    for (const [label, attempt] of attempts) {
      await expect(attempt(), label).rejects.toMatchObject({ code: "NOT_FOUND" });
    }
    const chapter = await getChapter(alice, workId, chapterId);
    expect(JSON.stringify(chapter!.doc)).toContain("alice's words");
    expect((await getManagedWork(alice, workId))!.status).toBe("DRAFT");
  });

  it("lets an admin moderate any work", async () => {
    const { workId } = await aliceDraft();
    expect(await getManagedWork(admin, workId)).not.toBeNull();
    await applyCommand(admin, workId, { type: "archive" }, t0);
    expect((await getManagedWork(alice, workId))!.status).toBe("ARCHIVED");
  });

  it("does not let readers write at all", async () => {
    await expect(createWork(reader, { collection: "fiction", title: "Nope" }, t0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listWorks(reader)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("records the owner and links published work to the author's handle", async () => {
    const { workId } = await aliceDraft();
    await applyCommand(alice, workId, { type: "publish" }, t0);
    const pub = (await col.publishedDoc(workId).get()).data() as PublishedDoc;
    expect(pub).toMatchObject({ owner_uid: "alice", author_handle: "alice-writer", author_name: "Alice Writer" });

    await updateProfile(alice, { handle: "alice-w", display_name: "Alice Writer", bio: "" }, t0);
    expect(((await col.publishedDoc(workId).get()).data() as PublishedDoc).author_handle).toBe("alice-w");
    expect((await col.handle("alice-writer").get()).exists).toBe(false);
  });
});

describe("accounts and the author request flow", () => {
  it("creates reader profiles with unique handles", async () => {
    await ensureUser({ uid: "x1", email: "same@a.test", name: "Same Name" }, t0);
    await ensureUser({ uid: "x2", email: "same@b.test", name: "Same Name" }, t0);
    const [a, b] = await Promise.all([col.user("x1").get(), col.user("x2").get()]);
    expect((a.data() as UserDoc).role).toBe("reader");
    expect([(a.data() as UserDoc).handle, (b.data() as UserDoc).handle]).toEqual(["same-name", "same-name-2"]);
  });

  it("goes reader → requested → approved author, with the admin recorded", async () => {
    await requestAuthorship(reader, { pitch: "I write short memoir essays about trains." }, t0);
    await expect(requestAuthorship(reader, { pitch: "Asking a second time, please." }, t0)).rejects.toMatchObject({ code: "INVALID_TRANSITION" });
    expect((await listAuthorRequests(admin)).map((u) => u.uid)).toEqual(["rae"]);
    await decideAuthorship(admin, "rae", true, t0);
    const rae = (await col.user("rae").get()).data() as UserDoc;
    expect(rae).toMatchObject({ role: "author", author_status: "approved", author_decided_by: "ada" });
  });

  it("lets a declined reader ask again", async () => {
    await requestAuthorship(reader, { pitch: "I write short memoir essays about trains." }, t0);
    await decideAuthorship(admin, "rae", false, t0);
    expect(((await col.user("rae").get()).data() as UserDoc).role).toBe("reader");
    await requestAuthorship(reader, { pitch: "Trying again with better samples." }, t0);
  });

  it("keeps role changes for admins only", async () => {
    await requestAuthorship(reader, { pitch: "I write short memoir essays about trains." }, t0);
    for (const who of [reader, alice]) {
      await expect(decideAuthorship(who, "rae", true, t0)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(setRole(who, "rae", "admin", t0)).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(listAuthorRequests(who)).rejects.toMatchObject({ code: "FORBIDDEN" });
    }
    await expect(setRole(admin, "ada", "reader", t0)).rejects.toMatchObject({ code: "INVALID" });
    await setRole(admin, "alice", "reader", t0);
    expect(((await col.user("alice").get()).data() as UserDoc).role).toBe("reader");
  });

  it("revokes writing immediately when an author is demoted", async () => {
    const { workId } = await aliceDraft();
    await setRole(admin, "alice", "reader", t0);
    const demoted: Actor = { uid: "alice", kind: "user", role: "reader" };
    await expect(createWork(demoted, { collection: "memoirs", title: "After demotion" }, t0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(applyCommand(demoted, workId, { type: "publish" }, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("validates profiles and keeps handles unique", async () => {
    await expect(updateProfile(bob, { handle: "alice-writer", display_name: "Bob", bio: "" }, t0)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(updateProfile(bob, { handle: "Bad Handle", display_name: "Bob", bio: "" }, t0)).rejects.toMatchObject({ code: "INVALID" });
    await expect(updateProfile(bob, { handle: "studio", display_name: "Bob", bio: "" }, t0)).rejects.toMatchObject({ code: "INVALID" });
  });
});
