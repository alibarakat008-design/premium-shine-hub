// Helper centralizado pra buscar o CUSTO de um produto num CANAL específico.
//
// Por que existe: as APIs faziam `product_prices: { take: 1 }` que pega o
// PRIMEIRO product_price do produto (não necessariamente o do canal certo).
// Como cada produto pode ter preços pra ML, Shopee, B2C, B2B — pegar
// qualquer um dá resultado errado.
//
// Estratégia:
// 1. Tenta o product_prices EXATO do canal pedido
// 2. Se não existir, pega QUALQUER product_prices do produto (não fica 0)
// 3. Se não existir nenhum, retorna 0
//
// Útil em DRE, Mix de Canais, Vendas ao Vivo, Lucro Real, Conciliação, etc.

import { prisma } from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export type CanalVenda = 'mercado_livre' | 'shopee' | 'site_b2c' | 'b2b' | 'whatsapp' | 'vendedora' | string

/**
 * Retorna Map<productId, custo> com o custo do CANAL pedido pra cada produto.
 * Fallback: usa o custo de QUALQUER product_price se o do canal não existir.
 */
export async function getCustosByCanal(
  productIds: string[],
  canal: CanalVenda
): Promise<Map<string, number>> {
  const map = new Map<string, number>()
  if (productIds.length === 0) return map

  // 1) Pega todos os product_prices pra esses produtos
  const allPrices = await prisma.product_prices.findMany({
    where: { product_id: { in: productIds } },
    select: { product_id: true, canal: true, custo: true },
  })

  // 2) Agrupa por product_id
  const byProduct = new Map<string, typeof allPrices>()
  for (const p of allPrices) {
    if (!byProduct.has(p.product_id)) byProduct.set(p.product_id, [])
    byProduct.get(p.product_id)!.push(p)
  }

  // 3) Pra cada produto, prioriza o do canal; fallback pra qualquer um
  for (const pid of productIds) {
    const prices = byProduct.get(pid) || []
    const doCanal = prices.find((p) => p.canal === canal)
    const qualquer = prices[0]
    const custo = doCanal?.custo ?? qualquer?.custo ?? 0
    map.set(pid, Number(custo))
  }
  return map
}

/**
 * Versão inline: recebe uma lista de products com product_prices já carregados
 * (pra usar com includes do Prisma sem segunda query).
 */
export function pickCusto(
  productPrices: { canal: string; custo: any }[] | null | undefined,
  canal: CanalVenda
): number {
  if (!productPrices || productPrices.length === 0) return 0
  const doCanal = productPrices.find((p) => p.canal === canal)
  if (doCanal) return Number(doCanal.custo || 0)
  return Number(productPrices[0]?.custo || 0)
}
