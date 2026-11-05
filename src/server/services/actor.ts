import "server-only";
import type { Role } from "@/domain/access/policy";
import type { Viewer } from "../auth/session";

/** Who is performing a change. Services require one, so every write is attributable and authorised. */
export type Actor = { uid: string; kind: "user"; role: Role } | { uid: "system:scheduler"; kind: "system"; role: null };

export const actorFrom = (viewer: Viewer): Actor => ({ uid: viewer.uid, kind: "user", role: viewer.role });
export const SCHEDULER: Actor = { uid: "system:scheduler", kind: "system", role: null };
