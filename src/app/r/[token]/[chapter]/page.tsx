import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ChapterBody } from "@/components/publication/ChapterView";
import { SharedFrame } from "@/components/publication/SharedFrame";
import { PageSkeleton } from "@/components/site/PageSkeleton";
import { getSharedChapter } from "@/server/read/shared";

export const metadata: Metadata = { title: "Shared with you" };

export default function SharedChapterPage({ params }: PageProps<"/r/[token]/[chapter]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Shared params={params} />
    </Suspense>
  );
}

async function Shared({ params }: { params: Promise<{ token: string; chapter: string }> }) {
  const { token, chapter } = await params;
  const data = await getSharedChapter(token, chapter);
  if (!data) notFound();
  return (
    <SharedFrame collection={data.work.collection}>
      <ChapterBody data={data} base={`/r/${token}`} shared />
    </SharedFrame>
  );
}
