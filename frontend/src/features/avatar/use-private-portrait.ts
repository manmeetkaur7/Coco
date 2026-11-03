"use client";
import { useEffect, useState } from "react";

export type PortraitStatus =
  "loading" | "available" | "missing" | "error" | "disabled";

/** Local blob URLs stay in memory; the photo is never sent to an image optimizer. */
export function usePrivatePortrait(enabled: boolean) {
  const [attempt, setAttempt] = useState(0);
  const [portrait, setPortrait] = useState<{
    status: PortraitStatus;
    src?: string;
  }>({ status: enabled ? "loading" : "disabled" });
  useEffect(() => {
    if (!enabled) return;
    let active = true;
    let objectUrl: string | undefined;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8000);
    async function load() {
      try {
        const response = await fetch("/api/avatar/reference", {
          cache: "no-store",
          signal: controller.signal,
          credentials: "same-origin",
        });
        if (!active) return;
        if (response.status === 404) {
          setPortrait({ status: "missing" });
          return;
        }
        if (
          !response.ok ||
          response.headers.get("content-type") !== "image/png"
        ) {
          throw new Error("Private portrait unavailable");
        }
        const blob = await response.blob();
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPortrait({ status: "available", src: objectUrl });
      } catch {
        if (active) setPortrait({ status: "error" });
      } finally {
        window.clearTimeout(timeout);
      }
    }
    void load();
    return () => {
      active = false;
      controller.abort();
      window.clearTimeout(timeout);
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [enabled, attempt]);
  return {
    ...portrait,
    retry: () => {
      setPortrait({ status: "loading" });
      setAttempt((n) => n + 1);
    },
    markImageError: () => setPortrait({ status: "error" }),
  };
}
