"use client";

import { useEffect } from "react";
import { identify } from "@/lib/analytics";

/** Associates analytics with the signed-in account's opaque id. */
export function AnalyticsIdentity({ uid, role }: { uid: string; role: string }) {
  useEffect(() => identify(uid, role), [uid, role]);
  return null;
}
