import axios from "axios"

/** Must be set in Vercel/hosted envs to your backend origin, e.g. `https://api.example.com`. */
const envApiUrl = process.env.NEXT_PUBLIC_API_URL?.trim()

if (!envApiUrl) {
  throw new Error(
    "Missing NEXT_PUBLIC_API_URL. Set it in your deployment environment and redeploy.",
  )
}

export const PUBLIC_API_BASE_URL = envApiUrl

export const api = axios.create({
  baseURL: PUBLIC_API_BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
})

api.interceptors.request.use((config) => {
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
