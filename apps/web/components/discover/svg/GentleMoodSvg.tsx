export function GentleMoodSvg({ expanded }: { expanded?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={`mood-svg mood-svg--gentle${expanded ? " mood-svg--expanded" : ""}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="200" height="200" fill="var(--mood-gentle-bg)" />

      {/* Layered wave shapes */}
      <path
        className="gentle-wave gentle-wave--1"
        d="M0 130 Q25 115 50 125 T100 120 T150 128 T200 118 V200 H0Z"
        fill="var(--mood-gentle-wave1)"
        opacity="0.3"
      />
      <path
        className="gentle-wave gentle-wave--2"
        d="M0 145 Q30 130 60 140 T120 135 T180 142 T200 132 V200 H0Z"
        fill="var(--mood-gentle-wave2)"
        opacity="0.25"
      />
      <path
        className="gentle-wave gentle-wave--3"
        d="M0 160 Q35 148 70 155 T140 150 T200 158 V200 H0Z"
        fill="var(--mood-gentle-wave3)"
        opacity="0.2"
      />

      {/* Floating dots rising upward */}
      <circle className="gentle-dot gentle-dot--1" cx="40" cy="100" r="2" fill="var(--mood-gentle-dot)" opacity="0.5" />
      <circle className="gentle-dot gentle-dot--2" cx="95" cy="110" r="1.5" fill="var(--mood-gentle-dot)" opacity="0.4" />
      <circle className="gentle-dot gentle-dot--3" cx="150" cy="95" r="2.5" fill="var(--mood-gentle-dot)" opacity="0.35" />
      <circle className="gentle-dot gentle-dot--4" cx="120" cy="80" r="1.5" fill="var(--mood-gentle-dot)" opacity="0.45" />
      <circle className="gentle-dot gentle-dot--5" cx="65" cy="70" r="2" fill="var(--mood-gentle-dot)" opacity="0.3" />

      {/* Thin flowing lines */}
      <path
        className="gentle-flow gentle-flow--1"
        d="M10 60 Q50 45 100 55 T190 48"
        fill="none"
        stroke="var(--mood-gentle-stroke)"
        strokeWidth="0.8"
        opacity="0.3"
      />
      <path
        className="gentle-flow gentle-flow--2"
        d="M0 40 Q60 30 120 38 T200 32"
        fill="none"
        stroke="var(--mood-gentle-stroke)"
        strokeWidth="0.6"
        opacity="0.25"
      />

      {/* Extra detail for expanded state */}
      {expanded && (
        <>
          <circle className="gentle-dot gentle-dot--6" cx="25" cy="50" r="1.5" fill="var(--mood-gentle-dot)" opacity="0.3" />
          <circle className="gentle-dot gentle-dot--7" cx="175" cy="60" r="2" fill="var(--mood-gentle-dot)" opacity="0.25" />
          <circle className="gentle-dot gentle-dot--8" cx="80" cy="35" r="1" fill="var(--mood-gentle-dot)" opacity="0.35" />
          <path
            className="gentle-flow gentle-flow--3"
            d="M20 80 Q70 68 130 75 T200 70"
            fill="none"
            stroke="var(--mood-gentle-stroke)"
            strokeWidth="0.5"
            opacity="0.2"
          />
        </>
      )}
    </svg>
  );
}
