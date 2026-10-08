/**
 * CRUD dos horarios de corte por company/conta
 *
 * GET  /api/admin/horarios-corte
 *   ?company_id=...  (filtra por empresa)
 *   ?marketplace_account_id=...
 * POST /api/admin/horarios-corte
 *   body: { company_id, marketplace_account_id?, tipo, descricao?, dia_semana, horario, ativo?, permite_junto_proximo_dia?, limite_junto_horas?, observacoes? }
 * PUT  /api/admin/horarios-corte?id=...
 * DELETE /api/admin/horarios-corte?id=...
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const companyId = searchParams.get('company_id')
    const mpAccountId = searchParams.get('marketplace_account_id')

    let where: string[] = ['1=1']
    if (companyId) where.push(`hc.company_id = '${companyId}'::uuid`)
    if (mpAccountId) where.push(`hc.marketplace_account_id = '${mpAccountId}'::uuid`)
    const whereClause = 'WHERE ' + where.join(' AND ')

    const rows: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        hc.id::text,
        hc.company_id::text,
        c.nome_fantasia as company_nome,
        hc.marketplace_account_id::text,
        ma.nickname as conta_nickname,
        ma.marketplace,
        hc.tipo,
        hc.descricao,
        hc.dia_semana,
        hc.horario::text,
        hc.ativo,
        hc.permite_junto_proximo_dia,
        hc.limite_junto_horas,
        hc.observacoes
      FROM horarios_corte hc
      LEFT JOIN companies c ON c.id = hc.company_id
      LEFT JOIN marketplace_accounts ma ON ma.id = hc.marketplace_account_id
      ${whereClause}
      ORDER BY hc.dia_semana, hc.horario
    `)

    return NextResponse.json({ ok: true, horarios: rows })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const body = await req.json()
    const {
      company_id,
      marketplace_account_id,
      tipo = 'custom',
      descricao,
      dia_semana,
      horario,
      ativo = true,
      permite_junto_proximo_dia = false,
      limite_junto_horas = 2,
      observacoes,
    } = body

    if (dia_semana === undefined || !horario) {
      return NextResponse.json({ ok: false, error: 'dia_semana e horario obrigatorios' }, { status: 400 })
    }

    const res: any[] = await prisma.$queryRawUnsafe(`
      INSERT INTO horarios_corte
        (company_id, marketplace_account_id, tipo, descricao, dia_semana, horario, ativo, permite_junto_proximo_dia, limite_junto_horas, observacoes)
      VALUES
        (${company_id ? `'${company_id}'::uuid` : 'NULL'},
         ${marketplace_account_id ? `'${marketplace_account_id}'::uuid` : 'NULL'},
         '${tipo}', ${descricao ? `'${descricao.replace(/'/g, "''")}'` : 'NULL'},
         ${Number(dia_semana)}, '${horario}', ${ativo},
         ${permite_junto_proximo_dia}, ${limite_junto_horas},
         ${observacoes ? `'${observacoes.replace(/'/g, "''").substring(0, 500)}'` : 'NULL'})
      RETURNING id::text
    `)

    return NextResponse.json({ ok: true, id: res[0]?.id })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function PUT(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id obrigatorio' }, { status: 400 })
    }
    const body = await req.json()
    const fields: string[] = []
    if (body.tipo !== undefined) fields.push(`tipo = '${body.tipo}'`)
    if (body.horario !== undefined) fields.push(`horario = '${body.horario}'`)
    if (body.dia_semana !== undefined) fields.push(`dia_semana = ${Number(body.dia_semana)}`)
    if (body.ativo !== undefined) fields.push(`ativo = ${body.ativo}`)
    if (body.permite_junto_proximo_dia !== undefined) fields.push(`permite_junto_proximo_dia = ${body.permite_junto_proximo_dia}`)
    if (body.limite_junto_horas !== undefined) fields.push(`limite_junto_horas = ${Number(body.limite_junto_horas)}`)
    if (body.descricao !== undefined) fields.push(`descricao = ${body.descricao ? `'${body.descricao.replace(/'/g, "''")}'` : 'NULL'}`)
    if (body.observacoes !== undefined) fields.push(`observacoes = ${body.observacoes ? `'${body.observacoes.replace(/'/g, "''").substring(0, 500)}'` : 'NULL'}`)
    if (fields.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nada pra atualizar' }, { status: 400 })
    }
    await prisma.$queryRawUnsafe(`
      UPDATE horarios_corte SET ${fields.join(', ')} WHERE id = '${id}'::uuid
    `)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) {
      return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    }
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) {
      return NextResponse.json({ ok: false, error: 'id obrigatorio' }, { status: 400 })
    }
    await prisma.$queryRawUnsafe(`DELETE FROM horarios_corte WHERE id = '${id}'::uuid`)
    return NextResponse.json({ ok: true })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
