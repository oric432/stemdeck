import { expect, test } from "@playwright/test";

test("loads and shows the Stemdeck title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Stemdeck" })).toBeVisible();
  // Not asserting on the backend-status indicator here: this CI job only
  // starts the frontend preview server (see playwright.config.ts), so the
  // backend is deterministically unreachable — that's a fact about this
  // job's environment, not something a smoke test for the page loading
  // should be asserting either way.
});
