import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { connection } from "next/server";
import { cache } from "react";
import { canAdminister, canWrite, type AuthorStatus, type Role } from "@/domain/access/policy";
import { AppError } from "../errors";
import { adminAuth } from "../firebase/admin";
import { col, type UserDoc } from "../firebase/model";
import { ensureUser } from "../services/users";

export const SESSION_COOKIE = "__session";
/** Readers stay signed in for two weeks (Firebase's maximum). */
export const READER_SESSION_MS = 14 * 24 * 60 * 60 * 1000;
/** Anyone who can write or administer re-authenticates daily. */
export const WRITER_SESSION_MS = 24 * 60 * 60 * 1000;
/** A session may only be minted from a sign-in this recent. */
export const MAX_SIGN_IN_AGE_S = 5 * 60;

export type Viewer = {
  uid: string;
  email: string;
  role: Role;
  authorStatus: AuthorStatus;
  handle: string;
  displayName: string;
};

function toViewer(uid: string, user: UserDoc): Viewer {
  return { uid, email: user.email, role: user.role, authorStatus: user.author_status, handle: user.handle, displayName: user.display_name };
}

/**
 * Exchanges a fresh Firebase ID token for a session cookie value. Any account with
 * a verified email may sign in; the first sign-in creates a reader profile.
 */
export async function mintSessionCookie(idToken: string, now = Date.now()): Promise<{ cookie: string; uid: string; maxAgeMs: number; viewer: Viewer }> {
  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    throw new AppError("UNAUTHENTICATED", "Sign-in could not be verified. Try again.");
  }
  if (now / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_S) {
    throw new AppError("UNAUTHENTICATED", "That sign-in is too old. Sign in again.");
  }
  if (!decoded.email || decoded.email_verified !== true) {
    throw new AppError("FORBIDDEN", "Verify your email address first. Check your inbox for the link.");
  }
  const user = await ensureUser({ uid: decoded.uid, email: decoded.email, name: typeof decoded.name === "string" ? decoded.name : null });
  const maxAgeMs = canWrite({ uid: decoded.uid, role: user.role }) ? WRITER_SESSION_MS : READER_SESSION_MS;
  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn: maxAgeMs });
  return { cookie, uid: decoded.uid, maxAgeMs, viewer: toViewer(decoded.uid, user) };
}

/**
 * Verifies a session cookie, including revocation (`checkRevoked`), then loads the
 * profile. Roles come from Firestore on every request, so promotions and demotions
 * take effect immediately.
 */
export async function verifySession(cookie: string | undefined): Promise<Viewer | null> {
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    const snap = await col.user(decoded.uid).get();
    if (!snap.exists) return null;
    return toViewer(decoded.uid, snap.data() as UserDoc);
  } catch {
    return null;
  }
}

/** The signed-in viewer for this request, or null. Memoised per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Session-derived content is request-time only: never part of a prerendered or prefetched shell.
  await connection();
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
});

// For server actions and route handlers: these throw instead of redirecting.

export async function requireUser(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Your session has ended. Sign in again.");
  return viewer;
}

export async function requireWriter(): Promise<Viewer> {
  const viewer = await requireUser();
  if (!canWrite(viewer)) throw new AppError("FORBIDDEN", "Only approved authors can do that.");
  return viewer;
}

export async function requireAdmin(): Promise<Viewer> {
  const viewer = await requireUser();
  if (!canAdminister(viewer)) throw new AppError("FORBIDDEN", "Only administrators can do that.");
  return viewer;
}

// For pages: these redirect.

export async function requireUserPage(next?: string): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  return viewer;
}

export async function requireWriterPage(): Promise<Viewer> {
  const viewer = await requireUserPage("/studio");
  if (!canWrite(viewer)) redirect("/account");
  return viewer;
}

export async function requireAdminPage(): Promise<Viewer> {
  const viewer = await requireUserPage("/studio/admin");
  if (!canAdminister(viewer)) redirect("/studio");
  return viewer;
}

/** Revokes every refresh token for the user, which invalidates all their sessions. */
export async function revokeSessions(uid: string): Promise<void> {
  await adminAuth().revokeRefreshTokens(uid);
}

export function sessionCookieOptions(secure: boolean, maxAgeMs: number) {
  return { httpOnly: true, secure, sameSite: "lax" as const, path: "/", maxAge: Math.floor(maxAgeMs / 1000) };
}
