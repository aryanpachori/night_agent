import axios from 'axios'

const explicit = process.env.NEXT_PUBLIC_API_URL?.trim()

/**
 * API origin for the browser.
 * - If `NEXT_PUBLIC_API_URL` is set, axios uses it (must be HTTPS when the site is HTTPS, or browsers block mixed content).
 * - On Vercel, if it is unset, use same-origin `''` so requests go to `/api/*` and `next.config` rewrites proxy to `BACKEND_URL`.
 *   (Uses `NEXT_PUBLIC_VERCEL_DEPLOY` from `next.config` — do not use `process.env.VERCEL` here; it is not inlined for the client.)
 * - Locally, default to the Express dev server.
 */
export const PUBLIC_API_BASE_URL =
  explicit ||
  (process.env.NEXT_PUBLIC_VERCEL_DEPLOY === "1" ? "" : "http://127.0.0.1:4000")

export const api = axios.create({
  baseURL: PUBLIC_API_BASE_URL,
  timeout: 15000,
  headers: { 'Content-Type': 'application/json' },
})

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('nightagent_token')
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      localStorage.removeItem('nightagent_token')
      window.location.href = '/login'
    }
    return Promise.reject(error)
  },
)
