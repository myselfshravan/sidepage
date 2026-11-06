"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createPersonaAction, updatePersonaAction } from "@/app/studio/actions";
import type { PersonaSummary } from "@/server/services/personas";
import { Button, Field, inputClass, Panel } from "./ui";

export function PersonasManager({ personas }: { personas: PersonaSummary[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
      <Panel id="list" title="Your personas">
        {personas.length === 0 ? (
          <p className="text-sm text-muted">No personas yet. Create one, then choose it as the byline on a publication.</p>
        ) : (
          <ul className="divide-y divide-rule">
            {personas.map((p) =>
              editing === p.id ? (
                <li key={p.id} className="py-4">
                  <form
                    className="space-y-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      const f = new FormData(e.currentTarget);
                      startTransition(async () => {
                        const r = await updatePersonaAction(p.id, { display_name: String(f.get("display_name")), handle: String(f.get("handle")), bio: String(f.get("bio")) });
                        if (r.ok) {
                          setEditing(null);
                          router.refresh();
                        } else setError(r.message);
                      });
                    }}
                  >
                    <div className="grid gap-3 sm:grid-cols-2">
                      <Field label="Name" htmlFor={`n-${p.id}`}>
                        <input id={`n-${p.id}`} name="display_name" defaultValue={p.displayName} required maxLength={80} className={inputClass} />
                      </Field>
                      <Field label="Handle" htmlFor={`h-${p.id}`}>
                        <input id={`h-${p.id}`} name="handle" defaultValue={p.handle} required maxLength={30} className={`${inputClass} font-mono`} />
                      </Field>
                    </div>
                    <Field label="Bio" htmlFor={`b-${p.id}`}>
                      <textarea id={`b-${p.id}`} name="bio" defaultValue={p.bio} rows={3} maxLength={600} className={inputClass} />
                    </Field>
                    <div className="flex gap-2">
                      <Button type="submit" variant="primary" size="sm" disabled={pending}>
                        Save
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setEditing(null)}>
                        Cancel
                      </Button>
                    </div>
                  </form>
                </li>
              ) : (
                <li key={p.id} className="flex items-start justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <p className="font-medium">{p.displayName}</p>
                    <p className="font-mono text-xs text-muted">@{p.handle}</p>
                    {p.bio ? <p className="mt-1 text-sm text-muted">{p.bio}</p> : null}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    <Link href={`/authors/${p.handle}`} target="_blank" className="inline-flex min-h-9 items-center px-3 text-sm text-muted hover:text-ink">
                      Page ↗
                    </Link>
                    <Button size="sm" variant="ghost" onClick={() => setEditing(p.id)}>
                      Edit
                    </Button>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </Panel>
      <Panel id="new" title="New persona">
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const f = new FormData(form);
            startTransition(async () => {
              setError(undefined);
              const r = await createPersonaAction({ display_name: String(f.get("display_name")), handle: String(f.get("handle") ?? ""), bio: String(f.get("bio") ?? "") });
              if (r.ok) {
                form.reset();
                router.refresh();
              } else setError(r.message);
            });
          }}
        >
          <Field label="Name" htmlFor="p-name">
            <input id="p-name" name="display_name" required maxLength={80} placeholder="e.g. V. Marlowe" className={inputClass} />
          </Field>
          <Field label="Handle" htmlFor="p-handle" hint="Optional. Made from the name if left blank.">
            <input id="p-handle" name="handle" maxLength={30} pattern="[a-z0-9]+(-[a-z0-9]+)*" className={`${inputClass} font-mono`} />
          </Field>
          <Field label="Bio" htmlFor="p-bio">
            <textarea id="p-bio" name="bio" rows={3} maxLength={600} className={inputClass} />
          </Field>
          <Button type="submit" variant="primary" disabled={pending} className="w-full">
            Create persona
          </Button>
          <p aria-live="polite" className="min-h-5 text-sm text-danger">
            {error}
          </p>
        </form>
      </Panel>
    </div>
  );
}
