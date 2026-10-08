/**
 * =====================================================
 * CALLBACK OAUTH SHOPEE
 * =====================================================
 * Recebe ?code= e ?shop_id= do Shopee
 * Troca por access_token + refresh_token
 * Salva a conta no banco
 * =====================================================
 */

// app/api/shopee/callback/route.ts

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'

const SHOPEE_PARTNER_ID = process.env.SHOPEE_PARTNER_ID!
const SHOPEE_PARTNER_KEY = process.env.SHOPEE_PARTNER_KEY!
const SHOPEE_API_HOST = 'https://openplatform.shopee.com.br'

export async function GET(request: NextRequest) {

  try {
    const { searchParams } = new URL(request.url)
    const code = searchParams.get('code')
    const shopId = searchParams.get('shop_id')
    const state = searchParams.get('state') // user_id

    if (!code || !shopId) {
      return NextResponse.json(
        { error: 'code ou shop_id ausente' },
        { status: 400 }
      )
    }

    // 1) Trocar code por access_token
    const path = '/api/v2/auth/token/get'
    const timestamp = Math.floor(Date.now() / 1000)

    // Assinatura SEM access_token (primeira vez)
    const baseString = `${SHOPEE_PARTNER_ID}${path}${timestamp}`
    const signature = crypto
      .createHmac('sha256', SHOPEE_PARTNER_KEY)
      .update(baseString)
      .digest('hex')

    const url = `${SHOPEE_API_HOST}${path}?partner_id=${SHOPEE_PARTNER_ID}&timestamp=${timestamp}&code=${code}&shop_id=${shopId}&sign=${signature}`

    const tokenRes = await fetch(url, { method: 'POST' })
    if (!tokenRes.ok) {
      const err = await tokenRes.text()
      throw new Error(`Erro ao obter token Shopee: ${err}`)
    }

    const token: any = await tokenRes.json()

    if (token.error) {
      throw new Error(`Shopee error: ${token.message}`)
    }

    const expiresAt = new Date(Date.now() + token.expire_in * 1000)

    // 2) Buscar informações da loja
    const shopInfo = await getShopInfo(token.access_token, shopId)

    // 3) Salvar no banco
    let account = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'shopee', account_id: String(shopId) },
    })
    if (account) {
      account = await prisma.marketplace_accounts.update({
        where: { id: account.id },
        data: {
          nickname: shopInfo.shop_name,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          token_expira_em: expiresAt,
          updated_at: new Date(),
        },
      })
    } else {
      account = await prisma.marketplace_accounts.create({
        data: {
          plataforma: 'shopee',
          account_id: String(shopId),
          nickname: shopInfo.shop_name,
          access_token: token.access_token,
          refresh_token: token.refresh_token,
          token_expira_em: expiresAt,
          ativa: true,
        },
      })
    }

    // 4) Log de auditoria
    await prisma.audit_log.create({
      data: {
        user_id: state,
        acao: 'conectar_shopee',
        tabela: 'marketplace_accounts',
        registro_id: account.id,
        dados_novos: { shop_id: shopId, shop_name: shopInfo.shop_name },
      },
    })

    return NextResponse.redirect(
      new URL(
        `/admin/shopee?success=true&shop_name=${encodeURIComponent(shopInfo.shop_name)}`,
        request.url
      )
    )
  } catch (err: any) {
    console.error('[Shopee Callback]', err)
    return NextResponse.redirect(
      new URL(`/admin/shopee?error=${encodeURIComponent(err.message)}`, request.url)
    )
  }
}

async function getShopInfo(accessToken: string, shopId: string) {
  const path = '/api/v2/shop/get_shop_info'
  const timestamp = Math.floor(Date.now() / 1000)

  const baseString = `${process.env.SHOPEE_PARTNER_ID}${path}${timestamp}${accessToken}${shopId}`
  const signature = crypto
    .createHmac('sha256', process.env.SHOPEE_PARTNER_KEY!)
    .update(baseString)
    .digest('hex')

  const url = `${SHOPEE_API_HOST}${path}?partner_id=${process.env.SHOPEE_PARTNER_ID}&timestamp=${timestamp}&access_token=${accessToken}&shop_id=${shopId}&sign=${signature}`

  const res = await fetch(url)
  const data: any = await res.json()
  return data.response || {}
}

async function getDefaultCompanyId(): Promise<string> {
  const company = await prisma.companies.findFirst({
    where: { ativa: true },
    orderBy: { created_at: 'asc' },
  })
  return company?.id || ''
}
