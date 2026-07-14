const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api';

type ApiRequestOptions = {
  token?: string | null;
  organizationId?: string | null;
  signal?: AbortSignal;
};

export async function apiGet<T>(
  path: string,
  options: ApiRequestOptions = {},
): Promise<T> {
  const headers = new Headers({ Accept: 'application/json' });
  if (options.token) {
    headers.set('Authorization', `Bearer ${options.token}`);
  }
  if (options.organizationId) {
    headers.set('x-organization-id', options.organizationId);
  }

  const response = await fetch(`${API_URL}${path}`, {
    headers,
    signal: options.signal,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as
      | { message?: string | string[] }
      | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(', ')
      : body?.message;
    throw new Error(message ?? `Falha na API (${response.status}).`);
  }

  return (await response.json()) as T;
}

