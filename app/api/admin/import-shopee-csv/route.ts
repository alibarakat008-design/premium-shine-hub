/**
 * Importa vendas Shopee via CSV/XLSX exportado do Seller Center
 *
 * POST /api/admin/import-shopee-csv
 * Body: multipart/form-data com field "file" (CSV ou XLSX)
 *
 * Aceita os formatos mais comuns de export do Shopee Seller Center:
 *   - "Vendas/Meus Pedidos" (CSV)
 *   - "Finanças/Minha Renda/Pedidos Completos" (XLSX)
 *
 * Mapeamento automático de colunas (tenta várias variações PT/EN)
 *
 * Retorna: { ok, total_linhas, processados, criados, atualizados, erros, amostra }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import * as XLSX from 'xlsx'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

// ============================================================================
// MAPEAMENTO DE COLUNAS — várias variações PT/EN/PT-BR
// ============================================================================
const COL_MAP: Record<string, string[]> = {
  order_number: [
    'ID do Pedido', 'ID Pedido', 'Número do Pedido', 'Numero do Pedido', 'Order ID', 'OrderID',
    'id_pedido', 'idPedido', 'order_id', 'orderId', 'Pedido',
  ],
  status: ['Status do Pedido', 'Status', 'Estado', 'Situação', 'Order Status'],
  data_pedido: [
    'Data do Pedido', 'Data Pedido', 'Data da Criação', 'Data de Criação', 'Data',
    'Order Date', 'Created At', 'Data Pedido', 'Horário do pedido',
  ],
  data_pagamento: ['Data do Pagamento', 'Data Pagamento', 'Payment Date', 'Pago em'],
  data_envio: ['Data de Envio', 'Data Envio', 'Ship Date', 'Envio'],
  data_entrega: ['Data de Entrega', 'Data Entrega', 'Delivery Date', 'Entrega'],
  // Cliente
  cliente_nome: ['Nome do Comprador', 'Nome do Cliente', 'Comprador', 'Cliente', 'Buyer Name', 'Buyer', 'Nome'],
  cliente_username: ['Nome de Usuário do Comprador', 'Username do Comprador', 'Username', 'User', 'Shopee ID'],
  cliente_telefone: [
    'Número de Telefone', 'Telefone', 'Phone', 'Phone Number', 'Celular', 'Tel',
  ],
  cliente_email: ['Email do Comprador', 'Email', 'E-mail'],
  cliente_cpf: ['CPF', 'CNPJ', 'Tax ID', 'Documento'],
  // Endereço
  endereco_completo: [
    'Endereço de Entrega', 'Endereço', 'Endereço do Comprador', 'Shipping Address',
    'Endereço completo', 'Delivery Address', 'Address',
  ],
  endereco_rua: ['Rua', 'Logradouro', 'Street'],
  endereco_numero: ['Número', 'Numero', 'Number'],
  endereco_complemento: ['Complemento', 'Complement'],
  endereco_bairro: ['Bairro', 'Distrito', 'Neighborhood', 'District'],
  endereco_cidade: ['Cidade', 'City'],
  endereco_estado: ['Estado', 'Província', 'State', 'Province'],
  endereco_cep: ['CEP', 'Código Postal', 'Zip Code', 'Postal Code'],
  endereco_pais: ['País', 'Country'],
  // Produto
  produto_nome: [
    'Nome do Produto', 'Produto', 'Item Name', 'Product Name', 'Item', 'Product',
    'Nome do Item', 'Título',
  ],
  produto_sku: [
    'SKU', 'SKU do Produto', 'SKU Pai', 'Variation SKU', 'Referência', 'Codigo',
    'Parent SKU', 'Item SKU',
  ],
  quantidade: ['Quantidade', 'Qtd', 'Quantity', 'Qty'],
  preco_unitario: [
    'Preço Unitário', 'Preço do Produto', 'Preço', 'Unit Price', 'Price',
    'Preço Original', 'Preço Pago',
  ],
  // Totais
  subtotal: ['Subtotal', 'Sub Total', 'Sub-Total'],
  frete_valor: ['Frete', 'Valor do Frete', 'Shipping Fee', 'Shipping Cost', 'Frete Pago'],
  total: ['Total do Pedido', 'Total', 'Order Total', 'Total Pago', 'Valor Total'],
  // Envio
  transportadora: ['Transportadora', 'Logística', 'Carrier', 'Shipping Provider', 'Courier'],
  codigo_rastreio: ['Código de Rastreio', 'Rastreio', 'Tracking Number', 'Tracking Code', 'Tracking'],
  metodo_envio: ['Método de Envio', 'Método de Envío', 'Shipping Method', 'Delivery Method'],
}

// Normaliza nome da coluna pra matching
function normalizeColName(s: string): string {
  return String(s || '').toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9]/g, '')
}

// Cria mapa reverso: coluna normalizada → field
const NORMALIZED_MAP: Record<string, string> = {}
for (const [field, aliases] of Object.entries(COL_MAP)) {
  for (const alias of aliases) {
    NORMALIZED_MAP[normalizeColName(alias)] = field
  }
}

function mapRow(rawRow: any): any {
  const out: any = {}
  for (const [key, value] of Object.entries(rawRow)) {
    const field = NORMALIZED_MAP[normalizeColName(key)]
    if (field) out[field] = value
  }
  return out
}

// ============================================================================
// PARSERS
// ============================================================================
function parseSpreadsheet(buffer: Buffer, filename: string): any[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = wb.SheetNames[0]
  const sheet = wb.Sheets[sheetName]
  return XLSX.utils.sheet_to_json(sheet, { defval: '' })
}

// ============================================================================
// HELPERS
// ============================================================================
function num(v: any): number {
  if (v === null || v === undefined || v === '') return 0
  const s = String(v).replace(/[^\d,.-]/g, '').replace(',', '.')
  const n = Number(s)
  return isNaN(n) ? 0 : n
}

function date(v: any): Date | null {
  if (!v) return null
  // Tenta DD/MM/YYYY primeiro (formato BR)
  if (typeof v === 'string') {
    const s = v.trim()
    // DD/MM/YYYY HH:mm:ss
    let m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:\s+(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?)?$/)
    if (m) {
      const [, dd, mm, yyyy, hh, mi, ss] = m
      return new Date(Number(yyyy), Number(mm) - 1, Number(dd), Number(hh || 0), Number(mi || 0), Number(ss || 0))
    }
    // YYYY-MM-DD
    m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/)
    if (m) {
      return new Date(s)
    }
  }
  // Excel serial number
  if (typeof v === 'number' && v > 25569) {
    return new Date((v - 25569) * 86400 * 1000)
  }
  const d = new Date(v)
  return isNaN(d.getTime()) ? null : d
}

function statusShopeeToInternal(status: string): string {
  const s = String(status || '').toLowerCase()
  if (s.includes('cancel')) return 'cancelado'
  if (s.includes('entregue') || s.includes('completed') || s.includes('concluído') || s.includes('concluido')) return 'entregue'
  if (s.includes('enviad') || s.includes('shipped')) return 'enviado'
  if (s.includes('separad') || s.includes('to ship') || s.includes('ready')) return 'separado'
  if (s.includes('pago') || s.includes('paid') || s.includes('confirmad') || s.includes('a enviar') || s.includes('to process')) return 'confirmado'
  return 'pendente'
}

function buildAddress(row: any): any {
  if (row.endereco_completo) {
    return { completo: String(row.endereco_completo).trim() }
  }
  const parts = [
    row.endereco_rua,
    row.endereco_numero && `nº ${row.endereco_numero}`,
    row.endereco_complemento,
    row.endereco_bairro,
    row.endereco_cidade,
    row.endereco_estado,
    row.endereco_cep,
    row.endereco_pais,
  ].filter(Boolean)
  if (parts.length === 0) return null
  return { completo: parts.join(', ') }
}

// ============================================================================
// UPSERT CUSTOMER
// ============================================================================
async function upsertCustomer(row: any, companyId: string): Promise<string | null> {
  const nome = String(row.cliente_nome || row.cliente_username || '').trim()
  if (!nome) return null

  // Tenta achar existente por (telefone) ou (nome+email) ou (nome)
  let existing: any = null
  const tel = String(row.cliente_telefone || '').replace(/\D/g, '')
  if (tel && tel.length >= 8) {
    const found = await prisma.customers.findFirst({
      where: { telefone: { contains: tel.slice(-8) } },
      select: { id: true },
    })
    if (found) existing = found
  }
  if (!existing && row.cliente_email) {
    const found = await prisma.customers.findFirst({
      where: { email: row.cliente_email },
      select: { id: true },
    })
    if (found) existing = found
  }
  if (!existing) {
    const found = await prisma.customers.findFirst({
      where: { nome: { equals: nome, mode: 'insensitive' } },
      select: { id: true },
    })
    if (found) existing = found
  }

  const endereco = buildAddress(row)
  const data: any = {
    nome,
    telefone: row.cliente_telefone || null,
    email: row.cliente_email || null,
    cpf: row.cliente_cpf || null,
    enderecos: endereco ? [endereco] : undefined,
    origem_lead: 'shopee',
    updated_at: new Date(),
  }

  if (existing) {
    await prisma.customers.update({ where: { id: existing.id }, data })
    return existing.id
  }
  const created = await prisma.customers.create({
    data: { ...data, total_pedidos: 0, total_gasto: 0 },
  })
  return created.id
}

// ============================================================================
// MAIN HANDLER
// ============================================================================
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const companyId = (formData.get('company_id') as string) || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
    const dryRun = formData.get('dry_run') === 'true'

    if (!file) {
      return NextResponse.json({ ok: false, error: 'Arquivo não enviado (field "file")' }, { status: 400 })
    }

    const buffer = Buffer.from(await file.arrayBuffer())
    const filename = file.name || 'planilha.csv'

    // Parseia
    let rawRows: any[] = []
    try {
      rawRows = parseSpreadsheet(buffer, filename)
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: `Erro ao parsear planilha: ${e.message}` }, { status: 400 })
    }

    if (rawRows.length === 0) {
      return NextResponse.json({ ok: false, error: 'Planilha vazia ou sem dados' }, { status: 400 })
    }

    // Mapeia colunas
    const rows = rawRows.map(mapRow).filter((r: any) => r.order_number)

    // Detecta colunas reconhecidas
    const camposReconhecidos = new Set<string>()
    for (const r of rows) Object.keys(r).forEach(k => camposReconhecidos.add(k))

    // Conta total de pedidos únicos
    const orderNumbers = new Set<string>()
    for (const r of rows) {
      const on = String(r.order_number || '').trim()
      if (on) orderNumbers.add(on)
    }

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dry_run: true,
        total_linhas_raw: rawRows.length,
        linhas_reconhecidas: rows.length,
        pedidos_unicos: orderNumbers.size,
        campos_reconhecidos: Array.from(camposReconhecidos),
        campos_faltando: ['status', 'data_pedido', 'cliente_nome', 'produto_nome', 'quantidade', 'preco_unitario', 'total']
          .filter(c => !camposReconhecidos.has(c)),
        amostra_3_linhas: rows.slice(0, 3),
      })
    }

    // Processa cada pedido
    let criados = 0
    let atualizados = 0
    const erros: string[] = []
    const clientesNovos: string[] = []
    const customersCache = new Map<string, string>() // chave → customer_id

    // Agrupa rows por pedido (1 pedido pode ter N itens)
    const porPedido = new Map<string, any[]>()
    for (const r of rows) {
      const on = String(r.order_number).trim()
      if (!porPedido.has(on)) porPedido.set(on, [])
      porPedido.get(on)!.push(r)
    }

    for (const [orderNumber, items] of porPedido.entries()) {
      try {
        const first = items[0]
        const orderId = String(orderNumber).trim()

        // Upsert customer
        let customerId: string | null = null
        const cacheKey = String(first.cliente_telefone || first.cliente_email || first.cliente_nome || '').trim()
        if (cacheKey && customersCache.has(cacheKey)) {
          customerId = customersCache.get(cacheKey)!
        } else {
          customerId = await upsertCustomer(first, companyId)
          if (customerId && cacheKey) customersCache.set(cacheKey, customerId)
          if (customerId && !clientesNovos.includes(customerId)) clientesNovos.push(customerId)
        }

        // Calcula totais
        const subtotal = items.reduce((s, i) => s + num(i.preco_unitario) * num(i.quantidade), 0)
        const total = num(first.total) || subtotal + num(first.frete_valor)
        const frete = num(first.frete_valor)
        const endereco = buildAddress(first)

        // Status
        const status = statusShopeeToInternal(String(first.status || ''))
        const dataPedido = date(first.data_pedido)
        const dataPagamento = date(first.data_pagamento) || dataPedido
        const dataEnvio = date(first.data_envio)
        const dataEntrega = date(first.data_entrega)

        // Verifica se já existe
        const existingOrder = await prisma.orders.findUnique({
          where: { order_number: orderId },
          select: { id: true, customer_id: true },
        })

        const orderData: any = {
          order_number: orderId,
          origem: 'shopee',
          company_id: companyId,
          status,
          subtotal: subtotal || 0,
          total: total || 0,
          frete: frete,
          endereco_entrega: endereco,
          codigo_rastreio: String(first.codigo_rastreio || '').trim() || null,
          transportadora: String(first.transportadora || '').trim() || null,
          pago_em: dataPagamento,
          data_envio: dataEnvio,
          data_entrega: dataEntrega,
          customer_id: customerId,
          // Comissões Shopee: tipicamente 14% + R$4 fixo (varia)
          comissao_seller_pct: 14,
          comissao_seller_valor: Math.round(total * 0.14 * 100) / 100,
          tarifa_pct_valor: Math.round(total * 0.14 * 100) / 100,
          updated_at: new Date(),
          ...(dataPedido ? { created_at: dataPedido } : {}),
        }

        let orderDbId: string
        if (existingOrder) {
          await prisma.orders.update({ where: { id: existingOrder.id }, data: orderData })
          orderDbId = existingOrder.id
          atualizados++
        } else {
          const created = await prisma.orders.create({ data: orderData })
          orderDbId = created.id
          criados++
        }

        // Upsert order_items
        for (const item of items) {
          const sku = String(item.produto_sku || '').trim() || null
          const qtd = Math.max(1, Math.round(num(item.quantidade) || 1))
          const precoUnit = num(item.preco_unitario) || 0
          const precoTotal = precoUnit * qtd

          // Tenta achar product_id via SKU
          let productId: string | null = null
          if (sku) {
            const prod = await prisma.products.findUnique({
              where: { sku },
              select: { id: true },
            })
            if (prod) productId = prod.id
          }

          // Deleta items anteriores desse SKU nesse order (idempotência)
          if (sku) {
            await prisma.order_items.deleteMany({
              where: { order_id: orderDbId, sku },
            })
          } else {
            // Sem SKU, deleta tudo que tiver (assume 1 item por venda sem SKU)
            await prisma.order_items.deleteMany({
              where: { order_id: orderDbId },
            })
          }

          await prisma.order_items.create({
            data: {
              order_id: orderDbId,
              product_id: productId,
              sku: sku,
              nome_produto: String(item.produto_nome || '').trim() || null,
              quantidade: qtd,
              preco_unitario: precoUnit,
              preco_total: precoTotal,
            },
          })
        }
      } catch (e: any) {
        erros.push(`Pedido ${orderNumber}: ${e.message?.substring(0, 150)}`)
      }
    }

    return NextResponse.json({
      ok: true,
      mensagem: `✅ ${criados} criados, ${atualizados} atualizados`,
      total_linhas_raw: rawRows.length,
      linhas_reconhecidas: rows.length,
      pedidos_unicos: orderNumbers.size,
      criados,
      atualizados,
      erros: erros.length,
      erro_amostra: erros.slice(0, 5),
      clientes_criados: clientesNovos.length,
      campos_reconhecidos: Array.from(camposReconhecidos),
      dica: 'Para re-importar a mesma planilha sem duplicar, é só rodar de novo. Idempotente (atualiza o que já existe).',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack?.substring(0, 800) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET(req: NextRequest) {
  // Help / documentação do endpoint
  return NextResponse.json({
    endpoint: 'POST /api/admin/import-shopee-csv',
    como_usar: [
      '1. Vá no Shopee Seller Center',
      '2. Pedidos → "Meus Pedidos" → Exportar (CSV) OU Finanças → Minha Renda → Exportar (XLSX)',
      '3. POST multipart com field "file" (a planilha)',
      '4. Opcional: ?company_id=X (default LIURA) e ?dry_run=true (só mostra o que vai fazer sem gravar)',
    ],
    campos_reconhecidos: Object.keys(COL_MAP),
    campos_obrigatorios: ['order_number', 'produto_nome', 'quantidade', 'preco_unitario'],
    status_mapeamento: {
      'a enviar / to ship / pago': 'confirmado',
      'pronto para enviar / ready to ship': 'separado',
      'enviado / shipped': 'enviado',
      'entregue / completed': 'entregue',
      'cancelado / cancelled': 'cancelado',
    },
  })
}
