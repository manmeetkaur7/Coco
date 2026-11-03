"use client";
import Image from "next/image";
import { AVATAR_STATE_COPY, AvatarState } from "../features/avatar/contracts";

export interface AvatarDisplayProps {
  state?: AvatarState;
  portraitSrc?: string;
  motionEnabled?: boolean;
  onPortraitError?: () => void;
}

/** A 2D portrait with ambient motion, not a facial animation rig. */
export function AvatarDisplay({
  state = "idle",
  portraitSrc,
  motionEnabled = true,
  onPortraitError,
}: AvatarDisplayProps) {
  const copy = AVATAR_STATE_COPY[state];
  return (
    <div
      className={`avatar-stage avatar-foundation${motionEnabled ? "" : " avatar-motion-paused"}`}
      data-state={state}
    >
      <div className="stage-grid" aria-hidden="true" />
      <div className="halo halo-one" aria-hidden="true" />
      <div className="halo halo-two" aria-hidden="true" />
      {portraitSrc ? (
        <div className="portrait-window">
          <div className="portrait-motion">
            <Image
              src={portraitSrc}
              alt="Coco portrait from your privately stored reference photograph"
              fill
              unoptimized
              sizes="(max-width: 760px) 100vw, 60vw"
              className="coco-portrait"
              onError={onPortraitError}
            />
          </div>
        </div>
      ) : (
        <div
          className="avatar-placeholder"
          role="img"
          aria-label="Coco portrait placeholder. Your reference photograph has not been loaded."
        >
          <div className="avatar-silhouette" aria-hidden="true">
            <div className="avatar-head" />
            <div className="avatar-neck" />
            <div className="avatar-body" />
          </div>
        </div>
      )}
      <div className="portrait-shade" aria-hidden="true" />
      <div className="stage-label">
        <span className="small-dot" />
        {portraitSrc
          ? "PRIVATE PORTRAIT · LOCAL PREVIEW"
          : "PORTRAIT FOUNDATION · PLACEHOLDER"}
      </div>
      <div
        className="avatar-state-indicator"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <span className="avatar-state-light" aria-hidden="true" />
        <span>
          {copy.label}
          <small>{copy.description}</small>
        </span>
      </div>
      <div className="avatar-caption">
        <span className="eyebrow">COCO · YOUR FUTURE HOST</span>
        <h2>
          A familiar face.
          <br />
          <em>A thoughtful welcome.</em>
        </h2>
        <p>
          {portraitSrc
            ? "2D portrait · ambient image motion only"
            : "Your portrait belongs here · no substitute face"}
        </p>
      </div>
      <div className="avatar-signal" aria-hidden="true">
        <span />
        <span />
        <span />
        <span />
        <span />
      </div>
      <span className="stage-corner">COCO / 02</span>
    </div>
  );
}
