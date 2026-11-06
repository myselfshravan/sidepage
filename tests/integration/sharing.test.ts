import { beforeEach, describe, expect, it } from "vitest";
import { col, type PublishedDoc } from "@/server/firebase/model";
import type { Actor } from "@/server/services/actor";
import { authenticateApiToken, createApiToken, listApiTokens, revokeApiToken } from "@/server/services/api-tokens";
import { createChapter, saveChapter } from "@/server/services/chapters";
import { applyCommand } from "@/server/services/publishing";
import { createShareLink, listShareLinks, revokeShareLink } from "@/server/services/share-links";
import { ensureUser } from "@/server/services/users";
import { createWork, setVisibility, updateWorkMetadata } from "@/server/services/works";
import { getPublicChapter, getPublicWork, listPublicWorks, listPublicWorksByAuthor } from "@/server/read/public";
import { getSharedChapter, getSharedWork } from "@/server/read/shared";
import { clearFirestore } from "../support/emulator";

const t0 = new Date("2026-11-06T10:00:00Z");
const ada: Actor = { uid: "ada", kind: "user", role: "admin" };
const alice: Actor = { uid: "alice", kind: "user", role: "author" };
const bob: Actor = { uid: "bob", kind: "user", role: "author" };
const doc = (text: string) => ({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text }] }] });

const meta = (slug: string, extra: Record<string, unknown> = {}) => ({
  title: "Night Letters",
  subtitle: "",
  description: "",
  byline: "profile",
  author_name: "",
  slug,
  content_warnings: [],
  seo_title: "",
  seo_description: "",
  timezone: "UTC",
  original_written_at: null,
  digitized_at: null,
  ...extra,
});

async function publishedWork(actor: Actor, title = "Night Letters") {
  const { workId } = await createWork(actor, { collection: "fiction", title }, t0);
  const { chapterId } = await createChapter(actor, workId, "One", t0);
  await saveChapter(actor, { workId, chapterId, baseRev: 1, title: "One", doc: doc("secret words") }, t0);
  await applyCommand(actor, workId, { type: "publish" }, t0);
  const slug = (await col.work(workId).get()).get("slug") as string;
  return { workId, slug };
}

beforeEach(async () => {
  await clearFirestore();
  for (const [uid, role] of [["ada", "admin"], ["alice", "author"], ["bob", "author"]] as const) {
    await ensureUser({ uid, email: `${uid}@example.test`, name: uid[0]!.toUpperCase() + uid.slice(1) }, t0);
    await col.user(uid).update({ role });
  }
});

