import "server-only";
import type { DecodedIdToken } from "firebase-admin/auth";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { redirect } from "next/navigation";
import { cache } from "react";
import { serverEnv } from "@/lib/env.server";
import { AppError } from "../errors";
import { adminAuth } from "../firebase/admin";

export const SESSION_COOKIE = "__session";
/** Author sessions are short: one day, then sign in again. */
export const AUTHOR_SESSION_MS = 24 * 60 * 60 * 1000;
/** A session may only be minted from a sign-in this recent. */
export const MAX_SIGN_IN_AGE_S = 5 * 60;

export type Viewer = { uid: string; email: string; isAuthor: true };

export function isAuthorToken(token: Pick<DecodedIdToken, "email" | "email_verified"> & { role?: unknown }): boolean {
  const expected = serverEnv().AUTHOR_EMAIL.toLowerCase();
  return token.role === "author" && token.email_verified === true && token.email?.toLowerCase() === expected;
}

/**
 * Exchanges a fresh Firebase ID token for a session cookie value. Only the author
 * can hold a session today; reader sessions arrive with invitations.
 */
export async function mintSessionCookie(idToken: string, now = Date.now()): Promise<{ cookie: string; uid: string }> {
  let decoded: DecodedIdToken;
  try {
    decoded = await adminAuth().verifyIdToken(idToken, true);
  } catch {
    throw new AppError("UNAUTHENTICATED", "Sign-in could not be verified. Try again.");
  }
  if (now / 1000 - decoded.auth_time > MAX_SIGN_IN_AGE_S) {
    throw new AppError("UNAUTHENTICATED", "That sign-in is too old. Sign in again.");
  }
  if (!isAuthorToken(decoded)) {
    throw new AppError("FORBIDDEN", "This account doesn't have access to the studio.");
  }
  const cookie = await adminAuth().createSessionCookie(idToken, { expiresIn: AUTHOR_SESSION_MS });
  return { cookie, uid: decoded.uid };
}

/**
 * Verifies a session cookie, including revocation (`checkRevoked`), so signing out
 * or revoking tokens takes effect on the very next request.
 */
export async function verifySession(cookie: string | undefined): Promise<Viewer | null> {
  if (!cookie) return null;
  try {
    const decoded = await adminAuth().verifySessionCookie(cookie, true);
    if (!isAuthorToken(decoded)) return null;
    return { uid: decoded.uid, email: decoded.email!, isAuthor: true };
  } catch {
    return null;
  }
}

/** The signed-in author for this request, or null. Memoised per request. */
export const getViewer = cache(async (): Promise<Viewer | null> => {
  // Session-derived content is request-time only: never part of a prerendered or prefetched shell.
  await connection();
  const store = await cookies();
  return verifySession(store.get(SESSION_COOKIE)?.value);
});

/** For server actions and route handlers: throws instead of redirecting. */
export async function requireAuthor(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) throw new AppError("UNAUTHENTICATED", "Your session has ended. Sign in again.");
  return viewer;
}

/** For studio pages: sends signed-out visitors to the sign-in page. */
export async function requireAuthorPage(): Promise<Viewer> {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in");
  return viewer;
}

/** Revokes every refresh token for the user, which invalidates all their sessions. */
export async function revokeSessions(uid: string): Promise<void> {
  await adminAuth().revokeRefreshTokens(uid);
}

export function sessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "lax" as const,
    path: "/",
    maxAge: AUTHOR_SESSION_MS / 1000,
  };
}
