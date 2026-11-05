import { OG_SIZE, ogCard } from "@/lib/og";
import { getPublicAuthor } from "@/server/read/public";

export const alt = "Author on sidepage";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image({ params }: { params: Promise<{ handle: string }> }) {
  const author = await getPublicAuthor((await params).handle);
  return ogCard({ title: author?.displayName ?? "sidepage", subtitle: author?.bio ? author.bio.slice(0, 120) : undefined, footnote: author ? `@${author.handle}` : undefined });
}
