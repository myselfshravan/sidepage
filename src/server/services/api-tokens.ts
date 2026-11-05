import "server-only";
import { randomBytes } from "node:crypto";
import { Timestamp } from "@google-cloud/firestore";
import { z } from "zod";
import { canAdminister, canWrite } from "@/domain/access/policy";
import { sha256Hex } from "@/domain/manuscript/canonical";
import { AppError } from "../errors";
import { col, type ApiTokenDoc, type UserDoc } from "../firebase/model";
import type { Actor } from "./actor";
import { parseInput } from "./works";

// Personal access tokens for agents (the MCP server, scripts). Only admins can create
// them. A token acts as its owner with the owner's *current* role, so demoting the
// owner or revoking the token cuts every agent off on its next call.

const PREFIX = "sp_";
const MAX_TOKENS = 50;

export const hashApiToken = (token: string) => sha256Hex(`api:${token}`);
const isTokenShape = (token: string) => /^sp_[A-Za-z0-9_-]{43}$/.test(token);

function assertAdmin(actor: Actor) {
  if (actor.kind !== "user" || !canAdminister(actor)) throw new AppError("FORBIDDEN", "Only administrators can manage API tokens.");
}

export async function createApiToken(actor: Actor, input: unknown, now = new Date()): Promise<{ token: string; id: string }> {
  assertAdmin(actor);
  const { name } = parseInput(z.object({ name: z.string().trim().min(1, "Name the token.").max(60) }), input);
  const count = await col.apiTokens().where("owner_uid", "==", actor.uid).count().get();
  if (count.data().count >= MAX_TOKENS) throw new AppError("INVALID", "You have the maximum number of tokens. Revoke some first.");
  const token = `${PREFIX}${randomBytes(32).toString("base64url")}`;
  const id = hashApiToken(token);
  await col.apiToken(id).create({
    owner_uid: actor.uid,
    name,
    hint: token.slice(0, 7),
    created_at: Timestamp.fromDate(now),
    last_used_at: null,
    revoked_at: null,
  } satisfies ApiTokenDoc);
  return { token, id };
}

export type ApiTokenSummary = { id: string; name: string; hint: string; createdAt: string; lastUsedAt: string | null; revoked: boolean };

export async function listApiTokens(actor: Actor): Promise<ApiTokenSummary[]> {
  assertAdmin(actor);
  const snap = await col.apiTokens().where("owner_uid", "==", actor.uid).orderBy("created_at", "desc").limit(MAX_TOKENS).get();
  return snap.docs.map((d) => {
    const t = d.data() as ApiTokenDoc;
    return {
      id: d.id,
      name: t.name,
      hint: t.hint,
      createdAt: t.created_at.toDate().toISOString(),
      lastUsedAt: t.last_used_at?.toDate().toISOString() ?? null,
      revoked: !!t.revoked_at,
    };
  });
}

export async function revokeApiToken(actor: Actor, id: unknown, now = new Date()): Promise<void> {
  assertAdmin(actor);
  const tid = parseInput(z.string().regex(/^[a-f0-9]{64}$/), id);
  const ref = col.apiToken(tid);
  const t = (await ref.get()).data() as ApiTokenDoc | undefined;
  if (!t || t.owner_uid !== actor.uid) throw new AppError("NOT_FOUND", "That token doesn't exist.");
  if (!t.revoked_at) await ref.update({ revoked_at: Timestamp.fromDate(now) });
}

/** Resolves a bearer token to the acting user, or null. The owner must still be able to write. */
export async function authenticateApiToken(token: string, now = new Date()): Promise<(Actor & { kind: "user" }) | null> {
  if (!isTokenShape(token)) return null;
  const ref = col.apiToken(hashApiToken(token));
  const t = (await ref.get()).data() as ApiTokenDoc | undefined;
  if (!t || t.revoked_at) return null;
  const user = (await col.user(t.owner_uid).get()).data() as UserDoc | undefined;
  if (!user || !canWrite({ uid: t.owner_uid, role: user.role })) return null;
  // Throttle the "last used" write to once a minute per token.
  if (!t.last_used_at || now.getTime() - t.last_used_at.toMillis() > 60_000) {
    void ref.update({ last_used_at: Timestamp.fromDate(now) }).catch(() => undefined);
  }
  return { uid: t.owner_uid, kind: "user", role: user.role };
}
