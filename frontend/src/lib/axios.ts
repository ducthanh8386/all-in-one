/**
 * Axios instance with interceptors for JWT token handling
 * TODO: Implement token refresh logic in Phase 1
 */

import axios from 'axios'

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:8000'

const axiosInstance = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
})

// TODO: Add request interceptor (attach JWT token)
// TODO: Add response interceptor (handle 401, auto-refresh)

export default axiosInstance
