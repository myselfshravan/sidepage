import type { JSONNode, ManuscriptDoc } from "./schema";

// Markdown ⇄ manuscript JSON, for agents and imports. Supports exactly what the
// manuscript schema supports, nothing more:
//
//   ## / ### / #### headings     > blockquotes          - or * bullet lists
//   1. ordered lists              ---  scene breaks       **bold**  *italic*  _italic_
//   [text](https://link)          text[^1] footnotes, with "[^1]: note" definitions
//
// A single "#" heading is treated as "##" (the chapter title is separate). Output is
// always run through validateManuscript by the caller before it is stored.

type Mark = NonNullable<JSONNode["marks"]>[number];

export function markdownToDoc(markdown: string): ManuscriptDoc {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n");
  const notes = new Map<string, string>();
  const body: string[] = [];
  for (const line of lines) {
    const def = /^\[\^([^\]]+)\]:\s*(.+)$/.exec(line.trim());
    if (def) notes.set(def[1]!, def[2]!.trim());
    else body.push(line);
  }

  const content: JSONNode[] = [];
  let i = 0;
  const isBlank = (l: string | undefined) => l === undefined || l.trim() === "";
  const isRule = (l: string) => /^\s*([-*_])(\s*\1){2,}\s*$/.test(l);
  const bullet = /^\s*[-*+]\s+(.*)$/;
  const ordered = /^\s*(\d+)[.)]\s+(.*)$/;

  while (i < body.length) {
    const line = body[i]!;
    if (isBlank(line)) {
      i++;
      continue;
    }
    if (isRule(line)) {
      content.push({ type: "horizontalRule" });
      i++;
      continue;
    }
    const heading = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (heading) {
      const level = Math.min(4, Math.max(2, heading[1]!.length === 1 ? 2 : heading[1]!.length));
      content.push(withInline({ type: "heading", attrs: { level } }, heading[2]!, notes));
      i++;
      continue;
    }
    if (/^\s*>/.test(line)) {
      const quoted: string[] = [];
      while (i < body.length && /^\s*>/.test(body[i]!)) quoted.push(body[i++]!.replace(/^\s*>\s?/, ""));
      const paragraphs = splitParagraphs(quoted).map((p) => withInline({ type: "paragraph" }, p, notes));
      if (paragraphs.length) content.push({ type: "blockquote", content: paragraphs });
      continue;
    }
    if (bullet.test(line) || ordered.test(line)) {
      const isOrdered = !bullet.test(line);
      const pattern = isOrdered ? ordered : bullet;
      const items: JSONNode[] = [];
      const start = isOrdered ? Number(ordered.exec(line)![1]) : 1;
      while (i < body.length && pattern.test(body[i]!)) {
        const m = pattern.exec(body[i]!)!;
        let text = isOrdered ? m[2]! : m[1]!;
        i++;
        // Continuation lines indented under the item belong to it.
        while (i < body.length && /^\s{2,}\S/.test(body[i]!) && !pattern.test(body[i]!)) text += ` ${body[i++]!.trim()}`;
        items.push({ type: "listItem", content: [withInline({ type: "paragraph" }, text, notes)] });
      }
      content.push(isOrdered ? { type: "orderedList", ...(start > 1 ? { attrs: { start } } : {}), content: items } : { type: "bulletList", content: items });
      continue;
    }
    const paragraph: string[] = [];
    while (i < body.length && !isBlank(body[i]) && !isRule(body[i]!) && !/^(#{1,6})\s/.test(body[i]!) && !/^\s*>/.test(body[i]!) && !bullet.test(body[i]!) && !ordered.test(body[i]!)) {
      paragraph.push(body[i++]!);
    }
    content.push(withInline({ type: "paragraph" }, joinLines(paragraph), notes));
  }

  return { type: "doc", content: content.length ? content : [{ type: "paragraph" }] };
}

function splitParagraphs(lines: string[]): string[] {
  const out: string[] = [];
  let current: string[] = [];
  for (const l of lines) {
    if (l.trim() === "") {
      if (current.length) out.push(joinLines(current));
      current = [];
    } else current.push(l);
  }
  if (current.length) out.push(joinLines(current));
  return out;
}

/** Soft line breaks join with a space; a trailing backslash or two spaces is a hard break. */
function joinLines(lines: string[]): string {
  return lines.map((l, idx) => (idx < lines.length - 1 && (/\\$/.test(l) || / {2,}$/.test(l)) ? `${l.replace(/\\$| +$/, "")}\u2028` : l.trim())).join(" ").replace(/\u2028 /g, "\u2028");
}

