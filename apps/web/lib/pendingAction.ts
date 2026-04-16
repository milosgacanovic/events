import { z } from "zod";

const STORAGE_KEY = "pending_gated_action";

const pendingActionSchema = z.object({
  action: z.enum(["save_event", "follow_host", "rsvp_event"]),
  payload: z.record(z.string()),
});

export type PendingAction = z.infer<typeof pendingActionSchema>;

export function setPendingAction(action: PendingAction): void {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(action));
  } catch {
    // storage unavailable — silent fail, action just won't auto-execute
  }
}

export function getPendingAction(): PendingAction | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = pendingActionSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function clearPendingAction(): void {
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {}
}
