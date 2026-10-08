// GET /api/admin/audit-log
// Lista entradas de auditoria com filtros
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const acao = searchParams.get('acao')
    const tabela = searchParams.get('tabela')
    const userId = searchParams.get('user_id')
    const registroId = searchParams.get('registro_id')
    const days = Number(searchParams.get('days') || 7)
    const limit = Math.min(Number(searchParams.get('limit') || 200), 500)

    const from = new Date(Date.now() - days * 24 * 3600 * 1000)

    const where: any = { created_at: { gte: from } }
    if (acao && acao !== 'todas') where.acao = acao
    if (tabela && tabela !== 'todas') where.tabela = tabela
    if (userId) where.user_id = userId
    if (registroId) where.registro_id = registroId

    const logs = await prisma.audit_log.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: limit,
      include: { users: { select: { id: true, nome: true, email: true } } },
    })

    // Resumo
    const porAcao: Record<string, number> = {}
    const porTabela: Record<string, number> = {}
    const porUsuario: Record<string, { id: string; nome: string; email: string; count: number }> = {}
    for (const l of logs) {
      porAcao[l.acao || 'outros'] = (porAcao[l.acao || 'outros'] || 0) + 1
      porTabela[l.tabela || 'outros'] = (porTabela[l.tabela || 'outros'] || 0) + 1
      if (l.users) {
        if (!porUsuario[l.users.id]) {
          porUsuario[l.users.id] = { id: l.users.id, nome: l.users.nome, email: l.users.email, count: 0 }
        }
        porUsuario[l.users.id].count++
      }
    }

    return NextResponse.json({
      ok: true,
      total: logs.length,
      por_acao: porAcao,
      por_tabela: porTabela,
      por_usuario: Object.values(porUsuario).sort((a, b) => b.count - a.count),
      logs: logs.map((l) => ({
        id: l.id,
        acao: l.acao,
        tabela: l.tabela,
        registro_id: l.registro_id,
        dados_anteriores: l.dados_anteriores,
        dados_novos: l.dados_novos,
        ip_address: l.ip_address,
        user_agent: l.user_agent,
        created_at: l.created_at,
        usuario: l.users ? { id: l.users.id, nome: l.users.nome, email: l.users.email } : null,
      })),
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}

// POST /api/admin/audit-log
// Registra uma ação de auditoria (chamado por outros endpoints)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { acao, tabela, registro_id, dados_anteriores, dados_novos, user_id, metadata } = body

    if (!acao) {
      return NextResponse.json({ ok: false, error: 'acao é obrigatório' }, { status: 400 })
    }

    const ip = (req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || '').split(',')[0]?.trim() || null
    const userAgent = req.headers.get('user-agent') || null

    const log = await prisma.audit_log.create({
      data: {
        acao,
        tabela: tabela || null,
        registro_id: registro_id || null,
        dados_anteriores: dados_anteriores || null,
        dados_novos: dados_novos || (metadata ? { _meta: metadata } : null),
        user_id: user_id || null,
        ip_address: ip,
        user_agent: userAgent,
      },
    })

    return NextResponse.json({ ok: true, log })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  }
}
