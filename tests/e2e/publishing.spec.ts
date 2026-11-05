import { expect, test } from "@playwright/test";
import { ACCOUNTS } from "./global-setup";
import { signInAs, unique, writeChapter } from "./helpers";

test("the complete publishing journey: write, autosave, backdate, publish, read, republish", async ({ page, browser }) => {
  const title = unique("Harbour Lights");
  await signInAs(page, ACCOUNTS.mira, /\/studio$/);

  // Create a memoir.
  await page.getByRole("textbox", { name: "Title" }).fill(title);
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
  const studioUrl = page.url();

  // Historical metadata.
  await page.getByLabel("Subtitle").fill("A test memoir");
  await page.getByLabel("Year written").fill("1998");
  await page.getByLabel("Month written").selectOption("6");
  await page.getByText("Approximate (shown as “c.”)").click();
  await page.getByRole("button", { name: "Save details" }).click();
  await expect(page.getByText("Saved.")).toBeVisible();

  // A chapter, written in the editor and autosaved.
  await page.getByLabel("New chapter title").fill("The First Night");
  await page.getByRole("button", { name: "Add chapter" }).click();
  await expect(page.getByLabel("Chapter text")).toBeVisible();
  await writeChapter(page, "The lamps on the harbour wall came on one by one, first edition.");

  // Autosave really persisted: a reload shows the text.
  await page.reload();
  await expect(page.getByLabel("Chapter text")).toContainText("first edition");

  // Publish with a historical date.
  await page.goto(studioUrl);
  await page.getByText("Historical date", { exact: true }).click();
  await page.getByLabel(/Publication date/).fill("2004-08-15T10:30");
  await page.getByRole("button", { name: "Publish", exact: true }).click();
  await expect(page.getByText("Published with a historical date.")).toBeVisible();
  await expect(page.getByText("Edition 1")).toBeVisible();

  // An anonymous reader sees it, dated 2004.
  const slug = new URL(await page.getByRole("link", { name: "View live ↗" }).getAttribute("href").then((h) => `http://x${h}`)).pathname;
  const reader = await (await browser.newContext()).newPage();
  await reader.goto(slug);
  await expect(reader.getByRole("heading", { name: title })).toBeVisible();
  await expect(reader.getByRole("link", { name: "Mira Sample" })).toBeVisible();
  await expect(reader.getByText("c. June 1998")).toBeVisible();
  await expect(reader.getByText("15 August 2004")).toBeVisible();
  await reader.getByRole("link", { name: "Begin reading" }).click();
  await expect(reader.getByRole("heading", { name: "The First Night" })).toBeVisible();
  await expect(reader.getByText("first edition")).toBeVisible();

  // Edit the draft: the public edition must not change.
  await page.getByRole("link", { name: "The First Night" }).click();
  await writeChapter(page, "The lamps on the harbour wall came on one by one, second edition.");
  await reader.reload();
  await expect(reader.getByText("first edition")).toBeVisible();
  await expect(reader.getByText("second edition")).toHaveCount(0);

  // Republish: readers now get edition 2; edition 1 is still listed and sealed.
  await page.goto(studioUrl);
  await page.getByRole("button", { name: "Publish new edition" }).click();
  await expect(page.getByText("New edition published.")).toBeVisible();
  await expect(page.getByText("Edition 2")).toBeVisible();
  await expect(page.getByText("Edition 1")).toBeVisible();
  await reader.reload();
  await expect(reader.getByText("second edition")).toBeVisible();

  // Withdraw: gone from the public site immediately.
  await page.getByRole("button", { name: "Withdraw" }).click();
  await page.getByRole("button", { name: "Confirm withdraw" }).click();
  await expect(page.getByText("Withdrawn. Editions are kept.")).toBeVisible();
  await reader.reload();
  await expect(reader.getByText("This page isn't on the shelf.")).toBeVisible();
  await expect(reader.getByText("second edition")).toHaveCount(0);
});

test("the studio is closed to visitors without a session", async ({ page, request }) => {
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/sign-in(\?|$)/);

  // A forged cookie gets nothing either.
  await page.context().addCookies([{ name: "__session", value: "forged", url: test.info().project.use.baseURL! }]);
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/sign-in(\?|$)/);

  // The session endpoint refuses cross-site requests.
  const res = await request.post("/api/auth/session", { headers: { origin: "https://evil.example" }, data: { idToken: "x" } });
  expect(res.status()).toBe(403);

  // The cron endpoint refuses callers without the secret.
  expect((await request.get("/api/cron/publish-due")).status()).toBe(401);
});

test("signing out ends the session on the server", async ({ page }) => {
  await signInAs(page, ACCOUNTS.mira, /\/studio$/);
  const cookies = await page.context().cookies();
  const session = cookies.find((c) => c.name === "__session");
  expect(session?.httpOnly).toBe(true);
  expect(session?.sameSite).toBe("Lax");

  await page.waitForTimeout(1100); // revocation has one-second granularity
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in(\?|$)/);

  // Replaying the old cookie no longer works: the refresh tokens were revoked.
  await page.context().addCookies([{ ...session!, expires: -1 }]);
  await page.goto("/studio");
  await expect(page).toHaveURL(/\/sign-in(\?|$)/);
});

test("readers can't enter the studio, and authors can't open each other's drafts", async ({ page, browser }) => {
  // Mira creates a draft and notes its URL.
  await signInAs(page, ACCOUNTS.mira, /\/studio$/);
  await page.getByRole("textbox", { name: "Title" }).fill(unique("Mira Secret"));
  await page.getByRole("button", { name: "Create draft" }).click();
  await expect(page).toHaveURL(/\/studio\/publications\//);
  const draftUrl = new URL(page.url()).pathname;

  // A reader is sent to their account page.
  const readerPage = await (await browser.newContext()).newPage();
  await signInAs(readerPage, ACCOUNTS.reader, /\/library$/);
  await readerPage.goto("/studio");
  await expect(readerPage).toHaveURL(/\/account$/);

  // Another author gets "not found" for Mira's draft.
  const theoPage = await (await browser.newContext()).newPage();
  await signInAs(theoPage, ACCOUNTS.theo, /\/studio$/);
  await theoPage.goto(draftUrl);
  await expect(theoPage.getByText(/not found|isn't on the shelf|could not be found/i).first()).toBeVisible();
  await expect(theoPage.getByRole("heading", { name: /Mira Secret/ })).toHaveCount(0);
});
