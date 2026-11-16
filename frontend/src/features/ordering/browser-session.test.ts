import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserVoice, type Recognition, type VoiceWindow } from "./browser-voice";

class Input implements Recognition {
  static all: Input[] = [];
  lang = ""; continuous = false; interimResults = false;
  onstart: Recognition["onstart"] = null;
  onend: Recognition["onend"] = null;
  onerror: Recognition["onerror"] = null;
  onresult: Recognition["onresult"] = null;
  start = vi.fn(() => this.onstart?.());
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn(() => this.onend?.());
  constructor() { Input.all.push(this); }
}
class Output {
  lang = ""; voice = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
let voice: BrowserVoice;
let outputs: Output[];
let native: { speaking: boolean; pending: boolean; cancel: ReturnType<typeof vi.fn> };
beforeEach(() => {
  vi.useFakeTimers();
  Input.all = []; outputs = [];
  vi.stubGlobal("SpeechSynthesisUtterance", Output);
  native = { speaking: false, pending: false, cancel: vi.fn() };
  const synth = { ...native, getVoices: () => [], addEventListener: vi.fn(), removeEventListener: vi.fn(), speak: (output: Output) => outputs.push(output) };
  // Getters let tests model delayed native cancellation independently of events.
  Object.defineProperties(synth, { speaking: { get: () => native.speaking }, pending: { get: () => native.pending } });
  voice = new BrowserVoice();
  voice.attach({ SpeechRecognition: Input, speechSynthesis: synth } as unknown as VoiceWindow);
});
afterEach(() => { voice.dispose(); vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("consented conversation sessions", () => {
  it("holds an explicitly low-confidence order for customer correction", async () => {
    const final = vi.fn();
    voice.setFinalHandler(final);
    voice.listen();
    Input.all[0].onresult?.({ resultIndex: 0, results: [
      { isFinal: true, 0: { transcript: "Two medium pizzas", confidence: 0.3 } },
    ] });
    await vi.advanceTimersByTimeAsync(2000);
    expect(final).not.toHaveBeenCalled();
    expect(voice.getSnapshot()).toMatchObject({ phase: "Paused", microphoneEnabled: false });
    expect(voice.takeUncertainTranscript()).toBe("Two medium pizzas");
    expect(voice.getSnapshot().uncertainTranscript).toBeNull();
    voice.listen();
    expect(voice.getSnapshot().phase).toBe("Listening");
  });
  it("stops speaking on interruption and ignores stale playback events", async () => {
    voice.listen();
    voice.speak("Which pizza would you like?");
    outputs[0].onstart?.();
    const lateStart = outputs[0].onstart;
    expect(voice.getSnapshot().speaking).toBe(true);
    voice.finishTurn(voice.beginTurn());
    lateStart?.();
    expect(voice.getSnapshot().speaking).toBe(false);
    await vi.advanceTimersByTimeAsync(600);
    expect(voice.getSnapshot().phase).toBe("Listening");
  });

  it("never activates on mount and keeps one restart timer after explicit start", async () => {
    await vi.advanceTimersByTimeAsync(15000);
    expect(Input.all).toHaveLength(0);
    voice.startSession(); voice.startSession();
    await vi.advanceTimersByTimeAsync(600);
    expect(Input.all).toHaveLength(1);
    expect(voice.getSnapshot().phase).toBe("Listening");
  });
  it("restarts safely after a normal browser end or a customer's pause", async () => {
    voice.listen();
    await vi.advanceTimersByTimeAsync(1500);
    Input.all[0].onend?.(); Input.all[0].onend?.();
    expect(voice.getSnapshot().phase).toBe("Paused");
    await vi.advanceTimersByTimeAsync(599);
    expect(Input.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(Input.all).toHaveLength(2);
    expect(voice.getSnapshot().phase).toBe("Listening");
  });
  it("does not restart after End Conversation, including late callbacks", async () => {
    voice.listen();
    const ended = Input.all[0].onend;
    voice.endSession(); ended?.();
    await vi.advanceTimersByTimeAsync(30000);
    expect(Input.all).toHaveLength(1);
    expect(voice.getSnapshot().phase).toBe("Ended");
  });
  it.each(["not-allowed", "service-not-allowed", "audio-capture", "language-not-supported", "unknown-fatal"])("does not automatically retry fatal %s", async (error) => {
    voice.listen(); Input.all[0].onerror?.({ error });
    await vi.advanceTimersByTimeAsync(30000);
    expect(Input.all).toHaveLength(1);
    expect(voice.getSnapshot()).toMatchObject({ sessionActive: true, microphoneEnabled: false, phase: "Paused" });
  });
  it.each(["network", "no-speech", "aborted"])("bounds retry/backoff for %s and requires explicit resume after exhaustion", async (error) => {
    voice.listen();
    for (const [index, delay] of [500, 1000, 2000].entries()) {
      Input.all[index].onerror?.({ error });
      await vi.advanceTimersByTimeAsync(delay - 1);
      expect(Input.all).toHaveLength(index + 1);
      await vi.advanceTimersByTimeAsync(1);
      expect(Input.all).toHaveLength(index + 2);
    }
    Input.all[3].onerror?.({ error });
    await vi.advanceTimersByTimeAsync(30000);
    expect(Input.all).toHaveLength(4);
    expect(voice.getSnapshot().error).toContain("Automatic retries are paused");
    voice.listen(); expect(Input.all).toHaveLength(5);
  });
  it("respects stop and mute across speech until explicit microphone resume", async () => {
    voice.listen(); voice.stopListening();
    expect(Input.all[0].stop).toHaveBeenCalledOnce();
    voice.speak("Take your time"); outputs[0].onstart?.(); outputs[0].onend?.();
    await vi.advanceTimersByTimeAsync(5000);
    expect(Input.all).toHaveLength(1);
    voice.listen(); voice.mute();
    await vi.advanceTimersByTimeAsync(5000);
    expect(Input.all).toHaveLength(2);
    expect(voice.getSnapshot().phase).toBe("Paused");
  });
  it("waits for native recognition end before speech, then cooldown before listening", async () => {
    voice.listen(); const first = Input.all[0];
    first.abort = vi.fn();
    voice.speak("Hello");
    expect(outputs).toHaveLength(0);
    voice.listen();
    // Explicit resume cancels that queued reply but cannot create another mic.
    expect(Input.all).toHaveLength(1);
    voice.speak("A fresh reply"); first.onend?.();
    expect(outputs).toHaveLength(1);
    outputs[0].onstart?.();
    expect(voice.getSnapshot().phase).toBe("Speaking");
    await vi.advanceTimersByTimeAsync(3000);
    expect(Input.all).toHaveLength(1);
    outputs[0].onend?.();
    await vi.advanceTimersByTimeAsync(599); expect(Input.all).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1); expect(Input.all).toHaveLength(2);
  });
  it("ignores late speech results and blocks self-listening before/while synthesis plays", async () => {
    const final = vi.fn(); voice.setFinalHandler(final);
    voice.listen(); const late = Input.all[0].onresult;
    voice.speak("Which pizza?");
    late?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Which pizza" } }] });
    await vi.advanceTimersByTimeAsync(1000);
    expect(Input.all).toHaveLength(1); expect(final).not.toHaveBeenCalled();
    outputs[0].onstart?.();
    await vi.advanceTimersByTimeAsync(1000);
    expect(Input.all).toHaveLength(1);
    outputs[0].onend?.(); await vi.advanceTimersByTimeAsync(600);
    expect(Input.all).toHaveLength(2);
  });
  it("holds recognition during backend processing and sends each final only once", async () => {
    let finish!: () => void;
    const final = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    voice.setFinalHandler(final); voice.listen();
    const result = Input.all[0].onresult;
    const event = { resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Hey Coco" } }] };
    result?.(event); result?.(event);
    await vi.advanceTimersByTimeAsync(5000);
    expect(final).toHaveBeenCalledTimes(1);
    expect(voice.getSnapshot().phase).toBe("Thinking");
    expect(Input.all).toHaveLength(1);
    finish(); await vi.advanceTimersByTimeAsync(600);
    expect(Input.all).toHaveLength(2);
  });
  it("pauses on an unreleased recognition instance instead of opening another microphone", async () => {
    voice.listen(); Input.all[0].abort = vi.fn();
    voice.speak("Deferred");
    await vi.advanceTimersByTimeAsync(2000);
    expect(voice.getSnapshot().error).toContain("did not release");
    expect(outputs).toHaveLength(0);
    voice.listen(); await vi.advanceTimersByTimeAsync(5000);
    expect(Input.all).toHaveLength(1);
  });
  it("bounds immediate browser end loops", async () => {
    voice.listen();
    for (let index = 0; index < 4; index++) {
      Input.all[index].onend?.(); await vi.advanceTimersByTimeAsync(600);
    }
    expect(Input.all).toHaveLength(4);
    expect(voice.getSnapshot().error).toContain("keeps ending recognition");
  });
  it("cleans up pending restarts, recognizers and synthesis on unmount", async () => {
    voice.listen(); Input.all[0].onend?.();
    voice.dispose(); await vi.advanceTimersByTimeAsync(30000);
    expect(Input.all).toHaveLength(1);
    expect(native.cancel).toHaveBeenCalled();
    expect(voice.getSnapshot().sessionActive).toBe(false);
  });
  it("never resumes over native audio even if synthesis cancellation settles late", async () => {
    voice.listen(); voice.speak("Hello"); outputs[0].onstart?.();
    native.speaking = true;
    voice.stopSpeaking(); await vi.advanceTimersByTimeAsync(600);
    expect(Input.all).toHaveLength(1);
    native.speaking = false; await vi.advanceTimersByTimeAsync(500);
    expect(Input.all).toHaveLength(2);
  });
  it("pauses when recognition never starts instead of looping permission prompts", async () => {
    voice.dispose();
    // Simulate a browser that constructs but never acknowledges start.
    class SilentInput extends Input { start = vi.fn(); }
    voice = new BrowserVoice();
    voice.attach({ SpeechRecognition: SilentInput } as unknown as VoiceWindow);
    voice.listen();
    await vi.advanceTimersByTimeAsync(8000);
    expect(voice.getSnapshot()).toMatchObject({ microphoneEnabled: false, phase: "Paused" });
    expect(voice.getSnapshot().error).toContain("did not start");
  });
  it("pauses the microphone if synthesized speech never starts", async () => {
    voice.listen(); voice.speak("Queued but not playing");
    await vi.advanceTimersByTimeAsync(10000);
    expect(voice.getSnapshot().error).toContain("playback did not start");
    expect(Input.all).toHaveLength(1);
    expect(voice.getSnapshot().microphoneEnabled).toBe(false);
  });
  it("clears session callbacks before an ended session can deliver a final turn", async () => {
    const final = vi.fn(); voice.setFinalHandler(final); voice.listen();
    Input.all[0].onresult?.({ resultIndex: 0, results: [{ isFinal: true, 0: { transcript: "Coco" } }] });
    voice.endSession();
    await vi.advanceTimersByTimeAsync(1000);
    expect(final).not.toHaveBeenCalled();
    expect(Input.all).toHaveLength(1);
  });
});
