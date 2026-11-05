"use server";

import { refresh } from "next/cache";
import { headers } from "next/headers";
import { requireUser } from "@/server/auth/session";
import { asResult, type ActionResult } from "@/server/errors";
import { assertSameOrigin } from "@/server/http/origin";
import { LIMITS, rateLimit } from "@/server/http/rate-limit";
import { actorFrom } from "@/server/services/actor";
import * as users from "@/server/services/users";

async function guard() {
  assertSameOrigin(await headers());
  const viewer = await requireUser();
  await rateLimit(LIMITS.write, viewer.uid);
  return actorFrom(viewer);
}

export async function updateProfileAction(input: unknown): Promise<ActionResult> {
  return asResult(async () => {
    await users.updateProfile(await guard(), input);
    refresh();
    return undefined;
  });
}

export async function requestAuthorshipAction(input: unknown): Promise<ActionResult> {
  return asResult(async () => {
    await users.requestAuthorship(await guard(), input);
    refresh();
    return undefined;
  });
}
