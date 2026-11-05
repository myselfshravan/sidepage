import type { JSONNode, ManuscriptDoc } from "./schema";

/**
 * Firestore documents are capped at 1 MiB. Edition snapshots store one document per
 * chapter; a chapter larger than this budget is split at top-level block boundaries.
 */
export const PART_BUDGET_BYTES = 800 * 1024;

const byteLength = (value: unknown) => Buffer.byteLength(JSON.stringify(value), "utf8");

export function splitDoc(doc: ManuscriptDoc, budget = PART_BUDGET_BYTES): ManuscriptDoc[] {
  if (byteLength(doc) <= budget) return [doc];
  const parts: ManuscriptDoc[] = [];
  let current: JSONNode[] = [];
  let size = 0;
  for (const block of doc.content) {
    const blockSize = byteLength(block) + 1;
    if (blockSize > budget) {
      throw new Error("A single block exceeds the snapshot size budget");
    }
    if (size + blockSize > budget && current.length > 0) {
      parts.push({ type: "doc", content: current });
      current = [];
      size = 0;
    }
    current.push(block);
    size += blockSize;
  }
  if (current.length > 0) parts.push({ type: "doc", content: current });
  return parts;
}

export function joinDocs(parts: ManuscriptDoc[]): ManuscriptDoc {
  return { type: "doc", content: parts.flatMap((p) => p.content) };
}
