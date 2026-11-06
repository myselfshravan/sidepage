import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { Cover } from "@/components/publication/Cover";
import { FollowButton } from "@/components/reader/FollowButton";
import { PageSkeleton } from "@/components/site/PageSkeleton";
import { SiteHeader } from "@/components/site/SiteHeader";
import { COLLECTION_LABEL } from "@/domain/types";
import { formatDate, formatMinutes } from "@/lib/format";
import { getPublicAuthor, listPublicWorksByAuthor } from "@/server/read/public";

export async function generateMetadata({ params }: PageProps<"/authors/[handle]">): Promise<Metadata> {
  const author = await getPublicAuthor((await params).handle);
  if (!author) return { title: "Not found", robots: { index: false } };
  return { title: author.displayName, description: author.bio || undefined, alternates: { canonical: `/authors/${author.handle}` } };
}

export default function AuthorPage({ params }: PageProps<"/authors/[handle]">) {
  return (
    <>
      <SiteHeader />
      <Suspense fallback={<PageSkeleton />}>
        <Author params={params} />
      </Suspense>
    </>
  );
}

async function Author({ params }: { params: Promise<{ handle: string }> }) {
  const author = await getPublicAuthor((await params).handle);
  if (!author) notFound();
  const works = await listPublicWorksByAuthor(author.followKey);
  return (
    <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-5 py-20 sm:px-8">
      <p className="meta">@{author.handle}</p>
      <div className="mt-4 flex flex-wrap items-end justify-between gap-6">
        <h1 className="font-display text-[clamp(2.6rem,7vw,4.5rem)] leading-none italic">{author.displayName}</h1>
        <FollowButton authorUid={author.followKey} />
      </div>
      {author.bio ? <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted">{author.bio}</p> : null}
      <h2 className="meta mt-16 border-b border-rule pb-3">Published work</h2>
      {works.length === 0 ? (
        <p className="mt-8 text-muted italic">Nothing published yet.</p>
      ) : (
        <ul className="grid gap-x-8 gap-y-12 py-10 sm:grid-cols-2 lg:grid-cols-3">
          {works.map((w) => (
            <li key={w.workId}>
              <Link href={`/${w.collection}/${w.slug}`} className="group flex gap-5">
                <Cover collection={w.collection} title={w.title} subtitle={w.subtitle} author={w.authorName} size="sm" />
                <span className="space-y-1">
                  <span className="meta block">{COLLECTION_LABEL[w.collection]}</span>
                  <span className="block text-xl leading-tight group-hover:text-accent-ink">{w.title}</span>
                  <span className="meta block">
                    {formatDate(w.firstPublishedAt)} · {formatMinutes(w.readingMinutes)}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
