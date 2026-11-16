/** Consent-based browser voice sessions. No audio recording or paid provider. */
export interface RecognitionResultEvent {
  resultIndex: number;
  results: ArrayLike<{ isFinal: boolean; 0: { transcript: string; confidence?: number } }>;
}
export interface Recognition {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onresult: ((event: RecognitionResultEvent) => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}
export type VoiceWindow = Window & {
  SpeechRecognition?: new () => Recognition;
  webkitSpeechRecognition?: new () => Recognition;
};
export type VoicePhase = "Listening" | "Thinking" | "Speaking" | "Paused" | "Ended";
export interface VoiceSnapshot {
  uncertainTranscript: string | null;
  recognitionSupported: boolean;
  synthesisSupported: boolean;
  sessionActive: boolean;
  microphoneEnabled: boolean;
  processing: boolean;
  phase: VoicePhase;
  reason: string;
  listening: boolean;
  speaking: boolean;
  starting: boolean;
  interim: string;
  error: string | null;
  voices: SpeechSynthesisVoice[];
}
const INITIAL: VoiceSnapshot = {
  uncertainTranscript: null, recognitionSupported: false, synthesisSupported: false,
  sessionActive: false, microphoneEnabled: false, processing: false,
  phase: "Ended", reason: "Choose Start Conversation to enable the microphone, or type a message.",
  listening: false, speaking: false, starting: false,
  interim: "", error: null, voices: [],
};
const errors: Record<string, string> = {
  "not-allowed": "Microphone permission was denied. Allow it in browser settings, then choose Resume microphone, or type your request.",
  "service-not-allowed": "The browser speech service is unavailable. Please type your request.",
  "audio-capture": "No microphone is available. Check your device or type instead.",
  "no-speech": "No speech was detected. Retrying the browser microphone briefly.",
  network: "The browser speech service could not connect. Recognition may require internet access.",
  "language-not-supported": "The browser does not support recognition for this language. Type an English request instead.",
};
const RECOVERABLE = new Set(["no-speech", "network", "aborted"]);
const BACKOFF = [500, 1000, 2000];
const RESUME_DELAY = 600;
const ORDER_DETAILS = /\b(yes|no|not|without|remove|cancel|small|medium|large|once|twice|one|two|three|four|five|six|seven|eight|nine|ten|\d+)\b/i;
// Web Speech has no gender metadata. Prefer known female names, local first.
const femaleVoiceName = /\b(zira|hazel|susan|heera|kalpana|samantha|victoria|karen|moira|tessa|fiona|veena|sangeeta|jenny|aria|sonia|natasha|neerja|swara)\b|\bfemale\b/i;

export class BrowserVoice {
  private state: VoiceSnapshot = INITIAL;
  private listeners = new Set<() => void>();
  private browser?: VoiceWindow;
  private recognition?: Recognition;
  private retiring = false;
  private utterance?: SpeechSynthesisUtterance;
  private deferredSpeech?: () => void;
  private outputPending = false;
  private outputGeneration = 0;
  private turnGeneration = 0;
  private turnStartedAt?: number;
  private voiceListener?: () => void;
  private restartTimer?: ReturnType<typeof setTimeout>;
  private releaseTimer?: ReturnType<typeof setTimeout>;
  private startTimer?: ReturnType<typeof setTimeout>;
  private speechTimer?: ReturnType<typeof setTimeout>;
  private retries = 0;
  private rapidEnds = 0;
  private nextDelay = RESUME_DELAY;
  private settlingChecks = 0;
  private language = "en-US";
  private available = true;
  private disposed = false;
  onFinal?: (text: string) => void | Promise<unknown>;
  setFinalHandler(handler?: (text: string) => void | Promise<unknown>) { this.onFinal = handler; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.state;
  getServerSnapshot = () => INITIAL;
  private update(next: Partial<VoiceSnapshot>) {
    const state = { ...this.state, ...next };
    state.phase = state.speaking ? "Speaking" : state.processing ? "Thinking" : state.listening ? "Listening" : state.sessionActive ? "Paused" : "Ended";
    this.state = state;
    this.listeners.forEach((listener) => listener());
  }
  attach(browser: VoiceWindow) {
    this.browser = browser;
    this.disposed = false;
    this.update({ recognitionSupported: !!(browser.SpeechRecognition || browser.webkitSpeechRecognition), synthesisSupported: !!browser.speechSynthesis && typeof SpeechSynthesisUtterance !== "undefined" });
    this.voiceListener = () => this.update({ voices: browser.speechSynthesis?.getVoices() ?? [] });
    browser.speechSynthesis?.addEventListener("voiceschanged", this.voiceListener);
    this.voiceListener();
  }
  private clearRestart() { clearTimeout(this.restartTimer); this.restartTimer = undefined; }
  private canListen() {
    return !this.disposed && this.available && this.state.sessionActive && this.state.microphoneEnabled && !this.state.processing && !this.outputPending && !this.state.speaking;
  }
  private scheduleRestart(delay = RESUME_DELAY) {
    this.clearRestart();
    if (!this.canListen() || this.recognition) return;
    this.restartTimer = setTimeout(() => {
      this.restartTimer = undefined;
      if (!this.canListen() || this.recognition) return;
      const synth = this.browser?.speechSynthesis;
      // cancel() can settle asynchronously; never listen over native playback.
      if (synth?.speaking || synth?.pending) {
        if (++this.settlingChecks > 10) this.pauseMicrophone("The browser still reports speech playback. Stop speaking, then resume the microphone.");
        else this.scheduleRestart(500);
        return;
      }
      this.settlingChecks = 0;
      this.beginRecognition();
    }, delay);
  }
  /** Called only by an explicit Start Conversation click. */
  startSession(language = "en-US") {
    this.language = language;
    this.retries = this.rapidEnds = 0;
    this.update({ sessionActive: true, microphoneEnabled: true, error: null, reason: "Preparing the microphone; listening resumes after Coco's greeting." });
    this.scheduleRestart();
  }
  /** Explicit microphone resume grants consent; never called on mount. */
  listen(language = this.language) {
    this.language = language;
    this.retries = this.rapidEnds = 0;
    const hadOutput = this.outputPending || this.state.speaking;
    this.cancelOutput();
    this.update({ sessionActive: true, microphoneEnabled: true, error: null, reason: "Requesting microphone access…" });
    if (hadOutput) this.scheduleRestart();
    else this.beginRecognition();
  }
  setAvailable(available: boolean) {
    if (this.available === available) return;
    this.available = available;
    if (!available) {
      this.clearRestart(); this.retireRecognition();
      this.update({ reason: "Backend unavailable. You can keep typing; listening resumes after reconnection." });
    } else this.scheduleRestart();
  }
  setLanguage(language: string) {
    this.language = language;
    this.clearRestart(); this.cancelOutput(); this.retireRecognition(); this.scheduleRestart();
  }
  private recover(error: string) {
    if (RECOVERABLE.has(error) && this.retries < BACKOFF.length) {
      this.nextDelay = BACKOFF[this.retries++];
      this.update({ error: errors[error] ?? "Recognition ended unexpectedly.", reason: `Retrying microphone in ${this.nextDelay / 1000}s (${this.retries}/${BACKOFF.length}).` });
    } else this.pauseMicrophone((errors[error] ?? "Recognition stopped unexpectedly.") + (RECOVERABLE.has(error) ? " Automatic retries are paused. Choose Resume microphone to try again." : " Automatic listening is paused."));
  }
  private beginRecognition() {
    if (!this.canListen() || this.recognition) return;
    const synth = this.browser?.speechSynthesis;
    if (synth?.speaking || synth?.pending) { this.scheduleRestart(); return; }
    const Constructor = this.browser?.SpeechRecognition || this.browser?.webkitSpeechRecognition;
    if (!Constructor) { this.pauseMicrophone("Speech recognition is unsupported in this browser. Use manual text input."); return; }
    let recognition: Recognition;
    try { recognition = new Constructor(); }
    catch { this.pauseMicrophone("Could not create browser recognition. Check browser support and permission, or type your request."); return; }
    this.recognition = recognition; this.retiring = false;
    recognition.lang = this.language; recognition.continuous = false; recognition.interimResults = true;
    let startedAt = Date.now();
    let hadError = false;
    const current = () => !this.disposed && this.recognition === recognition;
    const accepting = () => current() && !this.retiring && this.canListen();
    this.update({ starting: true, interim: "", reason: "Requesting microphone access…" });
    recognition.onstart = () => {
      if (!accepting()) return;
      clearTimeout(this.startTimer); startedAt = Date.now();
      this.update({ starting: false, listening: true, error: null, reason: "Microphone active. Browser recognition will restart safely after normal pauses." });
    };
    recognition.onend = () => {
      if (!current()) return;
      const deliberate = this.retiring;
      clearTimeout(this.startTimer); clearTimeout(this.releaseTimer);
      this.recognition = undefined; this.retiring = false;
      this.update({ starting: false, listening: false, interim: "" });
      if (this.deferredSpeech) { const speak = this.deferredSpeech; this.deferredSpeech = undefined; speak(); return; }
      if (!deliberate && !hadError) {
        this.update({ reason: "The browser paused recognition. Resuming listening safely…" });
        this.rapidEnds = Date.now() - startedAt < 1000 ? this.rapidEnds + 1 : 0;
        this.nextDelay = RESUME_DELAY;
        if (this.rapidEnds > 3) this.pauseMicrophone("The browser keeps ending recognition immediately. Choose Resume microphone or type your request.");
      }
      this.scheduleRestart(this.nextDelay);
    };
    recognition.onerror = (event) => {
      if (!current() || this.retiring) return;
      hadError = true; this.recover(event.error); this.retireRecognition();
    };
    recognition.onresult = (event) => {
      if (!accepting()) return;
      const final: string[] = [], interim: string[] = [];
      let uncertain = false;
      for (let index = event.resultIndex; index < event.results.length; index++) {
        const result = event.results[index];
        const { transcript, confidence } = result[0];
        (result.isFinal ? final : interim).push(transcript);
        // Missing/zero confidence is common; only use an explicit low score.
        if (result.isFinal && typeof confidence === "number" && confidence > 0 && confidence < 0.55) uncertain = true;
      }
      this.update({ interim: interim.join(" ") });
      const text = final.join(" ").trim();
      if (text && uncertain && (ORDER_DETAILS.test(text) || text.trim().split(/\s+/).length > 1)) {
        this.update({ uncertainTranscript: text });
        this.pauseMicrophone("I may have misheard your request. Check the text before sending, or resume and try again.");
        return;
      }
      if (text) {
        this.retries = this.rapidEnds = 0; this.nextDelay = RESUME_DELAY;
        const turn = this.beginTurn(); this.update({ error: null });
        void Promise.resolve().then(() => turn === this.turnGeneration ? this.onFinal?.(text) : undefined).then((ok) => {
          if (turn === this.turnGeneration && ok === false) this.pauseMicrophone("The request was not processed. Check the connection, then resume the microphone or type.");
        }).catch(() => {
          if (turn === this.turnGeneration) this.pauseMicrophone("The request failed. Resume the microphone or type your request.");
        }).finally(() => this.finishTurn(turn));
      }
    };
    this.startTimer = setTimeout(() => {
      if (current() && !this.state.listening) this.pauseMicrophone("The browser did not start the microphone. Check permission, then resume or type.");
    }, 8000);
    try { recognition.start(); }
    catch { this.pauseMicrophone("Could not start the microphone. Check permission, then resume or type your request."); }
  }
  private retireRecognition(stop = false) {
    const previous = this.recognition;
    if (!previous || this.retiring) return;
    this.retiring = true; clearTimeout(this.startTimer);
    this.update({ listening: false, starting: false, interim: "" });
    // Occupy the slot until native end; never create a second live recognizer.
    this.releaseTimer = setTimeout(() => {
      if (this.recognition !== previous) return;
      this.deferredSpeech = undefined; this.outputPending = false;
      this.pauseMicrophone("The browser did not release the microphone. Reload this page before starting voice again.");
    }, 2000);
    try { if (stop) previous.stop(); else previous.abort(); }
    catch { this.pauseMicrophone("The browser could not stop recognition. Reload this page before starting voice again."); }
  }
  stopListening() {
    this.clearRestart();
    this.update({ microphoneEnabled: false, reason: "Microphone stopped. Choose Resume microphone to listen again." });
    this.retireRecognition(true);
  }
  mute() { this.pauseMicrophone(); }
  private pauseMicrophone(error?: string) {
    this.clearRestart();
    this.update({ microphoneEnabled: false, listening: false, starting: false, ...(error ? { error } : {}), reason: error ?? "Microphone muted. Resume only when you are ready." });
    this.retireRecognition();
  }
  abortRecognition() { this.mute(); }
  takeUncertainTranscript() {
    const text = this.state.uncertainTranscript;
    this.update({ uncertainTranscript: null });
    return text;
  }
  beginTurn() {
    this.turnStartedAt = performance.now();
    this.update({ uncertainTranscript: null });
    const turn = ++this.turnGeneration;
    this.clearRestart(); this.update({ processing: true, reason: "Processing your request." });
    this.cancelOutput(); this.retireRecognition();
    return turn;
  }
  finishTurn(turn?: number) {
    if (turn !== undefined && turn !== this.turnGeneration) return;
    this.update({ processing: false, reason: this.state.speaking ? this.state.reason : this.outputPending ? "Preparing Coco's spoken response. Microphone paused." : this.state.microphoneEnabled ? "Resuming the conversation microphone…" : "Microphone paused. Choose Resume microphone when ready." }); this.scheduleRestart();
  }
  speak(text: string, language = "en-US", voiceURI = "") {
    this.cancelOutput(); this.clearRestart();
    const synth = this.browser?.speechSynthesis;
    if (!synth || !text.trim() || typeof SpeechSynthesisUtterance === "undefined") { this.scheduleRestart(); return; }
    const available = this.state.voices.filter((voice) => voice.lang.toLowerCase().startsWith(language.slice(0, 2).toLowerCase()));
    const selected = available.find((voice) => voice.voiceURI === voiceURI)
      ?? available.find((voice) => voice.localService && femaleVoiceName.test(voice.name))
      ?? available.find((voice) => femaleVoiceName.test(voice.name))
      ?? available.find((voice) => voice.localService) ?? available.find((voice) => voice.default) ?? available[0];
    if (language !== "en-US" && !selected) {
      this.update({ error: "No matching language voice is installed. The written greeting is available; ordering remains English-only." });
      this.scheduleRestart(); return;
    }
    this.outputPending = true;
    const generation = this.outputGeneration;
    const current = () => !this.disposed && generation === this.outputGeneration;
    const failed = () => {
      if (!current()) return;
      this.cancelOutput(); this.update({ error: "Speech playback failed. Please read Coco's written response." }); this.scheduleRestart();
    };
    const play = () => {
      if (!current()) return;
      const utterance = new SpeechSynthesisUtterance(text);
      this.utterance = utterance; utterance.lang = language;
      if (selected) utterance.voice = selected;
      utterance.onstart = () => {
        if (!current()) return;
        clearTimeout(this.speechTimer);
        if (this.turnStartedAt !== undefined) {
          performance.measure("coco:turn-to-speech-start", { start: this.turnStartedAt, end: performance.now() });
          this.turnStartedAt = undefined;
        }
        // Some browser voices omit onend. Recover even after playback started.
        this.speechTimer = setTimeout(failed, Math.max(15000, Math.min(180000, text.length * 180)));
        this.update({ speaking: true, error: null, reason: "Coco is speaking. The microphone is paused." });
      };
      utterance.onend = () => {
        if (!current()) return;
        clearTimeout(this.speechTimer); this.utterance = undefined; this.outputPending = false;
        this.update({ speaking: false, reason: this.state.microphoneEnabled ? "Resuming listening after playback…" : "Microphone paused." });
        this.scheduleRestart();
      };
      utterance.onerror = failed;
      this.speechTimer = setTimeout(() => {
        if (!current()) return;
        this.cancelOutput(); this.pauseMicrophone("Speech playback did not start. Please read the transcript and explicitly resume the microphone.");
      }, 10000);
      try { synth.speak(utterance); } catch { failed(); }
    };
    this.deferredSpeech = play; this.retireRecognition();
    if (!this.recognition) { this.deferredSpeech = undefined; play(); }
  }
  private cancelOutput() {
    this.outputGeneration++; clearTimeout(this.speechTimer);
    this.deferredSpeech = undefined; this.outputPending = false;
    if (this.utterance) this.utterance.onstart = this.utterance.onend = this.utterance.onerror = null;
    this.utterance = undefined; this.browser?.speechSynthesis?.cancel(); this.update({ speaking: false });
  }
  stopSpeaking() {
    this.cancelOutput();
    this.update({ reason: this.state.microphoneEnabled ? "Speech stopped. Resuming listening safely…" : "Speech stopped. Microphone remains paused." });
    this.scheduleRestart();
  }
  endSession() {
    this.turnStartedAt = undefined;
    this.update({ uncertainTranscript: null });
    ++this.turnGeneration; this.clearRestart();
    this.update({ sessionActive: false, microphoneEnabled: false, processing: false, reason: "Conversation ended. The microphone is off." });
    this.cancelOutput(); this.retireRecognition();
  }
  stopAll() { this.endSession(); }
  dispose() {
    this.disposed = true; this.endSession();
    clearTimeout(this.releaseTimer); clearTimeout(this.startTimer);
    const previous = this.recognition; this.recognition = undefined; this.retiring = false;
    if (previous) {
      previous.onstart = previous.onend = previous.onresult = previous.onerror = null;
      try { previous.abort(); } catch { /* Already ended. */ }
    }
    if (this.voiceListener) this.browser?.speechSynthesis?.removeEventListener("voiceschanged", this.voiceListener);
  }
}
