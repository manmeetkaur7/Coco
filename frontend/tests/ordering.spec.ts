import { test, expect, type Page } from "@playwright/test";
import type {
  Recognition,
  RecognitionResultEvent,
} from "../src/features/ordering/browser-voice";

declare global {
  interface Window {
    __cocoTestVoice: {
      final(text: string): void;
      interim(text: string): void;
      deny(): void;
      startOutput(): void;
      endOutput(): void;
      endInput(): void;
      inputCount(): number;
    };
  }
}

async function mockSpeech(page: Page, supported = true) {
  await page.addInitScript(
    ({ supported }) => {
      const recording: { current: Input | null } = { current: null };
      let inputCount = 0;
      let output: Output | null = null;
      class Input {
        lang = "";
        continuous = false;
        interimResults = false;
        onstart: Recognition["onstart"] = null;
        onend: Recognition["onend"] = null;
        onresult: Recognition["onresult"] = null;
        onerror: Recognition["onerror"] = null;
        start() {
          inputCount++;
          recording.current = this;
          this.onstart?.();
        }
        stop() {
          this.onend?.();
        }
        abort() {
          this.onend?.();
        }
      }
      class Output {
        lang = "";
        voice: SpeechSynthesisVoice | null = null;
        onstart: (() => void) | null = null;
        onend: (() => void) | null = null;
        onerror: (() => void) | null = null;
        constructor(public text: string) {}
      }
      Object.defineProperty(window, "SpeechRecognition", {
        configurable: true,
        value: supported ? Input : undefined,
      });
      Object.defineProperty(window, "webkitSpeechRecognition", {
        configurable: true,
        value: undefined,
      });
      Object.defineProperty(window, "SpeechSynthesisUtterance", {
        configurable: true,
        value: Output,
      });
      Object.defineProperty(window, "speechSynthesis", {
        configurable: true,
        value: {
          getVoices: () => [
            {
              name: "Test local English",
              lang: "en-US",
              voiceURI: "test-en",
              localService: true,
              default: true,
            },
          ],
          addEventListener: () => undefined,
          removeEventListener: () => undefined,
          cancel: () => {
            output = null;
          },
          speak: (utterance: Output) => {
            output = utterance;
          },
        },
      });
      const result = (
        text: string,
        isFinal: boolean,
      ): RecognitionResultEvent => ({
        resultIndex: 0,
        results: [{ isFinal, 0: { transcript: text } }],
      });
      window.__cocoTestVoice = {
        final: (text) => recording.current?.onresult?.(result(text, true)),
        interim: (text) => recording.current?.onresult?.(result(text, false)),
        deny: () => recording.current?.onerror?.({ error: "not-allowed" }),
        startOutput: () => output?.onstart?.(),
        endOutput: () => output?.onend?.(),
        endInput: () => recording.current?.onend?.(),
        inputCount: () => inputCount,
      };
    },
    { supported },
  );
}
async function ready(page: Page) {
  await page.goto("/");
  await expect(
    page.getByRole("status").filter({ hasText: /Backend connected/ }),
  ).toBeVisible();
}
async function say(page: Page, text: string) {
  await page.getByRole("textbox", { name: "Message to Coco" }).fill(text);
  await page.getByRole("button", { name: "Send message" }).click();
  await expect(page.getByRole("button", { name: "Processing…" })).toHaveCount(
    0,
  );
}

