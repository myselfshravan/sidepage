"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { createChapterAction, deleteChapterAction, reorderChaptersAction } from "@/app/studio/actions";
import { Button, inputClass, Panel } from "./ui";

type Chapter = { id: string; title: string; slug: string; words: number };

export function ChaptersPanel({ workId, chapters, editable }: { workId: string; chapters: Chapter[]; editable: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string>();
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [title, setTitle] = useState("");

  const act = (fn: () => Promise<{ ok: boolean; message?: string }>, after?: () => void) => {
    setError(undefined);
    startTransition(async () => {
      const r = await fn();
      if (!r.ok) setError(r.message);
      else {
        after?.();
        router.refresh();
      }
    });
  };

  const move = (index: number, delta: -1 | 1) => {
    const order = chapters.map((c) => c.id);
    const [item] = order.splice(index, 1);
    order.splice(index + delta, 0, item!);
    act(() => reorderChaptersAction(workId, order));
  };

  return (
    <Panel id="chapters" title="Chapters" description={editable ? "Order here is the reading order." : "Editing is paused while scheduled or archived."}>
      {chapters.length === 0 ? <p className="mb-4 text-sm text-muted">No chapters yet.</p> : null}
      <ol className="divide-y divide-rule">
        {chapters.map((c, i) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 py-3">
            <span className="w-6 font-mono text-xs text-faint">{String(i + 1).padStart(2, "0")}</span>
            <div className="min-w-0 flex-1">
              {editable ? (
                <Link href={`/studio/publications/${workId}/chapters/${c.id}`} className="font-medium hover:underline">
                  {c.title}
                </Link>
              ) : (
                <span className="font-medium">{c.title}</span>
              )}
              <p className="text-xs text-muted">
                /{c.slug} · {c.words.toLocaleString("en-GB")} words
              </p>
            </div>
            {editable ? (
              <div className="flex items-center gap-1">
                <Button size="sm" variant="ghost" aria-label={`Move ${c.title} up`} disabled={pending || i === 0} onClick={() => move(i, -1)}>
                  ↑
                </Button>
                <Button size="sm" variant="ghost" aria-label={`Move ${c.title} down`} disabled={pending || i === chapters.length - 1} onClick={() => move(i, 1)}>
                  ↓
                </Button>
                {confirmDelete === c.id ? (
                  <>
                    <Button size="sm" variant="danger" disabled={pending} onClick={() => act(() => deleteChapterAction(workId, c.id), () => setConfirmDelete(null))}>
                      Delete draft chapter
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setConfirmDelete(null)}>
                      Keep
                    </Button>
                  </>
                ) : (
                  <Button size="sm" variant="ghost" aria-label={`Delete ${c.title}`} onClick={() => setConfirmDelete(c.id)}>
                    Delete
                  </Button>
                )}
              </div>
            ) : null}
          </li>
        ))}
      </ol>
      {editable ? (
        <form
          className="mt-4 flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            act(
              async () => {
                const r = await createChapterAction(workId, title);
                if (r.ok) router.push(`/studio/publications/${workId}/chapters/${r.value.chapterId}`);
                return r;
              },
              () => setTitle(""),
            );
          }}
        >
          <label htmlFor="new-chapter" className="sr-only">
            New chapter title
          </label>
          <input id="new-chapter" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={200} placeholder="New chapter title" className={inputClass} />
          <Button type="submit" variant="primary" disabled={pending} className="shrink-0">
            Add chapter
          </Button>
        </form>
      ) : null}
      <p aria-live="polite" className="mt-2 min-h-5 text-sm text-danger">
        {error}
      </p>
    </Panel>
  );
}
