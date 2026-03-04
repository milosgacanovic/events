export function scrollToTopFast(durationMs = 160): void {
  if (typeof window === "undefined") {
    return;
  }

  const startY = window.scrollY;
  if (startY <= 0) {
    return;
  }

  if (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches) {
    window.scrollTo(0, 0);
    return;
  }

  const startTs = performance.now();
  const step = (timestamp: number) => {
    const progress = Math.min((timestamp - startTs) / durationMs, 1);
    const eased = 1 - (1 - progress) ** 3;
    window.scrollTo(0, Math.round(startY * (1 - eased)));
    if (progress < 1) {
      requestAnimationFrame(step);
    }
  };

  requestAnimationFrame(step);
}
