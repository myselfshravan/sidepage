import type { Metadata } from "next";
import { SiteHeader } from "@/components/site/SiteHeader";
import { site } from "@/lib/site";

export const metadata: Metadata = { title: "Contact" };

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-5 py-20 sm:px-8">
        <p className="meta uppercase">Contact</p>
        <h1 className="mt-4 font-display text-5xl italic">Get in touch</h1>
        <p className="mt-8 max-w-xl text-lg leading-relaxed text-muted">
          Questions about the site, corrections, and requests for permission are welcome.
        </p>
        <dl className="mt-10 space-y-4 border-t border-rule pt-8">
          {site.contactEmail ? (
            <div className="grid grid-cols-[8rem_1fr] gap-4">
              <dt className="meta uppercase">Email</dt>
              <dd>
                <a href={`mailto:${site.contactEmail}`} className="link-quiet text-lg">
                  {site.contactEmail}
                </a>
              </dd>
            </div>
          ) : null}
          {!site.contactEmail ? <p className="text-muted">Contact details haven&apos;t been published yet.</p> : null}
        </dl>
      </main>
    </>
  );
}
