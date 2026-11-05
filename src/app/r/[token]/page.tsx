import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { PublicationBody } from "@/components/publication/PublicationView";
import { SharedFrame } from "@/components/publication/SharedFrame";
import { PageSkeleton } from "@/components/site/PageSkeleton";
import { getSharedWork } from "@/server/read/shared";

export const metadata: Metadata = { title: "Shared with you" };

export default function SharedPublicationPage({ params }: PageProps<"/r/[token]">) {
  return (
    <Suspense fallback={<PageSkeleton />}>
      <Shared params={params} />
    </Suspense>
  );
}

async function Shared({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const found = await getSharedWork(token);
  if (!found) notFound();
  return (
    <SharedFrame collection={found.work.collection}>
      <PublicationBody work={found.work} toc={found.toc} base={`/r/${token}`} shared />
    </SharedFrame>
  );
}
