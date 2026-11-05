import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageSkeleton } from "@/components/site/PageSkeleton";
import { SiteHeader } from "@/components/site/SiteHeader";
import { COLLECTION_LABEL } from "@/domain/types";
import { requireUserPage } from "@/server/auth/session";
import { actorFrom } from "@/server/services/actor";
import { libraryView, type LibraryItem } from "@/server/services/reader";

export const metadata: Metadata = { title: "Your library", robots: { index: false } };

export default function LibraryPage() {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<PageSkeleton />}>
        <Library />
      </Suspense>
    </>
  );
}

async function Library() {
  const viewer = await requireUserPage("/library");
  const view = await libraryView(actorFrom(viewer));
  const empty = view.reading.length + view.saved.length + view.fromFollowed.length === 0;
  return (
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-5 py-16 sm:px-8 md:py-24">
      <h1 className="font-display text-5xl">Your library</h1>
      {empty ? (
        <div className="mt-12 max-w-xl rounded-md border border-rule bg-surface px-6 py-6">
          <p className="text-lg">Nothing on your shelves yet.</p>
          <p className="mt-2 leading-relaxed text-muted">
            Start a <Link href="/memoirs" className="link-quiet text-ink">memoir</Link> or a piece of{" "}
            <Link href="/fiction" className="link-quiet text-ink">fiction</Link>. Your place is kept here automatically. Save books and follow authors to see them here too.
          </p>
        </div>
      ) : null}
      <Shelf title="Continue reading" items={view.reading} showProgress />
      <Shelf title="Saved" items={view.saved} />
      <Shelf title="New from authors you follow" items={view.fromFollowed} />
      {view.following.length > 0 ? (
        <section className="mt-16" aria-labelledby="following-h">
          <h2 id="following-h" className="border-b border-rule pb-3 font-display text-2xl">
            Authors you follow
          </h2>
          <ul className="mt-5 flex flex-wrap gap-x-8 gap-y-3">
            {view.following.map((a) => (
              <li key={a.uid}>
                <Link href={`/authors/${a.handle}`} className="text-lg italic hover:text-accent-ink">
                  {a.displayName}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}

function Shelf({ title, items, showProgress = false }: { title: string; items: LibraryItem[]; showProgress?: boolean }) {
  if (items.length === 0) return null;
  const id = title.toLowerCase().replace(/\W+/g, "-");
  return (
    <section className="mt-16" aria-labelledby={id}>
      <h2 id={id} className="border-b border-rule pb-3 font-display text-2xl">
        {title}
      </h2>
      <ul className="divide-y divide-rule">
        {items.map((w) => {
          const href = showProgress && w.progress ? `/${w.collection}/${w.slug}/${w.progress.chapter}#resume` : `/${w.collection}/${w.slug}`;
          const percent = w.progress ? Math.round(w.progress.fraction * 100) : 0;
          return (
            <li key={w.workId} className="grid gap-x-8 gap-y-1 py-5 sm:grid-cols-[1fr_12rem] sm:items-center">
              <div>
                <Link href={href} className="text-xl leading-snug hover:text-accent-ink">
                  {w.title}
                </Link>
                <p className="meta">
                  {COLLECTION_LABEL[w.collection]}, by{" "}
                  <Link href={`/authors/${w.authorHandle}`} className="link-quiet">
                    {w.authorName}
                  </Link>
                </p>
              </div>
              {showProgress && w.progress ? (
                <div className="sm:text-right">
                  <p className="meta truncate">{w.progress.title}</p>
                  <div className="mt-2 h-[3px] w-full overflow-hidden rounded-full bg-rule" role="progressbar" aria-label={`${percent}% through ${w.progress.title}`} aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${Math.max(percent, 3)}%` }} />
                  </div>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
