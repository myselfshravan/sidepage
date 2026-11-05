"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { lifecycleAction, type CommandInput } from "@/app/studio/actions";
import { instantToZonedWallTime } from "@/domain/dates/partial-date";
import { allowedCommands } from "@/domain/lifecycle/machine";
import type { Status } from "@/domain/types";
import { track } from "@/lib/analytics";
import { formatDateInZone } from "@/lib/format";
import { Button, Field, inputClass, Panel } from "./ui";

type Props = { workId: string; status: Status; timezone: string; hasChapters: boolean; hasEdition: boolean; scheduledFor: string | null };

const DESCRIPTIONS: Record<Status, string> = {
  DRAFT: "Only you can see this draft.",
  REVIEW: "Waiting for a final read before publishing.",
  SCHEDULED: "Will publish automatically at the scheduled time.",
  PUBLISHED: "Live. Editing the draft does not change what readers see until you republish.",
  ARCHIVED: "Hidden from readers. Restore to make it available again.",
};

export function PublishPanel({ workId, status, timezone, hasChapters, hasEdition, scheduledFor }: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [message, setMessage] = useState<string>();
  const [confirming, setConfirming] = useState<string | null>(null);
  const [mode, setMode] = useState<"now" | "backdate" | "schedule">("now");
  const [wall, setWall] = useState(() => instantToZonedWallTime(new Date(Date.now() + 24 * 3600_000), timezone));
  const [backdate, setBackdate] = useState(() => instantToZonedWallTime(new Date(), timezone));
  const [note, setNote] = useState("");
  const allowed = new Set(allowedCommands(status));

  const run = (input: CommandInput, success: string) => {
    setError(undefined);
    setMessage(undefined);
    setConfirming(null);
    startTransition(async () => {
      const result = await lifecycleAction(workId, input);
      if (result.ok && (input.type === "publish" || input.type === "republish" || input.type === "schedule")) {
        track("published", { work_id: workId, edition_id: result.value.editionId, kind: input.type });
      }
      if (result.ok) {
        setMessage(success);
        router.refresh();
      } else {
        setError(result.message);
      }
    });
  };

  const confirmable = (key: string, label: string, input: CommandInput, success: string, variant: "secondary" | "danger" = "secondary") =>
    confirming === key ? (
      <span className="flex gap-2">
        <Button variant="danger" size="sm" disabled={pending} onClick={() => run(input, success)}>
          Confirm {label.toLowerCase()}
        </Button>
        <Button variant="ghost" size="sm" onClick={() => setConfirming(null)}>
          Cancel
        </Button>
      </span>
    ) : (
      <Button variant={variant} size="sm" disabled={pending} onClick={() => setConfirming(key)}>
        {label}
      </Button>
    );

  const canPublish = allowed.has("publish") || allowed.has("republish");
  const publishType = allowed.has("republish") ? "republish" : "publish";

  return (
    <Panel id="publishing" title="Publishing" description={DESCRIPTIONS[status]}>
      <div className="space-y-5">
        {status === "SCHEDULED" && scheduledFor ? (
          <p className="text-sm">
            Scheduled for <strong>{formatDateInZone(scheduledFor, timezone)}</strong> ({timezone}).
          </p>
        ) : null}

        {canPublish ? (
          <div className="space-y-3">
            <fieldset className="flex flex-wrap gap-1 text-sm" aria-label="When">
              {(
                [
                  ["now", "Now"],
                  ["backdate", "Historical date"],
                  ...(allowed.has("schedule") ? ([["schedule", "Schedule"]] as const) : []),
                ] as const
              ).map(([value, label]) => (
                <label key={value} className="cursor-pointer rounded-full border border-rule px-3 py-1 has-[:checked]:border-ink has-[:checked]:font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]">
                  <input type="radio" name="publish-mode" value={value} checked={mode === value} onChange={() => setMode(value)} className="sr-only" />
                  {label}
                </label>
              ))}
            </fieldset>

            {mode === "backdate" ? (
              <Field label={`Publication date (${timezone})`} htmlFor="backdate" hint="Readers will see this as the publication date. When it actually ran is recorded too.">
                <input id="backdate" type="datetime-local" value={backdate} onChange={(e) => setBackdate(e.target.value)} className={inputClass} />
              </Field>
            ) : null}
            {mode === "schedule" ? (
              <Field label={`Publish at (${timezone})`} htmlFor="schedule-at" hint="Checked every 15 minutes; dated exactly at this time.">
                <input id="schedule-at" type="datetime-local" value={wall} onChange={(e) => setWall(e.target.value)} className={inputClass} />
              </Field>
            ) : null}

            <Button
              variant="primary"
              className="w-full"
              disabled={pending || !hasChapters}
              onClick={() => {
                if (mode === "schedule") run({ type: "schedule", at: { wall, timeZone: timezone } }, "Scheduled.");
                else if (mode === "backdate") run({ type: publishType, effectiveAt: { wall: backdate, timeZone: timezone } }, "Published with a historical date.");
                else run({ type: publishType }, publishType === "republish" ? "New edition published." : "Published.");
              }}
            >
              {pending ? "Working…" : mode === "schedule" ? "Schedule" : publishType === "republish" ? "Publish new edition" : "Publish"}
            </Button>
            {!hasChapters ? <p className="text-xs text-muted">Add a chapter before publishing.</p> : null}
          </div>
        ) : null}

        <div className="flex flex-wrap gap-2 border-t border-rule pt-4">
          {allowed.has("submit") ? (
            <Button size="sm" disabled={pending} onClick={() => run({ type: "submit" }, "Submitted for review.")}>
              Submit for review
            </Button>
          ) : null}
          {allowed.has("returnToDraft") ? (
            <Button size="sm" disabled={pending} onClick={() => run({ type: "returnToDraft" }, "Back to draft.")}>
              Return to draft
            </Button>
          ) : null}
          {allowed.has("cancelSchedule") ? confirmable("cancel", "Cancel schedule", { type: "cancelSchedule" }, "Schedule cancelled.") : null}
          {allowed.has("withdraw") ? confirmable("withdraw", "Withdraw", { type: "withdraw" }, "Withdrawn. Editions are kept.", "danger") : null}
          {allowed.has("archive") ? confirmable("archive", "Archive", { type: "archive" }, "Archived.", "danger") : null}
          {allowed.has("restore") ? (
            <Button size="sm" variant="primary" disabled={pending} onClick={() => run({ type: "restore" }, hasEdition ? "Restored." : "Restored to draft.")}>
              Restore
            </Button>
          ) : null}
        </div>

        {allowed.has("reject") ? (
          <div className="space-y-2 border-t border-rule pt-4">
            <Field label="Review note" htmlFor="review-note" hint="Optional. Saved in the history.">
              <input id="review-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className={inputClass} />
            </Field>
            <Button size="sm" disabled={pending} onClick={() => run({ type: "reject", note: note || undefined }, "Sent back to draft.")}>
              Send back to draft
            </Button>
          </div>
        ) : null}

        <p aria-live="polite" className="min-h-5 text-sm">
          {error ? <span className="text-danger">{error}</span> : message ? <span className="text-success">{message}</span> : null}
        </p>
      </div>
    </Panel>
  );
}
