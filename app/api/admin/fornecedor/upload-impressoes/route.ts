/**
 * API: Upload de PDF de impressões ML
 *
 * O PDF gerado pelo ML na hora de imprimir etiquetas contém:
 *  - Lista de order_numbers
 *  - Data/hora da impressão
 *  - Endereço de envio
 *
 * Este endpoint extrai os order_numbers do PDF e cruza com vendas do sistema
 * pra validar: "imprimi X etiquetas, sistema registrou Y"
 *
 * GET /api/admin/fornecedor/upload-impressoes
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  return NextResponse.json({ ok: true, message: 'Use POST com form-data (file, partner_company_id)' })
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File
    const partnerCompanyId = formData.get('partner_company_id') as string

    if (!file) {
      return NextResponse.json({ ok: false, error: 'Arquivo PDF obrigatório' }, { status: 400 })
    }

    // Extrai texto do PDF (simplificado — pega o conteúdo bruto)
    // TODO: usar biblioteca de PDF (pdf-parse) pra extração robusta
    const buffer = Buffer.from(await file.arrayBuffer())
    const text = buffer.toString('latin1')

    // Regex pra encontrar order_numbers ML (formato: 2000013902390745 ou MLB...)
    // ML usa order_number numérico (2000013902390745) ou MLB ID
    const orderNumberRegex = /\b(2000013\d{10}|20\d{13})\b/g
    const matches = text.match(orderNumberRegex) || []
    const orderNumbers = Array.from(new Set(matches))

    if (orderNumbers.length === 0) {
      return NextResponse.json({
        ok: true,
        message: 'Nenhum order_number encontrado no PDF. Verifique se o PDF e do Mercado Livre.',
        orderNumbers_encontrados: [],
        cruzamento: { matched: 0, no_db: 0 },
      })
    }

    // Cruza com vendas do banco
    const orderNumbersSql = orderNumbers.map(n => `'${n}'`).join(',')
    const cruzamento: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.id::text,
        o.order_number,
        o.total::text,
        o.custo_total::text,
        o.etiqueta_impressa_em,
        o.impressa_por_company_id::text as impressa_por_company_id,
        c.nome_fantasia as impressa_por_nome
      FROM orders o
      LEFT JOIN companies c ON c.id = o.impressa_por_company_id
      WHERE o.order_number IN (${orderNumbersSql})
    `)

    const matched = cruzamento.length
    const noDb = orderNumbers.length - matched

    // Se foi passado partner_company_id, marca as vendas encontradas como "impressa por"
    let marcadas = 0
    if (partnerCompanyId && matched > 0) {
      const matchedIds = cruzamento.map((r: any) => `'${r.id}'::uuid`).join(',')
      if (matchedIds) {
        await prisma.$executeRawUnsafe(`
          UPDATE orders
          SET impressa_por_company_id = '${partnerCompanyId}'::uuid,
              etiqueta_impressa_em = COALESCE(etiqueta_impressa_em, NOW())
          WHERE id IN (${matchedIds})
        `)
        marcadas = matched
      }
    }

    return NextResponse.json({
      ok: true,
      pdf_info: {
        filename: file.name,
        size: file.size,
      },
      orderNumbers_encontrados: orderNumbers,
      cruzamento: {
        total_encontrados_pdf: orderNumbers.length,
        matched_db: matched,
        no_db: noDb,
        matched_ids: cruzamento,
      },
      acao: partnerCompanyId ? `${marcadas} vendas marcadas como "impressa por parceiro"` : 'Nenhuma acao (passe partner_company_id pra marcar)',
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
