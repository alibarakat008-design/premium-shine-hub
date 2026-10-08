import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { testMLToken } from '@/lib/ml-auth-multi'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * POST /api/public/connect-ml-manual
 * Body: { company_id, access_token, refresh_token? }
 *
 * Endpoint PÚBLICO (sem Basic Auth) pro vendor conectar a conta ML dele
 * COLANDO o access_token direto.
 *
 * Quando o OAuth não funciona (DNS bloqueia auth.mercadolibre.com.br, ISP
 * filtra domínios .com.br, etc), o vendor pode:
 * 1. Acessar www.mercadolivre.com.br/jms/ (ou /developers) com a conta dele
 * 2. Criar um Personal Access Token em "Minhas aplicações" → "Gerenciar" → "Tokens"
 * 3. Copiar o access_token (APP_USR-...) e colar aqui
 *
 * O backend valida via /users/me e salva em companies + marketplace_accounts.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { company_id, access_token, refresh_token } = body

    if (!company_id || !access_token) {
      return NextResponse.json({
        ok: false,
        error: 'company_id e access_token obrigatórios',
        exemplo: { company_id: 'uuid', access_token: 'APP_USR-...', refresh_token: 'TG-...' },
      }, { status: 400 })
    }

    // Valida company
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
      company_id,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    // Testa o access_token via /users/me
    const test = await testMLToken(access_token)
    if (!test.ok) {
      return NextResponse.json({
        ok: false,
        error: `Token inválido: ${test.error}`,
        dica: 'Verifique se copiou o token completo (começa com APP_USR-) e se ainda não expirou (6h após criação)',
      }, { status: 400 })
    }

    const realMlUserId = test.user_id
    const expiresAt = new Date(Date.now() + 6 * 60 * 60 * 1000) // 6h

    // Salva em companies
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        access_token_ml = $2,
        refresh_token_ml = $3,
        ml_expires_at = $4,
        ml_user_id = $5,
        updated_at = NOW()
      WHERE id = $1::uuid
    `, company_id, access_token, refresh_token || null, expiresAt, realMlUserId)

    // Cria/vincula marketplace_accounts
    const existingAccount = await prisma.marketplace_accounts.findFirst({
      where: { company_id, plataforma: 'mercado_livre' },
    })
    if (existingAccount) {
      await prisma.marketplace_accounts.update({
        where: { id: existingAccount.id },
        data: {
          account_id: String(realMlUserId),
          nickname: test.nickname || existingAccount.nickname,
          access_token,
          refresh_token: refresh_token || existingAccount.refresh_token,
          token_expira_em: expiresAt,
          ativa: true,
          updated_at: new Date(),
        },
      })
    } else {
      await prisma.marketplace_accounts.create({
        data: {
          plataforma: 'mercado_livre',
          company_id,
          account_id: String(realMlUserId),
          nickname: test.nickname || `ML-${realMlUserId}`,
          access_token,
          refresh_token: refresh_token || null,
          token_expira_em: expiresAt,
          ativa: true,
        },
      })
    }

    return NextResponse.json({
      ok: true,
      message: `✅ Conectado! Conta ML: ${test.nickname} (${test.user_id})`,
      ml: {
        user_id: realMlUserId,
        nickname: test.nickname,
        email: (test as any).email,
        expires_at: expiresAt,
      },
      company: { id: company[0].id, nome: company[0].nome_fantasia },
      proximo_passo: 'Os dados do ML vão ser sincronizados automaticamente. Pode fechar esta página.',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 300) }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: '/api/public/connect-ml-manual',
    method: 'POST',
    body: { company_id: 'uuid', access_token: 'APP_USR-...', refresh_token: 'TG-...' },
    docs: 'https://developers.mercadolivre.com.br/pt_br/autenticacao-e-seguranca/contas-autorizadas',
  })
}