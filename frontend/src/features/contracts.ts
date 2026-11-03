import type {
  AvatarCapabilities,
  AvatarState,
  PlaybackClock,
  VisemeFrame,
} from "./avatar/contracts";
export type {
  AvatarCapabilities,
  AvatarState,
  LipSyncDriver,
  PlaybackClock,
  VisemeFrame,
} from "./avatar/contracts";
/** Integration boundaries only. No media capture or AI provider is active. */
export interface TranscriptEntry {
  id: string;
  role: "customer" | "assistant";
  text: string;
  timestamp: string;
}
export interface SpeechInput {
  start(onText: (text: string) => void): Promise<void>;
  stop(): Promise<void>;
}
export interface SpeechOutput {
  speak(text: string, signal: AbortSignal): Promise<void>;
  stop(): void;
}
export interface AvatarRenderer {
  setState(state: AvatarState): void;
  dispose(): void;
}
export interface ConversationOrchestrator {
  start(): Promise<void>;
  end(): Promise<void>;
  subscribe(onEntry: (entry: TranscriptEntry) => void): () => void;
}

/** Future rig adapters must declare which facial features are actually supported. */
export interface RiggedAvatarRenderer extends AvatarRenderer {
  readonly capabilities: Readonly<AvatarCapabilities>;
  applyViseme(frame: VisemeFrame): void;
  blink(): void;
}
/** A future speech provider can publish timing against its actual audio clock. */
export interface TimedSpeechOutput extends SpeechOutput {
  readonly clock: PlaybackClock;
  subscribeVisemes(
    onFrames: (frames: readonly VisemeFrame[]) => void,
  ): () => void;
}
