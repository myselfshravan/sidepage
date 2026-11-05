import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "About", description: site.tagline };

// Placeholder copy describing how the platform works. Replace with your own words.
export default function AboutPage() {
  return (
    <>
      <SiteHeader current="/about" />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-20 sm:px-8">
        <h1 className="font-display text-5xl leading-tight italic">{site.name}</h1>
        <div className="prose-reader mt-10 !mx-0">
          <p>{site.tagline}</p>
          <p>Every piece is published as an edition. Readers always see exactly what the author published, and anyone can read public work without an account.</p>
          <p>With an account, readers keep their place across devices, save publications to a library and follow authors. Readers can ask to write; approved authors publish from the studio.</p>
        </div>
        <ul className="meta mt-12 flex flex-wrap gap-6">
          <li>
            <Link href="/memoirs" className="link-quiet">
              Memoirs
            </Link>
          </li>
          <li>
            <Link href="/fiction" className="link-quiet">
              Fiction
            </Link>
          </li>
          <li>
            <Link href="/account" prefetch={false} className="link-quiet">
              Write here
            </Link>
          </li>
        </ul>
      </main>
    </>
  );
}
