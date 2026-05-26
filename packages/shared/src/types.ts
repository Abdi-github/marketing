// Base type — extended with `role` by @marketing/tenancy.
// Use @marketing/tenancy#TenantContext for the full type in application code.
export type TenantContext = {
  tenantId: string;
  userId: string;
};

export type Pagination = {
  limit: number;
  offset: number;
};

export type PaginatedResult<T> = {
  data: T[];
  total: number;
  limit: number;
  offset: number;
};
