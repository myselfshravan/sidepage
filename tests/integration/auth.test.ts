import { beforeEach, describe, expect, it } from "vitest";
import { adminAuth } from "@/server/firebase/admin";
import { col, type UserDoc } from "@/server/firebase/model";
import { mintSessionCookie, READER_SESSION_MS, revokeSessions, verifySession, WRITER_SESSION_MS } from "@/server/auth/session";
import { LIMITS, rateLimit } from "@/server/http/rate-limit";
import { clearAuth, clearFirestore, signIn, sleep } from "../support/emulator";

const PASSWORD = "correct horse battery staple";

async function account(email: string, opts: { verified?: boolean; name?: string } = {}) {
  return adminAuth().createUser({ email, password: PASSWORD, emailVerified: opts.verified ?? true, displayName: opts.name });
}

beforeEach(async () => {
  await Promise.all([clearAuth(), clearFirestore()]);
});

describe("sessions", () => {
  it("lets any verified account sign in and creates a reader profile on first sign-in", async () => {
    const u = await account("new@example.test", { name: "New Person" });
    const { cookie, viewer, maxAgeMs } = await mintSessionCookie(await signIn("new@example.test", PASSWORD));
    expect(viewer).toMatchObject({ uid: u.uid, role: "reader", handle: "new-person" });
    expect(maxAgeMs).toBe(READER_SESSION_MS);
    const profile = (await col.user(u.uid).get()).data() as UserDoc;
    expect(profile).toMatchObject({ role: "reader", author_status: "none", email: "new@example.test" });
    expect(await verifySession(cookie)).toMatchObject({ uid: u.uid, role: "reader" });
  });

  it("gives writers short sessions", async () => {
    const u = await account("w@example.test");
    await mintSessionCookie(await signIn("w@example.test", PASSWORD));
    await col.user(u.uid).update({ role: "author" });
    const { maxAgeMs } = await mintSessionCookie(await signIn("w@example.test", PASSWORD));
    expect(maxAgeMs).toBe(WRITER_SESSION_MS);
  });

  it("refuses unverified email addresses", async () => {
    await account("unverified@example.test", { verified: false });
    await expect(mintSessionCookie(await signIn("unverified@example.test", PASSWORD))).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect((await col.users().get()).empty).toBe(true);
  });

  it("refuses stale sign-ins and garbage", async () => {
    await account("a@example.test");
    const token = await signIn("a@example.test", PASSWORD);
    await expect(mintSessionCookie(token, Date.now() + 10 * 60 * 1000)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    await expect(mintSessionCookie("not-a-token")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await verifySession("not-a-cookie")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("reads the role live, so promotions and demotions apply on the next request", async () => {
    const u = await account("p@example.test");
    const { cookie } = await mintSessionCookie(await signIn("p@example.test", PASSWORD));
    await col.user(u.uid).update({ role: "author" });
    expect((await verifySession(cookie))!.role).toBe("author");
    await col.user(u.uid).update({ role: "reader" });
    expect((await verifySession(cookie))!.role).toBe("reader");
  });

  it("invalidates sessions immediately after revocation", async () => {
    const u = await account("r@example.test");
    const { cookie } = await mintSessionCookie(await signIn("r@example.test", PASSWORD));
    expect(await verifySession(cookie)).not.toBeNull();
    // Revocation has one-second granularity (token auth_time vs validSince, in seconds).
    await sleep(1100);
    await revokeSessions(u.uid);
    expect(await verifySession(cookie)).toBeNull();
  });

  it("drops the session if the profile is deleted", async () => {
    const u = await account("d@example.test");
    const { cookie } = await mintSessionCookie(await signIn("d@example.test", PASSWORD));
    await col.user(u.uid).delete();
    expect(await verifySession(cookie)).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows up to the limit per window, then refuses", async () => {
    const now = new Date("2026-11-05T10:00:00Z");
    const limit = { ...LIMITS.session, max: 3 };
    for (let i = 0; i < 3; i++) await rateLimit(limit, "1.2.3.4", now);
    await expect(rateLimit(limit, "1.2.3.4", now)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await rateLimit(limit, "5.6.7.8", now);
    await rateLimit(limit, "1.2.3.4", new Date(now.getTime() + 61_000));
  });
});
