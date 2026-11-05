import "server-only";

export type ErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "INVALID"
  | "RATE_LIMITED"
  | "INVALID_TRANSITION"
  | "INVALID_TIME"
  | "NO_CHANGES";

/** An expected failure whose message is safe to show the author. */
export class AppError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export type ActionResult<T = undefined> = { ok: true; value: T } | { ok: false; code: ErrorCode; message: string };

/**
 * Wraps a server action body so expected failures reach the UI as data, and
 * unexpected ones are logged without request payloads (which may be manuscripts).
 */
export async function asResult<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    if (error instanceof AppError) return { ok: false, code: error.code, message: error.message };
    // Re-throw Next.js control-flow errors (redirect, notFound).
    if (error && typeof error === "object" && "digest" in error && typeof error.digest === "string" && error.digest.startsWith("NEXT_")) {
      throw error;
    }
    console.error(JSON.stringify({ level: "error", msg: "action failed", name: (error as Error)?.name, message: (error as Error)?.message }));
    return { ok: false, code: "INVALID", message: "Something went wrong. Your last saved work is safe." };
  }
}
