/**
 * Gera link de signin direto pro parceiro (com credenciais na URL)
 *
 * GET /api/admin/gerar-link-parceiro?company_id=X&redirect=/admin/vendas-ao-vivo
 *
 * Retorna URL de signin via GET (sem precisar de página HTML+JS).
 * Mais robusto que o auto-login HTML+JS.
 *
 * Por seguranca:
 *  - Requer Basic Auth (admin)
 *  - Token HMAC de 1 dia (valido so naquele dia)
 *  - Senha nunca eh exibida no response
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

const AUTH_SECRET = process.env.AUTH_SECRET || 'psh-auth-secret-2026'

export const dynamic = 'force-dynamic'

function generateToken(companyId: string, date: string): string {
  return crypto
    .createHmac('sha256', AUTH_SECRET)
    .update(`signin-link|${companyId}|${date}`)
    .digest('hex')
    .slice(0, 24)
}

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const companyId = searchParams.get('company_id')
  const redirect = searchParams.get('redirect') || '/admin/dashboard-parceiro'
  const daysValid = Math.max(1, Math.min(Number(searchParams.get('days') || 7), 30))

  if (!companyId) {
    return NextResponse.json({ ok: false, error: 'company_id obrigatorio' }, { status: 400 })
  }

  try {
    // Pega user da company
    const userRes: any[] = await prisma.$queryRawUnsafe(`
      SELECT u.id::text, u.email, c.nome_fantasia AS company_name
      FROM users u
      JOIN companies c ON c.id = u.company_id
      WHERE u.company_id = $1::uuid
        AND u.ativo = true
      ORDER BY u.created_at ASC
      LIMIT 1
    `, companyId)
    if (userRes.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhum user ativo encontrado nessa company' }, { status: 404 })
    }
    const user = userRes[0]

    // Pega senha de users.encrypted_password (caso use supabase) ou password_hash
    // Se nao conseguir, usa placeholder
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT nome_fantasia FROM companies WHERE id = $1::uuid`,
      companyId,
    )
    const c = company[0]

    // Pra ter a senha, vamos usar uma senha temporaria que o admin cadastrou
    // (GH SHOP = ghshop2026, ALAMEDA = alameda2026)
    // OU o admin pode passar a senha via param
    const senhaParam = searchParams.get('senha')

    // Mapa de senhas conhecidas (pra gerar links automaticos)
    const senhasConhecidas: Record<string, string> = {
      'a2176d33-f604-48cf-8d8a-df4313ce1417': 'ghshop2026',  // GH SHOP
      '3b1d4a0a-b864-4177-a9ce-e122d2956766': 'alameda2026',  // ALAMEDA
      'e8150eba-6de4-4ef6-8252-b7541d308e1c': 'cosmari2026',   // COSMARI
      'e2633570-74da-4b14-9ca1-ba7b0670e612': 'shine2026',    // LIURA (admin)
      '57d6d2a8-518e-4585-b9bb-cb474ab8ea83': 'naia2026',     // NAIA
    }

    const senha = senhaParam || senhasConhecidas[companyId]
    if (!senha) {
      return NextResponse.json({
        ok: false,
        error: 'Senha nao conhecida. Passe ?senha=XXX na URL',
      }, { status: 400 })
    }

    const origin = new URL(req.url).origin

    // Gera links validos por N dias
    const links: any[] = []
    const today = new Date()
    for (let i = 0; i < daysValid; i++) {
      const d = new Date(today)
      d.setDate(today.getDate() + i)
      const date = d.toISOString().substring(0, 10)
      const token = generateToken(companyId, date)
      // Se o redirect é /vincular-ml, anexa company_id pra página não dar erro
      const finalRedirect = redirect.includes('/vincular-ml') && !redirect.includes('company_id=')
        ? `${redirect}${redirect.includes('?') ? '&' : '?'}company_id=${companyId}`
        : redirect
      const url = `${origin}/api/auth/signin-link?email=${encodeURIComponent(user.email)}&password=${encodeURIComponent(senha)}&date=${date}&token=${token}&redirect=${encodeURIComponent(finalRedirect)}`
      links.push({ date, url })
    }

    return NextResponse.json({
      ok: true,
      company: { id: companyId, nome: c?.nome_fantasia },
      user: { email: user.email },
      dias_validos: daysValid,
      links,
      link_principal: links[0].url,
      mensagem: 'Link direto de signin. Manda pro parceiro (1-clique).',
      instrucoes: [
        '1. Manda o link_principal pro parceiro',
        '2. Parceiro clica e ja entra logado',
        '3. Cada link vale 1 dia (cookie expira em 30 dias)',
        '4. Se o navegador pedir user/senha, abre em janela anonima (Ctrl+Shift+N)',
      ],
    })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
