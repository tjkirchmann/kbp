const API = import.meta.env.VITE_API_URL

/**
 * Shared fetch wrapper for the backend API. Prefixes VITE_API_URL, attaches the
 * Bearer token when present, sets a JSON Content-Type for requests with a body,
 * throws `Error(<status>)` on non-2xx, and returns parsed JSON.
 *
 * `token` is nullable so public endpoints can pass `null`; authed callers pass
 * the Clerk token (use `token!` where a token is guaranteed).
 */
export async function apiFetch(token: string | null, path: string, init?: RequestInit) {
  const headers: Record<string, string> = {}
  if (token) headers['Authorization'] = `Bearer ${token}`
  if (init?.body != null) headers['Content-Type'] = 'application/json'
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers: { ...headers, ...init?.headers },
  })
  if (!res.ok) throw new Error(`${res.status}`)
  return res.json()
}
