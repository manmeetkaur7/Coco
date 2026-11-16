import { test, expect } from "@playwright/test";

test("local-model unavailability is visible and verified text ordering still works", async ({ page }) => {
  await page.route("**/api/v1/assistant/model", (route) => route.fulfill({ json: {
    available: false, mode: "fallback", name: "coco-local",
    message: "Local model unavailable. Using the verified ordering fallback.",
  } }));
  await page.goto("/");
  await expect(page.locator(".connection")).toContainText("Backend connected");
  await expect(page.getByTestId("model-status")).toContainText("Local model unavailable");
  await page.getByRole("checkbox", { name: "Spoken responses" }).uncheck();
  await page.getByRole("textbox", { name: "Message to Coco" }).fill("large create your own pizza");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByTestId("cart-line-0").getByRole("combobox")).toHaveValue("large");
  await expect(page.getByTestId("model-status")).toContainText("verified ordering fallback");
  await expect(page.locator(".cart-totals")).not.toContainText("$0.00");
});

test("session preferences survive cart controls and are cleared by End Conversation", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".connection")).toContainText("Backend connected");
  await page.getByRole("checkbox", { name: "Spoken responses" }).uncheck();
  await page.getByRole("textbox", { name: "Message to Coco" }).fill("I'm vegetarian");
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByText(/Preferences this session: vegetarian/)).toBeVisible();
  const item = page.getByTestId("item-create-your-own");
  await item.locator("summary").click();
  await item.getByRole("combobox").selectOption("large");
  await item.getByRole("button", { name: "Add to demo cart" }).click();
  await expect(page.getByTestId("cart-line-0")).toBeVisible();
  await expect(page.getByText(/Preferences this session: vegetarian/)).toBeVisible();
  const sent = page.waitForRequest((request) => request.url().endsWith("/assistant/turn") && request.method() === "POST");
  await page.getByRole("textbox", { name: "Message to Coco" }).fill("Give me a moment");
  await page.getByRole("button", { name: "Send message" }).click();
  expect((await sent).postDataJSON().context.memory.preferences).toEqual(["vegetarian"]);
  await expect(page.getByRole("button", { name: "Processing…" })).toHaveCount(0);
  await page.getByRole("button", { name: "End Conversation" }).click();
  await expect(page.getByText(/Preferences this session:/)).toHaveCount(0);
  await expect(page.getByTestId("cart-line-0")).toBeVisible();
});

test("connected local model indicator is driven by health response, not a static AI claim", async ({ page }) => {
  // Explicit health-response fixture; actual model inference is covered by the
  // separate local HTTP evaluation harness, not a browser speech mock.
  await page.route("**/api/v1/assistant/model", (route) => route.fulfill({ json: {
    available: true, mode: "local", name: "coco-local",
    message: "Local language model connected. Cart changes are validated.",
  } }));
  await page.goto("/");
  await expect(page.getByTestId("model-status")).toHaveAttribute("data-mode", "local");
  await expect(page.getByTestId("model-status")).toContainText("Local AI connected");
  await expect(page.getByText("LOCAL AI · VALIDATED ORDERING", { exact: true })).toBeVisible();
});
