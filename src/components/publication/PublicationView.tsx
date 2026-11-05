import Link from "next/link";
import { notFound } from "next/navigation";
import { SiteHeader } from "@/components/site/SiteHeader";
import { ResumeLink } from "@/components/reader/ResumeLink";
import type { Collection } from "@/domain/types";
import { chapterLabel, formatDate, formatMinutes, formatWords, romanize } from "@/lib/format";
import { getPublicToc } from "@/server/read/public";
import { Cover } from "./Cover";

export async function PublicationView({ collection, params }: { collection: Collection; params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const found = await getPublicToc(collection, slug);
  if (!found) notFound();
  const { work, toc } = found;
  const first = toc[0];
  const fiction = collection === "fiction";

  return (
    <>
      <SiteHeader current={`/${collection}`} />
      <main id="main" className="mx-auto w-full max-w-6xl flex-1 px-5 py-14 sm:px-8 sm:py-20">
        <article className="grid gap-12 md:grid-cols-[auto_1fr] md:gap-16">
          <div className="md:sticky md:top-10 md:self-start">
            <Cover collection={collection} title={work.title} subtitle={work.subtitle} author={work.authorName} size="lg" />
          </div>
          <div className="max-w-2xl">
            <p className="meta uppercase">{fiction ? "A work of fiction" : "A memoir"}</p>
            <h1 className={fiction ? "credits mt-4 text-[clamp(2.2rem,6vw,4.5rem)] leading-[1.02]" : "mt-4 font-display text-[clamp(2.6rem,6vw,4.5rem)] leading-[1.02] italic"}>
              {work.title}
            </h1>
            {work.subtitle ? <p className="mt-4 text-2xl text-muted italic">{work.subtitle}</p> : null}
            <p className="mt-6">
              by{" "}
              <Link href={`/authors/${work.authorHandle}`} className="link-quiet">
                {work.authorName}
              </Link>
            </p>

            {work.description ? <p className="mt-8 text-lg leading-relaxed">{work.description}</p> : null}

            {fiction && work.contentWarnings.length > 0 ? (
              <aside aria-label="Content warnings" className="mt-8 border-l-2 border-[var(--signal,var(--accent))] pl-4">
                <p className="meta uppercase">Content warnings</p>
                <p className="mt-1">{work.contentWarnings.join(", ")}</p>
              </aside>
            ) : null}

            <dl className="meta mt-10 grid grid-cols-2 gap-x-6 gap-y-3 border-y border-rule py-5 sm:grid-cols-4">
              {work.writtenLabel ? (
                <div>
                  <dt className="uppercase text-faint">Written</dt>
                  <dd className="mt-1 text-ink">{work.writtenLabel}</dd>
                </div>
              ) : null}
              <div>
                <dt className="uppercase text-faint">Published</dt>
                <dd className="mt-1 text-ink">
                  <time dateTime={work.firstPublishedAt}>{formatDate(work.firstPublishedAt)}</time>
                </dd>
              </div>
              {work.lastPublishedAt !== work.firstPublishedAt ? (
                <div>
                  <dt className="uppercase text-faint">This edition</dt>
                  <dd className="mt-1 text-ink">
                    <time dateTime={work.lastPublishedAt}>{formatDate(work.lastPublishedAt)}</time>
                  </dd>
                </div>
              ) : null}
              <div>
                <dt className="uppercase text-faint">Length</dt>
                <dd className="mt-1 text-ink">
                  {formatWords(work.wordCount)} · {formatMinutes(work.readingMinutes)}
                </dd>
              </div>
            </dl>

            {first ? (
              <div className="mt-10 flex flex-wrap items-center gap-x-6 gap-y-4">
                <Link
                  href={`/${collection}/${work.slug}/${first.slug}`}
                  className="inline-flex min-h-11 items-center bg-accent px-6 text-on-accent transition-colors hover:bg-[color-mix(in_srgb,var(--accent)_85%,black)]"
                >
                  Begin reading
                </Link>
                <ResumeLink workId={work.workId} base={`/${collection}/${work.slug}`} />
              </div>
            ) : null}

            <section aria-labelledby="contents" className="mt-16">
              <h2 id="contents" className="meta uppercase">
                Contents · {chapterLabel(toc.length)}
              </h2>
              <ol className="mt-4 divide-y divide-rule border-t border-rule">
                {toc.map((c) => (
                  <li key={c.slug}>
                    <Link href={`/${collection}/${work.slug}/${c.slug}`} className="group flex items-baseline gap-4 py-4">
                      <span className="meta w-10 shrink-0">{fiction ? String(c.ordinal).padStart(2, "0") : romanize(c.ordinal)}</span>
                      <span className="flex-1 text-lg group-hover:text-accent-ink">{c.title}</span>
                      <span className="meta">{formatMinutes(Math.max(1, Math.round(c.wordCount / 238)))}</span>
                    </Link>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </article>
      </main>
    </>
  );
}
