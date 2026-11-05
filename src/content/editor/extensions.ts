import { mergeAttributes, Node } from "@tiptap/core";
import { Placeholder } from "@tiptap/extensions";
import StarterKit from "@tiptap/starter-kit";
import { HEADING_LEVELS, isSafeHref } from "@/domain/manuscript/schema";

// The editor's schema, restricted to exactly what src/domain/manuscript/schema.ts
// allows. Anything the editor can produce, the server validator accepts, and the
// reader renderer can display.

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    footnote: {
      insertFootnote: (text: string) => ReturnType;
      updateFootnote: (text: string) => ReturnType;
    };
  }
}

/** An inline note marker. Its text is stored on the node and rendered as an endnote. */
export const Footnote = Node.create({
  name: "footnote",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      text: {
        default: "",
        parseHTML: (el) => el.getAttribute("data-footnote") ?? "",
        renderHTML: (attrs) => ({ "data-footnote": attrs.text, title: attrs.text }),
      },
    };
  },

  parseHTML() {
    return [{ tag: "sup[data-footnote]" }];
  },

  renderHTML({ HTMLAttributes }) {
    return ["sup", mergeAttributes(HTMLAttributes, { class: "footnote-chip", "aria-label": "Footnote" }), "note"];
  },

  addCommands() {
    return {
      insertFootnote:
        (text) =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: { text } }),
      updateFootnote:
        (text) =>
        ({ commands }) =>
          commands.updateAttributes(this.name, { text }),
    };
  },
});

export function manuscriptExtensions(placeholder = "Begin writing…") {
  return [
    StarterKit.configure({
      heading: { levels: [...HEADING_LEVELS] },
      code: false,
      codeBlock: false,
      strike: false,
      underline: false,
      link: {
        openOnClick: false,
        autolink: true,
        defaultProtocol: "https",
        protocols: ["http", "https", "mailto"],
        isAllowedUri: (url) => isSafeHref(url),
        HTMLAttributes: { rel: "noopener noreferrer nofollow", target: null },
      },
    }),
    Placeholder.configure({ placeholder }),
    Footnote,
  ];
}
