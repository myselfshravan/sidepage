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
    <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-5 py-20 sm:px-8">
      <p className="meta uppercase">Your library</p>
      <h1 className="mt-4 font-display text-5xl italic">Reading</h1>
      {empty ? (
        <p className="mt-10 text-muted">
          Nothing here yet. Find something in <Link href="/memoirs" className="link-quiet">memoirs</Link> or{" "}
          <Link href="/fiction" className="link-quiet">fiction</Link>, save it, or follow an author.
        </p>
      ) : null}
      <Shelf title="Continue reading" items={view.reading} showProgress />
      <Shelf title="Saved" items={view.saved} />
      <Shelf title="New from authors you follow" items={view.fromFollowed} />
      {view.following.length > 0 ? (
        <section className="mt-14">
          <h2 className="meta border-b border-rule pb-3 uppercase">Following</h2>
          <ul className="mt-4 flex flex-wrap gap-x-6 gap-y-2">
            {view.following.map((a) => (
              <li key={a.uid}>
                <Link href={`/authors/${a.handle}`} className="link-quiet">
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
  return (
    <section className="mt-14">
      <h2 className="meta border-b border-rule pb-3 uppercase">{title}</h2>
      <ul className="divide-y divide-rule">
        {items.map((w) => (
          <li key={w.workId} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
            <span>
              <Link href={showProgress && w.progress ? `/${w.collection}/${w.slug}/${w.progress.chapter}#resume` : `/${w.collection}/${w.slug}`} className="text-xl hover:text-accent-ink">
                {w.title}
              </Link>
              <span className="meta block">
                {COLLECTION_LABEL[w.collection]} · <Link href={`/authors/${w.authorHandle}`} className="link-quiet">{w.authorName}</Link>
              </span>
            </span>
            {showProgress && w.progress ? (
              <span className="meta">
                {w.progress.title} · {Math.round(w.progress.fraction * 100)}%
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
