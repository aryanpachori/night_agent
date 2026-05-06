import axios from "axios"

/**
 * Public API base URL.
 * Callers already use `/api/...` paths, so treat `/api` base as empty.
 */
const rawPublicApiBaseUrl = process.env.NEXT_PUBLIC_API_URL?.trim() || ""
export const PUBLIC_API_BASE_URL =
  rawPublicApiBaseUrl === "/api" ? "" : rawPublicApiBaseUrl

export const api = axios.create({
  baseURL: PUBLIC_API_BASE_URL,
  timeout: 30000,
  headers: { "Content-Type": "application/json" },
})

api.interceptors.request.use((config) => {
  // Guard against accidental `/api` base + `/api/...` route concatenation.
  const baseURL = config.baseURL?.replace(/\/+$/, "")
  if (
    typeof config.url === "string" &&
    config.url.startsWith("/api/") &&
    baseURL?.endsWith("/api")
  ) {
    config.url = config.url.replace(/^\/api/, "")
  } else if (
    typeof config.url === "string" &&
    config.url.startsWith("/api/api/")
  ) {
    config.url = config.url.replace(/^\/api/, "")
  }

  if (typeof window !== "undefined") {
    const token = localStorage.getItem("nightagent_token")
    if (token) {
      config.headers.Authorization = `Bearer ${token}`
    }
  }
  return config
})

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== "undefined") {
      localStorage.removeItem("nightagent_token")
      window.location.href = "/login"
    }
    return Promise.reject(error)
  },
)
