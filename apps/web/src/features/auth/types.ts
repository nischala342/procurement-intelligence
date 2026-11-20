export interface AuthUser {
  id: string;
  email: string;
  organizationName: string;
  tenantId: string;
  /** ISO 4217 code all amounts are reported in for this organization (e.g. GBP). */
  baseCurrency?: string;
  country?: string | null;
  createdAt?: string;
}

export interface Session {
  user: AuthUser;
}
