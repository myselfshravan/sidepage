"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createShareLinkAction, revokeShareLinkAction } from "@/app/studio/actions";
import type { ShareLinkSummary } from "@/server/services/share-links";
import { Button, Field, inputClass, Panel } from "./ui";

const EXPIRY = [
  ["", "Never"],
  ["1", "1 day"],
  ["7", "7 days"],
  ["30", "30 days"],
  ["365", "1 year"],
] as const;

export function ShareLinksPanel({ workId, links, live }: { workId: string; links: ShareLinkSummary[]; live: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();
  const [confirm, setConfirm] = useState<string | null>(null);

  return (
    <Panel id="share" title="Secret links" description="Anyone with a link can read this publication, even if it's private. Links never appear anywhere public.">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const days = String(f.get("expiry") ?? "");
          startTransition(async () => {
            setError(undefined);
            setCopied(false);
            const r = await createShareLinkAction(workId, { label: String(f.get("label") ?? ""), expires_in_days: days ? Number(days) : null });
            if (r.ok) {
              setCreated(r.value.url);
              router.refresh();
            } else setError(r.message);
          });
        }}
      >
        <div className="grid grid-cols-[1fr_7rem] gap-2">
          <Field label="Who is it for?" htmlFor="link-label" hint="Only you see this.">
            <input id="link-label" name="label" maxLength={80} placeholder="e.g. Writing group" className={inputClass} />
          </Field>
          <Field label="Expires" htmlFor="link-expiry">
            <select id="link-expiry" name="expiry" className={inputClass} defaultValue="">
              {EXPIRY.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <Button type="submit" variant="primary" disabled={pending} className="w-full">
          {pending ? "Creating…" : "Create link"}
        </Button>
        {!live ? <p className="text-xs text-muted">Links open the published edition, so they start working once this is published.</p> : null}
      </form>

      {created ? (
        <div className="mt-4 rounded-[var(--radius)] border border-success/40 bg-paper p-3">
          <p className="text-xs text-muted">Copy it now. For safety, the full link is only shown once.</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={created} className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} aria-label="New secret link" />
            <Button
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(created).catch(() => undefined);
                setCopied(true);
              }}
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        </div>
      ) : null}

      {links.length > 0 ? (
        <ul className="mt-5 divide-y divide-rule border-t border-rule text-sm">
          {links.map((l) => (
            <li key={l.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className={l.active ? "font-medium" : "text-muted line-through"}>{l.label || "Untitled link"}</p>
                <p className="text-xs text-muted">
                  {l.revokedAt ? "Revoked" : !l.active ? "Expired" : l.expiresAt ? `Expires ${new Date(l.expiresAt).toLocaleDateString()}` : "No expiry"}
                  {l.lastOpenedAt ? `, last opened ${new Date(l.lastOpenedAt).toLocaleDateString()}` : ", not opened yet"}
                </p>
              </div>
              {l.active ? (
                confirm === l.id ? (
                  <span className="flex gap-1">
                    <Button
                      size="sm"
                      variant="danger"
                      disabled={pending}
                      onClick={() =>
                        startTransition(async () => {
                          const r = await revokeShareLinkAction(workId, l.id);
                          if (!r.ok) setError(r.message);
                          setConfirm(null);
                          router.refresh();
                        })
                      }
                    >
                      Revoke
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirm(null)}>
                      Keep
                    </Button>
                  </span>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => setConfirm(l.id)}>
                    Revoke
                  </Button>
                )
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </Panel>
  );
}
