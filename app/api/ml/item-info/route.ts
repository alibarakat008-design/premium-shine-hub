/**
 * =====================================================
 * API: Info de Item ML
 * GET /api/ml/item-info?ml_id=MLB123456789&company_id=X
 * =====================================================
 * Puxa dados do ML: SKU (seller_custom_field), estoque, preço
 * Prioriza conta da empresa logada (company_id), senão usa a primeira disponível
 *
 * Reescrito em 2026-09-01: usava um Personal Access Token do Supabase gravado
 * direto no código (mesmo token exposto em outros arquivos — removido de
 * todos, recomendado revogar no painel do Supabase e gerar um novo) e montava
 * SQL colando valores direto na string, incluindo o company_id vindo da URL
 * (injeção de SQL). marketplace_accounts é um model normal do Prisma (sem
 * drift de schema), então agora usa Prisma direto — sempre parametrizado.
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

const ML_TOKEN_URL = 'https://api.mercadolibre.com/oauth/token'
const ML_CLIENT_ID = process.env.ML_CLIENT_ID || ''
const ML_CLIENT_SECRET = process.env.ML_CLIENT_SECRET || ''

async function getMLToken(companyId?: string): Promise<{ token: string; nickname: string; userId: string }> {
  let account = companyId
    ? await prisma.marketplace_accounts.findFirst({
        where: { company_id: companyId, plataforma: 'mercado_livre' },
        select: { id: true, nickname: true, access_token: true, refresh_token: true },
      })
    : null

  if (!account) {
    account = await prisma.marketplace_accounts.findFirst({
      where: { plataforma: 'mercado_livre', access_token: { not: null } },
      orderBy: { created_at: 'asc' },
      select: { id: true, nickname: true, access_token: true, refresh_token: true },
    })
  }

  if (!account?.access_token) {
    throw new Error('Nenhuma conta Mercado Livre conectada. Acesse /conectar-ml.')
  }

  // Testa token atual
  const testRes = await fetch(`https://api.mercadolibre.com/users/me`, {
    headers: { Authorization: `Bearer ${account.access_token}` }
  })

  if (testRes.ok) {
    const meData: any = await testRes.json()
    return { token: account.access_token, nickname: account.nickname || '', userId: String(meData.id) }
  }

  // Token expirou — tenta refresh
  if (!account.refresh_token) {
    throw new Error(`Token de ${account.nickname} expirou. Renove em /admin/ml-contas.`)
  }

  const refreshRes = await fetch(ML_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: ML_CLIENT_ID,
      client_secret: ML_CLIENT_SECRET,
      refresh_token: account.refresh_token,
    }),
  })

  if (!refreshRes.ok) {
    const errText = await refreshRes.text()
    throw new Error(`Token de ${account.nickname} expirou. Renove em /admin/ml-contas. (ML: ${errText.slice(0, 80)})`)
  }

  const newTokens: any = await refreshRes.json()
  const expiresAt = new Date(Date.now() + (newTokens.expires_in || 21600) * 1000)

  await prisma.marketplace_accounts.update({
    where: { id: account.id },
    data: {
      access_token: newTokens.access_token,
      refresh_token: newTokens.refresh_token,
      token_expira_em: expiresAt,
      updated_at: new Date(),
    },
  })

  return { token: newTokens.access_token, nickname: account.nickname || '', userId: '' }
}

export async function GET(req: NextRequest) {
  if (!isMatrizRequest(req)) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  let rawId = searchParams.get('ml_id')?.trim() || ''
  const companyId = searchParams.get('company_id')?.trim() || undefined

  if (!rawId) {
    return NextResponse.json({ ok: false, error: 'ml_id obrigatório (ex: 1234567890 ou MLBU4485208782)' }, { status: 400 })
  }

  // Normaliza: aceita MLB123, MLBU123, ou só números
  // Também aceita URL completa do ML
  const isUrl = rawId.includes('mercadolivre') || rawId.includes('mercadolibre') || rawId.includes('mla.') || rawId.includes('mlm.')
  if (isUrl) {
    const match = rawId.match(/(MLB|MLBU|MLM|MLA)\d{7,}/i)
    if (match) rawId = match[0].toUpperCase()
  }

  // Extrai só os números do ID
  const numbersOnly = rawId.replace(/\D/g, '')

  try {
    let tokenInfo: { token: string; nickname: string; userId: string }
    try {
      tokenInfo = await getMLToken(companyId)
    } catch (tokenErr: any) {
      console.error('[item-info] Token error:', tokenErr.message)
      return NextResponse.json({ ok: false, error: tokenErr.message }, { status: 401 })
    }

    const { token, nickname, userId } = tokenInfo

    // Se veio MLBU (user_product_id), busca o MLB real
    const isMlbuInput = rawId.toUpperCase().startsWith('MLBU')
    if (isMlbuInput) {
      if (!userId) {
        return NextResponse.json({ ok: false, error: `user_id não disponível. Tente usar o ID público do ML (ex: MLB4959410703).` }, { status: 400 })
      }
      const upid = `MLBU${numbersOnly}`
      // Busca pelo user_product_id
      const searchRes = await fetch(
        `https://api.mercadolibre.com/users/${userId}/items/search?user_product_id=${upid}&access_token=${token}`
      )
      const searchData: any = searchRes.ok ? await searchRes.json() : null
      if (searchRes.ok && searchData?.results?.length > 0) {
        rawId = searchData.results[0]
      } else {
        return NextResponse.json({
          ok: false,
          error: `MLBU não encontrado na conta. Na página do produto no ML, copie o ID público (MLB...) da URL.`,
        }, { status: 404 })
      }
    }

    // Normaliza para formato MLB
    const mlIdToFetch = rawId.toUpperCase().replace(/^MLB/i, '').replace(/^MLBU/i, '')
    const finalMlId = `MLB${mlIdToFetch}`

    // Puxa dados do item E promoções em paralelo
    const [itemRes, promoRes] = await Promise.all([
      fetch(`https://api.mercadolibre.com/items/${finalMlId}`, {
        headers: { Authorization: `Bearer ${token}` }
      }),
      fetch(`https://api.mercadolibre.com/seller-promotions/items/${finalMlId}?app_version=v2`, {
        headers: { Authorization: `Bearer ${token}` }
      }).catch(() => null),
    ])

    if (!itemRes.ok) {
      if (itemRes.status === 404) {
        return NextResponse.json({ ok: false, error: `${finalMlId} não encontrado no ML` }, { status: 404 })
      }
      if (itemRes.status === 403) {
        return NextResponse.json({ ok: false, error: `${finalMlId} inacessível (403). Verifique se o token tem permissão.` }, { status: 403 })
      }
      if (itemRes.status === 401) {
        return NextResponse.json({ ok: false, error: `Token de ${nickname} recusado pelo ML. Renove em /admin/ml-contas.` }, { status: 401 })
      }
      throw new Error(`ML API error: ${itemRes.status}`)
    }

    const item: any = await itemRes.json()

    // Extrai SKU dos atributos (SELLER_SKU) caso seller_custom_field esteja vazio
    const attrSku = item.attributes?.find((a: any) => a.id === 'SELLER_SKU')?.value_name || null
    const sku = item.seller_custom_field || attrSku
    // Thumbnail ML usa HTTP — converte pra HTTPS
    const thumbnail = item.thumbnail?.replace('http://', 'https://') || null

    // Preço promocional via seller-promotions API
    let promo_price: number | null = null
    let promo_name: string | null = null
    if (promoRes?.ok) {
      try {
        const promoData: any = await promoRes.json()
        // A API pode retornar array direto ou objeto com chave "promotions"
        let promotions: any[] = Array.isArray(promoData)
          ? promoData
          : (promoData?.promotions || promoData?.results || [])

        // Pega promoção STARTED (ativa) com menor preço
        const startedPromos = promotions.filter((p: any) => String(p.status) === 'started')
        if (startedPromos.length > 0) {
          const best = startedPromos.reduce((best: any, p: any) =>
            (p.price != null && (best.price == null || p.price < best.price)) ? p : best, {})
          if (best.price != null && Number(best.price) < item.price) {
            promo_price = Number(best.price)
            promo_name = best.name || null
          }
        }
        // Fallback: candidate com menor preço
        if (promo_price === null) {
          const candidatePromos = promotions.filter((p: any) =>
            String(p.status) === 'candidate' && p.price != null && Number(p.price) < item.price)
          if (candidatePromos.length > 0) {
            const best = candidatePromos.reduce((best: any, p: any) =>
              p.price < best.price ? p : best, {})
            promo_price = Number(best.price)
            promo_name = best.name || null
          }
        }
      } catch { /* promo não crítica */ }
    }

    return NextResponse.json({
      ok: true,
      ml_id: item.id,
      ml_title: item.title,
      sku,
      price: item.price,
      base_price: item.base_price,
      original_price: item.original_price,
      promo_price,
      promo_name,
      stock: item.available_quantity,
      pictures: item.pictures?.length || 0,
      thumbnail,
      status: item.status,
      listing_type: item.listing_type_id,
      account_nickname: nickname,
      height: item.height ? Number(item.height) : null,
      width: item.width ? Number(item.width) : null,
      length: item.length ? Number(item.length) : null,
      weight: item.weight ? Number(item.weight) : null,
    })
  } catch (err: any) {
    console.error('[item-info]', err)
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
