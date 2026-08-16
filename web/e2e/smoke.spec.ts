import { expect, test } from "@playwright/test";

test("loads and shows the Stemdeck title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Stemdeck" })).toBeVisible();
  // No backend-status indicator when the backend is healthy — it only shows
  // up when something's actually wrong.
  await expect(page.getByTestId("backend-status")).not.toBeVisible();
});
