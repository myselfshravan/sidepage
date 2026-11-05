// The canonical manuscript format: a ProseMirror/Tiptap JSON document restricted to
// the nodes and marks below. This file is the single source of truth for what a
// manuscript may contain; the editor, the server validator and the reader renderer
// all derive from it.

export const SCHEMA_VERSION = 1;

export const BLOCK_NODES = [
  "paragraph",
  "heading",
  "blockquote",
  "bulletList",
  "orderedList",
  "listItem",
  "horizontalRule",
] as const;
export const INLINE_NODES = ["text", "hardBreak", "footnote"] as const;
export const MARKS = ["bold", "italic", "link"] as const;

export type BlockNodeName = (typeof BLOCK_NODES)[number];
export type InlineNodeName = (typeof INLINE_NODES)[number];
export type NodeName = "doc" | BlockNodeName | InlineNodeName;
export type MarkName = (typeof MARKS)[number];

export type Mark =
  | { type: "bold" }
  | { type: "italic" }
  | { type: "link"; attrs: { href: string } };

export type JSONNode = {
  type: string;
  attrs?: Record<string, unknown>;
  content?: JSONNode[];
  marks?: { type: string; attrs?: Record<string, unknown> }[];
  text?: string;
};

export type ManuscriptDoc = { type: "doc"; content: JSONNode[] };

export const HEADING_LEVELS = [2, 3, 4] as const;
export const MAX_DEPTH = 12;
export const MAX_FOOTNOTE_LENGTH = 2000;

export function emptyDoc(): ManuscriptDoc {
  return { type: "doc", content: [{ type: "paragraph" }] };
}

/** Links may point to the web, email, or a path on this site. Nothing else. */
export function isSafeHref(href: string): boolean {
  if (href.length > 2048) return false;
  if (href.startsWith("/") && !href.startsWith("//")) return true;
  if (href.startsWith("#")) return true;
  try {
    const url = new URL(href);
    return url.protocol === "https:" || url.protocol === "http:" || url.protocol === "mailto:";
  } catch {
    return false;
  }
}
