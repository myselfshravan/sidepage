"use client";

import { useEffect } from "react";
import { startAnalytics } from "@/lib/analytics";

export function AnalyticsStart() {
  useEffect(() => startAnalytics(), []);
  return null;
}
