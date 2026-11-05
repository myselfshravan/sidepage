import { expect, type Page } from "@playwright/test";
import { AUTH_EMULATOR, PASSWORD } from "./global-setup";

export async function signInAs(page: Page, email: string, expected: RegExp = /\/(studio|library)$/) {
  await page.goto("/sign-in");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(expected);
}

export async function signOut(page: Page) {
  await page.context().clearCookies();
}

export const unique = (prefix: string) => `${prefix} ${Date.now().toString(36)}`;

/** Opens the newest email-verification link the Auth emulator has issued for an address. */
export async function verifyEmail(email: string) {
  const res = await fetch(`${AUTH_EMULATOR}/emulator/v1/projects/demo-sidepage/oobCodes`);
  const { oobCodes } = (await res.json()) as { oobCodes: { email: string; requestType: string; oobLink: string }[] };
  const code = oobCodes.filter((c) => c.email === email && c.requestType === "VERIFY_EMAIL").at(-1);
  if (!code) throw new Error(`No verification email for ${email}`);
  await fetch(code.oobLink);
}

/** Types into the manuscript editor and waits for autosave to confirm. */
export async function writeChapter(page: Page, text: string) {
  const editor = page.getByLabel("Chapter text");
  await editor.click();
  await page.keyboard.press("ControlOrMeta+a");
  await page.keyboard.type(text);
  await expect(page.getByRole("status").filter({ hasText: /^Saved/ })).toBeVisible({ timeout: 20_000 });
}
