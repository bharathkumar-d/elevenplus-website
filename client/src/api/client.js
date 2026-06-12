import axios from 'axios';

// In production (GitHub Pages) REACT_APP_API_URL points to the Cloudflare tunnel.
// In development the React dev server proxies /api to localhost:5000.
export const API_BASE = process.env.REACT_APP_API_URL || '';

const api = axios.create({ baseURL: `${API_BASE}/api` });

api.interceptors.request.use(config => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

api.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

export default api;
