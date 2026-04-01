export function DeepMoodSvg({ expanded }: { expanded?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={`mood-svg mood-svg--deep${expanded ? " mood-svg--expanded" : ""}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="200" height="200" fill="var(--mood-deep-bg)" />

      {/* Concentric rings breathing */}
      <circle className="deep-ring deep-ring--1" cx="100" cy="100" r="25" fill="none" stroke="var(--mood-deep-ring)" strokeWidth="1" opacity="0.35" />
      <circle className="deep-ring deep-ring--2" cx="100" cy="100" r="45" fill="none" stroke="var(--mood-deep-ring)" strokeWidth="0.8" opacity="0.25" />
      <circle className="deep-ring deep-ring--3" cx="100" cy="100" r="65" fill="none" stroke="var(--mood-deep-ring)" strokeWidth="0.6" opacity="0.18" />
      <circle className="deep-ring deep-ring--4" cx="100" cy="100" r="85" fill="none" stroke="var(--mood-deep-ring)" strokeWidth="0.5" opacity="0.12" />

      {/* Orbiting constellation A (clockwise) */}
      <g className="deep-orbit deep-orbit--cw">
        <circle cx="100" cy="60" r="2.5" fill="var(--mood-deep-dot)" opacity="0.5" />
        <circle cx="135" cy="80" r="1.5" fill="var(--mood-deep-dot)" opacity="0.35" />
        <circle cx="120" cy="55" r="1.8" fill="var(--mood-deep-dot)" opacity="0.4" />
      </g>

      {/* Orbiting constellation B (counter-clockwise) */}
      <g className="deep-orbit deep-orbit--ccw">
        <circle cx="100" cy="140" r="2" fill="var(--mood-deep-dot)" opacity="0.45" />
        <circle cx="65" cy="120" r="1.5" fill="var(--mood-deep-dot)" opacity="0.3" />
        <circle cx="80" cy="145" r="2" fill="var(--mood-deep-dot)" opacity="0.35" />
      </g>

      {/* Scattered particles */}
      <circle className="deep-particle deep-particle--1" cx="30" cy="30" r="1.5" fill="var(--mood-deep-dot)" opacity="0.25" />
      <circle className="deep-particle deep-particle--2" cx="170" cy="40" r="1" fill="var(--mood-deep-dot)" opacity="0.2" />
      <circle className="deep-particle deep-particle--3" cx="25" cy="160" r="1.5" fill="var(--mood-deep-dot)" opacity="0.2" />
      <circle className="deep-particle deep-particle--4" cx="175" cy="170" r="1" fill="var(--mood-deep-dot)" opacity="0.25" />

      {expanded && (
        <>
          <circle className="deep-ring deep-ring--5" cx="100" cy="100" r="95" fill="none" stroke="var(--mood-deep-ring)" strokeWidth="0.4" opacity="0.1" />
          <circle className="deep-particle deep-particle--5" cx="15" cy="100" r="1" fill="var(--mood-deep-dot)" opacity="0.2" />
          <circle className="deep-particle deep-particle--6" cx="185" cy="100" r="1.5" fill="var(--mood-deep-dot)" opacity="0.15" />
          <circle className="deep-particle deep-particle--7" cx="50" cy="15" r="1" fill="var(--mood-deep-dot)" opacity="0.18" />
          <circle className="deep-particle deep-particle--8" cx="150" cy="185" r="1" fill="var(--mood-deep-dot)" opacity="0.18" />
        </>
      )}
    </svg>
  );
}
