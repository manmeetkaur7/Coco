"use client";
import { useState } from "react";
import { AvatarDisplay } from "./avatar-display";
import {
  AVATAR_STATES,
  AVATAR_STATE_COPY,
  AvatarState,
} from "../features/avatar/contracts";
import { usePrivatePortrait } from "../features/avatar/use-private-portrait";

export function AvatarExperience() {
  const [state, setState] = useState<AvatarState>("idle");
  const [motionEnabled, setMotionEnabled] = useState(true);
  const isDevelopment = process.env.NODE_ENV === "development";
  const portrait = usePrivatePortrait(isDevelopment);
  return (
    <>
      <AvatarDisplay
        state={state}
        portraitSrc={portrait.src}
        motionEnabled={motionEnabled}
        onPortraitError={portrait.markImageError}
      />
      <div className="avatar-foundation-note">
        <span>PORTRAIT FOUNDATION</span>
        <p>
          Facial expressions, blinking, and lip-sync require a rigged avatar.
          Voice is not connected.
        </p>
      </div>
      {isDevelopment && (
        <section
          className="avatar-preview-panel"
          aria-labelledby="avatar-preview-title"
        >
          <div className="avatar-preview-heading">
            <h3 id="avatar-preview-title">Avatar state preview</h3>
            <span className="sample-badge">DEVELOPMENT ONLY</span>
          </div>
          <p className="avatar-preview-description">
            Visual states only. These controls do not start a conversation or
            capture audio.
          </p>
          <div
            className="avatar-state-buttons"
            role="group"
            aria-label="Preview avatar state"
          >
            {AVATAR_STATES.map((value) => (
              <button
                type="button"
                key={value}
                aria-pressed={state === value}
                onClick={() => setState(value)}
              >
                {AVATAR_STATE_COPY[value].label}
              </button>
            ))}
          </div>
          <label className="avatar-motion-toggle">
            <input
              type="checkbox"
              checked={motionEnabled}
              onChange={(event) => setMotionEnabled(event.target.checked)}
            />
            Ambient portrait motion{" "}
            <span>Reduced-motion settings take priority</span>
          </label>
          <div
            className="portrait-import-status"
            role="status"
            aria-live="polite"
          >
            {portrait.status === "loading" && <p>Checking private portrait…</p>}
            {portrait.status === "available" && (
              <p>Your private portrait is loaded in this local preview.</p>
            )}
            {portrait.status === "missing" && (
              <p>
                Reference photo not found. Save your PNG as{" "}
                <code>private-assets/coco-reference.png</code> in the project
                root, then reload the portrait.
              </p>
            )}
            {portrait.status === "error" && (
              <p>
                The private portrait could not be loaded. Check that it is a
                valid PNG under 20 MB, then try again.
              </p>
            )}
            <button
              type="button"
              onClick={portrait.retry}
              disabled={portrait.status === "loading"}
            >
              Reload portrait
            </button>
          </div>
        </section>
      )}
    </>
  );
}
