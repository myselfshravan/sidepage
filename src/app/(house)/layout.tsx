import { SiteFooter } from "@/components/site/SiteFooter";
import { fictionFonts, houseFonts } from "@/styles/fonts";

export default function HouseLayout({ children }: LayoutProps<"/">) {
  return (
    <div data-theme="house" className={`${houseFonts} ${fictionFonts} paper-grain flex min-h-screen flex-col`}>
      {children}
      <SiteFooter />
    </div>
  );
}
