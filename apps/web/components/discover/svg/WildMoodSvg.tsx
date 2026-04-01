export function WildMoodSvg({ expanded }: { expanded?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={`mood-svg mood-svg--wild${expanded ? " mood-svg--expanded" : ""}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="200" height="200" fill="var(--mood-wild-bg)" />

      {/* Vertical strokes rising from bottom */}
      <line className="wild-stroke wild-stroke--1" x1="30" y1="200" x2="30" y2="80" stroke="var(--mood-wild-stroke1)" strokeWidth="2.5" opacity="0.35" strokeLinecap="round" />
      <line className="wild-stroke wild-stroke--2" x1="60" y1="200" x2="60" y2="60" stroke="var(--mood-wild-stroke2)" strokeWidth="2" opacity="0.3" strokeLinecap="round" />
      <line className="wild-stroke wild-stroke--3" x1="95" y1="200" x2="95" y2="50" stroke="var(--mood-wild-stroke1)" strokeWidth="3" opacity="0.25" strokeLinecap="round" />
      <line className="wild-stroke wild-stroke--4" x1="130" y1="200" x2="130" y2="70" stroke="var(--mood-wild-stroke2)" strokeWidth="2" opacity="0.35" strokeLinecap="round" />
      <line className="wild-stroke wild-stroke--5" x1="165" y1="200" x2="165" y2="55" stroke="var(--mood-wild-stroke1)" strokeWidth="2.5" opacity="0.3" strokeLinecap="round" />

      {/* Spark dots wandering */}
      <circle className="wild-spark wild-spark--1" cx="45" cy="65" r="2" fill="var(--mood-wild-spark)" opacity="0.6" />
      <circle className="wild-spark wild-spark--2" cx="110" cy="45" r="2.5" fill="var(--mood-wild-spark)" opacity="0.5" />
      <circle className="wild-spark wild-spark--3" cx="155" cy="75" r="1.8" fill="var(--mood-wild-spark)" opacity="0.55" />
      <circle className="wild-spark wild-spark--4" cx="75" cy="55" r="1.5" fill="var(--mood-wild-spark)" opacity="0.45" />

      {/* Dashed flow lines */}
      <path
        className="wild-flow wild-flow--1"
        d="M10 90 Q50 70 100 85 T190 65"
        fill="none"
        stroke="var(--mood-wild-stroke2)"
        strokeWidth="1"
        strokeDasharray="6 4"
        opacity="0.3"
      />
      <path
        className="wild-flow wild-flow--2"
        d="M0 110 Q60 95 130 105 T200 88"
        fill="none"
        stroke="var(--mood-wild-stroke1)"
        strokeWidth="0.8"
        strokeDasharray="4 6"
        opacity="0.25"
      />

      {expanded && (
        <>
          <line className="wild-stroke wild-stroke--6" x1="15" y1="200" x2="15" y2="100" stroke="var(--mood-wild-stroke2)" strokeWidth="1.5" opacity="0.2" strokeLinecap="round" />
          <line className="wild-stroke wild-stroke--7" x1="185" y1="200" x2="185" y2="90" stroke="var(--mood-wild-stroke1)" strokeWidth="1.5" opacity="0.2" strokeLinecap="round" />
          <circle className="wild-spark wild-spark--5" cx="25" cy="90" r="1.5" fill="var(--mood-wild-spark)" opacity="0.4" />
          <circle className="wild-spark wild-spark--6" cx="180" cy="50" r="2" fill="var(--mood-wild-spark)" opacity="0.35" />
        </>
      )}
    </svg>
  );
}
