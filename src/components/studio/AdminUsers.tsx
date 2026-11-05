"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { decideAuthorshipAction, setRoleAction } from "@/app/studio/actions";
import { ROLES } from "@/domain/access/policy";
import type { UserSummary } from "@/server/services/users";
import { Button, inputClass } from "./ui";

export function AdminUsers({ users, mode, selfUid }: { users: UserSummary[]; mode: "requests" | "all"; selfUid: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const act = (fn: () => Promise<{ ok: boolean; message?: string }>) =>
    startTransition(async () => {
      setError(undefined);
      const r = await fn();
      if (!r.ok) setError(r.message);
      router.refresh();
    });

  return (
    <div>
      <ul className="divide-y divide-rule">
        {users.map((u) => (
          <li key={u.uid} className="flex flex-wrap items-start justify-between gap-4 py-4 text-sm">
            <div className="min-w-0 max-w-xl">
              <p className="font-medium">
                {u.displayName} <span className="font-mono text-xs text-muted">@{u.handle}</span>
              </p>
              <p className="text-xs text-muted">
                {u.email} · joined {new Date(u.createdAt).toLocaleDateString()}
              </p>
              {mode === "requests" && u.pitch ? <p className="mt-2 whitespace-pre-line">{u.pitch}</p> : null}
            </div>
            {mode === "requests" ? (
              <div className="flex gap-2">
                <Button size="sm" variant="primary" disabled={pending} onClick={() => act(() => decideAuthorshipAction(u.uid, true))}>
                  Approve
                </Button>
                <Button size="sm" variant="danger" disabled={pending} onClick={() => act(() => decideAuthorshipAction(u.uid, false))}>
                  Decline
                </Button>
              </div>
            ) : (
              <label className="flex items-center gap-2">
                <span className="sr-only">Role for {u.displayName}</span>
                <select
                  className={`${inputClass} w-32`}
                  defaultValue={u.role}
                  disabled={pending || u.uid === selfUid}
                  onChange={(e) => act(() => setRoleAction(u.uid, e.target.value))}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </li>
        ))}
      </ul>
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </div>
  );
}
