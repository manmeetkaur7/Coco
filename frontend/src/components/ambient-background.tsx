/** Decorative atmosphere only; independent of the avatar and conversation state. */
export function AmbientBackground() {
  return (
    <div className="ambient-background" aria-hidden="true">
      <div className="ambient-nebula" />
      <div className="ambient-stars" />
      <div className="ambient-orbit ambient-orbit-outer" />
      <div className="ambient-orbit ambient-orbit-inner" />
      <div className="ambient-horizon" />
      <div className="ambient-grid" />
    </div>
  );
}
