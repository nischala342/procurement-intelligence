import { request } from '../../shared/api';
import type { HealthReport } from './types';

export const fetchHealth = async (): Promise<HealthReport> => (await request<HealthReport>({ url: '/health' })).data;
