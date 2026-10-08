import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 30

/**
 * FIX CRÍTICO multi-tenant:
 * A conta ML "ALAMEDAORIENTAL" (ml_user_id 204402886) está com company_id
 * da GH SHOP (a2176d33). Isso faz a GH Shop puxar vendas da ALAMEDA.
 *
 * Correção: mover o token pra company_id da ALAMEDA ORIENTAL real (3b1d4a0a).
 *
 * Antes de chamar, rodar:
 *   GET ?secret=DRY_RUN
 *
 * Para aplicar:
 *   GET ?secret=CONFIRMAR_FIX_TOKEN_MIXUP
 */
export async function GET(req: NextRequest) {
  try {
    const authHeader = req.headers.get('authorization') || ''
    if (!authHeader.startsWith('Basic ')) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
    const { searchParams } = new URL(req.url)
    const secret = searchParams.get('secret') || ''

    // IDs conhecidos (do schema e da memória)
    const ALAMEDA_COMPANY = '3b1d4a0a-b864-4177-a9ce-e122d2956766'
    const GHSHOP_COMPANY = 'a2176d33-f604-48cf-8d8a-df4313ce1417'
    const ALAMEDA_ML_USER = '204402886'

    // 1) Estado atual
    const allAccounts = await prisma.marketplace_accounts.findMany({
      select: { id: true, nickname: true, account_id: true, company_id: true },
    })

    const contaErrada = allAccounts.find(a => a.account_id === ALAMEDA_ML_USER)
    const alamedaInfo = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
      ALAMEDA_COMPANY,
    )
    const ghshopInfo = await prisma.$queryRawUnsafe<any[]>(
      `SELECT id, nome_fantasia FROM companies WHERE id = $1::uuid`,
      GHSHOP_COMPANY,
    )

    const antes = {
      conta_ml: contaErrada ? { id: contaErrada.id, nickname: contaErrada.nickname, ml_user_id: contaErrada.account_id, company_id: contaErrada.company_id } : null,
      alameda: alamedaInfo[0] || null,
      ghshop: ghshopInfo[0] || null,
    }

    // 2) Vendas que foram gravadas ERRADAS (com company_id da GH SHOP mas que vieram da conta ML ALAMEDAORIENTAL)
    //    Após o fix, essas vendas precisam ser MOVIDAS pra ALAMEDA
    const vendasErradas = await prisma.orders.findMany({
      where: {
        marketplace_account_id: contaErrada?.id,
        company_id: GHSHOP_COMPANY,
      },
      select: { id: true, order_number: true, total: true, pago_em: true, company_id: true },
      take: 50,
    })
    const totalVendasErradas = await prisma.orders.count({
      where: {
        marketplace_account_id: contaErrada?.id,
        company_id: GHSHOP_COMPANY,
      },
    })

    if (secret === 'DRY_RUN' || secret !== 'CONFIRMAR_FIX_TOKEN_MIXUP') {
      return NextResponse.json({
        ok: true,
        modo: 'preview',
        antes,
        vendas_erradas: {
          total: totalVendasErradas,
          sample: vendasErradas.slice(0, 10).map(v => ({ order_number: v.order_number, total: Number(v.total), pago_em: v.pago_em })),
        },
        o_que_vai_acontecer: {
          '1': 'Mover company_id da conta ML ALAMEDAORIENTAL de GHSHOP → ALAMEDA ORIENTAL real',
          '2': `Mover ${totalVendasErradas} vendas que foram salvas com company_id errado (GHSHOP) → ALAMEDA ORIENTAL`,
          '3': 'GH Shop fica SEM token ML (precisará reconectar com a conta ML certa da GH Shop)',
        },
        para_aplicar: 'GET /api/admin/fix-gh-alameda-mixup?secret=CONFIRMAR_FIX_TOKEN_MIXUP',
      })
    }

    // 3) Aplicar fix
    let updates: any[] = []

    // 3a) Mover token pra ALAMEDA
    if (contaErrada && contaErrada.company_id === GHSHOP_COMPANY) {
      await prisma.marketplace_accounts.update({
        where: { id: contaErrada.id },
        data: { company_id: ALAMEDA_COMPANY },
      })
      updates.push(`✅ Conta ML "${contaErrada.nickname}" (${contaErrada.account_id}) movida pra ALAMEDA ORIENTAL`)
    } else {
      updates.push(`⚠️  Conta ML não estava com company_id errado (já está em ${contaErrada?.company_id})`)
    }

    // 3b) Mover vendas erradas
    if (totalVendasErradas > 0) {
      const result = await prisma.orders.updateMany({
        where: {
          marketplace_account_id: contaErrada?.id,
          company_id: GHSHOP_COMPANY,
        },
        data: { company_id: ALAMEDA_COMPANY },
      })
      updates.push(`✅ ${result.count} vendas movidas de GHSHOP → ALAMEDA`)
    }

    return NextResponse.json({
      ok: true,
      modo: 'aplicado',
      updates,
      antes,
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message, stack: e.stack }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}