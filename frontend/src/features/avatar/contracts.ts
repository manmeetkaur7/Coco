export const AVATAR_STATES = [
  "idle",
  "listening",
  "thinking",
  "speaking",
] as const;
export type AvatarState = (typeof AVATAR_STATES)[number];

export interface AvatarCapabilities {
  portrait: boolean;
  ambientMotion: boolean;
  facialMotion: boolean;
  blinking: boolean;
  lipSync: boolean;
}

/** Motion is whole-image presentation only, never a claim of facial rigging. */
export const PORTRAIT_CAPABILITIES: Readonly<AvatarCapabilities> =
  Object.freeze({
    portrait: true,
    ambientMotion: true,
    facialMotion: false,
    blinking: false,
    lipSync: false,
  });

export const AVATAR_STATE_COPY: Record<
  AvatarState,
  { label: string; description: string }
> = {
  idle: { label: "Idle", description: "Ready for a future conversation." },
  listening: {
    label: "Listening",
    description: "Listening-state preview. Microphone is off.",
  },
  thinking: {
    label: "Thinking",
    description: "Thinking-state preview. No AI request is running.",
  },
  speaking: {
    label: "Speaking",
    description: "Speaking-state preview. No audio or lip-sync.",
  },
};

/** Future assets must supply a facial rig before these frames can be applied. */
export interface VisemeFrame {
  timeMs: number;
  durationMs: number;
  weights: Readonly<Record<string, number>>;
}
export interface PlaybackClock {
  currentTimeMs(): number;
  isPlaying(): boolean;
}
export interface LipSyncDriver {
  schedule(frames: readonly VisemeFrame[], clock: PlaybackClock): void;
  reset(): void;
  dispose(): void;
}
