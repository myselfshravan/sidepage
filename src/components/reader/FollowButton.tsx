"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { track } from "@/lib/analytics";
import { readerOp } from "./account";

type State = { status: "loading" } | { status: "anonymous" } | { status: "self" } | { status: "ready"; following: boolean };

export function FollowButton({ authorUid }: { authorUid: string }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/reader?author=${encodeURIComponent(authorUid)}`, { cache: "no-store" })
      .then((r) => r.json())
      .then((b: { signedIn: boolean; following?: boolean; self?: boolean }) => {
        if (!live) return;
        setState(!b.signedIn ? { status: "anonymous" } : b.self ? { status: "self" } : { status: "ready", following: !!b.following });
      })
      .catch(() => live && setState({ status: "anonymous" }));
    return () => {
      live = false;
    };
  }, [authorUid]);

  if (state.status === "loading" || state.status === "self") return null;
  if (state.status === "anonymous") {
    return (
      <Link href={`/sign-in?next=${encodeURIComponent(typeof window === "undefined" ? "/" : window.location.pathname)}`} className="meta inline-flex min-h-11 items-center border border-ink px-5 uppercase">
        Sign in to follow
      </Link>
    );
  }
  const following = state.following;
  return (
    <button
      type="button"
      disabled={busy}
      aria-pressed={following}
      onClick={async () => {
        setBusy(true);
        const r = await readerOp({ op: "follow", authorUid, following: !following });
        if (r.ok) {
          setState({ status: "ready", following: !following });
          track("followed_author", { author_uid: authorUid, following: !following });
        }
        setBusy(false);
      }}
      className="meta inline-flex min-h-11 items-center border border-ink px-5 uppercase aria-pressed:bg-ink aria-pressed:text-paper disabled:opacity-50"
    >
      {following ? "Following" : "Follow"}
    </button>
  );
}