test("menu search, pizza customization, cart edits and safe demo confirmation", async ({
  page,
}) => {
  await mockSpeech(page);
  await ready(page);
  const search = page.getByRole("searchbox");
  await search.fill("unicorn");
  await expect(page.getByText(/No verified items match/)).toBeVisible();
  await search.fill("garlic");
  await expect(
    page.getByRole("heading", { name: "Garlic Bread", exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("heading", { name: /King Arthur/ })).toHaveCount(
    0,
  );
  await search.fill("");
  const item = page.getByTestId("item-create-your-own");
  await item.locator("summary").click();
  await item.getByRole("combobox", { name: /Size for/ }).selectOption("large");
  await item.getByRole("spinbutton").fill("2");
  await item
    .getByRole("checkbox", { name: "Add Mushrooms", exact: true })
    .check();
  await item.getByRole("button", { name: "Add to demo cart" }).click();
  const line = page.getByTestId("cart-line-0");
  await expect(
    line.getByRole("heading", { name: "Create Your Own Pizza" }),
  ).toBeVisible();
  await expect(
    line.getByRole("status").or(line.locator("output")),
  ).toContainText("2");
  await line.getByRole("combobox").selectOption("medium");
  await expect(line.getByRole("combobox")).toHaveValue("medium");
  await line
    .getByRole("button", { name: "Increase quantity for item 1" })
    .click();
  await expect(line.locator("output")).toHaveText("3");
  await expect(page.locator(".cart-totals")).toContainText("Unverified");
  await expect(page.locator(".cart-totals")).not.toContainText("$0.00");
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Confirm demo draft", exact: true }),
  ).toBeVisible();
  await line
    .getByRole("button", { name: "Decrease quantity for item 1" })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirm demo draft", exact: true }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Review draft", exact: true }).click();
  await page
    .getByRole("button", { name: "Confirm demo draft", exact: true })
    .click();
  await expect(page.locator(".demo-confirmation")).toContainText(
    "No restaurant order was placed",
  );
  await page.getByRole("button", { name: "Clear cart", exact: true }).click();
  await expect(page.getByTestId("cart-line-0")).toHaveCount(0);
});

test("typed ordering clarifies ambiguity and does not fabricate totals", async ({
  page,
}) => {
  await mockSpeech(page);
  await ready(page);
  await page.getByRole("checkbox", { name: "Spoken responses" }).uncheck();
  // Text ordering starts a session without the separate voice start control.
  await expect(page.getByRole("textbox", { name: "Message to Coco" })).toBeEditable();
  await say(page, "I want a large pepperoni pizza");
  await expect(page.getByRole("log")).toContainText("Do you mean Double Play");
  await expect(page.getByTestId("cart-line-0")).toHaveCount(0);
  await say(page, "create your own");
  await expect(page.getByTestId("cart-line-0")).toBeVisible();
  await say(page, "add mushrooms");
  await expect(page.getByTestId("cart-line-0")).toContainText("Mushrooms");
  await say(page, "what's my total");
  await expect(page.getByRole("log")).toContainText(
    "cannot quote a final total",
  );
  await say(page, "make it extra cheese");
  await expect(page.getByRole("log")).toContainText(
    "Extra-cheese options and charges are not verified",
  );
  await say(page, "no");
  await expect(page.getByRole("log")).toContainText("Is this correct?");
  await expect(page.locator(".demo-confirmation")).toHaveCount(0);
  await say(page, "yes");
  await expect(page.locator(".demo-confirmation")).toBeVisible();
  await page.getByRole("button", { name: "End Conversation" }).click();
  await expect(
    page.getByRole("textbox", { name: "Message to Coco" }),
  ).toBeEditable();
  await say(page, "what's my total");
  await expect(page.getByRole("button", { name: "End Conversation" })).toBeEnabled();
});

test("allows drafting text while the backend is unavailable", async ({ page }) => {
  await page.route("**/api/v1/**", (route) => route.abort());
  await page.goto("/");
  const message = page.getByRole("textbox", { name: "Message to Coco" });
  await message.fill("I want a large pizza");
  await expect(message).toHaveValue("I want a large pizza");
  await expect(page.getByRole("button", { name: "Send message" })).toBeDisabled();
  await expect(page.locator("#message-help")).toContainText("Sending becomes available when the backend connects");
});

test("voice events drive real listening, thinking and speaking states", async ({
  page,
}) => {
  await mockSpeech(page);
  await ready(page);
  await page.getByRole("button", { name: /Start Conversation/ }).click();
  await page.evaluate(() => window.__cocoTestVoice.startOutput());
  await expect(page.locator(".avatar-stage")).toHaveAttribute(
    "data-state",
    "speaking",
  );
  await page.evaluate(() => window.__cocoTestVoice.endOutput());
  await expect(page.locator(".avatar-stage")).toHaveAttribute(
    "data-state",
    "idle",
  );
  // An active, consented session resumes automatically after Coco's audio.
  await expect(page.locator(".avatar-stage")).toHaveAttribute(
    "data-state",
    "listening",
  );
  await page.evaluate(() => window.__cocoTestVoice.interim("large pizza"));
  await expect(page.getByText("Hearing: large pizza")).toBeVisible();
  await page.route("**/assistant/turn", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 600));
    await route.continue();
  });
  await page.evaluate(() =>
    window.__cocoTestVoice.final("large create your own pizza"),
  );
  await expect(page.locator(".avatar-stage")).toHaveAttribute(
    "data-state",
    "thinking",
  );
  await expect(page.getByTestId("cart-line-0")).toBeVisible();
  await page.evaluate(() => window.__cocoTestVoice.startOutput());
  await expect(page.locator(".avatar-stage")).toHaveAttribute(
    "data-state",
    "speaking",
  );
  await page
    .getByRole("button", { name: "Stop speaking", exact: true })
    .click();
  await expect(page.locator(".avatar-stage")).toHaveAttribute(
    "data-state",
    "idle",
  );
  await page.getByRole("button", { name: "End Conversation" }).click();
});

