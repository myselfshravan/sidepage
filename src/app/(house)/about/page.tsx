import type { Metadata } from "next";
import Link from "next/link";
import { SiteHeader } from "@/components/site/SiteHeader";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "About", description: `About ${site.author} and ${site.name}.` };

export default function AboutPage() {
  return (
    <>
      <SiteHeader current="/about" />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-20 sm:px-8">
        <p className="meta uppercase">About the author</p>
        <h1 className="mt-4 font-display text-5xl leading-tight italic">{site.author}</h1>
        <div className="prose-reader mt-10 !mx-0">
          <p>
            {site.author} is an engineer who writes. {site.name} is where that writing lives: memoir — the real things, set
            down carefully — and fiction, which takes more liberties.
          </p>
          <p>
            Every piece here is treated as a publication rather than a post. Each has editions, dates that mean what they
            say, and a reader built for long attention.
          </p>
        </div>
        <ul className="meta mt-12 flex flex-wrap gap-6 uppercase">
          <li>
            <Link href="/memoirs" className="link-quiet">
              Read the memoirs
            </Link>
          </li>
          <li>
            <Link href="/fiction" className="link-quiet">
              Read the fiction
            </Link>
          </li>
          <li>
            <Link href="/contact" className="link-quiet">
              Get in touch
            </Link>
          </li>
        </ul>
      </main>
    </>
  );
}
