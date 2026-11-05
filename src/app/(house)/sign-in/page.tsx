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
        <p className="meta uppercase">Your account</p>
        <h1 className="mt-4 font-display text-4xl italic">Sign in</h1>
        <p className="mt-4 text-muted">Sign in to keep your place across devices, build a library and follow authors. Writers sign in here too.</p>
        <Suspense>
          <SignInForm />
        </Suspense>
      </main>
    </>
  );
}
