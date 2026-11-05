import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { RenderDoc } from "@/content/render/RenderDoc";
import { getChapter } from "@/server/services/chapters";
import { getManagedWork } from "@/server/services/works";
import { atkinson, fictionFonts } from "@/styles/fonts";
import { requireWriterPage } from "@/server/auth/session";
import { actorFrom } from "@/server/services/actor";

export const metadata: Metadata = { title: "Draft preview" };

/** The draft, rendered by the same renderer readers get. Author-only; never cached. */
export default async function PreviewPage({ params }: PageProps<"/studio/publications/[id]/chapters/[chapterId]/preview">) {
  // Pages render in parallel with the layout, so each one authorises itself.
  const actor = actorFrom(await requireWriterPage());
  const { id, chapterId } = await params;
  const work = await getManagedWork(actor, id);
  const chapter = work ? await getChapter(actor, id, chapterId) : null;
  if (!work || !chapter) notFound();
  const fiction = work.collection === "fiction";

  return (
    <div data-theme={fiction ? "fiction" : "memoir"} className={`${fictionFonts} ${atkinson.variable} -mx-5 -my-8 min-h-screen px-5 py-8 ${fiction ? "film-grain" : "paper-grain"}`}>
      <p className="meta mx-auto flex max-w-[var(--measure)] items-center justify-between border border-dashed border-rule px-4 py-2 uppercase">
        <span>Draft preview — not published</span>
        <Link href={`/studio/publications/${id}/chapters/${chapterId}`} className="link-quiet">
          Back to editor
        </Link>
      </p>
      <article className="pt-16 pb-24">
        <header className="mx-auto mb-14 max-w-[var(--measure)] text-center">
          <p className="meta uppercase">{work.title}</p>
          <h1 className={fiction ? "credits mt-5 text-4xl" : "mt-5 font-display text-5xl italic"}>{chapter.title}</h1>
        </header>
        <div className={`prose-reader ${fiction ? "" : "has-dropcap"}`}>
          <RenderDoc doc={chapter.doc} />
        </div>
      </article>
    </div>
  );
}
