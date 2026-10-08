// /lib/comissoes.ts
// Helper centralizado pra cálculo de comissões por plataforma/tipo de venda
//
// Mercado Livre (atualizado jun/2026):
// - Tarifa fixa de R$6,55 para produtos abaixo de R$78,90 (regra do ML)
// - 12% pros 3 modelos (Full / Agência / Clássico) acima de R$78,90
//
// IMPORTANTE: prefere SEMPRE o valor REAL de recebimento do ML (transaction_amount)
// quando disponível. A % estimada aqui é fallback pra orders novas/legado.

export const COMISSOES_PADRAO: Record<string, number> = {
  mercado_livre_classico: 0.12,
  mercado_livre_agencia: 0.12,
  mercado_livre_full: 0.12,
  shopee: 0.14,
  site_b2c: 0.04,
  whatsapp: 0,
  b2b: 0.05,
  vendedora: 0,
}

/**
 * Limite de preço pra tarifa fixa do ML (atualizado 2026)
 * Abaixo desse valor → R$6,55 fixo
 * Acima → 12% (ou 13%/17% pra Premium)
 */
export const ML_TARIFA_FIXA_LIMITE = 78.90
export const ML_TARIFA_FIXA_VALOR = 6.55

/**
 * Detecta o tipo de venda ML baseado nos dados do listing/item
 */
export function detectarTipoML(item: {
  listing?: { envio_full?: boolean | null; listing_type?: string | null } | null
}): 'classico' | 'agencia' | 'full' {
  if (item.listing?.envio_full) return 'full'
  const lt = item.listing?.listing_type || ''
  if (lt === 'gold_pro' || lt === 'gold_special') return 'agencia'
  return 'classico'
}

/**
 * Retorna a comissão ML baseado no tipo detectado
 */
export function comissaoML(item: { listing?: { envio_full?: boolean | null; listing_type?: string | null } | null }): number {
  const tipo = detectarTipoML(item)
  if (tipo === 'full') return COMISSOES_PADRAO.mercado_livre_full
  if (tipo === 'agencia') return COMISSOES_PADRAO.mercado_livre_agencia
  return COMISSOES_PADRAO.mercado_livre_classico
}

/**
 * Calcula comissão em R$ baseada no preço do produto
 * - Preço < R$78,90 → R$6,55 fixo (tarifa mínima do ML)
 * - Preço >= R$78,90 → % do tipo (12% padrão)
 */
export function calcularComissaoMLValor(
  precoUnitario: number,
  tipo: 'classico' | 'agencia' | 'full'
): { valor: number; taxa: number; tarifa_fixa: boolean } {
  if (precoUnitario < ML_TARIFA_FIXA_LIMITE) {
    return { valor: ML_TARIFA_FIXA_VALOR, taxa: 0, tarifa_fixa: true }
  }
  const taxa = comissaoML({ listing: { envio_full: tipo === 'full', listing_type: tipo === 'agencia' ? 'gold_pro' : '' } })
  return { valor: precoUnitario * taxa, taxa, tarifa_fixa: false }
}

/**
 * Calcula comissão baseada em origem + dados do item (pra ML detecta tipo)
 */
export function calcularComissao(opts: {
  origem: string
  valor: number
  item?: { listing?: { envio_full?: boolean | null; listing_type?: string | null } | null } | null
  comissao_salva?: number | null
}): { taxa: number; valor: number; tipo?: string } {
  // Se já tem comissão salva no order, usa ela
  if (opts.comissao_salva && opts.comissao_salva > 0) {
    return { taxa: opts.comissao_salva / Math.max(opts.valor, 1), valor: opts.comissao_salva }
  }

  // Mercado Livre com regra de tarifa fixa
  if (opts.origem === 'mercado_livre') {
    const tipo = detectarTipoML(opts.item)
    const r = calcularComissaoMLValor(opts.valor, tipo)
    return { taxa: r.tarifa_fixa ? 0 : r.taxa, valor: r.valor, tipo }
  }

  let taxa = 0
  let tipo: string | undefined

  switch (opts.origem) {
    case 'shopee':
      taxa = COMISSOES_PADRAO.shopee
      break
    case 'site_b2c':
      taxa = COMISSOES_PADRAO.site_b2c
      break
    case 'b2b':
      taxa = COMISSOES_PADRAO.b2b
      break
    case 'whatsapp':
    case 'vendedora':
      taxa = 0
      break
  }

  return { taxa, valor: opts.valor * taxa, tipo }
}

/**
 * Label legível do tipo de venda ML
 */
export function labelTipoML(tipo: string): string {
  if (tipo === 'full') return 'Full (depósito ML)'
  if (tipo === 'agencia') return 'Agência (envio seu)'
  return 'Clássico (Mercado Envios)'
}

/**
 * Cor do tipo de venda ML (pra UI)
 */
export function corTipoML(tipo: string): string {
  if (tipo === 'full') return '#3b82f6'
  if (tipo === 'agencia') return '#10b981'
  return '#9ca3af'
}
