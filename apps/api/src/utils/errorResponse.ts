/**
 * Builds the JSON body for an error response.
 *
 * 5xx messages are masked to a generic "internal_error": raw error strings can
 * leak internal/DB/driver detail (e.g. Postgres `invalid byte sequence for
 * encoding "UTF8": 0x00`). The real message is still logged server-side. Sub-500
 * messages (validation, auth) are intentionally preserved for the client.
 */
export function safeErrorBody(code: number, message: string): { error: string } {
  if (code >= 500) {
    return { error: "internal_error" };
  }
  return { error: message || "internal_error" };
}
