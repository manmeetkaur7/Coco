export function AvatarDisplay() {
  return (
    <div
      className="avatar-stage"
      aria-label="Static conceptual avatar placeholder. No animation or interaction."
    >
      <div className="stage-grid" />
      <div className="halo halo-one" />
      <div className="halo halo-two" />
      <div className="avatar-silhouette">
        <div className="avatar-head" />
        <div className="avatar-neck" />
        <div className="avatar-body" />
      </div>
      <div className="stage-label">
        <span className="small-dot" /> DIGITAL HUMAN CONCEPT
      </div>
      <div className="avatar-caption">
        <span className="eyebrow">MEET YOUR FUTURE HOST</span>
        <h2>
          A warm welcome.
          <br />
          <em>A new experience.</em>
        </h2>
        <p>Static visual placeholder · Avatar rendering planned</p>
      </div>
      <span className="stage-corner">COCO / 01</span>
    </div>
  );
}
