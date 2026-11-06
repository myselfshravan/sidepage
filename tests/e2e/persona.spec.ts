import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./global-setup";
import { signInAs, unique } from "./helpers";

type Tool = { content: { type: string; text: string }[]; isError?: boolean };

async function call<T = Record<string, unknown>>(client: Client, name: string, args: Record<string, unknown> = {}): Promise<T> {
  const res = (await client.callTool({ name, arguments: args })) as Tool;
  const text = res.content[0]?.text ?? "";
  if (res.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text) as T;
}

test("a persona's backdated catalogue, a reader's response, and the author replying as the persona", async ({ page, browser, baseURL }) => {
  await signInAs(page, ACCOUNTS.admin, /\/studio$/);
  await page.goto("/studio/admin");
  await page.getByLabel("Token name").fill("persona e2e");
  await page.getByRole("button", { name: "Create token" }).click();
  const token = await page.getByLabel("New API token").inputValue();

  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(
    new StdioClientTransport({ command: "pnpm", args: ["--silent", "mcp"], env: { ...(process.env as Record<string, string>), SIDEPAGE_TOKEN: token, SIDEPAGE_URL: baseURL! } }),
  );
  try {
    const tag = Date.now().toString(36);
    const persona = await call<{ id: string; handle: string }>(client, "create_persona", { display_name: `Mara Vale ${tag}`, bio: "Dark romance, written young." });

    // A backdated catalogue: two books "first published" years ago.
    const titles: string[] = [];
    for (const [i, year] of [2009, 2012].entries()) {
      const title = unique(`Thorn Book ${i + 1}`);
      titles.push(title);
      const pub = await call<{ id: string }>(client, "create_publication", {
        collection: "fiction",
        title,
        byline: "persona",
        persona_id: persona.id,
        original_written_at: { year: year - 1, approximate: true },
      });
      await call(client, "add_chapter", { publication_id: pub.id, title: "The First Night", markdown: `Chapter text for book ${i + 1}.` });
      await call(client, "publish", { publication_id: pub.id, effective_at: `${year}-03-01T00:00:00Z` });
    }
    const list = await call<{ items: { id: string; title: string }[] }>(client, "list_publications");
    const second = list.items.find((w) => w.title === titles[1])!;

    // The persona's page lists only its catalogue, newest first, and never names the account.
    const visitor = await (await browser.newContext()).newPage();
    await visitor.goto(`/authors/${persona.handle}`);
    await expect(visitor.getByRole("heading", { name: `Mara Vale ${tag}` })).toBeVisible();
    const listed = await visitor.getByRole("link", { name: /Thorn Book/ }).allTextContents();
    expect(listed.join(" ")).toMatch(new RegExp(`${titles[1]}.*${titles[0]}`));
    await expect(visitor.getByText("2012").first()).toBeVisible();
    await expect(visitor.getByText("Sample Admin")).toHaveCount(0);

    // A reader responds to a chapter.
    const reader = await (await browser.newContext()).newPage();
    await signInAs(reader, ACCOUNTS.reader, /\/library$/);
    await reader.goto(`/fiction/${await slugOf(client, second.id)}/the-first-night`);
    await reader.getByRole("textbox", { name: "Your response" }).fill("This one stayed with me all week.");
    const posted = reader.waitForResponse((r) => r.url().endsWith("/api/comments") && r.request().method() === "POST");
    await reader.getByRole("button", { name: "Post", exact: true }).click();
    const response = await posted;
    expect(response.status(), await response.text()).toBe(200);
    await expect(reader.getByRole("article").getByText("This one stayed with me all week.")).toBeVisible();

    // The author replies through the agent, as the persona, and pins a note.
    const comments = await call<{ id: string; body: string; chapterSlug: string }[]>(client, "list_comments", { publication_id: second.id });
    const theirs = comments.find((c) => c.body.includes("stayed with me"))!;
    await call(client, "reply_as_author", { publication_id: second.id, chapter_slug: theirs.chapterSlug, parent_id: theirs.id, body: "That means a lot. Thank you." });
    await call(client, "post_author_note", { publication_id: second.id, chapter_slug: theirs.chapterSlug, body: "I wrote this at sixteen." });
    expect(JSON.stringify(comments)).not.toMatch(/Sample Admin|author_uid/);

    await reader.reload();
    const thread = reader.getByRole("region", { name: /response/ });
    await expect(thread.getByText("I wrote this at sixteen.")).toBeVisible();
    await expect(thread.getByText("Author's note")).toBeVisible();
    await expect(thread.getByText("That means a lot. Thank you.")).toBeVisible();
    await expect(thread.getByRole("link", { name: `Mara Vale ${tag}` }).first()).toBeVisible();
    await expect(reader.getByText("Sample Admin")).toHaveCount(0);
  } finally {
    await client.close();
  }
});

async function slugOf(client: Client, id: string) {
  const pub = await call<{ slug: string }>(client, "get_publication", { id });
  return pub.slug;
}
