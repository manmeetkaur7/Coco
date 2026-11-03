import { test, expect } from "@playwright/test";

test("preserves restaurant data and provides keyboard-operated avatar states", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(
    page.getByRole("status").filter({ hasText: /Backend connected/ }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Maison Olive" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Heirloom burrata" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Start Conversation" }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "End Conversation" }),
  ).toBeDisabled();
  for (const state of ["Idle", "Listening", "Thinking", "Speaking"]) {
    const button = page.getByRole("button", { name: state, exact: true });
    await button.focus();
    await page.keyboard.press("Enter");
    await expect(button).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".avatar-stage")).toHaveAttribute(
      "data-state",
      state.toLowerCase(),
    );
  }
  await expect(
    page.getByText("Speaking-state preview. No audio or lip-sync."),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("desktop-preview.png"),
    fullPage: true,
  });
});

test("decodes a local portrait blob without an image optimization request", async ({
  page,
}) => {
  // A transparent pixel tests browser decoding, never a replacement person's face.
  const pixel = Buffer.from(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aWQAAAABJRU5ErkJggg==",
    "base64",
  );
  await page.route("**/api/avatar/reference", (route) =>
    route.fulfill({ status: 200, contentType: "image/png", body: pixel }),
  );
  await page.goto("/");
  const portrait = page.getByRole("img", {
    name: /privately stored reference photograph/,
  });
  await expect(portrait).toBeVisible();
  await expect(portrait).toHaveAttribute("src", /^blob:/);
  expect(
    await portrait.evaluate(
      (image) => (image as HTMLImageElement).naturalWidth,
    ),
  ).toBe(1);
  await expect(
    page.getByText("2D portrait · ambient image motion only"),
  ).toBeVisible();
});

test("renders a mobile layout without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Avatar state preview" }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Speaking", exact: true }).click();
  await expect(
    page.getByText("Speaking-state preview. No audio or lip-sync."),
  ).toBeVisible();
  // Screenshots stay ignored alongside private assets; never add these to docs/public.
  await page.screenshot({
    path: testInfo.outputPath("mobile-preview.png"),
    fullPage: true,
  });
});

test("respects reduced motion and the local motion checkbox", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.getByRole("button", { name: "Thinking", exact: true }).click();
  expect(
    await page
      .locator(".halo-one")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(
    await page
      .locator(".avatar-state-light")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  await page.emulateMedia({ reducedMotion: "no-preference" });
  await page
    .getByRole("checkbox", { name: /Ambient portrait motion/ })
    .uncheck();
  expect(
    await page
      .locator(".halo-one")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
});

test("rejects cross-site photo requests without caching them", async ({
  request,
}) => {
  const response = await request.get("/api/avatar/reference", {
    headers: { Origin: "https://example.com", "Sec-Fetch-Site": "cross-site" },
  });
  expect(response.status()).toBe(404);
  expect(response.headers()["cache-control"]).toContain("no-store");
  expect(await response.text()).toBe("");
});
