import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import type { Collection } from "@/domain/types";
import { chapterLabel, formatDate, formatMinutes } from "@/lib/format";
import { listPublicWorks } from "@/server/read/public";
import { Cover } from "./Cover";

const COPY: Record<Collection, { title: string; intro: string; empty: string }> = {
  memoirs: {
    title: "Memoirs",
    intro: "Real lives, written down: essays, recollections and reflections.",
    empty: "No memoirs published yet.",
  },
  fiction: {
    title: "Fiction",
    intro: "Invented lives, released chapter by chapter. Content warnings are always shown before you begin.",
    empty: "No fiction has been released yet.",
  },
};

export async function CollectionIndex({ collection }: { collection: Collection }) {
  const works = await listPublicWorks(collection, 48);
  const copy = COPY[collection];
  return (
    <>
      <SiteHeader current={`/${collection}`} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-16 sm:px-8 sm:py-24">
        <header className="max-w-3xl">
          <h1 className={collection === "fiction" ? "credits text-[clamp(2.5rem,7vw,5rem)] leading-none" : "font-display text-[clamp(3rem,8vw,5.5rem)] leading-none italic"}>
            {copy.title}
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-muted">{copy.intro}</p>
        </header>

        {works.length === 0 ? (
          <p className="mt-16 border-t border-rule pt-10 text-muted italic">{copy.empty}</p>
        ) : collection === "memoirs" ? (
          <ol className="mt-16 divide-y divide-rule border-t border-rule">
            {works.map((w) => (
              <li key={w.workId}>
                <Link href={`/memoirs/${w.slug}`} className="group grid gap-6 py-8 sm:grid-cols-[auto_1fr]">
                  <Cover collection="memoirs" title={w.title} subtitle={w.subtitle} author={w.authorName} size="sm" className="hidden sm:flex" />
                  <div className="space-y-3">
                    <p className="meta">{[w.writtenLabel, chapterLabel(w.chapterCount), formatMinutes(w.readingMinutes)].filter(Boolean).join(" · ")}</p>
                    <h2 className="font-display text-3xl leading-tight group-hover:text-accent-ink">{w.title}</h2>
                    {w.subtitle ? <p className="text-lg text-muted italic">{w.subtitle}</p> : null}
                    <p className="meta">by {w.authorName}</p>
                    {w.description ? <p className="max-w-2xl leading-relaxed">{w.description}</p> : null}
                    <p className="meta">Published {formatDate(w.firstPublishedAt)}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <ul className="mt-16 grid grid-cols-2 gap-x-6 gap-y-12 sm:grid-cols-3 lg:grid-cols-4">
            {works.map((w) => (
              <li key={w.workId}>
                <Link href={`/fiction/${w.slug}`} className="group block space-y-4">
                  <Cover collection="fiction" title={w.title} subtitle={w.subtitle} author={w.authorName} className="!w-full transition-transform duration-300 ease-page group-hover:-translate-y-1" />
                  <div className="space-y-1">
                    <h2 className="credits text-sm group-hover:text-accent-ink">{w.title}</h2>
                    <p className="meta">by {w.authorName}</p>
                    <p className="meta">
                      {chapterLabel(w.chapterCount)} · {formatMinutes(w.readingMinutes)}
                    </p>
                    {w.contentWarnings.length > 0 ? <p className="meta text-faint">CW: {w.contentWarnings.join(", ")}</p> : null}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
