import { request } from '../../shared/api';
import type { Session } from './types';

export interface SignupPayload {
  email: string;
  password: string;
  organizationName: string;
}
export interface LoginPayload {
  email: string;
  password: string;
}

export const signup = async (p: SignupPayload) => (await request<Session>({ url: '/auth/signup', method: 'POST', data: p })).data;
export const login = async (p: LoginPayload) => (await request<Session>({ url: '/auth/login', method: 'POST', data: p })).data;
export const logout = async () => (await request<{ loggedOut: boolean }>({ url: '/auth/logout', method: 'POST' })).data;
export const fetchMe = async () => (await request<Session>({ url: '/auth/me' })).data;
