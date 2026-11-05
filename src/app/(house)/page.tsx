import Link from "next/link";
import { Cover } from "@/components/publication/Cover";
import { SiteHeader } from "@/components/site/SiteHeader";
import { formatDate, formatMinutes } from "@/lib/format";
import { site } from "@/lib/site";
import { listPublicWorks, type PublicWork } from "@/server/read/public";

export default async function HomePage() {
  const [memoirs, fiction] = await Promise.all([listPublicWorks("memoirs", 6), listPublicWorks("fiction", 4)]);
  const [lead, ...moreFiction] = fiction;
  const authors = uniqueAuthors([...memoirs, ...fiction]);

  return (
    <>
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="mx-auto max-w-6xl px-5 pt-20 pb-20 sm:px-8 sm:pt-28">
          <h1 className="font-display text-[clamp(3.5rem,11vw,9rem)] leading-[0.9] font-normal tracking-[-0.03em] italic">{site.name}</h1>
          <p className="mt-8 max-w-xl text-xl leading-relaxed text-muted">{site.tagline}</p>
          <div className="meta mt-10 flex flex-wrap gap-x-8 gap-y-3">
            <Link href="/memoirs" className="link-quiet">
              Read memoirs
            </Link>
            <Link href="/fiction" className="link-quiet">
              Read fiction
            </Link>
            <Link href="/account" prefetch={false} className="link-quiet">
              Write here
            </Link>
          </div>
        </section>

        <section aria-labelledby="memoirs-heading" className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
          <div className="flex items-baseline justify-between border-b border-rule pb-3">
            <h2 id="memoirs-heading" className="font-display text-3xl italic">
              Memoirs
            </h2>
            <Link href="/memoirs" className="meta link-quiet">
              All memoirs
            </Link>
          </div>
          {memoirs.length === 0 ? (
            <p className="py-10 text-muted italic">No memoirs published yet.</p>
          ) : (
            <ol className="divide-y divide-rule">
              {memoirs.map((w) => (
                <li key={w.workId} className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 py-5 sm:grid-cols-[9rem_1fr_auto]">
                  <span className="meta order-3 col-span-2 sm:order-none sm:col-span-1">{w.writtenLabel ?? formatDate(w.firstPublishedAt)}</span>
                  <span>
                    <Link href={`/memoirs/${w.slug}`} className="text-xl hover:text-accent-ink sm:text-2xl">
                      {w.title}
                    </Link>
                    <span className="text-muted">
                      {" "}
                      by{" "}
                      {w.authorHandle ? (
                        <Link href={`/authors/${w.authorHandle}`} className="link-quiet">
                          {w.authorName}
                        </Link>
                      ) : (
                        w.authorName
                      )}
                    </span>
                  </span>
                  <span className="meta whitespace-nowrap">{formatMinutes(w.readingMinutes)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>

        <section data-theme="fiction" aria-labelledby="fiction-heading" className="film-grain border-t border-[#b5444b]">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-8 sm:py-28">
            <div className="flex items-baseline justify-between">
              <h2 id="fiction-heading" className="credits text-sm text-muted">
                Fiction
              </h2>
              <Link href="/fiction" className="meta link-quiet">
                All fiction
              </Link>
            </div>
            {!lead ? (
              <p className="mt-10 text-lg text-muted italic">No fiction published yet.</p>
            ) : (
              <div className="mt-12 grid items-end gap-10 md:grid-cols-[auto_1fr]">
                <Link href={`/fiction/${lead.slug}`} aria-label={lead.title}>
                  <Cover collection="fiction" title={lead.title} subtitle={lead.subtitle} author={lead.authorName} size="lg" />
                </Link>
                <div className="space-y-6">
                  <p className="meta">
                    Latest · {lead.chapterCount} {lead.chapterCount === 1 ? "chapter" : "chapters"}
                  </p>
                  <h3 className="credits text-[clamp(2rem,5vw,4rem)] leading-[1.05]">
                    <Link href={`/fiction/${lead.slug}`} className="hover:text-accent-ink">
                      {lead.title}
                    </Link>
                  </h3>
                  <p className="meta">
                    by{" "}
                    {lead.authorHandle ? (
                      <Link href={`/authors/${lead.authorHandle}`} className="link-quiet">
                        {lead.authorName}
                      </Link>
                    ) : (
                      lead.authorName
                    )}
                  </p>
                  {lead.description ? <p className="max-w-xl text-lg leading-relaxed text-muted">{lead.description}</p> : null}
                  {lead.contentWarnings.length > 0 ? <p className="meta">Content warnings: {lead.contentWarnings.join(", ")}</p> : null}
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

        {authors.length > 0 ? (
          <section aria-labelledby="authors-heading" className="mx-auto max-w-6xl px-5 py-20 sm:px-8">
            <h2 id="authors-heading" className="meta border-b border-rule pb-3">
              Authors
            </h2>
            <ul className="mt-6 flex flex-wrap gap-x-8 gap-y-3">
              {authors.map((a) => (
                <li key={a.handle}>
                  <Link href={`/authors/${a.handle}`} className="text-xl italic hover:text-accent-ink">
                    {a.name}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </main>
    </>
  );
}

function uniqueAuthors(works: PublicWork[]) {
  const seen = new Map<string, string>();
  for (const w of works) if (w.authorHandle && !seen.has(w.authorHandle)) seen.set(w.authorHandle, w.authorName);
  return [...seen].map(([handle, name]) => ({ handle, name }));
}
