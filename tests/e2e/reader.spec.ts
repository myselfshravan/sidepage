import { expect, test } from "@playwright/test";

// Uses the sample data from `pnpm seed`.

test("reader preferences persist without a flash", async ({ page }) => {
  await page.goto("/memoirs/the-ferry-at-dusk/crossing");
  await expect(page.getByRole("heading", { name: "Crossing" })).toBeVisible();
  await page.getByRole("button", { name: "Reading settings" }).click();
  await page.getByRole("button", { name: "Larger text" }).click();
  await page.getByText("Sans", { exact: true }).click();
  await page.getByText("Dark", { exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-reader-size", "4");

  await page.reload();
  // Applied by the inline script before hydration.
  await expect(page.locator("html")).toHaveAttribute("data-reader-size", "4");
  await expect(page.locator("html")).toHaveAttribute("data-reader-family", "sans");
  await expect(page.locator("html")).toHaveAttribute("data-reader-mode", "dark");
});

test("chapter navigation and table of contents", async ({ page }) => {
  await page.goto("/memoirs/the-ferry-at-dusk");
  await page.getByRole("link", { name: "Begin reading" }).click();
  await expect(page.getByRole("heading", { name: "Crossing" })).toBeVisible();
  await page.getByRole("link", { name: /The Other Bank/ }).last().click();
  await expect(page.getByRole("heading", { name: "The Other Bank" })).toBeVisible();
  await page.getByRole("button", { name: "Contents" }).click();
  await page.getByRole("navigation", { name: "Contents" }).getByRole("link", { name: "Crossing" }).click();
  await expect(page.getByRole("heading", { name: "Crossing" })).toBeVisible();
});

test("fiction shows content warnings before the chapter, once", async ({ page }) => {
  await page.goto("/fiction/velvet-hours/the-invitation");
  await expect(page.getByRole("heading", { name: "Content warnings" })).toBeVisible();
  await expect(page.getByText("The card was black")).toBeHidden();
  await page.getByRole("button", { name: "Continue to the chapter" }).click();
  await expect(page.getByText("The card was black")).toBeVisible();
  await page.reload();
  await expect(page.getByText("The card was black")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Content warnings" })).toHaveCount(0);
});

test("drafts and other collections' URLs are not served", async ({ page }) => {
  await page.goto("/memoirs/unfinished-letters");
  await expect(page.getByText("This page isn't on the shelf.")).toBeVisible();
  await expect(page.getByText("Draft-only sample text")).toHaveCount(0);
  await page.goto("/memoirs/velvet-hours");
  await expect(page.getByText("This page isn't on the shelf.")).toBeVisible();
});

test("the home page shows both collections distinctly", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Memoirs" })).toBeVisible();
  await expect(page.locator('section[data-theme="fiction"]')).toBeVisible();
  await expect(page.getByRole("link", { name: "The Ferry at Dusk" })).toBeVisible();
  await expect(page.getByText("Unfinished Letters")).toHaveCount(0);
});
