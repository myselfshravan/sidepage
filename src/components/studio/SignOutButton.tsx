"use client";

import { useState } from "react";
import { Button } from "./ui";

export function SignOutButton() {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
        // A full navigation drops every studio payload held in the client router cache.
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- auth changed; the client cache must be discarded
      window.location.assign("/sign-in");
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
