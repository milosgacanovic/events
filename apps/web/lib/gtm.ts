export function pushDataLayer(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).dataLayer = (window as any).dataLayer || [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (window as any).dataLayer.push(payload);
}
