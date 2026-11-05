import type { Metadata } from "next";
import type { Collection } from "@/domain/types";
import { getPublicChapter, getPublicWork } from "@/server/read/public";

// Metadata comes only from the public read model, so drafts never leak into
// titles, descriptions or Open Graph tags.

export async function publicationMetadata(collection: Collection, slug: string): Promise<Metadata> {
  const work = await getPublicWork(collection, slug);
  if (!work) return { title: "Not found", robots: { index: false } };
  const description = work.description || work.subtitle || undefined;
  return {
    title: work.title,
    description,
    alternates: { canonical: `/${collection}/${work.slug}` },
    openGraph: { type: "book", title: work.title, description, authors: [work.authorName] },
  };
}

export async function chapterMetadata(collection: Collection, slug: string, chapter: string): Promise<Metadata> {
  const data = await getPublicChapter(collection, slug, chapter);
  if (!data) return { title: "Not found", robots: { index: false } };
  return {
    title: `${data.chapter.title} — ${data.work.title}`,
    description: data.work.description || undefined,
    alternates: { canonical: `/${collection}/${data.work.slug}/${data.chapter.slug}` },
    openGraph: { type: "article", title: data.chapter.title, authors: [data.work.authorName] },
  };
}
