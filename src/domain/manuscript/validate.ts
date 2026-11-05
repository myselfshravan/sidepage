import {
  HEADING_LEVELS,
  isSafeHref,
  MAX_DEPTH,
  MAX_FOOTNOTE_LENGTH,
  type JSONNode,
  type ManuscriptDoc,
} from "./schema";

export class ManuscriptError extends Error {
  constructor(
    message: string,
    readonly path: string,
  ) {
    super(`${message} (at ${path})`);
    this.name = "ManuscriptError";
  }
}

type Rule = {
  /** Which child node types are allowed. `null` = leaf. */
  children: readonly string[] | null;
  attrs: (attrs: Record<string, unknown>, path: string) => Record<string, unknown> | undefined;
  marks?: boolean;
};

const INLINE = ["text", "hardBreak", "footnote"] as const;
const BLOCK = ["paragraph", "heading", "blockquote", "bulletList", "orderedList", "horizontalRule"] as const;

const none = () => undefined;

const RULES: Record<string, Rule> = {
  paragraph: { children: INLINE, attrs: none },
  heading: {
    children: INLINE,
    attrs: (attrs, path) => {
      const level = attrs.level;
      if (!HEADING_LEVELS.includes(level as 2 | 3 | 4)) {
        throw new ManuscriptError("Heading level must be 2, 3 or 4", path);
      }
      return { level };
    },
  },
  blockquote: { children: ["paragraph"], attrs: none },
  bulletList: { children: ["listItem"], attrs: none },
  orderedList: {
    children: ["listItem"],
    attrs: (attrs) => {
      const start = attrs.start;
      return typeof start === "number" && Number.isInteger(start) && start > 1 ? { start } : undefined;
    },
  },
  listItem: { children: ["paragraph", "bulletList", "orderedList"], attrs: none },
  horizontalRule: { children: null, attrs: none },
  hardBreak: { children: null, attrs: none },
  footnote: {
    children: null,
    attrs: (attrs, path) => {
      const text = attrs.text;
      if (typeof text !== "string" || text.trim().length === 0) {
        throw new ManuscriptError("Footnote needs text", path);
      }
      if (text.length > MAX_FOOTNOTE_LENGTH) {
        throw new ManuscriptError("Footnote is too long", path);
      }
      return { text };
    },
  },
  text: { children: null, attrs: none, marks: true },
};

/**
 * Validates untrusted editor JSON and returns a normalised copy that contains only
 * known nodes, attributes and marks. Unknown attributes are dropped; unknown nodes,
 * unsafe links and malformed structure are rejected outright.
 */
export function validateManuscript(input: unknown): ManuscriptDoc {
  if (!isObject(input) || input.type !== "doc" || !Array.isArray(input.content)) {
    throw new ManuscriptError("Document must be a doc node with content", "$");
  }
  const content = input.content.map((child, i) => normaliseNode(child, BLOCK, `$.content[${i}]`, 1));
  return { type: "doc", content: content.length > 0 ? content : [{ type: "paragraph" }] };
}

function normaliseNode(input: unknown, allowed: readonly string[], path: string, depth: number): JSONNode {
  if (depth > MAX_DEPTH) throw new ManuscriptError("Document is nested too deeply", path);
  if (!isObject(input) || typeof input.type !== "string") {
    throw new ManuscriptError("Node must have a type", path);
  }
  const rule = RULES[input.type];
  if (!rule || !allowed.includes(input.type)) {
    throw new ManuscriptError(`"${String(input.type)}" is not allowed here`, path);
  }

  const out: JSONNode = { type: input.type };
  const attrs = rule.attrs(isObject(input.attrs) ? input.attrs : {}, path);
  if (attrs) out.attrs = attrs;

  if (input.type === "text") {
    if (typeof input.text !== "string" || input.text.length === 0) {
      throw new ManuscriptError("Text node must contain text", path);
    }
    out.text = input.text;
    if (Array.isArray(input.marks) && input.marks.length > 0) {
      out.marks = input.marks.map((m, i) => normaliseMark(m, `${path}.marks[${i}]`));
    }
    return out;
  }

  if (rule.children === null) {
    if (Array.isArray(input.content) && input.content.length > 0) {
      throw new ManuscriptError(`"${input.type}" cannot have content`, path);
    }
    return out;
  }

  if (input.content !== undefined && !Array.isArray(input.content)) {
    throw new ManuscriptError("content must be an array", path);
  }
  const children = (input.content as unknown[] | undefined) ?? [];
  if (children.length > 0) {
    out.content = children.map((c, i) => normaliseNode(c, rule.children!, `${path}.content[${i}]`, depth + 1));
  }
  if (["bulletList", "orderedList", "listItem", "blockquote"].includes(input.type) && children.length === 0) {
    throw new ManuscriptError(`"${input.type}" cannot be empty`, path);
  }
  return out;
}

function normaliseMark(input: unknown, path: string): NonNullable<JSONNode["marks"]>[number] {
  if (!isObject(input) || typeof input.type !== "string") throw new ManuscriptError("Mark must have a type", path);
  switch (input.type) {
    case "bold":
    case "italic":
      return { type: input.type };
    case "link": {
      const href = isObject(input.attrs) ? input.attrs.href : undefined;
      if (typeof href !== "string" || !isSafeHref(href)) throw new ManuscriptError("Link is not allowed", path);
      return { type: "link", attrs: { href } };
    }
    default:
      throw new ManuscriptError(`Mark "${input.type}" is not allowed`, path);
  }
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
