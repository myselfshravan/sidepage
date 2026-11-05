import "server-only";
import { Timestamp, type Transaction } from "@google-cloud/firestore";
import { canAdminister, canRequestAuthorship, ROLES, type Role } from "@/domain/access/policy";
import { checkSlug, slugify } from "@/domain/publication/slug";
import { authorRequestSchema, profileSchema } from "@/lib/validation/user";
import { AppError } from "../errors";
import { db } from "../firebase/admin";
import { col, type UserDoc } from "../firebase/model";
import type { Actor } from "./actor";
import { parseInput } from "./works";

/** Creates the reader profile on first sign-in; returns the existing one otherwise. */
export async function ensureUser(input: { uid: string; email: string; name: string | null }, now = new Date()): Promise<UserDoc> {
  const ref = col.user(input.uid);
  const existing = await ref.get();
  if (existing.exists) return existing.data() as UserDoc;
  const ts = Timestamp.fromDate(now);
  return db().runTransaction(async (tx) => {
    const again = await tx.get(ref);
    if (again.exists) return again.data() as UserDoc;
    const displayName = (input.name ?? input.email.split("@")[0] ?? "Reader").trim().slice(0, 80) || "Reader";
    const handle = await reserveHandle(tx, displayName, input.email, input.uid);
    const user: UserDoc = {
      handle,
      display_name: displayName,
      bio: "",
      email: input.email.toLowerCase(),
      role: "reader",
      author_status: "none",
      author_request: null,
      author_decided_by: null,
      author_decided_at: null,
      created_at: ts,
      updated_at: ts,
    };
    tx.create(ref, user);
    return user;
  });
}

async function reserveHandle(tx: Transaction, name: string, email: string, uid: string): Promise<string> {
  const base = slugify(name).slice(0, 30) || slugify(email.split("@")[0] ?? "").slice(0, 30) || "reader";
  const root = checkSlug(base) ? `reader-${base}`.slice(0, 30) : base;
  for (let n = 1; n <= 30; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const snap = await tx.get(col.handle(candidate));
    if (!snap.exists) {
      tx.create(col.handle(candidate), { uid });
      return candidate;
    }
  }
  const fallback = `${root}-${uid.slice(0, 6).toLowerCase()}`;
  tx.create(col.handle(fallback), { uid });
  return fallback;
}

export async function updateProfile(actor: Actor, input: unknown, now = new Date()): Promise<{ handle: string; previous: string }> {
  const data = parseInput(profileSchema, input);
  const result = await db().runTransaction(async (tx) => {
    const ref = col.user(actor.uid);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AppError("NOT_FOUND", "Your profile no longer exists.");
    const user = snap.data() as UserDoc;
    if (data.handle !== user.handle) {
      const taken = await tx.get(col.handle(data.handle));
      if (taken.exists) throw new AppError("CONFLICT", "That handle is taken.");
      tx.delete(col.handle(user.handle));
      tx.create(col.handle(data.handle), { uid: actor.uid });
    }
    tx.update(ref, { handle: data.handle, display_name: data.display_name, bio: data.bio, updated_at: Timestamp.fromDate(now) });
    return { handle: data.handle, previous: user.handle };
  });
  if (result.handle !== result.previous) {
    // Published works link to the author by handle; point them at the new one.
    const published = await col.published().where("owner_uid", "==", actor.uid).select().get();
    const writer = db().bulkWriter();
    for (const d of published.docs) writer.update(d.ref, { author_handle: result.handle });
    await writer.close();
  }
  return result;
}

export async function requestAuthorship(actor: Actor, input: unknown, now = new Date()): Promise<void> {
  const { pitch } = parseInput(authorRequestSchema, input);
  await db().runTransaction(async (tx) => {
    const ref = col.user(actor.uid);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AppError("NOT_FOUND", "Your profile no longer exists.");
    const user = snap.data() as UserDoc;
    if (!canRequestAuthorship({ uid: actor.uid, role: user.role }, user.author_status)) {
      throw new AppError("INVALID_TRANSITION", user.author_status === "requested" ? "Your request is already waiting for review." : "You can already write.");
    }
    tx.update(ref, { author_status: "requested", author_request: { pitch, requested_at: Timestamp.fromDate(now) }, updated_at: Timestamp.fromDate(now) });
  });
}

