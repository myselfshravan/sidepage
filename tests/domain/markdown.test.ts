import { describe, expect, it } from "vitest";
import { docToMarkdown, markdownToDoc } from "@/domain/manuscript/markdown";
import { validateManuscript } from "@/domain/manuscript/validate";
import { wordCount } from "@/domain/manuscript/metrics";

const sample = `# Arrival

The rain came **early** that year, and *nobody* was ready.
It came anyway.

> I remember the smell of it.
>
> And the sound.

- one
- two **bold**
- [three](https://example.com)

1. first
2. second

---

A footnote here.[^1] And a line\\
break.

[^1]: The note text.
`;

describe("markdownToDoc", () => {
  it("produces a valid manuscript for every supported construct", () => {
    const doc = validateManuscript(markdownToDoc(sample));
    const types = doc.content.map((n) => n.type);
    expect(types).toEqual(["heading", "paragraph", "blockquote", "bulletList", "orderedList", "horizontalRule", "paragraph"]);
    expect(doc.content[0]).toMatchObject({ attrs: { level: 2 } });
    expect(doc.content[2]!.content).toHaveLength(2);
    const para = doc.content[1]!.content!;
    expect(para.find((n) => n.text === "early")?.marks).toEqual([{ type: "bold" }]);
    expect(para.find((n) => n.text === "nobody")?.marks).toEqual([{ type: "italic" }]);
    const last = doc.content[6]!.content!;
    expect(last.some((n) => n.type === "footnote" && n.attrs?.text === "The note text.")).toBe(true);
    expect(last.some((n) => n.type === "hardBreak")).toBe(true);
  });

  it("joins soft-wrapped lines with spaces", () => {
    const doc = markdownToDoc("one\ntwo\nthree");
    expect(doc.content[0]!.content![0]!.text).toBe("one two three");
  });

  it("refuses unsafe links through validation", () => {
    expect(() => validateManuscript(markdownToDoc("[x](javascript:alert(1))"))).toThrow(/Link is not allowed/);
  });

  it("does not treat intra-word underscores as italics", () => {
    const doc = markdownToDoc("snake_case_name stays");
    expect(doc.content[0]!.content).toEqual([{ type: "text", text: "snake_case_name stays" }]);
  });

  it("gives an empty document a paragraph", () => {
    expect(markdownToDoc("   \n\n")).toEqual({ type: "doc", content: [{ type: "paragraph" }] });
  });
});

describe("docToMarkdown", () => {
  it("round-trips without losing words or structure", () => {
    const doc = validateManuscript(markdownToDoc(sample));
    const again = validateManuscript(markdownToDoc(docToMarkdown(doc)));
    expect(again).toEqual(doc);
    expect(wordCount(again)).toBe(wordCount(doc));
  });
});
