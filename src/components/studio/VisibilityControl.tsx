"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { setVisibilityAction } from "@/app/studio/actions";
import type { Visibility } from "@/domain/types";
import { Panel } from "./ui";

const OPTIONS: { value: Visibility; label: string; hint: string }[] = [
  { value: "PUBLIC", label: "Public", hint: "Listed in the collection and open to everyone." },
  { value: "UNLISTED", label: "Unlisted", hint: "Hidden from the public site. Share links arrive with invitations." },
  { value: "PRIVATE", label: "Private", hint: "Hidden from the public site. Invited readers arrive with invitations." },
];

export function VisibilityControl({ workId, visibility }: { workId: string; visibility: Visibility }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  return (
    <Panel id="visibility" title="Visibility" description="Takes effect on the live site immediately.">
      <fieldset disabled={pending} className="space-y-2">
        <legend className="sr-only">Visibility</legend>
        {OPTIONS.map((o) => (
          <label key={o.value} className="flex cursor-pointer gap-3 rounded-[var(--radius)] border border-rule px-3 py-2 has-[:checked]:border-ink has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]">
            <input
              type="radio"
              name="visibility"
              value={o.value}
              checked={visibility === o.value}
              onChange={() =>
                startTransition(async () => {
                  setError(undefined);
                  const r = await setVisibilityAction(workId, o.value);
                  if (!r.ok) setError(r.message);
                  router.refresh();
                })
              }
              className="mt-1"
            />
            <span>
              <span className="block text-sm font-medium">{o.label}</span>
              <span className="block text-xs text-muted">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </Panel>
  );
}
