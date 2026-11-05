import type { ReactNode } from "react";
import { SiteFooter } from "@/components/site/SiteFooter";
import type { Collection } from "@/domain/types";

/** Applies the collection's theme around a secret-link page, with a note that it isn't public. */
export function SharedFrame({ collection, children }: { collection: Collection; children: ReactNode }) {
  return (
    <div data-theme={collection === "fiction" ? "fiction" : "memoir"} className={`${collection === "fiction" ? "film-grain" : "paper-grain"} flex min-h-screen flex-col`}>
      <p className="no-print border-b border-rule px-5 py-2 text-center text-[0.875rem] text-muted italic">Shared with you privately. Please don&apos;t pass this link on.</p>
      {children}
      <SiteFooter />
    </div>
  );
}
