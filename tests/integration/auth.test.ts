import { beforeEach, describe, expect, it } from "vitest";
import { adminAuth } from "@/server/firebase/admin";
import { mintSessionCookie, revokeSessions, verifySession } from "@/server/auth/session";
import { LIMITS, rateLimit } from "@/server/http/rate-limit";
import { clearAuth, clearFirestore, signIn, sleep } from "../support/emulator";

const PASSWORD = "correct horse battery staple";

async function user(email: string, opts: { author?: boolean; verified?: boolean } = {}) {
  const u = await adminAuth().createUser({ email, password: PASSWORD, emailVerified: opts.verified ?? true });
  if (opts.author) await adminAuth().setCustomUserClaims(u.uid, { role: "author" });
  return u;
}

beforeEach(async () => {
  await Promise.all([clearAuth(), clearFirestore()]);
});

describe("author sessions", () => {
  it("mints a session cookie for the author and verifies it", async () => {
    const u = await user("author@sidepage.test", { author: true });
    const { cookie, uid } = await mintSessionCookie(await signIn("author@sidepage.test", PASSWORD));
    expect(uid).toBe(u.uid);
    expect(await verifySession(cookie)).toMatchObject({ uid: u.uid, isAuthor: true });
  });

  it("refuses accounts that are not the author", async () => {
    await user("reader@sidepage.test", { author: true }); // right claim, wrong email
    await expect(mintSessionCookie(await signIn("reader@sidepage.test", PASSWORD))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses the author's email without the author claim", async () => {
    await user("author@sidepage.test");
    await expect(mintSessionCookie(await signIn("author@sidepage.test", PASSWORD))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses an unverified author email", async () => {
    await user("author@sidepage.test", { author: true, verified: false });
    await expect(mintSessionCookie(await signIn("author@sidepage.test", PASSWORD))).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("refuses stale sign-ins", async () => {
    await user("author@sidepage.test", { author: true });
    const token = await signIn("author@sidepage.test", PASSWORD);
    await expect(mintSessionCookie(token, Date.now() + 10 * 60 * 1000)).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
  });

  it("rejects garbage tokens and cookies", async () => {
    await expect(mintSessionCookie("not-a-token")).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(await verifySession("not-a-cookie")).toBeNull();
    expect(await verifySession(undefined)).toBeNull();
  });

  it("invalidates sessions immediately after revocation", async () => {
    const u = await user("author@sidepage.test", { author: true });
    const { cookie } = await mintSessionCookie(await signIn("author@sidepage.test", PASSWORD));
    expect(await verifySession(cookie)).not.toBeNull();
    // Revocation has one-second granularity (token auth_time vs validSince, in seconds).
    await sleep(1100);
    await revokeSessions(u.uid);
    expect(await verifySession(cookie)).toBeNull();
  });

  it("drops a session when the author claim is removed", async () => {
    const u = await user("author@sidepage.test", { author: true });
    const { cookie } = await mintSessionCookie(await signIn("author@sidepage.test", PASSWORD));
    await sleep(1100);
    await adminAuth().setCustomUserClaims(u.uid, null);
    await revokeSessions(u.uid);
    expect(await verifySession(cookie)).toBeNull();
  });
});

describe("rate limiting", () => {
  it("allows up to the limit per window, then refuses", async () => {
    const now = new Date("2026-11-05T10:00:00Z");
    const limit = { ...LIMITS.session, max: 3 };
    for (let i = 0; i < 3; i++) await rateLimit(limit, "1.2.3.4", now);
    await expect(rateLimit(limit, "1.2.3.4", now)).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await rateLimit(limit, "5.6.7.8", now); // other subjects unaffected
    await rateLimit(limit, "1.2.3.4", new Date(now.getTime() + 61_000)); // next window
  });
});