test("permission denial retains manual input and language limitations are explicit", async ({
  page,
}) => {
  await mockSpeech(page);
  await ready(page);
  await page.getByRole("button", { name: /Start Conversation/ }).click();
  await page
    .getByRole("button", { name: "Start listening", exact: true })
    .click();
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Listening");
  await page.evaluate(() => window.__cocoTestVoice.deny());
  await expect(
    page
      .getByRole("alert")
      .filter({ hasText: /Microphone permission was denied/ }),
  ).toContainText("Microphone permission was denied");
  await expect(
    page.getByRole("textbox", { name: "Message to Coco" }),
  ).toBeEnabled();
  await page.getByLabel("Speech locale").selectOption("pa-IN");
  await say(page, "ਮੈਨੂੰ ਪੀਜ਼ਾ ਚਾਹੀਦਾ ਹੈ");
  await expect(page.getByRole("log")).toContainText("English only");
  await expect(page.getByTestId("cart-line-0")).toHaveCount(0);
});

test("unsupported recognition exposes a usable typed fallback", async ({
  page,
}) => {
  await mockSpeech(page, false);
  await ready(page);
  await expect(
    page.getByText(/Speech recognition is unsupported here/),
  ).toBeVisible();
  await page.getByRole("button", { name: /Start Conversation/ }).click();
  await say(page, "large create your own pizza");
  await expect(page.getByTestId("cart-line-0")).toBeVisible();
});

test("consented session resumes after browser end and speech, respects mute and End", async ({ page }) => {
  await mockSpeech(page);
  await ready(page);
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Ended");
  expect(await page.evaluate(() => window.__cocoTestVoice.inputCount())).toBe(0);
  await page.getByRole("checkbox", { name: "Spoken responses" }).uncheck();
  await page.getByRole("button", { name: /Start Conversation/ }).click();
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Listening");
  await page.evaluate(() => window.__cocoTestVoice.endInput());
  await expect.poll(() => page.evaluate(() => window.__cocoTestVoice.inputCount())).toBe(2);
  await page.getByRole("checkbox", { name: "Spoken responses" }).check();
  await page.route("**/assistant/turn", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await page.evaluate(() => window.__cocoTestVoice.final("Hey Coco"));
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Thinking");
  await expect(page.getByRole("log")).toContainText("What can I get started for you?");
  await page.evaluate(() => window.__cocoTestVoice.startOutput());
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Speaking");
  await page.evaluate(() => window.__cocoTestVoice.final("Coco's own speech"));
  await page.waitForTimeout(800); // Verify no scheduled restart over audio.
  expect(await page.evaluate(() => window.__cocoTestVoice.inputCount())).toBe(2);
  await expect(page.getByRole("log")).not.toContainText("Coco's own speech");
  await page.evaluate(() => window.__cocoTestVoice.endOutput());
  await expect.poll(() => page.evaluate(() => window.__cocoTestVoice.inputCount())).toBe(3);
  await page.getByRole("checkbox", { name: "Mute microphone" }).check();
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Paused");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__cocoTestVoice.inputCount())).toBe(3);
  await page.getByRole("checkbox", { name: "Mute microphone" }).uncheck();
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Listening");
  await page.getByRole("button", { name: "End Conversation" }).click();
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Ended");
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__cocoTestVoice.inputCount())).toBe(4);
});

