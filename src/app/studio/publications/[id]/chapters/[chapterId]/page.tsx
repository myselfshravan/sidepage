import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ChapterEditor } from "@/components/editor/ChapterEditor";
import { getChapter } from "@/server/services/chapters";
import { getWork } from "@/server/services/works";
import { requireAuthorPage } from "@/server/auth/session";

export const metadata: Metadata = { title: "Editing" };

export default async function ChapterEditPage({ params }: PageProps<"/studio/publications/[id]/chapters/[chapterId]">) {
  // Pages render in parallel with the layout, so each one authorises itself.
  await requireAuthorPage();
  const { id, chapterId } = await params;
  const [work, chapter] = await Promise.all([getWork(id), getChapter(id, chapterId)]);
  if (!work || !chapter) notFound();
  const readOnly = work.status === "SCHEDULED" || work.status === "ARCHIVED";

  return (
    <div className="space-y-4">
      <nav aria-label="Breadcrumb" className="text-sm text-muted">
        <Link href={`/studio/publications/${id}`} className="hover:text-ink">
          ← {work.title}
        </Link>
      </nav>
      <ChapterEditor
        workId={id}
        chapterId={chapterId}
        previewHref={`/studio/publications/${id}/chapters/${chapterId}/preview`}
        readOnly={readOnly}
        readOnlyReason={
          work.status === "SCHEDULED"
            ? "This publication is scheduled. Cancel the schedule to keep editing; the scheduled content is what will publish."
            : "This publication is archived. Restore it to edit."
        }
        initial={{ title: chapter.title, slug: chapter.slug, doc: chapter.doc, rev: chapter.rev, updatedAt: chapter.updated_at.toDate().toISOString() }}
      />
    </div>
  );
}
