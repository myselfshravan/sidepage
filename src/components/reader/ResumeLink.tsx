"use client";

import Link from "next/link";
import { parseProgress, progressKey, type Progress } from "./prefs";
import { parseJson, useStored } from "./storage";

/** "Continue reading" — shown only when this browser has a saved position. */
export function ResumeLink({ workId, base }: { workId: string; base: string }) {
  const saved = parseProgress(parseJson<Progress | null>(useStored(progressKey(workId)), null));
  if (!saved || saved.fraction >= 0.98) return null;
  return (
    <Link href={`${base}/${saved.chapter}#resume`} className="meta inline-flex min-h-11 items-center uppercase link-quiet">
      Continue “{saved.title}” · {Math.round(saved.fraction * 100)}%
    </Link>
  );
}
