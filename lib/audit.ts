// /lib/audit.ts
// Helper para registrar mudanças críticas no sistema
// Uso:
//   await audit({ acao: 'product.update', tabela: 'products', registro_id, dados_anteriores, dados_novos, req })
//
// Acoes comuns:
//   product.create, product.update, product.delete
//   product.price_change, product.cost_change, product.stock_change
//   order.status_change, order.cancel
//   listing.sync, listing.update
//   goal.update, cost.create, cost.update
//   auth.login, auth.logout

import { prisma } from './prisma'

export interface AuditInput {
  acao: string
  tabela?: string
  registro_id?: string
  dados_anteriores?: any
  dados_novos?: any
  user_id?: string
  ip_address?: string
  user_agent?: string
  metadata?: any
}

export async function audit(input: AuditInput) {
  try {
    await prisma.audit_log.create({
      data: {
        acao: input.acao,
        tabela: input.tabela,
        registro_id: input.registro_id,
        dados_anteriores: input.dados_anteriores || undefined,
        dados_novos: input.dados_novos
          ? { ...input.dados_novos, ...(input.metadata ? { _meta: input.metadata } : {}) }
          : input.metadata || undefined,
        user_id: input.user_id,
        ip_address: input.ip_address,
        user_agent: input.user_agent,
      },
    })
  } catch (err) {
    // Não bloqueia a operação principal
    console.error('[audit] falhou ao registrar:', err)
  }
}

export function auditFromRequest(req: Request) {
  return {
    ip_address: (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0]?.trim() || undefined,
    user_agent: req.headers.get('user-agent') || undefined,
  }
}
