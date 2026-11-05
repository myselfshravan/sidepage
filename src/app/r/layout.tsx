import type { Metadata } from "next";
import { atkinson, fictionFonts, houseFonts } from "@/styles/fonts";

// Secret-link reading. Pages here are personal to whoever holds the link.
export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default function SharedLayout({ children }: LayoutProps<"/r">) {
  return <div className={`${houseFonts} ${fictionFonts} ${atkinson.variable}`}>{children}</div>;
}
