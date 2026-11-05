"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { warningKey } from "./prefs";
import { setStored, useHydrated, useStored } from "./storage";

/**
 * Shows a publication's content warnings before the chapter. The choice is
 * remembered per publication. Without JavaScript the chapter is shown directly
 * (the warnings remain visible above it).
 */
export function ContentWarningGate({ workId, warnings, backHref, children }: { workId: string; warnings: string[]; backHref: string; children: ReactNode }) {
  const hydrated = useHydrated();
  const seen = useStored(warningKey(workId)) === "1";
  const state = !hydrated ? "checking" : seen ? "open" : "gate";
  const proceed = () => setStored(warningKey(workId), "1");

  return (
    <>
      <noscript>
        <style>{`[data-cw-content]{display:block!important}[data-cw-gate]{display:none!important}`}</style>
      </noscript>
      {state === "gate" ? (
        <section data-cw-gate aria-labelledby="cw-title" className="mx-auto max-w-xl px-5 py-24 text-center">
          <p className="meta">Before you begin</p>
          <h2 id="cw-title" className="credits mt-4 text-2xl">
            Content warnings
          </h2>
          <ul className="mt-6 space-y-1 text-lg">
            {warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <button type="button" onClick={proceed} autoFocus className="min-h-11 bg-accent px-6 text-on-accent">
              Continue to the chapter
            </button>
            <Link href={backHref} className="meta inline-flex min-h-11 items-center px-4 link-quiet">
              Back to contents
            </Link>
          </div>
        </section>
      ) : null}
      <div data-cw-content style={{ display: state === "open" ? "block" : "none" }}>
        {children}
      </div>
    </>
  );
}
