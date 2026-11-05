import type { JSONNode } from "./schema";

/** Average adult silent-reading speed for prose (Brysbaert, 2019). */
export const WORDS_PER_MINUTE = 238;

export function plainText(node: JSONNode): string {
  if (node.type === "text") return node.text ?? "";
  if (node.type === "hardBreak") return " ";
  if (node.type === "footnote") return "";
  const inner = (node.content ?? []).map(plainText);
  const isBlock = node.type !== "doc" && node.type !== "listItem";
  return isBlock ? `${inner.join("")}\n` : inner.join("\n");
}

export function countWords(text: string): number {
  const matches = text.match(/[\p{L}\p{N}]+(?:['’\-][\p{L}\p{N}]+)*/gu);
  return matches ? matches.length : 0;
}

export function wordCount(doc: JSONNode): number {
  return countWords(plainText(doc));
}

export function readingMinutes(words: number): number {
  if (words <= 0) return 0;
  return Math.max(1, Math.round(words / WORDS_PER_MINUTE));
}

/** First ~N characters of prose, for previews. Never used for private content metadata. */
export function excerpt(doc: JSONNode, max = 220): string {
  const text = plainText(doc).replace(/\s+/g, " ").trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, cut.lastIndexOf(" ") > 0 ? cut.lastIndexOf(" ") : max)}…`;
}
