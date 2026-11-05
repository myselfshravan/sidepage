import { SiteFooter } from "@/components/site/SiteFooter";
import { atkinson, houseFonts } from "@/styles/fonts";

export default function MemoirsLayout({ children }: LayoutProps<"/memoirs">) {
  return (
    <div data-theme="memoir" className={`${houseFonts} ${atkinson.variable} paper-grain flex min-h-screen flex-col`}>
      {children}
      <SiteFooter />
    </div>
  );
}
