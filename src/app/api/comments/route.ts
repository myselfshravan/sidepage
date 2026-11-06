import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { requireUser, SESSION_COOKIE, verifySession } from "@/server/auth/session";
import { AppError, type ErrorCode } from "@/server/errors";
import { assertSameOrigin } from "@/server/http/origin";
import { LIMITS, rateLimit } from "@/server/http/rate-limit";
import { actorFrom } from "@/server/services/actor";
import * as comments from "@/server/services/comments";

// Chapter comments for static reading pages: GET lists, POST posts or removes.
const noStore = { "Cache-Control": "private, no-store" };
const STATUS: Partial<Record<ErrorCode, number>> = { UNAUTHENTICATED: 401, FORBIDDEN: 403, NOT_FOUND: 404, RATE_LIMITED: 429, INVALID: 400 };

export async function GET(request: NextRequest) {
  try {
    const viewer = await verifySession(request.cookies.get(SESSION_COOKIE)?.value);
    const params = request.nextUrl.searchParams;
    const result = await comments.listComments(viewer ? actorFrom(viewer) : null, params.get("work"), params.get("chapter"));
    return NextResponse.json({ ...result, signedIn: !!viewer }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

const op = z.discriminatedUnion("op", [
  z.object({ op: z.literal("post"), data: z.unknown() }),
  z.object({ op: z.literal("note"), data: z.unknown() }),
  z.object({ op: z.literal("remove"), id: z.string() }),
]);

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request.headers);
    const viewer = await requireUser();
    const parsed = op.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw new AppError("INVALID", "Malformed request.");
    const actor = actorFrom(viewer);
    if (parsed.data.op === "remove") {
      await rateLimit(LIMITS.write, viewer.uid);
      await comments.removeComment(actor, parsed.data.id);
      return NextResponse.json({ ok: true }, { headers: noStore });
    }
    await rateLimit(LIMITS.comment, viewer.uid);
    const result = parsed.data.op === "note" ? await comments.postAuthorNote(actor, parsed.data.data) : await comments.postComment(actor, parsed.data.data);
    return NextResponse.json({ ok: true, ...result }, { headers: noStore });
  } catch (error) {
    return failure(error);
  }
}

function failure(error: unknown) {
  if (error instanceof AppError) return NextResponse.json({ ok: false, code: error.code, message: error.message }, { status: STATUS[error.code] ?? 400, headers: noStore });
  console.error(JSON.stringify({ level: "error", msg: "comments route failed", name: (error as Error)?.name }));
  return NextResponse.json({ ok: false, message: "Something went wrong." }, { status: 500, headers: noStore });
}
