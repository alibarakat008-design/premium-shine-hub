/**
 * Shopee API client stub
 * A função real está em /app/api/shopee/auth/route.ts
 * Esse arquivo é só pra satisfazer o type-check
 */

export async function shopeeFetch(
  accountId: string,
  path: string,
  options?: {
    method?: string
    body?: any
    params?: Record<string, string | number>
    query?: Record<string, string | number>
  }
): Promise<any> {
  // Implementação real está no auth route
  // Esse stub é só pra resolver a dependência de tipos
  return Promise.resolve({})
}
