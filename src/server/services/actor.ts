import "server-only";
import type { Viewer } from "../auth/session";

/** Who is performing a change. Services require one, so every write is attributable. */
export type Actor = { uid: string; kind: "author" } | { uid: "system:scheduler"; kind: "system" };

export const authorActor = (viewer: Viewer): Actor => ({ uid: viewer.uid, kind: "author" });
export const SCHEDULER: Actor = { uid: "system:scheduler", kind: "system" };
