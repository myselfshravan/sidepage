import type { Metadata } from "next";
import { Suspense } from "react";
import { SiteHeader } from "@/components/site/SiteHeader";
import { SignInForm } from "./SignInForm";

export const metadata: Metadata = { title: "Sign in", robots: { index: false } };

export default function SignInPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-md flex-1 px-5 py-24 sm:px-8">
        <h1 className="font-display text-4xl">Sign in to sidepage</h1>
        <p className="mt-3 leading-relaxed text-muted">Keep your place across devices, save books to your library and follow authors. Writers sign in here too.</p>
        <Suspense>
          <SignInForm />
        </Suspense>
      </main>
    </>
  );
}
