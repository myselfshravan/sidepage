import Link from "next/link";
import { notFound } from "next/navigation";
import { RenderDoc } from "@/content/render/RenderDoc";
import { ContentWarningGate } from "@/components/reader/ContentWarningGate";
import { InlineScript } from "@/components/reader/InlineScript";
import { READER_PREFS_SCRIPT } from "@/components/reader/prefs";
import { ReaderShell } from "@/components/reader/ReaderShell";
import type { Collection } from "@/domain/types";
import { formatMinutes, formatWords, romanize } from "@/lib/format";
import { getPublicChapter } from "@/server/read/public";

export async function ChapterView({ collection, params }: { collection: Collection; params: Promise<{ slug: string; chapter: string }> }) {
  const { slug, chapter: chapterSlug } = await params;
  const data = await getPublicChapter(collection, slug, chapterSlug);
  if (!data) notFound();
  const { work, toc, chapter, prev, next } = data;
  const base = `/${collection}/${work.slug}`;
  const fiction = collection === "fiction";
  const minutes = Math.max(1, Math.round(chapter.wordCount / 238));

  const article = (
    <article className="px-5 pt-14 pb-24 sm:px-8 sm:pt-24" lang="en">
      <header className="mx-auto mb-14 max-w-[var(--measure)] text-center">
        <p className="meta">
          {fiction ? `Chapter ${chapter.ordinal}` : romanize(chapter.ordinal)} · {formatMinutes(minutes)}
        </p>
        <h1 className={fiction ? "credits mt-5 text-[clamp(1.8rem,5vw,3rem)] leading-tight" : "mt-5 font-display text-[clamp(2.2rem,5vw,3.4rem)] leading-tight italic"}>
          {chapter.title}
        </h1>
        <p className="meta mt-5">
          {work.title} · {work.authorName}
        </p>
      </header>
      <div className={`prose-reader ${fiction ? "" : "has-dropcap"}`}>
        <RenderDoc doc={chapter.doc} />
      </div>
      <nav aria-label="Chapters" className="no-print mx-auto mt-20 grid max-w-[var(--measure)] gap-4 border-t border-rule pt-8 sm:grid-cols-2">
        {prev ? (
          <Link href={`${base}/${prev.slug}`} className="group">
            <span className="meta block">Previous</span>
            <span className="group-hover:text-accent-ink">{prev.title}</span>
          </Link>
        ) : (
          <Link href={base} className="group">
            <span className="meta block">Back to</span>
            <span className="group-hover:text-accent-ink">Contents</span>
          </Link>
        )}
        {next ? (
          <Link href={`${base}/${next.slug}`} className="group sm:text-right">
            <span className="meta block">Next</span>
            <span className="group-hover:text-accent-ink">{next.title}</span>
          </Link>
        ) : (
          <p className="sm:text-right">
            <span className="meta block">The end</span>
            <span className="text-muted">{formatWords(work.wordCount)} read</span>
          </p>
        )}
      </nav>
    </article>
  );

  return (
    <>
      <InlineScript code={READER_PREFS_SCRIPT} />
      <ReaderShell workId={work.workId} base={base} workTitle={work.title} chapter={{ slug: chapter.slug, title: chapter.title }} toc={toc}>
        {fiction && work.contentWarnings.length > 0 ? (
          <ContentWarningGate workId={work.workId} warnings={work.contentWarnings} backHref={base}>
            {article}
          </ContentWarningGate>
        ) : (
          article
        )}
      </ReaderShell>
    </>
  );
}
