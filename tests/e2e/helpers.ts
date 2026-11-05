import { expect, type Page } from "@playwright/test";
import { AUTHOR } from "./global-setup";

export async function signInAsAuthor(page: Page) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(AUTHOR.email);
  await page.getByLabel("Password").fill(AUTHOR.password);
  await page.getByRole("button", { name: "Sign in with email" }).click();
  await expect(page).toHaveURL(/\/studio$/);
  await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** Types into the manuscript editor and waits for autosave to confirm. */
export async function writeChapter(page: Page, text: string) {
  const editor = page.getByLabel("Chapter text");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible({ timeout: 20_000 });
}
