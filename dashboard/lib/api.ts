import axios from 'axios';
import Cookies from 'js-cookie';

// Same-origin: in production the dashboard and the API live on the same
// Vercel deployment, so an empty baseURL means requests go to /api/* on the
// current host. NEXT_PUBLIC_API_URL is honored only as an explicit override
// (e.g. when pointing the dev dashboard at a remote API).
const api = axios.create({
  baseURL: process.env.NEXT_PUBLIC_API_URL || '',
});

api.interceptors.request.use((config) => {
  const token = Cookies.get('token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      Cookies.remove('token');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
