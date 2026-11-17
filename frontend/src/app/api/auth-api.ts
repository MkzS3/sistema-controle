import { apiClient } from './api-client.js';
import type { AuthSessionResponse } from '../auth/types.js';

export const authApi = {
  session: () => apiClient.get<AuthSessionResponse>('/auth/session'),
};
