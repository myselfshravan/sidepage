import { OG_SIZE, ogCard } from "@/lib/og";
import { site } from "@/lib/site";

export const alt = `${site.name}: ${site.tagline}`;
export const size = OG_SIZE;
export const contentType = "image/png";

export default function Image() {
  return ogCard({ title: site.name, subtitle: site.tagline, footnote: "Memoirs and fiction" });
}
