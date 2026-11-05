import { Suspense } from "react";
import { PublicationView } from "@/components/publication/PublicationView";
import { publicationMetadata } from "@/components/publication/metadata";
import { PageSkeleton } from "@/components/site/PageSkeleton";

export async function generateMetadata({ params }: PageProps<"/fiction/[slug]">) {
  return publicationMetadata("fiction", (await params).slug);
}

export default function Page({ params }: PageProps<"/fiction/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PublicationView collection="fiction" params={params} />
    </Suspense>
  );
}
