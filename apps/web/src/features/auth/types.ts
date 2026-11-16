export interface AuthUser {
  id: string;
  email: string;
  organizationName: string;
  tenantId: string;
  createdAt?: string;
}

export interface Session {
  user: AuthUser;
}
