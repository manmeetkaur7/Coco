import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BrowserVoice, Recognition, VoiceWindow } from "./browser-voice";

class FakeRecognition implements Recognition {
  static instances: FakeRecognition[] = [];
  lang = "";
  continuous = false;
  interimResults = false;
  onstart: Recognition["onstart"] = null;
  onend: Recognition["onend"] = null;
  onerror: Recognition["onerror"] = null;
  onresult: Recognition["onresult"] = null;
  start = vi.fn();
  stop = vi.fn(() => this.onend?.());
  abort = vi.fn(() => this.onend?.());
  constructor() {
    FakeRecognition.instances.push(this);
  }
}
class FakeUtterance {
  lang = "";
  voice: SpeechSynthesisVoice | null = null;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public text: string) {}
}
function fixture(recognition = true) {
  const utterances: FakeUtterance[] = [];
  const voices = [
    {
      name: "Local English",
      lang: "en-US",
      voiceURI: "local-en",
      localService: true,
      default: true,
    },
  ] as SpeechSynthesisVoice[];
  const synth = {
    getVoices: () => voices,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    cancel: vi.fn(),
    speak: vi.fn((utterance: FakeUtterance) => utterances.push(utterance)),
  };
  const browser = {
    SpeechRecognition: recognition ? FakeRecognition : undefined,
    speechSynthesis: synth,
  } as unknown as VoiceWindow;
  const controller = new BrowserVoice();
  controller.attach(browser);
  controllers.push(controller);
  return { controller, synth, utterances, voices };
}
let controllers: BrowserVoice[] = [];
beforeEach(() => {
  vi.useFakeTimers();
  controllers = [];
  FakeRecognition.instances = [];
  vi.stubGlobal("SpeechSynthesisUtterance", FakeUtterance);
});
afterEach(() => {
  controllers.forEach((controller) => controller.dispose());
  vi.clearAllTimers();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("browser voice lifecycle", () => {
  it("prefers an installed female voice over the default and honors manual choice", () => {
    const { controller, utterances, voices } = fixture();
    voices.push({ ...voices[0], name: "Microsoft Zira Desktop - English (United States)", voiceURI: "zira", default: false });
    controller.speak("Hello");
    expect(utterances[0].voice?.voiceURI).toBe("zira");
    controller.speak("Hello again", "en-US", "local-en");
    expect(utterances[1].voice?.voiceURI).toBe("local-en");
  });
  it("does not open a microphone without explicit interaction", () => {
    const { controller } = fixture();
    expect(FakeRecognition.instances).toHaveLength(0);
    controller.listen("pa-IN");
    const input = FakeRecognition.instances[0];
    expect(input.lang).toBe("pa-IN");
    expect(input.continuous).toBe(false);
    expect(controller.getSnapshot().listening).toBe(false);
    input.onstart?.();
    expect(controller.getSnapshot().listening).toBe(true);
  });
  it("shows interim text but sends only final recognition results", async () => {
    const { controller } = fixture();
    const final = vi.fn();
    controller.onFinal = final;
    controller.listen("en-US");
    const input = FakeRecognition.instances[0];
    input.onstart?.();
    input.onresult?.({
      resultIndex: 0,
      results: [{ isFinal: false, 0: { transcript: "large pizza" } }],
    });
    expect(controller.getSnapshot().interim).toBe("large pizza");
    expect(final).not.toHaveBeenCalled();
    input.onresult?.({
      resultIndex: 0,
      results: [
        { isFinal: true, 0: { transcript: "large create your own pizza" } },
      ],
    });
    await vi.advanceTimersByTimeAsync(0);
    expect(final).toHaveBeenCalledWith("large create your own pizza");
    expect(input.abort).toHaveBeenCalled();
    expect(controller.getSnapshot().listening).toBe(false);
  });
  it("surfaces permission denial and never automatically restarts", () => {
    const { controller } = fixture();
    controller.listen("en-US");
    FakeRecognition.instances[0].onerror?.({ error: "not-allowed" });
    expect(controller.getSnapshot().error).toContain("permission was denied");
    expect(controller.getSnapshot().listening).toBe(false);
    expect(FakeRecognition.instances).toHaveLength(1);
  });
  it("provides a text fallback when recognition is unsupported", () => {
    const { controller } = fixture(false);
    controller.listen("en-US");
    expect(controller.getSnapshot().recognitionSupported).toBe(false);
    expect(controller.getSnapshot().error).toContain("manual text input");
  });
  it("stops listening and disconnects late events on abort", () => {
    const { controller } = fixture();
    const final = vi.fn();
    controller.onFinal = final;
    controller.listen("hi-IN");
    const input = FakeRecognition.instances[0];
    controller.stopListening();
    expect(input.stop).toHaveBeenCalled();
    const late = input.onresult;
    controller.stopAll();
    late?.({
      resultIndex: 0,
      results: [{ isFinal: true, 0: { transcript: "add pizza" } }],
    });
    expect(final).not.toHaveBeenCalled();
    expect(controller.getSnapshot().listening).toBe(false);
  });
  it("speaks without overlap and reports actual audio events", () => {
    const { controller, synth, utterances } = fixture();
    controller.speak("Hello");
    expect(controller.getSnapshot().speaking).toBe(false);
    utterances[0].onstart?.();
    expect(controller.getSnapshot().speaking).toBe(true);
    const staleEnd = utterances[0].onend;
    controller.speak("Your draft");
    utterances[1].onstart?.();
    staleEnd?.();
    expect(synth.cancel).toHaveBeenCalledTimes(2);
    expect(controller.getSnapshot().speaking).toBe(true);
    utterances[1].onend?.();
    expect(controller.getSnapshot().speaking).toBe(false);
  });
  it("stops playback and reports errors without claiming successful speech", () => {
    const { controller, utterances } = fixture();
    controller.speak("Hello");
    utterances[0].onerror?.();
    expect(controller.getSnapshot().error).toContain("playback failed");
    expect(controller.getSnapshot().speaking).toBe(false);
    controller.stopSpeaking();
    expect(controller.getSnapshot().speaking).toBe(false);
  });
  it("does not pretend a missing Punjabi voice can speak", () => {
    const { controller, synth } = fixture();
    controller.speak("ਸਤ ਸ੍ਰੀ ਅਕਾਲ", "pa-IN");
    expect(synth.speak).not.toHaveBeenCalled();
    expect(controller.getSnapshot().error).toContain(
      "No matching language voice",
    );
  });
  it("cleans up browser listeners and media on disposal", () => {
    const { controller, synth } = fixture();
    controller.listen("en-US");
    controller.dispose();
    expect(FakeRecognition.instances[0].abort).toHaveBeenCalled();
    expect(synth.cancel).toHaveBeenCalled();
    expect(synth.removeEventListener).toHaveBeenCalledWith(
      "voiceschanged",
      expect.any(Function),
    );
  });
});
