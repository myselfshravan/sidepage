"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "./ui";

export function SignOutButton() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      size="sm"
      variant="ghost"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        await fetch("/api/auth/session", { method: "DELETE" }).catch(() => undefined);
        router.replace("/sign-in");
        router.refresh();
      }}
    >
      {busy ? "Signing out…" : "Sign out"}
    </Button>
  );
}
