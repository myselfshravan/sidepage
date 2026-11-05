import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { COLLECTION_LABEL } from "@/domain/types";
import { formatDate, formatWords } from "@/lib/format";
import { listPublicWorks, type PublicWork } from "@/server/read/public";

export const metadata: Metadata = { title: "Archive", description: "Everything published, by year." };

export default async function ArchivePage() {
  const works = await listPublicWorks(null, 100);
  const byYear = new Map<number, PublicWork[]>();
  for (const w of works) {
    const year = new Date(w.firstPublishedAt).getUTCFullYear();
    byYear.set(year, [...(byYear.get(year) ?? []), w]);
  }

  return (
    <>
      <SiteHeader current="/archive" />
      <main id="main" className="mx-auto w-full max-w-4xl flex-1 px-5 py-20 sm:px-8">
        <h1 className="font-display text-5xl italic">Everything, by year of publication</h1>
        {works.length === 0 ? (
          <p className="mt-12 text-muted italic">Nothing has been published yet.</p>
        ) : (
          <div className="mt-14 space-y-14">
            {[...byYear.entries()].map(([year, items]) => (
              <section key={year} aria-labelledby={`y-${year}`} className="grid gap-4 sm:grid-cols-[7rem_1fr]">
                <h2 id={`y-${year}`} className="font-display text-3xl text-muted">
                  {year}
                </h2>
                <ul className="divide-y divide-rule border-t border-rule">
                  {items.map((w) => (
                    <li key={w.workId} className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 py-4">
                      <Link href={`/${w.collection}/${w.slug}`} className="text-xl hover:text-accent-ink">
                        {w.title}
                      </Link>
                      <span className="meta">
                        {COLLECTION_LABEL[w.collection]} · {formatDate(w.firstPublishedAt)} · {formatWords(w.wordCount)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </>
  );
}
