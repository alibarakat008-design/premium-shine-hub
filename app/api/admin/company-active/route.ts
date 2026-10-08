import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// POST: define company ativa via cookie
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // PRIVACIDADE: Parceiro/filial NÃO pode trocar de empresa
  // Só a matriz pode definir a company ativa
  const sessionRole = req.cookies.get('psh_session_role')?.value
  if (sessionRole && sessionRole !== 'matriz') {
    return NextResponse.json(
      {
        ok: false,
        error: '🔒 Sua conta só pode ver vendas da própria empresa. Faça login como matriz para trocar.',
      },
      { status: 403 }
    )
  }

  try {
    const { company_id } = await req.json()

    if (company_id === null || company_id === 'null') {
      // Reset: mostra TUDO
      const res = NextResponse.json({ ok: true, message: 'Filtro resetado — vendo TODAS as companies' })
      res.cookies.delete('psh_active_company')
      return res
    }

    if (!company_id) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }

    // Valida que company existe
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, account_type FROM companies WHERE id = $1::uuid`,
      company_id,
    )

    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Company não encontrada' }, { status: 404 })
    }

    const res = NextResponse.json({
      ok: true,
      message: `Company ativa: ${company[0].nome_fantasia} (${company[0].account_type})`,
      company: company[0],
    })
    // Cookie expira em 1 ano
    res.cookies.set('psh_active_company', company_id, {
      httpOnly: false,
      sameSite: 'lax',
      maxAge: 365 * 24 * 60 * 60,
      path: '/',
    })
    return res
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

// GET: retorna company ativa atual
export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  // PRIVACIDADE: Se NÃO for matriz, SEMPRE retorna a session_company
  // (ignora active_company cookie se o user tentar manipular)
  const sessionRole = req.cookies.get('psh_session_role')?.value
  const sessionCompanyId = req.cookies.get('psh_session_company')?.value
  const isMatriz = !sessionRole || sessionRole === 'matriz'

  if (!isMatriz && sessionCompanyId) {
    // Força a retornar a company da sessão do user
    try {
      const company: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, nome_fantasia, account_type, cnpj FROM companies WHERE id = $1::uuid LIMIT 1`,
        sessionCompanyId,
      )
      return NextResponse.json({
        ok: true,
        active_company: company[0] || null,
        company_id: sessionCompanyId,
        is_matriz: false,
        session_role: sessionRole,
        message: `Forçado: sua empresa (${sessionRole})`,
      })
    } catch (e: any) {
      return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
    } finally {
      await prisma.$disconnect()
    }
  }

  // Matriz: comportamento normal
  const activeCompanyId = req.cookies.get('psh_active_company')?.value || null

  if (!activeCompanyId) {
    // Sem cookie: assume LIURA matriz como default
    try {
      const company: any[] = await prisma.$queryRawUnsafe(
        `SELECT id, nome_fantasia, account_type FROM companies WHERE id = 'e2633570-74da-4b14-9ca1-ba7b0670e612'::uuid LIMIT 1`,
      )
      return NextResponse.json({
        ok: true,
        active_company: company[0] || null,
        company_id: company[0]?.id || 'e2633570-74da-4b14-9ca1-ba7b0670e612',
        is_matriz: true,
        session_role: sessionRole || null,
        message: 'Default: LIURA matriz',
      })
    } catch (e: any) {
      return NextResponse.json({ ok: true, active_company: null, company_id: 'e2633570-74da-4b14-9ca1-ba7b0670e612', message: 'Default LIURA' })
    }
  }

  try {
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia, account_type FROM companies WHERE id = $1::uuid`,
      activeCompanyId,
    )
    return NextResponse.json({
      ok: true,
      active_company: company[0] || null,
      is_matriz: true,
      session_role: sessionRole || null,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

// DELETE: reseta o filtro
export async function DELETE(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const res = NextResponse.json({ ok: true, message: 'Resetado' })
  res.cookies.delete('psh_active_company')
  return res
}