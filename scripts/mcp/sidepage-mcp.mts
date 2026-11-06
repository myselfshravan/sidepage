#!/usr/bin/env -S npx tsx
// sidepage MCP server (stdio). Lets agents write and publish on sidepage through the
// token-authenticated /api/v1 API. It holds no state and no credentials of its own.
//
//   SIDEPAGE_TOKEN=sp_…  [SIDEPAGE_URL=https://sidepage.vercel.app]  pnpm mcp
//
// Register with Claude Code:
//   claude mcp add sidepage --env SIDEPAGE_TOKEN=sp_… -- pnpm --silent --dir /path/to/sidepage mcp
//
// See docs/AGENTS.md for every tool and a recommended workflow.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const BASE = (process.env.SIDEPAGE_URL ?? "https://sidepage.vercel.app").replace(/\/$/, "");
const TOKEN = process.env.SIDEPAGE_TOKEN ?? "";

if (!/^sp_[A-Za-z0-9_-]{43}$/.test(TOKEN)) {
  console.error("sidepage-mcp: set SIDEPAGE_TOKEN to an API token from /studio/admin (it starts with sp_).");
  process.exit(1);
}

type Json = Record<string, unknown> | unknown[];

async function api(method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: Json): Promise<unknown> {
  const res = await fetch(`${BASE}/api/v1${path}`, {
    method,
    headers: { authorization: `Bearer ${TOKEN}`, ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await res.json().catch(() => ({}))) as { error?: { code: string; message: string } };
  if (!res.ok) throw new Error(`${res.status} ${data.error?.code ?? ""}: ${data.error?.message ?? res.statusText}`);
  return data;
}

function result(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

async function run(fn: () => Promise<unknown>) {
  try {
    return result(await fn());
  } catch (error) {
    return { isError: true, content: [{ type: "text" as const, text: error instanceof Error ? error.message : String(error) }] };
  }
}

const id = z.string().min(1).describe("Publication id (from list_publications or create_publication).");
const partialDate = z
  .object({ year: z.number().int(), month: z.number().int().min(1).max(12).optional(), day: z.number().int().min(1).max(31).optional(), approximate: z.boolean() })
  .describe("When it was originally written, as precisely as known.");
const metadata = {
  subtitle: z.string().max(300).optional(),
  description: z.string().max(2000).optional().describe("Shown on the publication page and in collection lists."),
  byline: z
    .enum(["profile", "persona", "pen_name", "anonymous"])
    .optional()
    .describe("profile = your own name, linked to your author page; persona = one of your personas (persona_id), with its own author page, never linked to you; pen_name = a one-off name; anonymous = shown as Anonymous."),
  persona_id: z.string().optional().describe("Required when byline is persona (from create_persona or list_personas)."),
  pen_name: z.string().max(120).optional().describe("Required when byline is pen_name."),
  content_warnings: z.array(z.string().max(80)).max(20).optional().describe("Shown before fiction chapters."),
  original_written_at: partialDate.nullable().optional(),
  seo_title: z.string().max(120).optional(),
  seo_description: z.string().max(300).optional(),
  timezone: z.string().optional().describe("IANA zone, e.g. Asia/Kolkata."),
};

const server = new McpServer({ name: "sidepage", version: "1.0.0" });

server.registerTool("whoami", { title: "Who am I", description: "The account this token acts as, and its role." }, () => run(() => api("GET", "/me")));

server.registerTool(
  "list_publications",
  {
    title: "List publications",
    description: "Your publications, most recently edited first (20 per page).",
    inputSchema: { status: z.enum(["DRAFT", "REVIEW", "SCHEDULED", "PUBLISHED", "ARCHIVED"]).optional(), after: z.string().optional().describe("Cursor: the `next` value from the previous page.") },
  },
  ({ status, after }) => run(() => api("GET", `/publications?${new URLSearchParams({ ...(status ? { status } : {}), ...(after ? { after } : {}) })}`)),
);

server.registerTool(
  "get_publication",
  { title: "Get publication", description: "Metadata, status, chapter list, editions and the public URL (if public).", inputSchema: { id } },
  ({ id }) => run(() => api("GET", `/publications/${id}`)),
);

server.registerTool(
  "create_publication",
  {
    title: "Create publication",
    description: "Creates a draft in the memoirs or fiction collection. Add chapters next, then publish.",
    inputSchema: { collection: z.enum(["memoirs", "fiction"]), title: z.string().min(1).max(200), ...metadata },
  },
  (input) => run(() => api("POST", "/publications", input)),
);

server.registerTool(
  "update_publication",
  {
    title: "Update publication details",
    description: "Changes draft metadata. Readers see it after the next publish. The slug can't change once published.",
    inputSchema: { id, title: z.string().min(1).max(200).optional(), slug: z.string().optional(), ...metadata },
  },
  ({ id, ...patch }) => run(() => api("PATCH", `/publications/${id}`, patch)),
);

server.registerTool(
  "add_chapter",
  {
    title: "Add chapter",
    description:
      "Appends a chapter written in Markdown: ## headings, paragraphs, **bold**, *italic*, [links](https://…), > quotes, - lists, 1. lists, --- scene breaks, and footnotes (text[^1] with a '[^1]: note' line). Don't repeat the chapter title as a heading.",
    inputSchema: { publication_id: id, title: z.string().min(1).max(200), markdown: z.string().max(800_000) },
  },
  ({ publication_id, title, markdown }) => run(() => api("POST", `/publications/${publication_id}/chapters`, { title, markdown })),
);

server.registerTool(
  "get_chapter",
  { title: "Get chapter", description: "A chapter's current draft as Markdown, with its revision number.", inputSchema: { publication_id: id, chapter_id: z.string() } },
  ({ publication_id, chapter_id }) => run(() => api("GET", `/publications/${publication_id}/chapters/${chapter_id}`)),
);

server.registerTool(
  "update_chapter",
  {
    title: "Update chapter",
    description: "Replaces a chapter's title and/or Markdown. Pass base_rev from get_chapter to refuse overwriting someone else's newer change.",
    inputSchema: { publication_id: id, chapter_id: z.string(), title: z.string().min(1).max(200).optional(), markdown: z.string().max(800_000).optional(), base_rev: z.number().int().positive().optional() },
  },
  ({ publication_id, chapter_id, ...rest }) => run(() => api("PUT", `/publications/${publication_id}/chapters/${chapter_id}`, rest)),
);

server.registerTool(
  "delete_chapter",
  { title: "Delete chapter", description: "Deletes a draft chapter. Published editions keep their copy.", inputSchema: { publication_id: id, chapter_id: z.string() } },
  ({ publication_id, chapter_id }) => run(() => api("DELETE", `/publications/${publication_id}/chapters/${chapter_id}`)),
);

server.registerTool(
  "reorder_chapters",
  { title: "Reorder chapters", description: "Sets the reading order. Pass every chapter id exactly once.", inputSchema: { publication_id: id, order: z.array(z.string()).min(1) } },
  ({ publication_id, order }) => run(() => api("POST", `/publications/${publication_id}/chapters/reorder`, { order })),
);

server.registerTool(
  "publish",
  {
    title: "Publish",
    description: "Seals the current draft as an immutable edition and makes it readable (publicly if visibility is PUBLIC). Republishes as a new edition if already published. Optional effective_at backdates the publication (ISO date-time in the past).",
    inputSchema: { publication_id: id, effective_at: z.string().optional() },
  },
  ({ publication_id, effective_at }) =>
    run(async () => {
      const pub = (await api("GET", `/publications/${publication_id}`)) as { status: string };
      const command = pub.status === "PUBLISHED" ? "republish" : "publish";
      return api("POST", `/publications/${publication_id}/lifecycle`, { command, ...(effective_at ? { effective_at } : {}) });
    }),
);

server.registerTool(
  "schedule",
  { title: "Schedule", description: "Publishes automatically at a future time (ISO date-time, at least a minute ahead). Checked every 15 minutes.", inputSchema: { publication_id: id, at: z.string() } },
  ({ publication_id, at }) => run(() => api("POST", `/publications/${publication_id}/lifecycle`, { command: "schedule", at })),
);

server.registerTool(
  "change_status",
  {
    title: "Change status",
    description: "Other lifecycle steps: submit (for review), returnToDraft, cancelSchedule, withdraw (unpublish, keeps editions), archive, restore.",
    inputSchema: { publication_id: id, command: z.enum(["submit", "returnToDraft", "cancelSchedule", "withdraw", "archive", "restore"]) },
  },
  ({ publication_id, command }) => run(() => api("POST", `/publications/${publication_id}/lifecycle`, { command })),
);

server.registerTool(
  "set_visibility",
  {
    title: "Set visibility",
    description: "PUBLIC = listed and open to everyone. UNLISTED or PRIVATE = not listed anywhere; readable only through secret links (create_share_link).",
    inputSchema: { publication_id: id, visibility: z.enum(["PUBLIC", "UNLISTED", "PRIVATE"]) },
  },
  ({ publication_id, visibility }) => run(() => api("PUT", `/publications/${publication_id}/visibility`, { visibility })),
);

server.registerTool(
  "create_share_link",
  {
    title: "Create secret link",
    description:
      "A secret URL that opens this publication for anyone holding it, even when private. Returned once; store it. Optional expiry in days. Add gift_for (and a dedication) to make it a gift: the recipient first sees a page addressed to them, signed with the work's byline.",
    inputSchema: {
      publication_id: id,
      label: z.string().max(80).optional(),
      expires_in_days: z.number().int().min(1).max(3650).optional(),
      gift_for: z.string().max(80).optional().describe("The recipient's name, e.g. 'Ana'."),
      dedication: z.string().max(1000).optional(),
    },
  },
  ({ publication_id, label, expires_in_days, gift_for, dedication }) =>
    run(() =>
      api("POST", `/publications/${publication_id}/share-links`, {
        label: label ?? (gift_for ? `Gift for ${gift_for}` : ""),
        expires_in_days: expires_in_days ?? null,
        gift: gift_for ? { recipient_name: gift_for, dedication: dedication ?? "" } : null,
      }),
    ),
);

server.registerTool(
  "list_share_links",
  { title: "List secret links", description: "Links for a publication with their status (the URLs themselves aren't stored).", inputSchema: { publication_id: id } },
  ({ publication_id }) => run(() => api("GET", `/publications/${publication_id}/share-links`)),
);

server.registerTool(
  "revoke_share_link",
  { title: "Revoke secret link", description: "Stops a link working immediately.", inputSchema: { publication_id: id, link_id: z.string() } },
  ({ publication_id, link_id }) => run(() => api("DELETE", `/publications/${publication_id}/share-links/${link_id}`)),
);

server.registerTool(
  "create_persona",
  {
    title: "Create persona",
    description: "A reusable pen-name identity with its own author page and catalogue. Nothing public links it to your account or your other personas. Use it as a byline with byline: persona.",
    inputSchema: { display_name: z.string().min(1).max(80), handle: z.string().max(30).optional().describe("Lowercase letters, numbers, hyphens. Made from the name if omitted."), bio: z.string().max(600).optional() },
  },
  (input) => run(() => api("POST", "/personas", input)),
);

server.registerTool("list_personas", { title: "List personas", description: "Your personas with their ids and handles." }, () => run(() => api("GET", "/personas")));

server.registerTool(
  "update_persona",
  {
    title: "Update persona",
    description: "Rename a persona, change its handle or bio. Every work credited to it updates.",
    inputSchema: { persona_id: z.string(), display_name: z.string().min(1).max(80).optional(), handle: z.string().max(30).optional(), bio: z.string().max(600).optional() },
  },
  ({ persona_id, ...patch }) => run(() => api("PATCH", `/personas/${persona_id}`, patch)),
);

server.registerTool(
  "list_comments",
  { title: "List comments", description: "Readers' responses on one of your publications (newest first), including hidden ones, with chapter slugs.", inputSchema: { publication_id: id } },
  ({ publication_id }) => run(() => api("GET", `/publications/${publication_id}/comments`)),
);

server.registerTool(
  "post_author_note",
  {
    title: "Post author's note",
    description: "Pins a note at the top of a chapter's responses on your own publication. It appears under the work's byline (the persona or pen name, or 'Author'), never your account name.",
    inputSchema: { publication_id: id, chapter_slug: z.string(), body: z.string().min(1).max(2000) },
  },
  ({ publication_id, chapter_slug, body }) => run(() => api("POST", `/publications/${publication_id}/comments`, { chapter_slug, body, pin: true })),
);

server.registerTool(
  "reply_as_author",
  {
    title: "Reply as author",
    description: "Replies to a reader's comment on your own publication, under the work's byline (persona, pen name or 'Author'). Use parent_id from list_comments.",
    inputSchema: { publication_id: id, chapter_slug: z.string(), parent_id: z.string(), body: z.string().min(1).max(2000) },
  },
  ({ publication_id, chapter_slug, parent_id, body }) => run(() => api("POST", `/publications/${publication_id}/comments`, { chapter_slug, parent_id, body })),
);

server.registerTool(
  "hide_comment",
  { title: "Hide comment", description: "Hides a comment (and its replies) on your publication. Your own comments are deleted instead.", inputSchema: { comment_id: z.string() } },
  ({ comment_id }) => run(() => api("DELETE", `/comments/${comment_id}`)),
);

await server.connect(new StdioServerTransport());
