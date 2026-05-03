import axios from "axios"

/** Set `NEXT_PUBLIC_API_URL` to your Express API (e.g. same EC2 host: `http://127.0.0.1:4000` behind nginx, or public `https://api.example.com`). */
export const PUBLIC_API_BASE_URL =
  process.env.NEXT_PUBLIC_API_URL?.trim() || "http://127.0.0.1:4000"

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
