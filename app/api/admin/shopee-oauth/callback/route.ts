import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { exchangeShopeeCode, testShopeeToken } from '@/lib/shopee-auth'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

/**
 * GET /api/admin/shopee-oauth/callback?code=X&shop_id=X&state=<company_id>
 *
 * Callback do OAuth Shopee. Troca o code por tokens, salva em companies.shopee_*
 * e redireciona pro painel com mensagem.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const code = searchParams.get('code')
    const shopIdStr = searchParams.get('shop_id')
    const state = searchParams.get('state') // company_id
    const error = searchParams.get('error')

    const origin = new URL(req.url).origin

    if (error) {
      const msg = encodeURIComponent(`Erro OAuth Shopee: ${error}`)
      return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?shopee_error=${msg}`)
    }

    if (!code || !shopIdStr || !state) {
      return NextResponse.json({ ok: false, error: 'code, shop_id ou state faltando' }, { status: 400 })
    }

    const shopId = parseInt(shopIdStr, 10)
    if (isNaN(shopId)) {
      return NextResponse.json({ ok: false, error: 'shop_id inválido' }, { status: 400 })
    }

    // Valida company
    const company: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
      state,
    )
    if (company.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    // Troca code por tokens
    const tokens = await exchangeShopeeCode(code, shopId)
    if (!tokens) {
      const msg = encodeURIComponent('Não foi possível trocar o código por tokens')
      return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?shopee_error=${msg}`)
    }

    // Salva em companies
    const expiresAt = new Date(Date.now() + tokens.expire_in * 1000)
    await prisma.$queryRawUnsafe(`
      UPDATE companies SET
        shopee_access_token = $2,
        shopee_refresh_token = $3,
        shopee_expires_at = $4,
        shopee_shop_id = $5,
        shopee_authorized_at = NOW(),
        shopee_region = COALESCE(shopee_region, 'BR'),
        updated_at = NOW()
      WHERE id = $1::uuid
    `, state, tokens.access_token, tokens.refresh_token, expiresAt, tokens.shop_id)

    // Cria/vincula em marketplace_accounts (pra reusar sync genérico)
    const existingAccount = await prisma.marketplace_accounts.findFirst({
      where: { company_id: state, plataforma: 'shopee' },
    })
    if (existingAccount) {
      await prisma.marketplace_accounts.update({
        where: { id: existingAccount.id },
        data: {
          account_id: String(tokens.shop_id),
          nickname: `SHOPEE-${tokens.shop_id}`,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expira_em: expiresAt,
          ativa: true,
          updated_at: new Date(),
        },
      })
    } else {
      await prisma.marketplace_accounts.create({
        data: {
          plataforma: 'shopee',
          company_id: state,
          account_id: String(tokens.shop_id),
          nickname: `SHOPEE-${tokens.shop_id}`,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expira_em: expiresAt,
          ativa: true,
        },
      })
    }

    // Testa o token (busca shop info)
    const test = await testShopeeToken(state)
    const shopName = test.shop_info?.shop_name || `shop ${tokens.shop_id}`

    const msg = encodeURIComponent(
      `✅ Conectado com sucesso! Shopee shop: ${shopName} (${tokens.shop_id})`,
    )
    return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?shopee_success=${msg}`)
  } catch (e: any) {
    const state = new URL(req.url).searchParams.get('state') || ''
    const origin = new URL(req.url).origin
    const msg = encodeURIComponent(`Erro inesperado: ${e.message}`)
    return NextResponse.redirect(`${origin}/admin/empresas/${state}/configuracao?shopee_error=${msg}`)
  } finally {
    await prisma.$disconnect()
  }
}
