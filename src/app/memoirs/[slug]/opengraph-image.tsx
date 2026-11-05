import { formatMinutes } from "@/lib/format";
import { OG_SIZE, ogCard } from "@/lib/og";
import { getPublicWork } from "@/server/read/public";

export const alt = "Publication cover";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const work = await getPublicWork("memoirs", (await params).slug);
  if (!work) return ogCard({ collection: "memoirs", title: "sidepage" });
  return ogCard({
    collection: "memoirs",
    title: work.title,
    subtitle: work.subtitle || undefined,
    byline: work.authorName,
    footnote: [work.writtenLabel, formatMinutes(work.readingMinutes)].filter(Boolean).join(", "),
  });
}
