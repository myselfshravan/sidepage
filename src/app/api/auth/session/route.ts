import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { mintSessionCookie, revokeSessions, SESSION_COOKIE, sessionCookieOptions, verifySession } from "@/server/auth/session";
import { AppError, type ErrorCode } from "@/server/errors";
import { assertSameOrigin, clientIp } from "@/server/http/origin";
import { LIMITS, rateLimit } from "@/server/http/rate-limit";

const STATUS: Partial<Record<ErrorCode, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, RATE_LIMITED: 429, INVALID: 400 };

const body = z.object({ idToken: z.string().min(1).max(8192) });

const noStore = { "Cache-Control": "no-store" };

function isSecure(request: NextRequest) {
  return request.nextUrl.protocol === "https:" || process.env.NODE_ENV === "production" && !["localhost", "127.0.0.1"].includes(request.nextUrl.hostname);
}

/** Exchanges a fresh Firebase ID token for an httpOnly session cookie. */
export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request.headers);
    await rateLimit(LIMITS.session, clientIp(request.headers));
    const parsed = body.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("INVALID", "Malformed sign-in request.");
    const { cookie, maxAgeMs, viewer } = await mintSessionCookie(parsed.data.idToken);
    (await cookies()).set(SESSION_COOKIE, cookie, sessionCookieOptions(isSecure(request), maxAgeMs));
    return NextResponse.json({ ok: true, role: viewer.role }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

/** Signs out: revokes every refresh token for the user and clears the cookie. */
export async function DELETE(request: NextRequest) {
  try {
    assertSameOrigin(request.headers);
    const store = await cookies();
    const viewer = await verifySession(store.get(SESSION_COOKIE)?.value);
    if (viewer) await revokeSessions(viewer.uid);
    store.delete({ name: SESSION_COOKIE, path: "/" });
    return NextResponse.json({ ok: true }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof AppError) {
    return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: STATUS[error.code] ?? 400, headers: noStore });
  }
  console.error(JSON.stringify({ level: "error", msg: "session route failed", name: (error as Error)?.name }));
  return NextResponse.json({ ok: false, code: "INVALID", message: "Sign-in failed. Try again." }, { status: 500, headers: noStore });
}
