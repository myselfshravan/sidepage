import { Suspense } from "react";
import { PublicationView } from "@/components/publication/PublicationView";
import { publicationMetadata } from "@/components/publication/metadata";
import { PageSkeleton } from "@/components/site/PageSkeleton";

export async function generateMetadata({ params }: PageProps<"/memoirs/[slug]">) {
  return publicationMetadata("memoirs", (await params).slug);
}

export default function Page({ params }: PageProps<"/memoirs/[slug]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <PublicationView collection="memoirs" params={params} />
    </Suspense>
  );
}
