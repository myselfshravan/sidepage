import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  allowedCommands,
  MIN_SCHEDULE_LEAD_MS,
  transition,
  type Command,
  type LifecycleState,
} from "@/domain/lifecycle/machine";

const now = new Date("2026-11-05T12:00:00Z");
const draft: LifecycleState = { status: "DRAFT", scheduledFor: null, archivedFrom: null, hasEdition: false };

function run(state: LifecycleState, command: Command, at = now) {
  const result = transition(state, command, at);
  if (!result.ok) throw new Error(result.error.message);
  return result.value;
}

describe("lifecycle transitions", () => {
  it("submits for review and rejects back to draft", () => {
    const review = run(draft, { type: "submit" });
    expect(review.next.status).toBe("REVIEW");
    const rejected = run(review.next, { type: "reject", note: "tighten chapter 2" });
    expect(rejected.next.status).toBe("DRAFT");
    expect(rejected.event).toBe("REVIEW_REJECTED");
  });

  it("lets the author pull a submission back to draft", () => {
    const review = run(draft, { type: "submit" }).next;
    const back = run(review, { type: "returnToDraft" });
    expect(back.next.status).toBe("DRAFT");
    expect(back.event).toBe("RETURNED_TO_DRAFT");
  });

  it("publishes immediately and asks for an edition dated now", () => {
    const t = run(draft, { type: "publish" });
    expect(t.next.status).toBe("PUBLISHED");
    expect(t.seal).toEqual({ effectiveAt: now });
    expect(t.live).toBe(true);
  });

  it("backdates a publication to a historical date", () => {
    const historical = new Date("1998-06-01T00:00:00Z");
    const t = run(draft, { type: "publish", effectiveAt: historical });
    expect(t.seal?.effectiveAt).toEqual(historical);
  });

  it("refuses a future publication date (that is a schedule)", () => {
    const result = transition(draft, { type: "publish", effectiveAt: new Date(now.getTime() + 3600_000) }, now);
    expect(result.ok).toBe(false);
  });

  it("schedules, cancels, and requires a lead time", () => {
    const at = new Date(now.getTime() + 3600_000);
    const scheduled = run(draft, { type: "schedule", at });
    expect(scheduled.next).toMatchObject({ status: "SCHEDULED", scheduledFor: at });
    expect(scheduled.seal).toBeNull();
    const cancelled = run(scheduled.next, { type: "cancelSchedule" });
    expect(cancelled.next).toMatchObject({ status: "DRAFT", scheduledFor: null });

    const tooSoon = transition(draft, { type: "schedule", at: new Date(now.getTime() + MIN_SCHEDULE_LEAD_MS - 1) }, now);
    expect(tooSoon.ok).toBe(false);
  });

  it("fires a due schedule dated at the intended time, even when the job runs late", () => {
    const at = new Date(now.getTime() + 3600_000);
    const scheduled = run(draft, { type: "schedule", at }).next;
    expect(transition(scheduled, { type: "fireSchedule" }, now).ok).toBe(false);

    const threeHoursLate = new Date(at.getTime() + 3 * 3600_000);
    const fired = run(scheduled, { type: "fireSchedule" }, threeHoursLate);
    expect(fired.next.status).toBe("PUBLISHED");
    expect(fired.seal?.effectiveAt).toEqual(at);
  });

  it("republishes a published work as a new edition", () => {
    const published = run(draft, { type: "publish" }).next;
    const t = run(published, { type: "republish" });
    expect(t.event).toBe("REPUBLISHED");
    expect(t.seal).not.toBeNull();
  });

  it("withdraws to draft but keeps the edition record", () => {
    const published = run(draft, { type: "publish" }).next;
    const t = run(published, { type: "withdraw" });
    expect(t.next).toMatchObject({ status: "DRAFT", hasEdition: true });
    expect(t.live).toBe(false);
  });

  it("archives and restores back to the public state it left", () => {
    const published = run(draft, { type: "publish" }).next;
    const archived = run(published, { type: "archive" });
    expect(archived.next).toMatchObject({ status: "ARCHIVED", archivedFrom: "PUBLISHED" });
    expect(archived.live).toBe(false);
    const restored = run(archived.next, { type: "restore" });
    expect(restored.next.status).toBe("PUBLISHED");
    expect(restored.live).toBe(true);
    expect(restored.seal).toBeNull();
  });

  it("restores an archived draft to draft", () => {
    const archived = run(draft, { type: "archive" }).next;
    const restored = run(archived, { type: "restore" });
    expect(restored.next.status).toBe("DRAFT");
    expect(restored.live).toBe(false);
  });

  it("does not archive a scheduled work without cancelling first", () => {
    const scheduled = run(draft, { type: "schedule", at: new Date(now.getTime() + 3600_000) }).next;
    expect(transition(scheduled, { type: "archive" }, now).ok).toBe(false);
  });

  it("lists the commands available in each state", () => {
    expect(allowedCommands("PUBLISHED").sort()).toEqual(["archive", "republish", "withdraw"]);
    expect(allowedCommands("ARCHIVED")).toEqual(["restore"]);
  });
});

const commandArb: fc.Arbitrary<Command> = fc.oneof(
  fc.constant<Command>({ type: "submit" }),
  fc.constant<Command>({ type: "reject" }),
  fc.constant<Command>({ type: "returnToDraft" }),
  fc.integer({ min: -7200, max: 7200 }).map<Command>((s) => ({ type: "schedule", at: new Date(now.getTime() + s * 1000) })),
  fc.constant<Command>({ type: "cancelSchedule" }),
  fc.option(fc.integer({ min: -1e6, max: 3600 })).map<Command>((s) =>
    s === null ? { type: "publish" } : { type: "publish", effectiveAt: new Date(now.getTime() + s * 1000) },
  ),
  fc.constant<Command>({ type: "fireSchedule" }),
  fc.constant<Command>({ type: "republish" }),
  fc.constant<Command>({ type: "withdraw" }),
  fc.constant<Command>({ type: "archive" }),
  fc.constant<Command>({ type: "restore" }),
);

describe("lifecycle invariants (property-based)", () => {
  it("holds over any sequence of commands", () => {
    fc.assert(
      fc.property(fc.array(fc.tuple(commandArb, fc.integer({ min: 0, max: 7200 })), { maxLength: 40 }), (steps) => {
        let state = draft;
        let clock = now.getTime();
        let live = false;
        for (const [command, advance] of steps) {
          clock += advance * 1000;
          const at = new Date(clock);
          const result = transition(state, command, at);
          if (!result.ok) {
            continue; // rejected commands never change state
          }
          const t = result.value;
          // Public iff published.
          expect(t.live).toBe(t.next.status === "PUBLISHED");
          // Only PUBLISHED results may seal, and sealing never uses a future date.
          if (t.seal) {
            expect(t.next.status).toBe("PUBLISHED");
            expect(t.seal.effectiveAt.getTime()).toBeLessThanOrEqual(clock);
          }
          // A schedule exists only in SCHEDULED, and is always in the future when set.
          if (t.next.status === "SCHEDULED") {
            expect(t.next.scheduledFor!.getTime()).toBeGreaterThan(clock);
          } else {
            expect(t.next.scheduledFor).toBeNull();
          }
          // Once an edition exists, nothing un-exists it.
          if (state.hasEdition) expect(t.next.hasEdition).toBe(true);
          // Only archive records where it came from.
          expect(t.next.archivedFrom !== null).toBe(t.next.status === "ARCHIVED");
          state = t.next;
          live = t.live;
        }
        expect(typeof live).toBe("boolean");
      }),
      { numRuns: 500 },
    );
  });
});
