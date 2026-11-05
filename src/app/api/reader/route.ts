import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, verifySession, SESSION_COOKIE } from "@/server/auth/session";
import { AppError, type ErrorCode } from "@/server/errors";
import { assertSameOrigin } from "@/server/http/origin";
import { LIMITS, rateLimit } from "@/server/http/rate-limit";
import { actorFrom } from "@/server/services/actor";
import * as reader from "@/server/services/reader";

// The reader's own data, for static reading pages: GET returns state for one work
// (or `signedIn: false`); POST performs one operation. POST accepts `keepalive`
// fetches, so progress is saved even as the page closes.

const noStore = { "Cache-Control": "private, no-store" };
const STATUS: Partial<Record<ErrorCode, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, RATE_LIMITED: 429, INVALID: 400 };

export async function GET(request: NextRequest) {
  const viewer = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
  const work = request.nextUrl.searchParams.get("work");
  const author = request.nextUrl.searchParams.get("author");
  if (!viewer) return NextResponse.json({ signedIn: false }, { headers: noStore });
  try {
    const actor = actorFrom(viewer);
    if (author) return NextResponse.json({ signedIn: true, following: await reader.isFollowing(actor, author), self: author === viewer.uid }, { headers: noStore });
    if (!work) throw new AppError("INVALID", "Missing work.");
    return NextResponse.json({ signedIn: true, ...(await reader.readerState(actor, work)) }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

const op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("progress"), data: z.unknown() }),
  z.object({ op: z.literal("bookmark.add"), data: z.unknown() }),
  z.object({ op: z.literal("bookmark.remove"), id: z.string() }),
  z.object({ op: z.literal("save"), workId: z.string(), saved: z.boolean() }),
  z.object({ op: z.literal("follow"), authorUid: z.string(), following: z.boolean() }),
]);

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request.headers);
    const viewer = await requireUser();
    await rateLimit(LIMITS.save, viewer.uid);
    const parsed = op.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("INVALID", "Malformed request.");
    const actor = actorFrom(viewer);
    const body = parsed.data;
    switch (body.op) {
      case "progress":
        await reader.saveProgress(actor, body.data);
        return NextResponse.json({ ok: true }, { headers: noStore });
      case "bookmark.add":
        return NextResponse.json({ ok: true, ...(await reader.addBookmark(actor, body.data)) }, { headers: noStore });
      case "bookmark.remove":
        await reader.removeBookmark(actor, body.id);
        return NextResponse.json({ ok: true }, { headers: noStore });
      case "save":
        await reader.setSaved(actor, body.workId, body.saved);
        return NextResponse.json({ ok: true }, { headers: noStore });
      case "follow":
        await reader.setFollowing(actor, body.authorUid, body.following);
        return NextResponse.json({ ok: true }, { headers: noStore });
    }
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: STATUS[error.code] ?? 400, headers: noStore });
  console.error(JSON.stringify({ level: "error", msg: "reader route failed", name: (error as Error)?.name }));
  return NextResponse.json({ ok: false, message: "Something went wrong." }, { status: 500, headers: noStore });
}
