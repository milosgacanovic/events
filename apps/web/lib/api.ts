export const apiBase =
  process.env.NEXT_PUBLIC_API_BASE_URL?.replace(/\/$/, "") ?? "http://localhost:13001/api";

export class ApiRequestError extends Error {
  status: number;
  code: string | null;
  retryAfterSeconds: number | null;

  constructor(input: { status: number; code: string | null; retryAfterSeconds: number | null }) {
    super(
      `Request failed: ${input.status}${input.code ? ` (${input.code})` : ""}${
        input.retryAfterSeconds ? ` retry_after=${input.retryAfterSeconds}s` : ""
      }`,
    );
    this.name = "ApiRequestError";
    this.status = input.status;
    this.code = input.code;
    this.retryAfterSeconds = input.retryAfterSeconds;
  }
}

export async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const needsContentType = init?.body != null;
  const response = await fetch(url, {
    ...init,
    headers: {
      ...(needsContentType ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const retryAfterHeader = response.headers.get("Retry-After");
    const retryAfterSeconds = retryAfterHeader ? Number.parseInt(retryAfterHeader, 10) : NaN;
    let code: string | null = null;
    try {
      const body = (await response.clone().json()) as { error?: string };
      if (typeof body.error === "string") {
        code = body.error;
      }
    } catch {
      // ignore non-json errors
    }
    throw new ApiRequestError({
      status: response.status,
      code,
      retryAfterSeconds: Number.isFinite(retryAfterSeconds) ? retryAfterSeconds : null,
    });
  }

  return (await response.json()) as T;
}