/** Admin decision on an author request. Approval makes the user an author immediately. */
export async function decideAuthorship(actor: Actor, uid: string, approve: boolean, now = new Date()): Promise<void> {
  assertAdmin(actor);
  await db().runTransaction(async (tx) => {
    const ref = col.user(uid);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AppError("NOT_FOUND", "That account no longer exists.");
    const user = snap.data() as UserDoc;
    if (user.author_status !== "requested") throw new AppError("INVALID_TRANSITION", "There is no pending request for this account.");
    const ts = Timestamp.fromDate(now);
    tx.update(ref, {
      author_status: approve ? "approved" : "rejected",
      role: approve && user.role === "reader" ? "author" : user.role,
      author_decided_by: actor.uid,
      author_decided_at: ts,
      updated_at: ts,
    });
  });
}

/** Admin override of a role, e.g. revoking an author. Admins can't demote themselves. */
export async function setRole(actor: Actor, uid: string, role: unknown, now = new Date()): Promise<void> {
  assertAdmin(actor);
  if (typeof role !== "string" || !(ROLES as readonly string[]).includes(role)) throw new AppError("INVALID", "Unknown role.");
  if (uid === actor.uid && role !== "admin") throw new AppError("INVALID", "You can't remove your own admin role.");
  await db().runTransaction(async (tx) => {
    const ref = col.user(uid);
    const snap = await tx.get(ref);
    if (!snap.exists) throw new AppError("NOT_FOUND", "That account no longer exists.");
    const next = role as Role;
    tx.update(ref, {
      role: next,
      author_status: next === "reader" ? "none" : "approved",
      updated_at: Timestamp.fromDate(now),
    });
  });
}

function assertAdmin(actor: Actor) {
  if (actor.kind !== "user" || !canAdminister(actor)) throw new AppError("FORBIDDEN", "Only administrators can do that.");
}

export type UserSummary = {
  uid: string;
  handle: string;
  displayName: string;
  email: string;
  role: Role;
  authorStatus: UserDoc["author_status"];
  pitch: string | null;
  requestedAt: string | null;
  createdAt: string;
};

function toSummary(uid: string, u: UserDoc): UserSummary {
  return {
    uid,
    handle: u.handle,
    displayName: u.display_name,
    email: u.email,
    role: u.role,
    authorStatus: u.author_status,
    pitch: u.author_request?.pitch ?? null,
    requestedAt: u.author_request?.requested_at.toDate().toISOString() ?? null,
    createdAt: u.created_at.toDate().toISOString(),
  };
}

export async function listAuthorRequests(actor: Actor): Promise<UserSummary[]> {
  assertAdmin(actor);
  const snap = await col.users().where("author_status", "==", "requested").orderBy("updated_at", "asc").limit(100).get();
  return snap.docs.map((d) => toSummary(d.id, d.data() as UserDoc));
}

export const USERS_PAGE = 25;

export async function listUsers(actor: Actor, after?: string): Promise<{ items: UserSummary[]; next: string | null }> {
  assertAdmin(actor);
  let query = col.users().orderBy("created_at", "desc");
  if (after) {
    const cursor = await col.user(after).get();
    if (cursor.exists) query = query.startAfter(cursor);
  }
  const snap = await query.limit(USERS_PAGE + 1).get();
  const docs = snap.docs.slice(0, USERS_PAGE);
  return { items: docs.map((d) => toSummary(d.id, d.data() as UserDoc)), next: snap.docs.length > USERS_PAGE ? docs[docs.length - 1]!.id : null };
}

export async function getUser(uid: string): Promise<UserDoc | null> {
  const snap = await col.user(uid).get();
  return snap.exists ? (snap.data() as UserDoc) : null;
}
