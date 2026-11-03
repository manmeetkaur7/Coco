/** Integration boundaries only. No media capture or AI implementation in Sprint 1. */
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
  setState(state: "idle" | "listening" | "speaking"): void;
  dispose(): void;
}
export interface ConversationOrchestrator {
  start(): Promise<void>;
  end(): Promise<void>;
  subscribe(onEntry: (entry: TranscriptEntry) => void): () => void;
}
