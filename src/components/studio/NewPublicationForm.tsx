"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { createWorkAction } from "@/app/studio/actions";
import { Button, Field, inputClass } from "./ui";

export function NewPublicationForm() {
  const router = useRouter();
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  return (
    <form
      className="space-y-4"
      onSubmit={async (e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        setBusy(true);
        setError(undefined);
        const result = await createWorkAction({ collection: String(data.get("collection")), title: String(data.get("title")) });
        if (result.ok) {
          router.push(`/studio/publications/${result.value.workId}`);
        } else {
          setError(result.message);
          setBusy(false);
        }
      }}
    >
      <Field label="Title" htmlFor="new-title" error={error}>
        <input id="new-title" name="title" required maxLength={200} className={inputClass} placeholder="The things we never said" />
      </Field>
      <fieldset className="space-y-1.5">
        <legend className="text-sm font-medium">Collection</legend>
        <div className="flex gap-2">
          {(["memoirs", "fiction"] as const).map((c) => (
            <label key={c} className="flex min-h-10 flex-1 cursor-pointer items-center justify-center rounded-[var(--radius)] border border-rule text-sm has-[:checked]:border-ink has-[:checked]:font-medium has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-[var(--focus)]">
              <input type="radio" name="collection" value={c} defaultChecked={c === "memoirs"} className="sr-only" />
              {c === "memoirs" ? "Memoir" : "Fiction"}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" variant="primary" disabled={busy} className="w-full">
        {busy ? "Creating…" : "Create draft"}
      </Button>
    </form>
  );
}
