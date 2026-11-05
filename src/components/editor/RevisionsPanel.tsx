import { useEffect, useState, useTransition } from "react";
import { getRevisionAction, listRevisionsAction, restoreRevisionAction } from "@/app/studio/actions";
import { RenderDoc } from "@/content/render/RenderDoc";
import { validateManuscript } from "@/domain/manuscript/validate";
import type { ManuscriptDoc } from "@/domain/manuscript/schema";
import { Button } from "@/components/studio/ui";

type Revision = { id: string; kind: string; rev: number; words: number; createdAt: string; title: string };

const KIND: Record<string, string> = { AUTO: "Autosave", CHECKPOINT: "Checkpoint", BEFORE_RESTORE: "Before restore" };

type Props = {
  workId: string;
  chapterId: string;
  readOnly: boolean;
  beforeRestore: () => Promise<boolean>;
  currentRev: () => number;
  onRestored: () => void;
  onClose: () => void;
};

export function RevisionsPanel({ workId, chapterId, readOnly, beforeRestore, currentRev, onRestored, onClose }: Props) {
  const [items, setItems] = useState<Revision[] | null>(null);
  const [error, setError] = useState<string>();
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ title: string; doc: ManuscriptDoc } | null>(null);
  const [confirm, setConfirm] = useState(false);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    listRevisionsAction(workId, chapterId).then((r) => (r.ok ? setItems(r.value) : setError(r.message)));
  }, [workId, chapterId]);

  const open = (id: string) => {
    setSelected(id);
    setPreview(null);
    setConfirm(false);
    getRevisionAction(workId, chapterId, id).then((r) => {
      if (r.ok) setPreview({ title: r.value.title, doc: validateManuscript(r.value.doc) });
      else setError(r.message);
    });
  };

  return (
    <section aria-labelledby="revisions-title" className="rounded-[var(--radius)] border border-rule bg-surface">
      <header className="flex items-center justify-between border-b border-rule px-5 py-3">
        <h2 id="revisions-title" className="font-semibold">
          Revision history
        </h2>
        <Button size="sm" variant="ghost" onClick={onClose}>
          Close
        </Button>
      </header>
      <div className="grid gap-0 md:grid-cols-[18rem_1fr]">
        <div className="max-h-[60vh] overflow-y-auto border-rule md:border-r">
          {error ? <p className="px-5 py-4 text-sm text-danger">{error}</p> : null}
          {items === null && !error ? <p className="px-5 py-4 text-sm text-muted">Loading…</p> : null}
          {items?.length === 0 ? <p className="px-5 py-4 text-sm text-muted">No revisions yet. They are kept every 10 minutes of writing, and whenever you save a checkpoint.</p> : null}
          <ol>
            {items?.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => open(r.id)}
                  aria-current={selected === r.id}
                  className="w-full border-b border-rule px-5 py-3 text-left text-sm hover:bg-paper aria-[current=true]:bg-paper"
                >
                  <span className="block font-medium">{KIND[r.kind] ?? r.kind}</span>
                  <span className="block text-xs text-muted">
                    {new Date(r.createdAt).toLocaleString()} · {r.words.toLocaleString()} words
                  </span>
                </button>
              </li>
            ))}
          </ol>
        </div>
        <div className="max-h-[60vh] overflow-y-auto px-5 py-5">
          {!selected ? <p className="text-sm text-muted">Choose a revision to read it.</p> : null}
          {selected && !preview ? <p className="text-sm text-muted">Loading revision…</p> : null}
          {preview ? (
            <>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                {!readOnly ? (
                  confirm ? (
                    <>
                      <Button
                        size="sm"
                        variant="primary"
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            if (!(await beforeRestore())) return;
                            const r = await restoreRevisionAction(workId, chapterId, selected!, currentRev());
                            if (r.ok) onRestored();
                            else setError(r.message);
                          })
                        }
                      >
                        {pending ? "Restoring…" : "Replace the draft with this revision"}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setConfirm(false)}>
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" onClick={() => setConfirm(true)}>
                      Restore this revision
                    </Button>
                  )
                ) : null}
                <span className="text-xs text-muted">The current draft is kept as a revision first.</span>
              </div>
              <h3 className="font-display text-2xl italic">{preview.title}</h3>
              <div className="prose-reader !mx-0 mt-4 text-base">
                <RenderDoc doc={preview.doc} idPrefix="rev-" />
              </div>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
