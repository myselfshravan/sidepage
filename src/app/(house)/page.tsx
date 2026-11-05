import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { Cover } from "@/components/publication/Cover";
import { listPublicWorks } from "@/server/read/public";
import { formatDate, formatMinutes } from "@/lib/format";
import { site } from "@/lib/site";

export default async function HomePage() {
  const [memoirs, fiction] = await Promise.all([listPublicWorks("memoirs", 6), listPublicWorks("fiction", 4)]);
  const [lead, ...moreFiction] = fiction;

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        {/* Title page */}
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-24 sm:px-8 sm:pt-28">
          <p className="meta uppercase">
            {site.name} · est. {site.established}
          </p>
          <h1 className="mt-6 max-w-4xl font-display text-[clamp(3rem,9vw,7.5rem)] leading-[0.95] font-normal tracking-[-0.02em]">
            {site.author}
          </h1>
          <p className="mt-8 max-w-xl text-xl leading-relaxed text-muted italic">
            True things remembered, and invented things that feel true. Two collections, one house.
          </p>
        </section>

        {/* Memoir room: a set table of contents */}
        <section aria-labelledby="memoirs-heading" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="flex items-baseline justify-between border-b border-rule pb-3">
            <h2 id="memoirs-heading" className="font-display text-3xl italic">
              Memoirs
            </h2>
            <Link href="/memoirs" className="meta uppercase link-quiet">
              The collection
            </Link>
          </div>
          {memoirs.length === 0 ? (
            <p className="py-10 text-muted italic">The first memoir is still being set in type.</p>
          ) : (
            <ol className="divide-y divide-rule">
              {memoirs.map((w) => (
                <li key={w.workId}>
                  <Link href={`/memoirs/${w.slug}`} className="group grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-5 sm:grid-cols-[9rem_1fr_auto]">
                    <span className="meta order-3 col-span-2 sm:order-none sm:col-span-1">{w.writtenLabel ?? formatDate(w.firstPublishedAt)}</span>
                    <span className="text-xl group-hover:text-accent-ink sm:text-2xl">
                      {w.title}
                      {w.subtitle ? <span className="text-muted italic"> — {w.subtitle}</span> : null}
                    </span>
                    <span className="meta whitespace-nowrap">{formatMinutes(w.readingMinutes)}</span>
                  </Link>
                </li>
              ))}
            </ol>
          )}
        </section>

        {/* Fiction room: a hard cut to the dark */}
        <section data-theme="fiction" aria-labelledby="fiction-heading" className="film-grain border-t border-[#b5444b]">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <div className="flex items-baseline justify-between">
              <h2 id="fiction-heading" className="credits text-sm text-muted">
                Fiction
              </h2>
              <Link href="/fiction" className="meta uppercase link-quiet">
                The collection
              </Link>
            </div>
            {!lead ? (
              <p className="mt-10 text-lg text-muted italic">The first story hasn&apos;t been released yet.</p>
            ) : (
              <div className="mt-12 grid items-end gap-10 md:grid-cols-[auto_1fr]">
                <Link href={`/fiction/${lead.slug}`} aria-label={lead.title}>
                  <Cover collection="fiction" title={lead.title} subtitle={lead.subtitle} author={lead.authorName} size="lg" />
                </Link>
                <div className="space-y-6">
                  <p className="meta uppercase">Now reading · {lead.chapterCount} {lead.chapterCount === 1 ? "chapter" : "chapters"}</p>
                  <h3 className="credits text-[clamp(2rem,5vw,4rem)] leading-[1.05]">
                    <Link href={`/fiction/${lead.slug}`} className="hover:text-accent-ink">
                      {lead.title}
                    </Link>
                  </h3>
                  {lead.description ? <p className="max-w-xl text-lg leading-relaxed text-muted">{lead.description}</p> : null}
                  {lead.contentWarnings.length > 0 ? (
                    <p className="meta">Content warnings: {lead.contentWarnings.join(", ")}</p>
                  ) : null}
                  {moreFiction.length > 0 ? (
                    <ul className="flex flex-wrap gap-x-6 gap-y-2 border-t border-rule pt-6">
                      {moreFiction.map((w) => (
                        <li key={w.workId}>
                          <Link href={`/fiction/${w.slug}`} className="credits text-xs hover:text-accent-ink">
                            {w.title}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        </section>
      </main>
    </>
  );
}
