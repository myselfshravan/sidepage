import Link from "next/link";
import { site } from "@/lib/site";

export function SiteFooter() {
  return (
    <footer className="no-print mt-24 border-t border-rule">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-[1fr_auto] sm:px-8">
        <div className="space-y-2">
          <p className="font-display text-lg italic">{site.name}</p>
          <p className="meta max-w-md leading-relaxed">
            {site.tagline} Set in Newsreader, Bodoni Moda, Crimson Pro and IBM Plex Mono.
          </p>
        </div>
        <nav aria-label="Footer" className="meta flex flex-wrap items-end gap-x-6 gap-y-2 uppercase">
          <Link href="/contact" className="hover:text-ink">
            Contact
          </Link>
          <Link href="/archive" className="hover:text-ink">
            Archive
          </Link>
          <Link href="/studio" className="hover:text-ink">
            Studio
          </Link>
          <span>
            © {site.established} {site.author}
          </span>
        </nav>
      </div>
    </footer>
  );
}
