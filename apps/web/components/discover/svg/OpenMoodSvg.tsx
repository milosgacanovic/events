export function OpenMoodSvg({ expanded }: { expanded?: boolean }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={`mood-svg mood-svg--open${expanded ? " mood-svg--expanded" : ""}`}
      preserveAspectRatio="xMidYMid slice"
    >
      <rect width="200" height="200" fill="var(--mood-open-bg)" />

      {/* Warm center glow */}
      <defs>
        <radialGradient id="open-glow" cx="50%" cy="50%" r="40%">
          <stop offset="0%" stopColor="var(--mood-open-glow)" stopOpacity="0.4" />
          <stop offset="100%" stopColor="var(--mood-open-glow)" stopOpacity="0" />
        </radialGradient>
      </defs>
      <circle className="open-glow" cx="100" cy="100" r="80" fill="url(#open-glow)" />

      {/* Rays pulsing in brightness */}
      <line className="open-ray open-ray--1" x1="100" y1="100" x2="100" y2="20" stroke="var(--mood-open-ray)" strokeWidth="1.2" opacity="0.2" strokeLinecap="round" />
      <line className="open-ray open-ray--2" x1="100" y1="100" x2="160" y2="40" stroke="var(--mood-open-ray)" strokeWidth="1" opacity="0.18" strokeLinecap="round" />
      <line className="open-ray open-ray--3" x1="100" y1="100" x2="180" y2="100" stroke="var(--mood-open-ray)" strokeWidth="1.2" opacity="0.2" strokeLinecap="round" />
      <line className="open-ray open-ray--4" x1="100" y1="100" x2="160" y2="160" stroke="var(--mood-open-ray)" strokeWidth="1" opacity="0.18" strokeLinecap="round" />
      <line className="open-ray open-ray--5" x1="100" y1="100" x2="100" y2="180" stroke="var(--mood-open-ray)" strokeWidth="1.2" opacity="0.2" strokeLinecap="round" />
      <line className="open-ray open-ray--6" x1="100" y1="100" x2="40" y2="160" stroke="var(--mood-open-ray)" strokeWidth="1" opacity="0.18" strokeLinecap="round" />
      <line className="open-ray open-ray--7" x1="100" y1="100" x2="20" y2="100" stroke="var(--mood-open-ray)" strokeWidth="1.2" opacity="0.2" strokeLinecap="round" />
      <line className="open-ray open-ray--8" x1="100" y1="100" x2="40" y2="40" stroke="var(--mood-open-ray)" strokeWidth="1" opacity="0.18" strokeLinecap="round" />

      {/* Floating dots on curved paths */}
      <circle className="open-dot open-dot--1" cx="60" cy="50" r="2.5" fill="var(--mood-open-dot)" opacity="0.4" />
      <circle className="open-dot open-dot--2" cx="145" cy="65" r="2" fill="var(--mood-open-dot)" opacity="0.35" />
      <circle className="open-dot open-dot--3" cx="55" cy="140" r="2" fill="var(--mood-open-dot)" opacity="0.3" />
      <circle className="open-dot open-dot--4" cx="150" cy="145" r="2.5" fill="var(--mood-open-dot)" opacity="0.35" />

      {/* Dashed orbital arcs */}
      <path
        className="open-arc open-arc--1"
        d="M60 40 A60 60 0 0 1 160 60"
        fill="none"
        stroke="var(--mood-open-ray)"
        strokeWidth="0.8"
        strokeDasharray="4 6"
        opacity="0.2"
      />
      <path
        className="open-arc open-arc--2"
        d="M140 160 A60 60 0 0 1 40 140"
        fill="none"
        stroke="var(--mood-open-ray)"
        strokeWidth="0.8"
        strokeDasharray="4 6"
        opacity="0.2"
      />

      {expanded && (
        <>
          <circle className="open-dot open-dot--5" cx="30" cy="100" r="1.5" fill="var(--mood-open-dot)" opacity="0.25" />
          <circle className="open-dot open-dot--6" cx="170" cy="100" r="1.5" fill="var(--mood-open-dot)" opacity="0.25" />
          <line className="open-ray open-ray--9" x1="100" y1="100" x2="130" y2="25" stroke="var(--mood-open-ray)" strokeWidth="0.8" opacity="0.15" strokeLinecap="round" />
          <line className="open-ray open-ray--10" x1="100" y1="100" x2="70" y2="175" stroke="var(--mood-open-ray)" strokeWidth="0.8" opacity="0.15" strokeLinecap="round" />
        </>
      )}
    </svg>
  );
}
