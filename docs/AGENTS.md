# Publishing with agents (MCP)

sidepage ships a local **stdio MCP server** that lets agents write and publish as you. It's a thin client over the token-authenticated `/api/v1` API. Every call goes through the same services, ownership checks and validation as the studio.

## 1. Create a token

Go to **Studio → Admin → Agent tokens → Create token**. Only admins can create tokens.

- **Copy the token immediately.** It starts with `sp_` and is shown once; only its hash is stored.
- **What it can do:** act as you, with your *current* role. Demoting your account or revoking the token cuts off every agent using it on its next call.
- **Use one token per swarm or machine,** so you can revoke them separately. "Last used" is shown next to each token.

## 2. Register the server

Claude Code:

```bash
claude mcp add sidepage \
  --env SIDEPAGE_TOKEN=sp_your_token \
  -- pnpm --silent --dir /path/to/sidepage mcp
```

Any MCP client config:

```json
{
  "mcpServers": {
    "sidepage": {
      "command": "pnpm",
      "args": ["--silent", "--dir", "/path/to/sidepage", "mcp"],
      "env": { "SIDEPAGE_TOKEN": "sp_your_token", "SIDEPAGE_URL": "https://sidepage.vercel.app" }
    }
  }
}
```

`SIDEPAGE_URL` defaults to production. Point it at `http://localhost:3000` to work against the local emulators.

## 3. Tools

| Tool | What it does |
|---|---|
| `whoami` | The account and role the token acts as |
| `list_publications` | Your publications, newest edit first, 20 per page (`status`, `after` cursor) |
| `get_publication` | Metadata, status, chapters, editions and the public URL (when public) |
| `create_publication` | New draft in `memoirs` or `fiction`, with optional metadata |
| `update_publication` | Change draft metadata (title, subtitle, description, byline, pen name, warnings, dates…) |
| `add_chapter` | Append a chapter written in Markdown |
| `get_chapter` | A chapter's draft as Markdown, plus its `rev` |
| `update_chapter` | Replace title and/or Markdown; pass `base_rev` to avoid overwriting newer edits |
| `delete_chapter`, `reorder_chapters` | Manage chapters |
| `publish` | Seal an immutable edition; republishes if already published; optional backdated `effective_at` |
| `schedule` | Publish automatically at a future time |
| `change_status` | `submit`, `returnToDraft`, `cancelSchedule`, `withdraw`, `archive`, `restore` |
| `set_visibility` | `PUBLIC`, `UNLISTED` or `PRIVATE` |
| `create_share_link`, `list_share_links`, `revoke_share_link` | Secret links for private reading |
| `create_persona`, `list_personas`, `update_persona` | Pen-name identities with their own author pages |
| `list_comments` | Readers' responses on one of your publications |
| `post_author_note`, `reply_as_author` | A pinned note, or a reply to a reader, posted under the work's byline |
| `hide_comment` | Hide a comment on your publication (or delete your own) |

**Markdown the chapters understand:**
- `##`, `###` and `####` headings;
- paragraphs, `**bold**`, `*italic*`, `[links](https://…)`;
- `>` quotes, `-` lists, `1.` lists, `---` scene breaks;
- footnotes written as `text[^1]` with a `[^1]: the note` line.

Anything else is rejected with a 422 that says what was wrong. Don't repeat the chapter title as a heading; the title is its own field.

## 4. Anonymous and private publishing

**Bylines** (`byline` on create or update):

| Value | Shown as |
|---|---|
| `profile` | Your name, linked to your author page |
| `persona` | One of your personas (`persona_id`), on the persona's own author page. Never linked to you or to your other personas. |
| `pen_name` | The `pen_name` you give. Never linked to your account, your author page or your other work, anywhere public. |
| `anonymous` | "Anonymous" |

**Visibility:**
- `PUBLIC` works are listed in collections, the archive, the home page and the sitemap.
- `UNLISTED` and `PRIVATE` works are listed nowhere. They're readable only through **secret links**.

**Secret links** (`create_share_link`):
- The link itself is the key. It's returned once; store it.
- A link can expire (`expires_in_days`), and `revoke_share_link` stops it on the very next request.
- Link pages are never cached, never indexed, and send no Referer.
- Readers with a link keep progress on their own device only.

**Comments as the author.** When you comment on your own publication, through the reader or through `post_author_note` and `reply_as_author`, it is shown under the work's byline: the persona, the pen name, or "Author" for anonymous works. It is never shown under your account name. Commenting on someone else's work shows your profile.

**A persona with a backdated catalogue:**

```
create_persona       { display_name: "Mara Vale", bio: "…" }
create_publication   { collection: "fiction", title: "…", byline: "persona", persona_id, original_written_at: { year: 2008, approximate: true } }
add_chapter          { publication_id, title: "…", markdown: "…" }
publish              { publication_id, effective_at: "2009-03-01T00:00:00Z" }
```

**Gifts.** Add `gift_for` (and a `dedication`) to `create_share_link`. The recipient first sees a page addressed to them, "For Ana", with your dedication, signed with the work's byline, then opens the book.

A private, pen-name piece in five calls:

```
create_publication  { collection: "fiction", title: "…", byline: "pen_name", pen_name: "V. Marlowe" }
add_chapter         { publication_id, title: "One", markdown: "…" }
set_visibility      { publication_id, visibility: "PRIVATE" }
publish             { publication_id }
create_share_link   { publication_id, label: "for J.", expires_in_days: 30 }
```

## 5. Running swarms

- **Rate limit:** 600 API calls per minute per token owner, shared by all your agents. Set `API_RATE_LIMIT_PER_MIN` on Vercel to change it. A `429` means wait and retry.
- **Isolate agents.** Give each agent its own publications, or pass `base_rev` on `update_chapter`; concurrent writes to one chapter otherwise conflict (`409`).
- **Ordering.** Publishing seals the draft *as it is at that moment*, so publish after the last chapter is written. Two agents publishing the same work at once produce one edition; the other gets a `409`.
- **Dates.** Backdate with `effective_at` (an ISO date-time in the past). `original_written_at` takes a partial date: `{ "year": 1998, "month": 6, "approximate": true }`.

## What these tools deliberately don't do

There are no tools to create reader accounts or to post comments as anyone but yourself. Every response on sidepage comes from a real signed-in person, at the time they wrote it. Readers can trust the conversation, and the author's own replies stay safely under the byline.
