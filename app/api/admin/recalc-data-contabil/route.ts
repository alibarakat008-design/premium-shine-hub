/**
 * Recalcula orders.data_contabil baseado nos horarios_corte configurados
 *
 * Logica:
 *  1. Pra cada venda, acha o horario de corte aplicavel (mesma company + mesma conta)
 *  2. Se venda < horario de corte, data_contabil = mesmo dia
 *  3. Se venda >= horario de corte, data_contabil = proximo dia (respeitando dias uteis se necessario)
 *  4. Se permite_junto_proximo_dia, vendas ate X horas apos o corte ainda contam pro mesmo dia
 *  5. Se nao tem horario configurado, usa 14h como padrao (regra antiga)
 *
 * POST /api/admin/recalc-data-contabil
 *   body: { days?, company_id? }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const body = await req.json().catch(() => ({}))
    const days = Math.max(1, Number(body.days || 30))
    const companyId = body.company_id || null

    let whereConditions: string[] = [`o.created_at > NOW() - (INTERVAL '${days} days')`]
    if (companyId) whereConditions.push(`o.company_id = '${companyId}'::uuid`)
    const whereClause = 'WHERE ' + whereConditions.join(' AND ')

    // Pega todas as vendas que precisam recálculo (em batches de 200)
    const BATCH_SIZE = 200
    const offset = Math.max(0, Number(body.offset || 0))

    const orders: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        o.id::text,
        o.company_id::text,
        o.created_at,
        EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'America/Sao_Paulo')::int as hora,
        EXTRACT(DOW FROM o.created_at AT TIME ZONE 'America/Sao_Paulo')::int as dow,
        DATE(o.created_at AT TIME ZONE 'America/Sao_Paulo') as data_venda
      FROM orders o
      ${whereClause}
      ORDER BY o.created_at DESC
      LIMIT ${BATCH_SIZE} OFFSET ${offset}
    `)

    // Se tem mais, indica pro user rodar de novo
    const temMais = orders.length === BATCH_SIZE

    // Pre-cache: pega todas as regras de horarios_corte uma vez
    const allRegras: any[] = await prisma.$queryRawUnsafe(`
      SELECT id::text, company_id::text, marketplace_account_id::text, dia_semana,
             horario::text, permite_junto_proximo_dia, limite_junto_horas
      FROM horarios_corte
      WHERE ativo = true
    `)
    // Index: key = company_id + dia_semana, value = regra
    const regrasIndex = new Map<string, any>()
    for (const r of allRegras) {
      const key = (r.company_id || 'null') + '|' + r.dia_semana
      if (!regrasIndex.has(key)) {
        regrasIndex.set(key, r)
      }
    }

    let recalculados = 0
    let semRegra = 0
    const samples: any[] = []

    for (const o of orders) {
      const key = (o.company_id || 'null') + '|' + o.dow
      const r = regrasIndex.get(key)

      let horarioCorte = '14:00'  // padrao
      let permiteJunto = false
      let limiteJunto = 0
      let regraId: string | null = null

      if (r) {
        horarioCorte = r.horario.substring(0, 5)
        permiteJunto = r.permite_junto_proximo_dia
        limiteJunto = r.limite_junto_horas
        regraId = r.id
      } else {
        semRegra++
      }

      const [hh, mm] = horarioCorte.split(':').map(Number)
      const minutosCorte = hh * 60 + mm
      const minutosVenda = o.hora * 60
      let dataContabil = o.data_venda

      if (minutosVenda >= minutosCorte) {
        if (!(permiteJunto && minutosVenda < minutosCorte + limiteJunto * 60)) {
          dataContabil = new Date(o.data_venda.getTime() + 24 * 60 * 60 * 1000)
          dataContabil = dataContabil.toISOString().substring(0, 10)
        }
      }

      const dataContabilStr = dataContabil.toISOString ? dataContabil.toISOString().substring(0, 10) : dataContabil

      await prisma.$queryRawUnsafe(`
        UPDATE orders
        SET data_contabil = $1::date,
            horario_corte_id = ${regraId ? `'${regraId}'::uuid` : 'NULL'}
        WHERE id = '${o.id}'::uuid
      `, dataContabilStr)
      recalculados++

      if (samples.length < 5) {
        samples.push({
          order: o.id.substring(0, 8),
          hora: o.hora,
          corte: horarioCorte,
          permite_junto: permiteJunto,
          data_venda: o.data_venda,
          data_contabil: dataContabilStr,
        })
      }
    }

    return NextResponse.json({
      ok: true,
      analisados: orders.length,
      recalculados,
      sem_regra_configurada: semRegra,
      samples,
      tem_mais: temMais,
      proximo_offset: temMais ? offset + BATCH_SIZE : null,
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message, stack: err.stack }, { status: 500 })
  }
}

export async function GET(req: NextRequest) {
  return POST(req)
}