test("friendly waiting preserves pizza choice and Goodbye ends voice without clearing the cart", async ({ page }) => {
  await mockSpeech(page);
  await ready(page);
  await page.getByRole("checkbox", { name: "Spoken responses" }).uncheck();
  await page.getByRole("button", { name: /Start Conversation/ }).click();
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Listening");
  await say(page, "Hey Coco.");
  await expect(page.getByRole("log")).toContainText("What can I get started for you?");
  await say(page, "Give me a minute");
  await expect(page.getByRole("log")).toContainText("Take your time");
  await say(page, "Okay, I'm ready.");
  await say(page, "I want a large pizza");
  await say(page, "Coco");
  await say(page, "Wait");
  await expect(page.locator(".cart-lines > li")).toHaveCount(0);
  await say(page, "I'm ready");
  await say(page, "King Arthur's Supreme.");
  await expect(page.getByTestId("cart-line-0").getByRole("combobox")).toHaveValue("large");
  await say(page, "That's everything");
  await expect(page.locator(".demo-confirmation")).toHaveCount(0);
  await expect(page.locator(".transcript-entry.assistant").last()).toContainText("Is this correct?");
  await say(page, "yes");
  await expect(page.locator(".demo-confirmation")).toBeVisible();
  await say(page, "Goodbye");
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Ended");
  const endedCount = await page.evaluate(() => window.__cocoTestVoice.inputCount());
  await page.waitForTimeout(800);
  expect(await page.evaluate(() => window.__cocoTestVoice.inputCount())).toBe(endedCount);
  await expect(page.getByRole("button", { name: "End Conversation" })).toBeDisabled();
  await expect(page.getByTestId("cart-line-0")).toBeVisible();
});

test("real customer ASR transcript preserves Google text, proposes Supreme, adds one Large and reviews", async ({ page }) => {
  const runtimeErrors: string[] = [];
  page.on("pageerror", (error) => runtimeErrors.push(error.message));
  await mockSpeech(page);
  await ready(page);
  await page.getByRole("checkbox", { name: "Spoken responses" }).uncheck();
  await page.getByRole("button", { name: /Start Conversation/ }).click();
  const hear = async (text: string) => {
    await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Listening");
    const response = page.waitForResponse((reply) => reply.url().endsWith("/assistant/turn") && reply.request().method() === "POST");
    await page.evaluate((input) => window.__cocoTestVoice.final(input), text);
    const reply = await response;
    expect(reply.status()).toBe(200);
    const body = await reply.json();
    await expect(page.getByRole("button", { name: "Processing…" })).toHaveCount(0);
    // The recognized words are displayed verbatim, even when intent matching
    // interprets this very specific greeting as a Coco name confusion.
    await expect(page.locator(".transcript-entry.customer p").last()).toHaveText(text);
    return body;
  };
  expect((await hear("hey Google")).reply).toContain("Hi! Welcome");
  expect((await hear("hello Google")).reply).toContain("Hi! Welcome");
  const pending = await hear("I want a large pizza");
  expect(pending.context.pending.variation_id).toBe("large");
  const proposed = await hear("Supreme");
  expect(proposed.reply).toContain("Would you like King Arthur");
  expect(proposed.cart.lines).toHaveLength(0);
  const added = await hear("King Arthur Supreme");
  expect(added.cart.lines).toHaveLength(1);
  expect(added.cart.lines[0]).toMatchObject({ item_id: "king-arthur", variation_id: "large", quantity: 1, added_topping_ids: [], removed_topping_ids: [] });
  expect(added.reply).toContain("Added 1 Large King Arthur");
  await expect(page.getByTestId("cart-line-0").getByRole("combobox")).toHaveValue("large");
  const reviewed = await hear("that's everything I want");
  expect(reviewed.reply).toContain("Is this correct?");
  expect(reviewed.reply).toContain("Large King Arthur");
  expect(reviewed.draft).toBeNull();
  expect(reviewed.summary.total).toBeNull();
  await expect(page.locator(".demo-confirmation")).toHaveCount(0);
  const confirmed = await hear("yes");
  expect(confirmed.draft).toMatchObject({ status: "demo_confirmed", submitted_to_restaurant: false, payment_processed: false });
  expect(confirmed.cart).toEqual(added.cart);
  await page.getByRole("button", { name: "End Conversation" }).click();
  await expect(page.getByTestId("conversation-phase")).toHaveAttribute("data-phase", "Ended");
  expect(runtimeErrors).toEqual([]);
});
