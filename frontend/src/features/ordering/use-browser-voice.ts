"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { BrowserVoice, type VoiceWindow } from "./browser-voice";

export function useBrowserVoice(onFinal: (text: string) => void | Promise<unknown>) {
  const [controller] = useState(() => new BrowserVoice());
  const state = useSyncExternalStore(
    controller.subscribe,
    controller.getSnapshot,
    controller.getServerSnapshot,
  );
  useEffect(() => {
    controller.attach(window as VoiceWindow);
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    controller.setFinalHandler(onFinal);
    return () => {
      controller.setFinalHandler(undefined);
    };
  }, [controller, onFinal]);
  return { controller, ...state };
}
