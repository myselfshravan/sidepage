import "server-only";
import { randomBytes } from "node:crypto";
import { Timestamp } from "@google-cloud/firestore";
import { z } from "zod";
import { sha256Hex } from "@/domain/manuscript/canonical";
import { AppError } from "../errors";
import { col, type ShareLinkDoc } from "../firebase/model";
import type { Actor } from "./actor";
import { parseInput, requireManagedWork } from "./works";

// Secret links. The token is the key: 32 random bytes, shown once when the link is
// created and stored only as its SHA-256, so a database leak reveals no usable links.
// Links can expire and be revoked; both take effect on the very next request.

export const SHARE_TOKEN_PREFIX = "k_";
const MAX_LINKS_PER_WORK = 100;

export function hashShareToken(token: string): string {
  return sha256Hex(`share:${token}`);
}

export function isShareTokenShape(token: string): boolean {
  return /^k_[A-Za-z0-9_-]{43}$/.test(token);
}

const createInput = z.object({
  label: z.string().trim().max(80).default(""),
  expires_in_days: z.number().int().min(1).max(3650).nullable().default(null),
  /** Makes the link a gift: the recipient sees a dedication before the book. */
  gift: z
    .object({
      recipient_name: z.string().trim().min(1, "Who is the gift for?").max(80),
      dedication: z.string().trim().max(1000).default(""),
    })
    .nullable()
    .default(null),
});

export async function createShareLink(actor: Actor, workId: string, input: unknown, now = new Date()): Promise<{ token: string; id: string; expiresAt: string | null }> {
  const work = await requireManagedWork(actor, workId);
  const data = parseInput(createInput, input ?? {});
  const existing = await col.shareLinks().where("work_id", "==", workId).count().get();
  if (existing.data().count >= MAX_LINKS_PER_WORK) throw new AppError("INVALID", "This publication has the maximum number of links. Revoke some first.");
  const token = `${SHARE_TOKEN_PREFIX}${randomBytes(32).toString("base64url")}`;
  const id = hashShareToken(token);
  const expires = data.expires_in_days ? Timestamp.fromMillis(now.getTime() + data.expires_in_days * 86_400_000) : null;
  await col.shareLink(id).create({
    work_id: workId,
    owner_uid: work.owner_uid,
    label: data.label,
    created_by: actor.uid,
    created_at: Timestamp.fromDate(now),
    expires_at: expires,
    revoked_at: null,
    last_opened_at: null,
    gift: data.gift,
  } satisfies ShareLinkDoc);
  return { token, id, expiresAt: expires?.toDate().toISOString() ?? null };
}

export type ShareLinkSummary = {
  id: string;
  label: string;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
  lastOpenedAt: string | null;
  active: boolean;
  giftFor: string | null;
};

export async function listShareLinks(actor: Actor, workId: string, now = new Date()): Promise<ShareLinkSummary[]> {
  await requireManagedWork(actor, workId);
  const snap = await col.shareLinks().where("work_id", "==", workId).orderBy("created_at", "desc").limit(MAX_LINKS_PER_WORK).get();
  return snap.docs.map((d) => {
    const l = d.data() as ShareLinkDoc;
    const expired = !!l.expires_at && l.expires_at.toMillis() <= now.getTime();
    return {
      id: d.id,
      label: l.label,
      createdAt: l.created_at.toDate().toISOString(),
      expiresAt: l.expires_at?.toDate().toISOString() ?? null,
      revokedAt: l.revoked_at?.toDate().toISOString() ?? null,
      lastOpenedAt: l.last_opened_at?.toDate().toISOString() ?? null,
      active: !l.revoked_at && !expired,
      giftFor: l.gift?.recipient_name ?? null,
    };
  });
}

export async function revokeShareLink(actor: Actor, workId: string, linkId: unknown, now = new Date()): Promise<void> {
  await requireManagedWork(actor, workId);
  const id = parseInput(z.string().regex(/^[a-f0-9]{64}$/), linkId);
  const ref = col.shareLink(id);
  const snap = await ref.get();
  const link = snap.data() as ShareLinkDoc | undefined;
  if (!link || link.work_id !== workId) throw new AppError("NOT_FOUND", "That link doesn't exist.");
  if (!link.revoked_at) await ref.update({ revoked_at: Timestamp.fromDate(now) });
}
