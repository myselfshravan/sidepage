import { expect, test } from "@playwright/test";
import { ACCOUNTS, PASSWORD } from "./global-setup";
import { signInAs, verifyEmail } from "./helpers";

test("a new reader signs up, verifies, asks to write, and is approved by an admin", async ({ page, browser }) => {
  const email = `new-${Date.now().toString(36)}@sidepage.test`;

  await page.goto("/sign-in");
  await page.getByRole("button", { name: "New here? Create an account" }).click();
  await page.getByLabel("Name").fill("Nia Newcomer");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText(`We've sent a verification link to ${email}`)).toBeVisible();

  // Signing in before verifying is refused.
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Verify your email first")).toBeVisible();

  await verifyEmail(email);
  await signInAs(page, email, /\/library$/);
  await expect(page.getByRole("heading", { name: "Reading" })).toBeVisible();

  // Readers can't write yet; they can ask.
  await page.goto("/account");
  await page.getByLabel("Want to publish here? Tell us what you write.").fill("Short memoir essays about growing up by the sea.");
  await page.getByRole("button", { name: "Request to write" }).click();
  await expect(page.getByText(/waiting for review/)).toBeVisible();

  // An admin approves.
  const admin = await (await browser.newContext()).newPage();
  await signInAs(admin, ACCOUNTS.admin, /\/studio$/);
  await admin.goto("/studio/admin");
  const requests = admin.getByRole("region", { name: "Requests to write" });
  const request = requests.getByRole("listitem").filter({ hasText: email });
  await expect(request).toContainText("growing up by the sea");
  await request.getByRole("button", { name: "Approve" }).click();
  await expect(requests.getByRole("listitem").filter({ hasText: email })).toHaveCount(0);

  // The new author's role applies on the next request, without signing in again.
  await page.goto("/studio");
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
});

test("signed-in readers follow authors and build a library", async ({ page }) => {
  await signInAs(page, ACCOUNTS.reader, /\/library$/);

  await page.goto("/fiction/velvet-hours");
  await page.getByRole("link", { name: "Theo Sample" }).click();
  await expect(page).toHaveURL(/\/authors\//);
  const follow = page.getByRole("button", { name: /^Follow(ing)?$/ });
  if ((await follow.textContent()) === "Following") await follow.click();
  await page.getByRole("button", { name: "Follow" }).click();
  await expect(page.getByRole("button", { name: "Following" })).toBeVisible();

  await page.goto("/fiction/velvet-hours");
  const save = page.getByRole("button", { name: /Save to library|In your library/ });
  if ((await save.textContent())?.startsWith("Save")) await save.click();
  await expect(page.getByRole("button", { name: "In your library ✓" })).toBeVisible();

  await page.goto("/library");
  await expect(page.getByRole("heading", { name: "Saved" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Velvet Hours" }).first()).toBeVisible();
  await expect(page.getByRole("heading", { name: "New from authors you follow" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Theo Sample" }).first()).toBeVisible();
});

test("signed-in bookmarks follow the reader to another device", async ({ page, browser }) => {
  await signInAs(page, ACCOUNTS.reader, /\/library$/);
  await page.goto("/memoirs/the-ferry-at-dusk/crossing");
  await page.getByRole("button", { name: "Bookmark" }).click();
  await expect(page.getByText("Bookmarked to your account.")).toBeVisible();

  const other = await (await browser.newContext()).newPage();
  await signInAs(other, ACCOUNTS.reader, /\/library$/);
  await other.goto("/memoirs/the-ferry-at-dusk/crossing");
  await other.getByRole("button", { name: "Contents" }).click();
  await expect(other.getByRole("navigation", { name: "Contents" }).getByText(/sample text for the local emulator/)).toBeVisible();
});
