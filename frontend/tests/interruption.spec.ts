import { test, expect } from "@playwright/test";

test("newer text supersedes a delayed cart response", async ({ page }) => {
  let release!: () => void;
  const delay = new Promise<void>((resolve) => { release = resolve; });
  let arrived!: () => void;
  const firstStarted = new Promise<void>((resolve) => { arrived = resolve; });
  await page.route("**/assistant/turn", async (route) => {
    if (route.request().postDataJSON().text !== "large King Arthur Supreme") {
      await route.continue();
      return;
    }
    const response = await route.fetch();
    arrived();
    await delay;
    await route.fulfill({ response }).catch(() => {});
  });
  await page.goto("/");
  await expect(page.locator(".connection")).toContainText("Backend connected");
  await page.getByRole("checkbox", { name: "Spoken responses" }).uncheck();
  const message = page.getByRole("textbox", { name: "Message to Coco" });
  try {
    await message.fill("large King Arthur Supreme");
    await page.getByRole("button", { name: "Send message" }).click();
    await firstStarted;
    await expect(page.getByRole("button", { name: "Interrupt Coco" })).toBeEnabled();
    await message.fill("small create your own");
    await page.getByRole("button", { name: "Send message" }).click();
    await expect(page.getByTestId("cart-line-0").getByRole("combobox")).toHaveValue("small");
  } finally {
    release();
  }
  await expect(page.getByTestId("cart-line-1")).toHaveCount(0);
  await expect(page.getByRole("log")).not.toContainText("Added 1 Large King Arthur");
});
