import { test as base, expect, type Page } from "@playwright/test";

// Unlike speech-event tests, these use the actual browser APIs with speech off.
// Fail the audited flows on browser exceptions or unexpected console errors.
const test = base.extend<{ runtimeErrors: string[] }>({
  runtimeErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    page.on("console", (message) => {
      if (message.type() === "error") errors.push(message.text());
    });
    await use(errors);
    expect(errors).toEqual([]);
  }, { auto: true }],
});

async function ready(page: Page) {
  await page.goto("/");
  await expect(page.locator(".connection")).toContainText("Backend connected");
  await page.getByRole("checkbox", { name: "Spoken responses" }).uncheck();
}

async function say(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message to Coco" }).fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Processing…" })).toHaveCount(0);
  await expect(page.locator(".ordering-error")).toHaveCount(0);
}

test("audit categories and both language limitations without runtime errors", async ({ page }) => {
  await ready(page);
  const categories: Record<string, number> = {
    "Specialty Pizzas": 4, "Create Your Own Pizza": 1,
    "Appetizers and Sides": 2, Wings: 2, Salads: 1,
    Desserts: 1, Beverages: 1, "Deals and Combos": 0,
  };
  const nav = page.getByRole("navigation", { name: "Menu categories" });
  for (const [name, count] of Object.entries(categories)) {
    await nav.getByRole("button", { name, exact: true }).click();
    await expect(page.locator(".catalog-card")).toHaveCount(count);
  }
  await expect(page.locator(".ordering-menu")).toContainText("No location-specific deals have been verified");
  for (const [language, text] of [["pa-IN", "ਮੈਨੂੰ ਪੀਜ਼ਾ ਚਾਹੀਦਾ ਹੈ"], ["hi-IN", "मुझे पिज़्ज़ा चाहिए"]]) {
    await page.getByLabel("Speech locale").selectOption(language);
    await say(page, text);
    await expect(page.locator(".transcript-entry.assistant").last()).toContainText("English only");
    await expect(page.locator(".cart-lines > li")).toHaveCount(0);
  }
});

test("audit unavailable item, size and topping controls using explicit fixtures", async ({ page }) => {
  // National data is all 'unknown'. Inject unavailable flags only in responses
  // to verify UI behavior, without changing the real restaurant catalog.
  await page.route("**/api/v1/restaurants/round-table/menu**", async (route) => {
    const response = await route.fetch();
    const data = await response.json();
    const items = Array.isArray(data) ? data : data.items;
    if (items) for (const item of items) {
      if (item.id === "create-your-own") item.availability = "unavailable";
      if (item.id === "king-arthur") item.variations.find((option: { id: string }) => option.id === "large").availability = "unavailable";
    }
    if (data.toppings) data.toppings.find((option: { id: string }) => option.id === "red-onions").availability = "unavailable";
    await route.fulfill({ response, json: data });
  });
  await ready(page);
  const unavailable = page.getByTestId("item-create-your-own");
  await expect(unavailable.locator(".availability")).toHaveText("Unavailable");
  await unavailable.locator("summary").click();
  await expect(unavailable.getByRole("button", { name: "Add to demo cart" })).toBeDisabled();
  const pizza = page.getByTestId("item-king-arthur");
  await pizza.locator("summary").click();
  await expect(pizza.locator('option[value="large"]')).toHaveJSProperty("disabled", true);
  await expect(pizza.getByRole("checkbox", { name: "Add Red Onions", exact: true })).toBeDisabled();
});

test("audit mixed requests and pending items cannot silently alter or confirm a cart", async ({ page }) => {
  await ready(page);
  await say(page, "large create your own pizza");
  const original = (await page.locator(".cart-lines").textContent()) ?? "";
  expect(original).toContain("Create Your Own Pizza");
  for (const text of ["add mushrooms and pineapple", "remove large create your own pizza", "add 20 oz bottle coke"]) {
    await say(page, text);
    await expect(page.locator(".cart-lines")).toHaveText(original);
  }
  await say(page, "review order");
  await expect(page.getByRole("button", { name: "Confirm demo draft", exact: true })).toBeVisible();
  await say(page, "I want a large pizza");
  await expect(page.getByRole("button", { name: "Confirm demo draft", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Review draft", exact: true })).toBeDisabled();
  await say(page, "yes");
  await expect(page.locator(".demo-confirmation")).toHaveCount(0);
  await expect(page.locator(".transcript-entry.assistant").last()).toContainText("still needs a menu choice or size");
  await say(page, "king arthur");
  await expect(page.locator(".cart-lines > li")).toHaveCount(2);
});
