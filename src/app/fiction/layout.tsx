import { SiteFooter } from "@/components/site/SiteFooter";
import { atkinson, fictionFonts, plexMono } from "@/styles/fonts";

export default function FictionLayout({ children }: LayoutProps<"/fiction">) {
  return (
    <div data-theme="fiction" className={`${fictionFonts} ${plexMono.variable} ${atkinson.variable} film-grain flex min-h-screen flex-col`}>
      {children}
      <SiteFooter />
    </div>
  );
}
