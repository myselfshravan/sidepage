import { describe, expect, it } from "vitest";
import { canonicalJson, contentHash } from "@/domain/manuscript/canonical";
import { readingMinutes, wordCount } from "@/domain/manuscript/metrics";
import type { ManuscriptDoc } from "@/domain/manuscript/schema";
import { joinDocs, splitDoc } from "@/domain/manuscript/split";
import { ManuscriptError, validateManuscript } from "@/domain/manuscript/validate";

const p = (text: string) => ({ type: "paragraph", content: [{ type: "text", text }] });

describe("validateManuscript", () => {
  it("accepts the supported structure and strips unknown attributes", () => {
    const doc = validateManuscript({
      type: "doc",
      content: [
        { type: "heading", attrs: { level: 2, id: "x", style: "color:red" }, content: [{ type: "text", text: "One" }] },
        {
          type: "paragraph",
          content: [
            { type: "text", text: "Hello ", marks: [{ type: "bold" }] },
            { type: "text", text: "there", marks: [{ type: "link", attrs: { href: "https://example.com", target: "_blank" } }] },
            { type: "footnote", attrs: { text: "A note." } },
          ],
        },
        { type: "bulletList", content: [{ type: "listItem", content: [p("item")] }] },
        { type: "horizontalRule" },
      ],
    });
    expect(doc.content[0]).toEqual({ type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "One" }] });
    const link = doc.content[1]!.content![1]!.marks![0];
    expect(link).toEqual({ type: "link", attrs: { href: "https://example.com" } });
  });

  it.each([
    ["javascript: links", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "javascript:alert(1)" } }] }] }] }],
    ["protocol-relative links", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", attrs: { href: "//evil.example" } }] }] }] }],
    ["unknown nodes", { type: "doc", content: [{ type: "iframe" }] }],
    ["unknown marks", { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "code" }] }] }] }],
    ["h1 headings", { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] }],
    ["inline nodes at block level", { type: "doc", content: [{ type: "text", text: "loose" }] }],
    ["empty footnotes", { type: "doc", content: [{ type: "paragraph", content: [{ type: "footnote", attrs: { text: " " } }] }] }],
    ["a non-doc root", { type: "paragraph" }],
  ])("rejects %s", (_label, input) => {
    expect(() => validateManuscript(input)).toThrow(ManuscriptError);
  });

  it("rejects pathological nesting", () => {
    let node: Record<string, unknown> = p("deep");
    for (let i = 0; i < 20; i++) node = { type: "blockquote", content: [node] };
    // blockquote only allows paragraphs, so build nesting via lists instead
    let list: Record<string, unknown> = { type: "bulletList", content: [{ type: "listItem", content: [p("x")] }] };
    for (let i = 0; i < 10; i++) list = { type: "bulletList", content: [{ type: "listItem", content: [p("x"), list] }] };
    expect(() => validateManuscript({ type: "doc", content: [list] })).toThrow(/nested too deeply/);
  });

  it("gives an empty document a paragraph", () => {
    expect(validateManuscript({ type: "doc", content: [] })).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("metrics", () => {
  it("counts words across blocks without merging them, ignoring footnotes", () => {
    const doc = validateManuscript({
      type: "doc",
      content: [p("The house on"), p("Hill-Road was don’t quiet."), { type: "paragraph", content: [{ type: "footnote", attrs: { text: "not counted at all" } }] }],
    });
    expect(wordCount(doc)).toBe(7);
  });

  it("estimates reading time", () => {
    expect(readingMinutes(0)).toBe(0);
    expect(readingMinutes(10)).toBe(1);
    expect(readingMinutes(2380)).toBe(10);
  });
});

describe("canonical hashing", () => {
  it("is independent of key order", () => {
    expect(canonicalJson({ b: 1, a: { d: [1, { z: 1, y: 2 }], c: undefined } })).toBe('{"a":{"d":[1,{"y":2,"z":1}]},"b":1}');
    expect(contentHash({ x: 1, y: 2 })).toBe(contentHash({ y: 2, x: 1 }));
  });

  it("changes when content changes", () => {
    expect(contentHash({ doc: p("a") })).not.toBe(contentHash({ doc: p("b") }));
  });
});

describe("splitDoc", () => {
  it("keeps small chapters whole and splits large ones at block boundaries", () => {
    const small: ManuscriptDoc = { type: "doc", content: [p("short")] };
    expect(splitDoc(small)).toEqual([small]);

    const big: ManuscriptDoc = { type: "doc", content: Array.from({ length: 50 }, (_, i) => p(`${i} ${"x".repeat(100)}`)) };
    const parts = splitDoc(big, 1024);
    expect(parts.length).toBeGreaterThan(1);
    for (const part of parts) expect(Buffer.byteLength(JSON.stringify(part))).toBeLessThanOrEqual(1024 + 200);
    expect(joinDocs(parts)).toEqual(big);
  });
});