function withInline(node: JSONNode, text: string, notes: Map<string, string>): JSONNode {
  const inline = parseInline(text, [], notes);
  return inline.length ? { ...node, content: inline } : node;
}

function parseInline(text: string, marks: Mark[], notes: Map<string, string>): JSONNode[] {
  const out: JSONNode[] = [];
  let buffer = "";
  const flush = () => {
    if (!buffer) return;
    const parts = buffer.split("\u2028");
    parts.forEach((part, idx) => {
      if (part) out.push(marks.length ? { type: "text", text: part, marks: [...marks] } : { type: "text", text: part });
      if (idx < parts.length - 1) out.push({ type: "hardBreak" });
    });
    buffer = "";
  };

  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    if (rest.startsWith("\\") && rest.length > 1 && /[\\`*_[\]()#>!-]/.test(rest[1]!)) {
      buffer += rest[1];
      i += 2;
      continue;
    }
    const footnote = /^\[\^([^\]]+)\]/.exec(rest);
    if (footnote) {
      const note = notes.get(footnote[1]!);
      if (note) {
        flush();
        out.push({ type: "footnote", attrs: { text: note } });
        i += footnote[0].length;
        continue;
      }
    }
    const link = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/.exec(rest);
    if (link) {
      flush();
      out.push(...parseInline(link[1]!, [...marks, { type: "link", attrs: { href: link[2]! } }], notes));
      i += link[0].length;
      continue;
    }
    const strong = /^(\*\*|__)(?=\S)([\s\S]*?\S)\1/.exec(rest);
    if (strong) {
      flush();
      out.push(...parseInline(strong[2]!, [...marks, { type: "bold" }], notes));
      i += strong[0].length;
      continue;
    }
    const em = /^([*_])(?=\S)([\s\S]*?\S)\1(?![*_])/.exec(rest);
    if (em && !(em[1] === "_" && /\w$/.test(buffer))) {
      flush();
      out.push(...parseInline(em[2]!, [...marks, { type: "italic" }], notes));
      i += em[0].length;
      continue;
    }
    buffer += text[i];
    i++;
  }
  flush();
  return out;
}

/** Manuscript JSON back to Markdown (so agents can read and revise a chapter). */
export function docToMarkdown(doc: ManuscriptDoc): string {
  const notes: string[] = [];
  const blocks = doc.content.map((node) => block(node, notes)).filter((b) => b !== "");
  const tail = notes.map((n, i) => `[^${i + 1}]: ${n}`);
  return [...blocks, ...(tail.length ? [tail.join("\n")] : [])].join("\n\n") + "\n";
}

function block(node: JSONNode, notes: string[]): string {
  switch (node.type) {
    case "paragraph":
      return inline(node.content ?? [], notes);
    case "heading":
      return `${"#".repeat(Number(node.attrs?.level ?? 2))} ${inline(node.content ?? [], notes)}`;
    case "blockquote":
      return (node.content ?? []).map((c) => block(c, notes).replace(/^/gm, "> ")).join("\n>\n");
    case "bulletList":
      return (node.content ?? []).map((c) => `- ${block(c, notes)}`).join("\n");
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : 1;
      return (node.content ?? []).map((c, idx) => `${start + idx}. ${block(c, notes)}`).join("\n");
    }
    case "listItem":
      return (node.content ?? []).map((c) => block(c, notes).replace(/\n/g, "\n   ")).join("\n   ");
    case "horizontalRule":
      return "---";
    default:
      return "";
  }
}

function inline(nodes: JSONNode[], notes: string[]): string {
  return nodes
    .map((n) => {
      if (n.type === "hardBreak") return "\\\n";
      if (n.type === "footnote") {
        notes.push(String(n.attrs?.text ?? ""));
        return `[^${notes.length}]`;
      }
      let text = (n.text ?? "").replace(/([\\`*_[\]])/g, "\\$1");
      for (const m of [...(n.marks ?? [])].reverse()) {
        if (m.type === "bold") text = `**${text}**`;
        else if (m.type === "italic") text = `*${text}*`;
        else if (m.type === "link") text = `[${text}](${String(m.attrs?.href ?? "")})`;
      }
      return text;
    })
    .join("");
}
