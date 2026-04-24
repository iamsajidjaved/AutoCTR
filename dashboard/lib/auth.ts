import Cookies from 'js-cookie';
import api from './api';

const COOKIE_OPTIONS = { expires: 7, sameSite: 'strict' as const };

export async function login(email: string, password: string): Promise<void> {
  const res = await api.post('/api/auth/login', { email, password });
  Cookies.set('token', res.data.token, COOKIE_OPTIONS);
}

export async function register(email: string, password: string): Promise<void> {
  const res = await api.post('/api/auth/register', { email, password });
  Cookies.set('token', res.data.token, COOKIE_OPTIONS);
}

export function logout(): void {
  Cookies.remove('token');
  window.location.href = '/login';
}

export function getToken(): string | undefined {
  return Cookies.get('token');
}
