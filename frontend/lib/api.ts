import axios from 'axios'

/** Inlined at build time (Next.js). Set `NEXT_PUBLIC_API_URL` on Vercel for Production + Preview, then redeploy. */
export const PUBLIC_API_BASE_URL = process.env.NEXT_PUBLIC_API_URL?.trim() || 'http://localhost:4000'

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
