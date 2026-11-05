import type { Metadata } from "next";
import { Suspense } from "react";
import { StudioShell } from "@/components/studio/StudioShell";
import { requireAuthorPage } from "@/server/auth/session";
import { houseFonts, studioFonts } from "@/styles/fonts";

export const metadata: Metadata = { title: { default: "Studio", template: "%s · Studio" }, robots: { index: false, follow: false } };

export default function StudioLayout({ children }: LayoutProps<"/studio">) {
  return (
    <div data-theme="studio" className={`${studioFonts} ${houseFonts} min-h-screen font-sans`}>
      <Suspense fallback={<StudioLoading />}>
        <AuthorGate>{children}</AuthorGate>
      </Suspense>
    </div>
  );
}

/** Every studio page renders inside this gate: no session, no studio. */
async function AuthorGate({ children }: { children: React.ReactNode }) {
  const viewer = await requireAuthorPage();
  return <StudioShell email={viewer.email}>{children}</StudioShell>;
}

function StudioLoading() {
  return (
    <div role="status" className="flex min-h-screen items-center justify-center text-sm text-muted">
      Opening the studio…
    </div>
  );
}
