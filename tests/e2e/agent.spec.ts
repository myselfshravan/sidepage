import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./global-setup";
import { signInAs, unique } from "./helpers";

type Tool = { content: { type: string; text: string }[]; isError?: boolean };

async function call(client: Client, name: string, args: Record<string, unknown> = {}) {
  const res = (await client.callTool({ name, arguments: args })) as Tool;
  const text = res.content[0]?.text ?? "";
  if (res.isError) throw new Error(`${name} failed: ${text}`);
  return JSON.parse(text) as Record<string, unknown> & { id?: string; url?: string };
}

test("an agent writes and privately publishes under a pen name through the MCP server", async ({ page, browser, baseURL }) => {
  // The admin creates an agent token in the studio.
  await signInAs(page, ACCOUNTS.admin, /\/studio$/);
  await page.goto("/studio/admin");
  await page.getByLabel("Token name").fill("e2e agent");
  await page.getByRole("button", { name: "Create token" }).click();
  const token = await page.getByLabel("New API token").inputValue();
  expect(token).toMatch(/^sp_/);

  // A real MCP client launches the stdio server with that token.
  const transport = new StdioClientTransport({
    command: "pnpm",
    args: ["--silent", "mcp"],
    env: { ...(process.env as Record<string, string>), SIDEPAGE_TOKEN: token, SIDEPAGE_URL: baseURL! },
  });
  const client = new Client({ name: "e2e", version: "1.0.0" });
  await client.connect(transport);
  try {
    const tools = (await client.listTools()).tools.map((t) => t.name);
    expect(tools).toEqual(expect.arrayContaining(["create_publication", "add_chapter", "publish", "set_visibility", "create_share_link", "revoke_share_link"]));
    expect(await call(client, "whoami")).toMatchObject({ role: "admin" });

    const title = unique("Ledger of Small Hours");
    const pub = await call(client, "create_publication", {
      collection: "fiction",
      title,
      description: "Written by an agent in an end-to-end test.",
      byline: "pen_name",
      pen_name: "V. Marlowe",
      content_warnings: ["test warning"],
    });
    const id = pub.id!;
    await call(client, "add_chapter", {
      publication_id: id,
      title: "The Ledger",
      markdown: "She kept the ledger **in ink**, never pencil.[^1]\n\n---\n\nThe second entry was *unsigned*.\n\n[^1]: Pencil can be erased.",
    });
    await call(client, "set_visibility", { publication_id: id, visibility: "PRIVATE" });
    const published = await call(client, "publish", { publication_id: id });
    expect(published).toMatchObject({ status: "PUBLISHED" });

    const chapter = (await call(client, "get_publication", { id })) as { chapters: { id: string }[]; public_url: string | null };
    expect(chapter.public_url).toBeNull(); // private: no public URL
    const md = await call(client, "get_chapter", { publication_id: id, chapter_id: chapter.chapters[0]!.id });
    expect(String(md.markdown)).toContain("**in ink**");

    const link = await call(client, "create_share_link", { publication_id: id, label: "e2e reader", expires_in_days: 7 });
    expect(link.url).toMatch(/\/r\/k_/);

    // A stranger with the link can read it; the byline is the pen name only.
    const reader = await (await browser.newContext()).newPage();
    const path = new URL(link.url!).pathname;
    await reader.goto(path);
    await expect(reader.getByRole("heading", { name: title })).toBeVisible();
    await expect(reader.getByText("V. Marlowe").first()).toBeVisible();
    await expect(reader.getByRole("link", { name: "V. Marlowe" })).toHaveCount(0);
    await expect(reader.getByText("Sample Admin")).toHaveCount(0);
    await reader.getByRole("link", { name: "Begin reading" }).click();
    await reader.getByRole("button", { name: "Continue to the chapter" }).click();
    await expect(reader.getByText("never pencil")).toBeVisible();

    // A gift link opens on a page addressed to the recipient, signed with the byline.
    const gift = await call(client, "create_share_link", { publication_id: id, gift_for: "Ana", dedication: "Read this one slowly." });
    await reader.goto(new URL(gift.url!).pathname);
    await expect(reader.getByRole("heading", { name: "For Ana" })).toBeVisible();
    await expect(reader.getByText("Read this one slowly.")).toBeVisible();
    await expect(reader.getByText("— V. Marlowe")).toBeVisible();
    await expect(reader.getByText("Sample Admin")).toHaveCount(0);
    await reader.getByRole("link", { name: `Open “${title}”` }).click();
    await expect(reader.getByRole("heading", { name: title })).toBeVisible();

    // It isn't listed or reachable publicly.
    await reader.goto("/fiction");
    await expect(reader.getByText(title)).toHaveCount(0);

    // Revoking the link locks the reader out on the next request.
    await call(client, "revoke_share_link", { publication_id: id, link_id: link.id });
    await reader.goto(path);
    await expect(reader.getByText("This page isn't on the shelf.")).toBeVisible();
  } finally {
    await client.close();
  }
});

test("bad tokens get nothing from the API", async ({ request }) => {
  expect((await request.get("/api/v1/me")).status()).toBe(401);
  expect((await request.get("/api/v1/me", { headers: { authorization: `Bearer sp_${"A".repeat(43)}` } })).status()).toBe(401);
  expect((await request.post("/api/v1/publications", { data: { collection: "fiction", title: "x" } })).status()).toBe(401);
});

test("publications have share cards and the site has icons", async ({ request }) => {
  const og = await request.get("/fiction/velvet-hours/opengraph-image");
  expect(og.status()).toBe(200);
  expect(og.headers()["content-type"]).toContain("image/png");
  expect((await request.get("/icon")).headers()["content-type"]).toContain("image/png");
  expect((await request.get("/manifest.webmanifest")).status()).toBe(200);
});
