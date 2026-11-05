import { Suspense } from "react";
import { ChapterView } from "@/components/publication/ChapterView";
import { chapterMetadata } from "@/components/publication/metadata";
import { PageSkeleton } from "@/components/site/PageSkeleton";

export async function generateMetadata({ params }: PageProps<"/memoirs/[slug]/[chapter]">) {
  const { slug, chapter } = await params;
  return chapterMetadata("memoirs", slug, chapter);
}

export default function Page({ params }: PageProps<"/memoirs/[slug]/[chapter]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChapterView collection="memoirs" params={params} />
    </Suspense>
  );
}
