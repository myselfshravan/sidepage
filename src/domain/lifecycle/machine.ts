import type { Status } from "../types";

// The publication lifecycle as a pure function. No I/O and no clock: the caller
// passes `now`, so every transition is reproducible in tests.
//
//   DRAFT ──submit──▶ REVIEW ──reject / returnToDraft──▶ DRAFT
//   DRAFT|REVIEW ──schedule(at)──▶ SCHEDULED ──cancelSchedule──▶ DRAFT
//   SCHEDULED ──fireSchedule (at ≤ now)──▶ PUBLISHED
//   DRAFT|REVIEW ──publish(effectiveAt ≤ now)──▶ PUBLISHED
//   PUBLISHED ──republish──▶ PUBLISHED (new edition)
//   PUBLISHED ──withdraw──▶ DRAFT (editions kept, nothing public)
//   DRAFT|REVIEW|PUBLISHED ──archive──▶ ARCHIVED ──restore──▶ previous public state
//
// Visibility (PUBLIC/UNLISTED/PRIVATE) is orthogonal and not modelled here.
// Editions are never changed by a transition; a transition can only ask for a new one.

export type LifecycleState = {
  status: Status;
  scheduledFor: Date | null;
  /** Status the work had when it was archived, so restore can return there. */
  archivedFrom: Status | null;
  /** Whether at least one sealed edition exists. */
  hasEdition: boolean;
};

export type Command =
  | { type: "submit" }
  | { type: "reject"; note?: string }
  | { type: "returnToDraft" }
  | { type: "schedule"; at: Date }
  | { type: "cancelSchedule" }
  | { type: "publish"; effectiveAt?: Date }
  | { type: "fireSchedule" }
  | { type: "republish"; effectiveAt?: Date }
  | { type: "withdraw" }
  | { type: "archive" }
  | { type: "restore" };

export type EventType =
  | "SUBMITTED"
  | "REVIEW_REJECTED"
  | "RETURNED_TO_DRAFT"
  | "SCHEDULED"
  | "SCHEDULE_CANCELLED"
  | "PUBLISHED"
  | "REPUBLISHED"
  | "WITHDRAWN"
  | "ARCHIVED"
  | "RESTORED";

export type Transition = {
  next: LifecycleState;
  event: EventType;
  /** When set, the caller must seal a new edition dated `effectiveAt`. */
  seal: { effectiveAt: Date } | null;
  /** Whether the public read model should be live after this transition. */
  live: boolean;
};

export type TransitionError = { code: "INVALID_TRANSITION" | "INVALID_TIME"; message: string };

export type Result = { ok: true; value: Transition } | { ok: false; error: TransitionError };

/** A schedule must be at least this far ahead, so it can't race the cron. */
export const MIN_SCHEDULE_LEAD_MS = 60_000;

const ALLOWED: Record<Command["type"], readonly Status[]> = {
  submit: ["DRAFT"],
  reject: ["REVIEW"],
  returnToDraft: ["REVIEW"],
  schedule: ["DRAFT", "REVIEW"],
  cancelSchedule: ["SCHEDULED"],
  publish: ["DRAFT", "REVIEW"],
  fireSchedule: ["SCHEDULED"],
  republish: ["PUBLISHED"],
  withdraw: ["PUBLISHED"],
  archive: ["DRAFT", "REVIEW", "PUBLISHED"],
  restore: ["ARCHIVED"],
};

export function allowedCommands(status: Status): Command["type"][] {
  return (Object.keys(ALLOWED) as Command["type"][]).filter((c) => ALLOWED[c].includes(status));
}

export function transition(state: LifecycleState, command: Command, now: Date): Result {
  if (!ALLOWED[command.type].includes(state.status)) {
    return fail("INVALID_TRANSITION", `Can't ${describe(command.type)} a ${state.status.toLowerCase()} publication.`);
  }
  const base = { ...state, scheduledFor: null, archivedFrom: null };

  switch (command.type) {
    case "submit":
      return ok({ ...base, status: "REVIEW" }, "SUBMITTED", null, false);
    case "reject":
      return ok({ ...base, status: "DRAFT" }, "REVIEW_REJECTED", null, false);
    case "returnToDraft":
      return ok({ ...base, status: "DRAFT" }, "RETURNED_TO_DRAFT", null, false);
    case "schedule":
      if (command.at.getTime() < now.getTime() + MIN_SCHEDULE_LEAD_MS) {
        return fail("INVALID_TIME", "Schedule a time at least a minute from now.");
      }
      return ok({ ...base, status: "SCHEDULED", scheduledFor: command.at }, "SCHEDULED", null, false);
    case "cancelSchedule":
      return ok({ ...base, status: "DRAFT" }, "SCHEDULE_CANCELLED", null, false);
    case "publish":
    case "republish": {
      const effectiveAt = command.effectiveAt ?? now;
      if (effectiveAt.getTime() > now.getTime()) {
        return fail("INVALID_TIME", "A publication date in the future is a schedule. Use Schedule instead.");
      }
      const event = command.type === "publish" ? "PUBLISHED" : "REPUBLISHED";
      return ok({ ...base, status: "PUBLISHED", hasEdition: true }, event, { effectiveAt }, true);
    }
    case "fireSchedule": {
      const at = state.scheduledFor;
      if (!at || at.getTime() > now.getTime()) {
        return fail("INVALID_TIME", "This publication isn't due yet.");
      }
      // Dated at the intended time, however late the job actually ran.
      return ok({ ...base, status: "PUBLISHED", hasEdition: true }, "PUBLISHED", { effectiveAt: at }, true);
    }
    case "withdraw":
      return ok({ ...base, status: "DRAFT" }, "WITHDRAWN", null, false);
    case "archive":
      return ok({ ...base, status: "ARCHIVED", archivedFrom: state.status }, "ARCHIVED", null, false);
    case "restore": {
      const backToPublic = state.archivedFrom === "PUBLISHED" && state.hasEdition;
      return ok({ ...base, status: backToPublic ? "PUBLISHED" : "DRAFT" }, "RESTORED", null, backToPublic);
    }
  }
}

function ok(next: LifecycleState, event: EventType, seal: Transition["seal"], live: boolean): Result {
  return { ok: true, value: { next, event, seal, live } };
}

function fail(code: TransitionError["code"], message: string): Result {
  return { ok: false, error: { code, message } };
}

function describe(command: Command["type"]): string {
  const words: Record<Command["type"], string> = {
    submit: "submit",
    reject: "reject",
    returnToDraft: "return to draft",
    schedule: "schedule",
    cancelSchedule: "cancel the schedule of",
    publish: "publish",
    fireSchedule: "release",
    republish: "republish",
    withdraw: "withdraw",
    archive: "archive",
    restore: "restore",
  };
  return words[command];
}
