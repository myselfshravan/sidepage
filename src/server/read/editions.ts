import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import type { ManuscriptDoc } from "@/domain/manuscript/schema";
import { col, partId, type EditionDoc, type EditionPartDoc } from "../firebase/model";

// Content loaders for SEALED editions. They perform no access checks: callers
// (public.ts for public works, shared.ts for share links) decide who may read.
// Sealed editions never change, so their content is cached indefinitely by id.

export type LoadedEdition = { id: string; sealToken: string; toc: EditionDoc["toc"] };

export async function loadEdition(editionId: string): Promise<LoadedEdition | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`edition:${editionId}`);
  const e = (await col.edition(editionId).get()).data() as EditionDoc | undefined;
  if (!e || e.state !== "SEALED") return null;
  return { id: editionId, sealToken: e.seal_token, toc: e.toc };
}

export async function loadChapter(editionId: string, chapterSlug: string): Promise<ManuscriptDoc | null> {
  "use cache";
  cacheLife("max");
  cacheTag(`edition:${editionId}`);
  const edition = await loadEdition(editionId);
  const entry = edition?.toc.find((t) => t.slug === chapterSlug);
  if (!edition || !entry) return null;
  const refs = Array.from({ length: entry.parts }, (_, i) => col.parts(editionId).doc(partId(edition.sealToken, entry.ordinal, i)));
  const snaps = await Promise.all(refs.map((r) => r.get()));
  const parts = snaps.map((s) => s.data() as EditionPartDoc | undefined);
  if (parts.some((p) => !p || p.seal_token !== edition.sealToken)) return null;
  return { type: "doc", content: parts.flatMap((p) => p!.doc.content) };
}
