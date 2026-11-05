"use client";

import { useCallback, useEffect, useState } from "react";

// Signed-in readers keep progress, bookmarks and their library on the server; anonymous
// readers keep them on this device. Reading pages are static, so the account state is
// fetched after load.

export type ServerBookmark = { id: string; chapter: string; title: string; block: string; excerpt: string; at: number };
export type ServerReaderState = {
  signedIn: true;
  progress: { chapter: string; title: string; fraction: number; at: number } | null;
  bookmarks: ServerBookmark[];
  saved: boolean;
};

export type AccountState = { status: "loading" } | { status: "anonymous" } | ({ status: "signed-in" } & Omit<ServerReaderState, "signedIn">);

export function useReaderAccount(workId: string, enabled = true) {
  const [state, setState] = useState<AccountState>({ status: enabled ? "loading" : "anonymous" });
  const load = useCallback(async () => {
    const res = await fetch(`/api/reader?work=${encodeURIComponent(workId)}`, { cache: "no-store" }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as (ServerReaderState | { signedIn: false }) | null;
    if (!body || !body.signedIn) return setState({ status: "anonymous" });
    setState({ status: "signed-in", progress: body.progress, bookmarks: body.bookmarks, saved: body.saved });
  }, [workId]);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    fetch(`/api/reader?work=${encodeURIComponent(workId)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((body: ServerReaderState | { signedIn: false }) => {
        if (!live) return;
        setState(body.signedIn ? { status: "signed-in", progress: body.progress, bookmarks: body.bookmarks, saved: body.saved } : { status: "anonymous" });
      })
      .catch(() => live && setState({ status: "anonymous" }));
    return () => {
      live = false;
    };
  }, [workId, enabled]);
  return { state, reload: load };
}

export async function readerOp(body: Record<string, unknown>, opts: { keepalive?: boolean } = {}): Promise<{ ok: boolean; message?: string }> {
  try {
    const res = await fetch("/api/reader", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
      keepalive: opts.keepalive,
    });
    return (await res.json().catch(() => ({ ok: res.ok }))) as { ok: boolean; message?: string };
  } catch {
    return { ok: false, message: "You're offline." };
  }
}
