import { timingSafeEqual } from "node:crypto";
import { revalidateTag } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";
import { serverEnv } from "@/lib/env.server";
import { SCHEDULER } from "@/server/services/actor";
import { runDueSchedules, sweepStaleSeals } from "@/server/services/publishing";

// Called every 15 minutes by .github/workflows/scheduled-publish.yml (Vercel Hobby
// crons run only daily). Idempotent: running late, twice, or concurrently is safe.

function authorised(request: NextRequest): boolean {
  const secret = serverEnv().CRON_SECRET;
  const header = request.headers.get("authorization") ?? "";
  if (!secret) return false;
  const expected = Buffer.from(`Bearer ${secret}`);
  const given = Buffer.from(header);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

async function handle(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ ok: false }, { status: 401 });
  const now = new Date();
  const run = await runDueSchedules(SCHEDULER, now);
  for (const tag of new Set(run.tags)) revalidateTag(tag, { expire: 0 });
  const swept = await sweepStaleSeals(now);
  console.info(JSON.stringify({ level: "info", msg: "scheduled publish run", published: run.published.length, skipped: run.skipped, swept }));
  return NextResponse.json({ ok: true, published: run.published, skipped: run.skipped, swept }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = handle;
export const POST = handle;
