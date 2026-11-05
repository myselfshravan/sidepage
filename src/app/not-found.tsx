import { NotFoundPanel } from "@/components/site/NotFoundPanel";
import { houseFonts } from "@/styles/fonts";

export default function NotFound() {
  return (
    <div data-theme="house" className={`${houseFonts} paper-grain flex min-h-screen flex-col`}>
      <NotFoundPanel />
    </div>
  );
}
