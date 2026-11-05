"use client";

import Link from "next/link";
import { useState } from "react";
import { track } from "@/lib/analytics";
import { readerOp, useReaderAccount } from "./account";
import { parseProgress, progressKey, type Progress } from "./prefs";
import { parseJson, useStored } from "./storage";

/**
 * "Continue reading" plus "Save to library". Signed-in readers see their account's
 * position; others see this device's.
 */
export function ResumeLink({ workId, base }: { workId: string; base: string }) {
  const { state, reload } = useReaderAccount(workId);
  const local = parseProgress(parseJson<Progress | null>(useStored(progressKey(workId)), null));
  const [busy, setBusy] = useState(false);
  const saved = state.status === "signed-in" ? state.progress : local;

  return (
    <>
      {saved && saved.fraction < 0.98 ? (
        <Link href={`${base}/${saved.chapter}#resume`} className="meta inline-flex min-h-11 items-center uppercase link-quiet">
          Continue “{saved.title}” · {Math.round(saved.fraction * 100)}%
        </Link>
      ) : null}
      {state.status === "signed-in" ? (
        <button
          type="button"
          disabled={busy}
          aria-pressed={state.saved}
          className="meta inline-flex min-h-11 items-center uppercase link-quiet disabled:opacity-50"
          onClick={async () => {
            setBusy(true);
            const r = await readerOp({ op: "save", workId, saved: !state.saved });
            if (r.ok) track("saved_to_library", { work_id: workId, saved: !state.saved });
            await reload();
            setBusy(false);
          }}
        >
          {state.saved ? "In your library ✓" : "Save to library"}
        </button>
      ) : null}
    </>
  );
}
