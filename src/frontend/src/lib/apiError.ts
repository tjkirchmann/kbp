/**
 * Error thrown by service fetch helpers when the API responds non-2xx.
 * Carries the HTTP status so consumers (query retry logic, per-field error
 * messages) can branch on it without parsing message strings.
 */
export class ApiError extends Error {
  status: number

  constructor(status: number) {
    super(`Request failed with status ${status}`)
    this.name = 'ApiError'
    this.status = status
  }
}
