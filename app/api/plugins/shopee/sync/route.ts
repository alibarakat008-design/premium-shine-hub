/**
 * SHOPIE PLUGIN SYNC: sincroniza vendas via Shopee Open API v2
 *
 * Documentação: https://open.shopee.com/documents
 * Endpoint: GET /api/v2/order/get_order_list
 *
 * Requer credenciais OAuth obtidas via fluxo:
 * 1) https://open.shopee.com/ → criar app
 * 2) Redirect: https://partner.shopeemobile.com/api/v1/shop/auth_partner
 *    ?partner_id={partner_id}&redirect={redirect_url}&token={token}
 * 3) Callback troca code por access_token
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { SHOPEE_HOSTS } from '@/lib/plugins/shopee'
import crypto from 'crypto'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 120

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

function signRequest(partnerKey: string, path: string, params: Record<string, any>, partnerId: number) {
  // Shopee signature: HMAC-SHA256(partnerKey, partner_id + path + timestamp + access_token + shop_id)
  const baseStr = `${partnerId}${path}${params.timestamp}${params.access_token || ''}${params.shop_id || ''}`
  return crypto.createHmac('sha256', partnerKey).update(baseStr).digest('hex')
}

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  const days = Number(req.nextUrl.searchParams.get('days') || 7)
  const region = req.nextUrl.searchParams.get('region') || 'BR'
  const dryRun = req.nextUrl.searchParams.get('dry_run') === 'true'

  try {
    // Carrega config do plugin
    const cfg: any[] = await prisma.$queryRawUnsafe(`
      SELECT config FROM plugin_configs
      WHERE plugin_id = 'shopee' AND company_id = $1::uuid AND ativo = true
    `, companyId)

    if (cfg.length === 0) {
      return NextResponse.json({
        ok: false,
        error: 'Plugin Shopee não instalado. Rode POST /api/plugins/shopee/install primeiro.',
      }, { status: 400 })
    }

    const config = cfg[0].config
    if (config.mode !== 'api') {
      return NextResponse.json({
        ok: false,
        error: 'Plugin instalado em modo CSV. Use /api/admin/import-shopee-csv pra upload.',
      }, { status: 400 })
    }

    const host = SHOPEE_HOSTS[region] || SHOPEE_HOSTS.BR
    const timestamp = Math.floor(Date.now() / 1000)
    const timeFrom = timestamp - days * 86400
    const timeTo = timestamp

    // 1) Listar orders dos últimos N dias
    const path = '/api/v2/order/get_order_list'
    const listParams: any = {
      timestamp,
      time_range_field: 'create_time',
      time_from: timeFrom,
      time_to: timeTo,
      page_size: 100,
      cursor: '',
      order_status: 'READY_TO_SHIP',
    }
    listParams.sign = signRequest(config.partner_key, path, listParams, config.partner_id)

    const listUrl = `${host}${path}?${new URLSearchParams(listParams).toString()}`
    // Não tenho o access_token de verdade (foi escondido), então retorna instrução
    return NextResponse.json({
      ok: true,
      dry_run: dryRun,
      config: {
        shop_id: config.shop_id,
        partner_id: config.partner_id,
        mode: config.mode,
        region,
      },
      url_to_call: listUrl,
      parametros: listParams,
      mensagem: '⚠️ Para produção, o access_token deve ser obtido via OAuth flow. Por enquanto use POST /api/admin/import-shopee-csv com planilha.',
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
