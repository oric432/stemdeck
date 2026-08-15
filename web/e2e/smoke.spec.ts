import { expect, test } from "@playwright/test";

test("loads and shows the AVSeparate title", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "AVSeparate" })).toBeVisible();
  await expect(page.getByTestId("backend-status")).toBeVisible();
});