describe("secret links", () => {
  it("open a private work that is otherwise invisible", async () => {
    const { workId, slug } = await publishedWork(alice);
    await setVisibility(alice, workId, "PRIVATE", t0);
    expect(await getPublicWork("fiction", slug)).toBeNull();

    const { token } = await createShareLink(alice, workId, { label: "Writing group", expires_in_days: null }, t0);
    expect(token).toMatch(/^k_[A-Za-z0-9_-]{43}$/);
    const shared = await getSharedWork(token, t0);
    expect(shared?.work.title).toBe("Night Letters");
    const chapter = await getSharedChapter(token, "one", t0);
    expect(JSON.stringify(chapter?.chapter.doc)).toContain("secret words");

    // The token is never stored, only its hash.
    const stored = await col.shareLinks().get();
    expect(JSON.stringify(stored.docs.map((d) => [d.id, d.data()]))).not.toContain(token);
  });

  it("stop working immediately when revoked, expired, or the work is withdrawn", async () => {
    const { workId } = await publishedWork(alice);
    const a = await createShareLink(alice, workId, { expires_in_days: null }, t0);
    const b = await createShareLink(alice, workId, { expires_in_days: 7 }, t0);
    const c = await createShareLink(alice, workId, {}, t0);

    await revokeShareLink(alice, workId, a.id, t0);
    expect(await getSharedWork(a.token, t0)).toBeNull();
    expect(await getSharedWork(b.token, new Date(t0.getTime() + 8 * 86_400_000))).toBeNull();
    expect(await getSharedWork(b.token, t0)).not.toBeNull();

    await applyCommand(alice, workId, { type: "withdraw" }, t0);
    expect(await getSharedWork(c.token, t0)).toBeNull();

    const listed = await listShareLinks(alice, workId, t0);
    expect(listed.find((l) => l.id === a.id)).toMatchObject({ active: false });
  });

  it("refuse malformed and guessed tokens", async () => {
    await publishedWork(alice);
    for (const token of ["", "k_short", "k_" + "A".repeat(43), "../../etc", "sp_" + "a".repeat(43)]) {
      expect(await getSharedWork(token, t0)).toBeNull();
    }
  });

  it("are managed only by the work's owner (or an admin)", async () => {
    const { workId } = await publishedWork(alice);
    const link = await createShareLink(alice, workId, {}, t0);
    await expect(createShareLink(bob, workId, {}, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(listShareLinks(bob, workId, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(revokeShareLink(bob, workId, link.id, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await revokeShareLink(ada, workId, link.id, t0);
    expect(await getSharedWork(link.token, t0)).toBeNull();
  });
});

describe("gift links", () => {
  it("carry a recipient and dedication, shown only through the link", async () => {
    const { workId } = await publishedWork(alice);
    await setVisibility(alice, workId, "PRIVATE", t0);
    const gift = await createShareLink(alice, workId, { gift: { recipient_name: "Ana", dedication: "For the summer we read everything." } }, t0);
    const plain = await createShareLink(alice, workId, {}, t0);
    expect((await getSharedWork(gift.token, t0))?.gift).toEqual({ recipientName: "Ana", dedication: "For the summer we read everything." });
    expect((await getSharedWork(plain.token, t0))?.gift).toBeNull();
    expect((await listShareLinks(alice, workId, t0)).map((l) => l.giftFor).sort()).toEqual(["Ana", null].sort());
    await expect(createShareLink(alice, workId, { gift: { recipient_name: "  ", dedication: "" } }, t0)).rejects.toMatchObject({ code: "INVALID" });
  });
});

describe("pen names", () => {
  it("never connect a pen-name or anonymous work to the account", async () => {
    const credited = await publishedWork(alice, "Signed Work");
    const { workId, slug } = await publishedWork(alice, "Masked Work");
    await updateWorkMetadata(alice, workId, meta(slug, { title: "Masked Work", byline: "pen_name", author_name: "M. Vale" }), t0);
    await applyCommand(alice, workId, { type: "republish" }, t0);

    const pub = (await col.publishedDoc(workId).get()).data() as PublishedDoc;
    expect(pub).toMatchObject({ author_name: "M. Vale", author_handle: "", public_author_uid: null });

    const work = await getPublicWork("fiction", slug);
    expect(work).toMatchObject({ authorName: "M. Vale", authorHandle: "" });
    const serialised = JSON.stringify([work, await getPublicChapter("fiction", slug, "one"), await listPublicWorks(null)]);
    const masked = JSON.stringify(await getPublicWork("fiction", slug));
    expect(masked).not.toContain("alice");
    expect(masked).not.toContain("Alice");
    expect(serialised).toContain("M. Vale");

    const byAlice = await listPublicWorksByAuthor("alice");
    expect(byAlice.map((w) => w.workId)).toEqual([credited.workId]);
  });

  it("supports anonymous bylines and requires a pen name when chosen", async () => {
    const { workId, slug } = await publishedWork(alice, "Unsigned");
    await expect(updateWorkMetadata(alice, workId, meta(slug, { title: "Unsigned", byline: "pen_name", author_name: "" }), t0)).rejects.toMatchObject({ code: "INVALID" });
    await updateWorkMetadata(alice, workId, meta(slug, { title: "Unsigned", byline: "anonymous" }), t0);
    await applyCommand(alice, workId, { type: "republish" }, t0);
    expect(await getPublicWork("fiction", slug)).toMatchObject({ authorName: "Anonymous", authorHandle: "" });
  });
});

describe("API tokens", () => {
  it("are created by admins only, stored hashed, and act as the owner", async () => {
    await expect(createApiToken(alice, { name: "x" }, t0)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const { token, id } = await createApiToken(ada, { name: "Seeding swarm" }, t0);
    expect(token).toMatch(/^sp_[A-Za-z0-9_-]{43}$/);
    expect(JSON.stringify((await col.apiToken(id).get()).data())).not.toContain(token);
    expect(await authenticateApiToken(token, t0)).toEqual({ uid: "ada", kind: "user", role: "admin" });
    expect((await listApiTokens(ada)).map((t) => t.name)).toEqual(["Seeding swarm"]);
  });

  it("stop working when revoked or when the owner can no longer write", async () => {
    const one = await createApiToken(ada, { name: "one" }, t0);
    await revokeApiToken(ada, one.id, t0);
    expect(await authenticateApiToken(one.token, t0)).toBeNull();

    const two = await createApiToken(ada, { name: "two" }, t0);
    await col.user("ada").update({ role: "reader" });
    expect(await authenticateApiToken(two.token, t0)).toBeNull();
  });

  it("refuse malformed or unknown tokens", async () => {
    for (const token of ["", "sp_x", "sp_" + "A".repeat(43), "k_" + "A".repeat(43)]) expect(await authenticateApiToken(token, t0)).toBeNull();
  });

  it("can't be revoked by someone else", async () => {
    const t = await createApiToken(ada, { name: "mine" }, t0);
    await col.user("bob").update({ role: "admin" });
    const otherAdmin: Actor = { uid: "bob", kind: "user", role: "admin" };
    await expect(revokeApiToken(otherAdmin, t.id, t0)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});
