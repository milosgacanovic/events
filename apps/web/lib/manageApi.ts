import { apiBase } from "./api";

export async function authorizedFetch<T>(
  getToken: () => Promise<string | null>,
  path: string,
  options?: RequestInit,
): Promise<T> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const url = path.startsWith("http") ? path : `${apiBase}${path}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  };
  if (options?.body) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    ...options,
    headers: {
      ...headers,
      ...(options?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const body = await response.json().catch(() => ({})) as Record<string, unknown>;
    const errorBody = body.error;
    let message: string;
    if (typeof errorBody === "string") {
      message = errorBody;
    } else if (errorBody && typeof errorBody === "object") {
      // Zod flatten: { fieldErrors: {...}, formErrors: [...] }
      const fe = errorBody as { fieldErrors?: Record<string, string[]>; formErrors?: string[] };
      const msgs = [...(fe.formErrors ?? []), ...Object.values(fe.fieldErrors ?? {}).flat()];
      message = msgs.join("; ") || `Request failed: ${response.status}`;
    } else {
      message = `Request failed: ${response.status}`;
    }
    const error = new Error(message);
    (error as unknown as { status: number }).status = response.status;
    throw error;
  }

  if (response.status === 204) return {} as T;
  return (await response.json()) as T;
}

export async function authorizedGet<T>(
  getToken: () => Promise<string | null>,
  path: string,
): Promise<T> {
  return authorizedFetch<T>(getToken, path);
}

export async function authorizedPost<T>(
  getToken: () => Promise<string | null>,
  path: string,
  body: unknown,
): Promise<T> {
  return authorizedFetch<T>(getToken, path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function authorizedPatch<T>(
  getToken: () => Promise<string | null>,
  path: string,
  body: unknown,
): Promise<T> {
  return authorizedFetch<T>(getToken, path, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function authorizedDelete<T>(
  getToken: () => Promise<string | null>,
  path: string,
): Promise<T> {
  return authorizedFetch<T>(getToken, path, { method: "DELETE" });
}

export async function authorizedUpload(
  getToken: () => Promise<string | null>,
  kind: string,
  entityId: string,
  file: File,
): Promise<{ stored_path: string; url: string }> {
  const token = await getToken();
  if (!token) throw new Error("Not authenticated");
  const formData = new FormData();
  formData.append("kind", kind);
  formData.append("entityId", entityId);
  formData.append("file", file);

  const response = await fetch(`${apiBase}/uploads`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.status}`);
  }

  return (await response.json()) as { stored_path: string; url: string };
}
