import Link from "next/link";

export function NotFoundPanel({ back = "/", backLabel = "Return home" }: { back?: string; backLabel?: string }) {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl flex-1 px-5 py-28 text-center sm:px-8">
      <p className="meta">Not found</p>
      <h1 className="mt-4 font-display text-4xl italic">This page isn&apos;t on the shelf.</h1>
      <p className="mt-6 text-muted">It may have been moved, withdrawn, or never published.</p>
      <Link href={back} className="meta mt-10 inline-flex min-h-11 items-center link-quiet">
        {backLabel}
      </Link>
    </main>
  );
}
