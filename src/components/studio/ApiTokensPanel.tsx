"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createApiTokenAction, revokeApiTokenAction } from "@/app/studio/actions";
import type { ApiTokenSummary } from "@/server/services/api-tokens";
import { Button, Field, inputClass, Panel } from "./ui";

export function ApiTokensPanel({ tokens }: { tokens: ApiTokenSummary[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [created, setCreated] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string>();

  return (
    <Panel id="tokens" title="Agent tokens" description="For the sidepage MCP server and scripts. A token can do everything you can do in the studio, as you. See docs/AGENTS.md.">
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          const name = String(new FormData(e.currentTarget).get("name") ?? "");
          startTransition(async () => {
            setError(undefined);
            setCopied(false);
            const r = await createApiTokenAction(name);
            if (r.ok) {
              setCreated(r.value.token);
              router.refresh();
            } else setError(r.message);
          });
        }}
      >
        <Field label="Token name" htmlFor="token-name">
          <input id="token-name" name="name" required maxLength={60} placeholder="e.g. Seeding swarm" className={inputClass} />
        </Field>
        <Button type="submit" variant="primary" disabled={pending} className="mt-auto shrink-0">
          Create token
        </Button>
      </form>
      {created ? (
        <div className="mt-4 rounded-[var(--radius)] border border-rule bg-paper p-3">
          <p className="text-xs text-muted">Copy it now; it won&apos;t be shown again. Store it like a password.</p>
          <div className="mt-2 flex gap-2">
            <input readOnly value={created} aria-label="New API token" className={`${inputClass} font-mono text-xs`} onFocus={(e) => e.currentTarget.select()} />
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
      {tokens.length > 0 ? (
        <ul className="mt-5 divide-y divide-rule border-t border-rule text-sm">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center justify-between gap-3 py-3">
              <div>
                <p className={t.revoked ? "text-muted line-through" : "font-medium"}>{t.name}</p>
                <p className="font-mono text-xs text-muted">
                  {t.hint}… · created {new Date(t.createdAt).toLocaleDateString()} · {t.lastUsedAt ? `last used ${new Date(t.lastUsedAt).toLocaleString()}` : "never used"}
                </p>
              </div>
              {!t.revoked ? (
                <Button
                  size="sm"
                  variant="danger"
                  disabled={pending}
                  onClick={() =>
                    startTransition(async () => {
                      const r = await revokeApiTokenAction(t.id);
                      if (!r.ok) setError(r.message);
                      router.refresh();
                    })
                  }
                >
                  Revoke
                </Button>
              ) : (
                <span className="text-xs text-muted">Revoked</span>
              )}
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
