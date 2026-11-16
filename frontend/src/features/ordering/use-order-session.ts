"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  Cart,
  CartLine,
  CartSummary,
  Draft,
  EMPTY_CART,
  OrderingContext,
  request,
  restaurantPath,
  Turn,
  ModelState,
} from "../../lib/api";
import { GREETINGS, LanguageCode } from "./languages";
import type { TranscriptEntry } from "../contracts";

export function useOrderSession() {
  const [cart, setCart] = useState<Cart>(EMPTY_CART);
  const [summary, setSummary] = useState<CartSummary | null>(null);
  const [context, setContext] = useState<OrderingContext>({});
  const [draft, setDraft] = useState<Draft | null>(null);
  const [model, setModel] = useState<ModelState | null>(null);
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [announcement, setAnnouncement] = useState<{
    id: string;
    text: string;
    language: LanguageCode;
    sessionAction?: "continue" | "end";
  } | null>(null);
  const inFlight = useRef(false);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const append = useCallback(
    (role: TranscriptEntry["role"], text: string, language: string = "en-US") =>
      setTranscript((previous) => [
        ...previous,
        {
          id: crypto.randomUUID(),
          role,
          text,
          timestamp: new Date().toISOString(),
          language,
        },
      ]),
    [],
  );
  const reply = useCallback(
    (text: string, language: LanguageCode = "en-US") => {
      append("assistant", text, language);
      if (active) setAnnouncement({ id: crypto.randomUUID(), text, language });
    },
    [active, append],
  );

  const run = useCallback(
    async (
      action: (signal: AbortSignal, isCurrent: () => boolean) => Promise<void>,
    ) => {
      if (inFlight.current) return false;
      inFlight.current = true;
      setBusy(true);
      setError(null);
      const operation = ++generation.current;
      const abort = new AbortController();
      controller.current = abort;
      const timer = window.setTimeout(() => abort.abort(), 45000);
      const current = () => generation.current === operation;
      try {
        await action(abort.signal, current);
        return current();
      } catch (failure) {
        if (current())
          setError(
            abort.signal.aborted
              ? "The request timed out or was cancelled. Your last validated cart is unchanged; try again."
              : failure instanceof Error
                ? failure.message
                : "Could not reach the ordering backend.",
          );
        return false;
      } finally {
        window.clearTimeout(timer);
        if (current()) {
          setBusy(false);
          inFlight.current = false;
          controller.current = null;
        }
      }
    },
    [],
  );

  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  const start = (language: LanguageCode) => {
    setActive(true);
    setError(null);
    setContext({});
    const text = GREETINGS[language];
    setTranscript([
      {
        id: crypto.randomUUID(),
        role: "assistant",
        text,
        timestamp: new Date().toISOString(),
        language,
      },
    ]);
    setAnnouncement({ id: crypto.randomUUID(), text, language });
  };
  const cancelPending = useCallback(() => {
    generation.current++;
    controller.current?.abort();
    controller.current = null;
    inFlight.current = false;
    setBusy(false);
    setAnnouncement(null);
    setError(null);
  }, []);
  const end = () => {
    cancelPending();
    setActive(false);
    setContext({});
    append(
      "assistant",
      "Conversation ended. Your cart is kept in this tab only. No order was submitted.",
    );
  };
  const send = useCallback(
    async (text: string, language: LanguageCode = "en-US") => {
      if (!text.trim()) return false;
      if (inFlight.current) cancelPending();
      setActive(true);
      append("customer", text.trim(), language);
      return run(async (signal, current) => {
        const result = await request<Turn>(
          `${restaurantPath(cart.restaurant_id)}/assistant/turn`,
          signal,
          { text, language, cart, context, conversation_active: true },
        );
        if (!current()) return;
        setCart(result.cart);
        setContext(result.context);
        setSummary(result.summary);
        setDraft(result.draft);
        setModel(result.model);
        if (result.session_action === "end") setActive(false);
        append("assistant", result.reply, result.language);
        setAnnouncement({ id: crypto.randomUUID(), text: result.reply, language: result.language, sessionAction: result.session_action });
      });
    },
    [append, cart, context, run, cancelPending],
  );
  const replaceCart = useCallback(
    async (candidate: Cart, notice = "Updated your local draft cart.") =>
      run(async (signal, current) => {
        const validated = await request<CartSummary>(
          `${restaurantPath(candidate.restaurant_id)}/cart/validate`,
          signal,
          candidate,
        );
        if (!current()) return;
        setCart(candidate);
        setSummary(validated);
        setDraft(null);
        setContext((previous) => ({ target_line_id: candidate.lines.at(-1)?.line_id ?? null, memory: previous.memory }));
        if (active) reply(notice);
      }),
    [active, reply, run],
  );
  const addLine = (line: CartLine) =>
    replaceCart(
      { ...cart, lines: [...cart.lines, line] },
      "Added the selected item to your demo cart. Local prices and availability still need verification. Would you like to add anything to the order?",
    );
  const updateLine = (line: CartLine) =>
    replaceCart({
      ...cart,
      lines: cart.lines.map((old) =>
        old.line_id === line.line_id ? line : old,
      ),
    });
  const removeLine = (id: string) =>
    replaceCart(
      { ...cart, lines: cart.lines.filter((line) => line.line_id !== id) },
      "Removed the selected draft item.",
    );
  const review = () =>
    run(async (signal, current) => {
      const result = await request<Draft>(
        `${restaurantPath(cart.restaurant_id)}/order-drafts`,
        signal,
        { cart, confirm: false },
      );
      if (!current()) return;
      setDraft(result);
      setSummary(result.summary);
      setContext((previous) => ({
        ...previous,
        review_token: result.summary.review_token,
      }));
      reply(
        "Let me confirm your order. " +
          result.summary.readback +
          " Review it, then choose Confirm demo draft. Nothing has been placed.",
      );
    });
  const confirm = () =>
    run(async (signal, current) => {
      const result = await request<Draft>(
        `${restaurantPath(cart.restaurant_id)}/order-drafts`,
        signal,
        { cart, confirm: true, review_token: context.review_token },
      );
      if (!current()) return;
      setDraft(result);
      setContext((previous) => ({ ...previous, review_token: null }));
      reply(result.message);
    });
  return {
    cart,
    summary,
    context,
    draft,
    model,
    setModel,
    active,
    busy,
    error,
    transcript,
    announcement,
    start,
    end,
    cancelPending,
    send,
    addLine,
    updateLine,
    removeLine,
    review,
    confirm,
    clear: () =>
      replaceCart({ ...cart, lines: [] }, "Your local cart is cleared."),
    selectLine: (id: string) =>
      setContext((previous) => ({ ...previous, target_line_id: id })),
  };
}
export type OrderSession = ReturnType<typeof useOrderSession>;
