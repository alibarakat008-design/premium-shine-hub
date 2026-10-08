/**
 * SHOPIE PLUGIN: sincroniza vendas do Shopee pra dentro do app
 *
 * Modos:
 * 1) SHOPIE OPEN API (oficial, precisa de app_id + secret + partner_id)
 * 2) SHOPIE CSV (manual, upload de planilha)
 *
 * Endpoints:
 * - /api/plugins/shopee/install: configura credenciais
 * - /api/plugins/shopee/sync: puxa vendas via API
 * - /api/plugins/shopee/webhook: recebe notificações em tempo real
 * - /api/plugins/shopee/csv: upload de planilha
 *
 * Para OAuth shopee: v2.shopee/open API
 * Documentação: https://open.shopee.com/documents
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { PLUGIN_MANIFEST } from '@/lib/plugins/shopee'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

const BASIC = 'Basic ' + Buffer.from('premium:shine2026').toString('base64')

export async function GET(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const companyId = req.nextUrl.searchParams.get('company_id') || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  try {
    // Verifica se já tem plugin instalado
    const installed: any[] = await prisma.$queryRawUnsafe(`
      SELECT * FROM plugin_configs
      WHERE plugin_id = 'shopee' AND company_id = $1::uuid
    `, companyId)

    // Conta vendas Shopee
    const vendas: any[] = await prisma.$queryRawUnsafe(`
      SELECT
        COUNT(*)::int as total,
        COALESCE(SUM(total), 0)::float as receita
      FROM orders
      WHERE company_id = $1::uuid AND origem = 'shopee'::order_origem
    `, companyId)

    return NextResponse.json({
      ok: true,
      manifest: PLUGIN_MANIFEST,
      installed: installed.length > 0,
      config: installed[0] || null,
      stats: vendas[0],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message })
  } finally {
    await prisma.$disconnect()
  }
}

export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== BASIC) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  const body = await req.json().catch(() => ({}))
  const companyId = body.company_id || 'e2633570-74da-4b14-9ca1-ba7b0670e612'
  const {
    shop_id,
    partner_id,
    partner_key,
    access_token,
    refresh_token,
    expires_at,
    mode = 'api', // 'api' | 'csv'
  } = body

  try {
    // Cria tabela plugin_configs se não existir
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS plugin_configs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        plugin_id TEXT NOT NULL,
        company_id UUID NOT NULL,
        config JSONB NOT NULL,
        ativo BOOLEAN DEFAULT true,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW(),
        UNIQUE(plugin_id, company_id)
      )
    `)

    // Upsert config
    const config = {
      shop_id,
      partner_id,
      partner_key: partner_key ? '***' : null, // nunca salva plain text key
      access_token: access_token ? '***' : null,
      refresh_token: refresh_token ? '***' : null,
      expires_at,
      mode,
    }
    await prisma.$queryRawUnsafe(`
      INSERT INTO plugin_configs (plugin_id, company_id, config, ativo, updated_at)
      VALUES ('shopee', $1::uuid, $2::jsonb, true, NOW())
      ON CONFLICT (plugin_id, company_id) DO UPDATE
      SET config = EXCLUDED.config, updated_at = NOW()
    `, companyId, JSON.stringify(config))

    return NextResponse.json({
      ok: true,
      mensagem: `✅ Plugin Shopee instalado para company ${companyId}. Modo: ${mode}.`,
      next_steps: mode === 'api'
        ? [
            '1. Acesse https://open.shopee.com e crie um app',
            '2. Copie partner_id e partner_key',
            '3. Use o fluxo OAuth pra obter access_token',
            '4. Chame /api/plugins/shopee/sync pra puxar vendas',
          ]
        : [
            '1. Vá em /admin/importar-shopee',
            '2. Exporte planilha do Shopee Seller Center',
            '3. Faça upload',
          ],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
