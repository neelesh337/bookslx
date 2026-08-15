import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
  timeout: 30000, // 30 second timeout
});

api.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) {
    // Validate token format (JWT format: xxx.yyy.zzz)
    if (!/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)) {
      localStorage.removeItem('token');
      return config;
    }
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => {
    // Validate response structure
    if (!response.data) {
      throw new Error('Invalid response from server');
    }
    return response.data;
  },
  (error) => {
    // Handle network errors
    if (!error.response) {
      console.error('Network error:', error.message);
      return Promise.reject({
        message: 'Network error. Please check your connection.',
        code: 'NETWORK_ERROR',
        status: 0,
      });
    }

    const message = error.response?.data?.message || error.message || 'An unexpected error occurred';
    const code = error.response?.data?.code || 'UNKNOWN_ERROR';
    const status = error.response?.status;

    // Handle 401 Unauthorized - clear token
    if (status === 401) {
      localStorage.removeItem('token');
      localStorage.removeItem('pendingVerificationEmail');
    }

    // Handle 403 Forbidden
    if (status === 403) {
      console.warn('Access denied:', message);
    }

    // Handle 500+ errors
    if (status >= 500) {
      console.error('Server error:', status, message);
    }

    return Promise.reject({ message, code, status });
  }
);
