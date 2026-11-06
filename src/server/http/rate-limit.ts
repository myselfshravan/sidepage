import "server-only";
import { Timestamp } from "@google-cloud/firestore";
import { sha256Hex } from "@/domain/manuscript/canonical";
import { serverEnv } from "@/lib/env.server";
import { AppError } from "../errors";
import { col, type RateLimitDoc } from "../firebase/model";
import { db } from "../firebase/admin";

export type Limit = { name: string; max: number; windowSeconds: number };

/** Sign-ins per IP per minute. Configurable because offices and campuses share an IP. */
const sessionMax = Number(process.env.SESSION_RATE_LIMIT_PER_MIN ?? "") || 20;

export const LIMITS = {
  session: { name: "session", max: sessionMax, windowSeconds: 60 },
  save: { name: "save", max: 120, windowSeconds: 60 },
  publish: { name: "publish", max: 20, windowSeconds: 60 },
  write: { name: "write", max: 60, windowSeconds: 60 },
  comment: { name: "comment", max: 10, windowSeconds: 60 },
  /** Agents publishing in parallel share one budget per token owner. */
  api: { name: "api", max: Number(process.env.API_RATE_LIMIT_PER_MIN ?? "") || 600, windowSeconds: 60 },
} satisfies Record<string, Limit>;

/**
 * Fixed-window counter in Firestore, keyed by a salted hash so raw IPs and uids are
 * never stored. Documents carry `expires_at` for a Firestore TTL policy.
 */
export async function rateLimit(limit: Limit, subject: string, now = new Date()): Promise<void> {
  const key = sha256Hex(`${serverEnv().RATE_LIMIT_SALT}:${limit.name}:${subject}`);
  const ref = col.rateLimit(key);
  const windowMs = limit.windowSeconds * 1000;

  const allowed = await db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() as RateLimitDoc | undefined;
    const fresh = !data || now.getTime() - data.window_start.toMillis() >= windowMs;
    const count = fresh ? 1 : data.count + 1;
    const windowStart = fresh ? Timestamp.fromDate(now) : data.window_start;
    tx.set(ref, {
      window_start: windowStart,
      count,
      expires_at: Timestamp.fromMillis(windowStart.toMillis() + windowMs * 2),
    } satisfies RateLimitDoc);
    return count <= limit.max;
  });

  if (!allowed) throw new AppError("RATE_LIMITED", "Too many requests. Wait a moment and try again.");
}
