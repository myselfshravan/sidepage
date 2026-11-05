import { Suspense } from "react";
import { ChapterView } from "@/components/publication/ChapterView";
import { chapterMetadata } from "@/components/publication/metadata";
import { PageSkeleton } from "@/components/site/PageSkeleton";

export async function generateMetadata({ params }: PageProps<"/fiction/[slug]/[chapter]">) {
  const { slug, chapter } = await params;
  return chapterMetadata("fiction", slug, chapter);
}

export default function Page({ params }: PageProps<"/fiction/[slug]/[chapter]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <ChapterView collection="fiction" params={params} />
    </Suspense>
  );
}
