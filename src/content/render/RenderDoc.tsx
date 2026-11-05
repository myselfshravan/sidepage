import { Fragment, type ReactNode } from "react";
import { isSafeHref, type JSONNode, type ManuscriptDoc } from "@/domain/manuscript/schema";

// Renders a validated manuscript to React elements on the server. Text is always
// rendered as React text (escaped); there is no dangerouslySetInnerHTML anywhere,
// so manuscript content cannot inject markup or script. Unknown nodes render nothing.
//
// Top-level blocks get stable ids (`b-<index>`) that reading progress anchors to.
// Footnotes are numbered in reading order and collected as endnotes.

type Ctx = { notes: string[]; idPrefix: string };

export function RenderDoc({ doc, idPrefix = "" }: { doc: ManuscriptDoc; idPrefix?: string }) {
  const ctx: Ctx = { notes: [], idPrefix };
  const blocks = doc.content.map((node, i) => renderBlock(node, ctx, `${idPrefix}b-${i}`, i));
  return (
    <>
      {blocks}
      {ctx.notes.length > 0 && (
        <section className="endnotes" aria-label="Notes">
          <hr />
          <ol>
            {ctx.notes.map((text, i) => (
              <li key={i} id={`${idPrefix}fn-${i + 1}`}>
                {text}{" "}
                <a href={`#${idPrefix}fnref-${i + 1}`} aria-label={`Back to reference ${i + 1}`} className="backref">
                  ↩
                </a>
              </li>
            ))}
          </ol>
        </section>
      )}
    </>
  );
}

function renderBlock(node: JSONNode, ctx: Ctx, id: string | undefined, key: number): ReactNode {
  const children = () => (node.content ?? []).map((child, i) => renderNode(child, ctx, i));
  const anchor = id ? { id, "data-block": "" } : {};
  switch (node.type) {
    case "paragraph":
      return (
        <p key={key} {...anchor}>
          {children()}
        </p>
      );
    case "heading": {
      const level = node.attrs?.level;
      const Tag = level === 3 ? "h3" : level === 4 ? "h4" : "h2";
      return (
        <Tag key={key} {...anchor}>
          {children()}
        </Tag>
      );
    }
    case "blockquote":
      return (
        <blockquote key={key} {...anchor}>
          {(node.content ?? []).map((c, i) => renderBlock(c, ctx, undefined, i))}
        </blockquote>
      );
    case "bulletList":
      return (
        <ul key={key} {...anchor}>
          {(node.content ?? []).map((c, i) => renderBlock(c, ctx, undefined, i))}
        </ul>
      );
    case "orderedList": {
      const start = typeof node.attrs?.start === "number" ? node.attrs.start : undefined;
      return (
        <ol key={key} start={start} {...anchor}>
          {(node.content ?? []).map((c, i) => renderBlock(c, ctx, undefined, i))}
        </ol>
      );
    }
    case "listItem":
      return <li key={key}>{(node.content ?? []).map((c, i) => renderBlock(c, ctx, undefined, i))}</li>;
    case "horizontalRule":
      return <hr key={key} className="scene-break" {...anchor} />;
    default:
      return null;
  }
}

function renderNode(node: JSONNode, ctx: Ctx, key: number): ReactNode {
  switch (node.type) {
    case "text":
      return <Fragment key={key}>{applyMarks(node.text ?? "", node.marks ?? [])}</Fragment>;
    case "hardBreak":
      return <br key={key} />;
    case "footnote": {
      const text = typeof node.attrs?.text === "string" ? node.attrs.text : "";
      ctx.notes.push(text);
      const n = ctx.notes.length;
      return (
        <sup key={key} className="noteref">
          <a href={`#${ctx.idPrefix}fn-${n}`} id={`${ctx.idPrefix}fnref-${n}`} aria-label={`Note ${n}`}>
            {n}
          </a>
        </sup>
      );
    }
    default:
      return null;
  }
}

function applyMarks(text: string, marks: NonNullable<JSONNode["marks"]>): ReactNode {
  return marks.reduce<ReactNode>((inner, mark) => {
    switch (mark.type) {
      case "bold":
        return <strong>{inner}</strong>;
      case "italic":
        return <em>{inner}</em>;
      case "link": {
        const href = typeof mark.attrs?.href === "string" ? mark.attrs.href : "";
        if (!isSafeHref(href)) return inner;
        const external = /^https?:/.test(href);
        return (
          <a href={href} {...(external ? { rel: "noopener noreferrer nofollow", target: "_blank" } : {})}>
            {inner}
          </a>
        );
      }
      default:
        return inner;
    }
  }, text);
}
