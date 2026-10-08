/**
 * POST /api/admin/promo-scenarios/migrate
 * Cria as tabelas promo_scenarios, history, latest_queries, simulations
 */
import { NextRequest, NextResponse } from 'next/server'
import { isMatrizRequest } from '@/lib/admin-auth'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  if (!isMatrizRequest(req)) return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })

  try {
    // Criar tabelas via SQL raw
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS promo_scenarios (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        product_name VARCHAR(255) NOT NULL,
        mlb VARCHAR(50) NOT NULL UNIQUE,
        max_seller_discount_pct DECIMAL(5,2),
        min_sale_price DECIMAL(10,2),
        min_net_receivable DECIMAL(10,2),
        activation_mode VARCHAR(20) DEFAULT 'conservative',
        active BOOLEAN DEFAULT false,
        created_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS promo_scenario_history (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        scenario_id UUID NOT NULL REFERENCES promo_scenarios(id) ON DELETE CASCADE,
        event_type VARCHAR(50) NOT NULL,
        old_values JSONB,
        new_values JSONB,
        source_scenario_id UUID,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS promo_latest_queries (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        scenario_id UUID UNIQUE NOT NULL REFERENCES promo_scenarios(id) ON DELETE CASCADE,
        ml_user_id VARCHAR(50),
        mlb_at_query VARCHAR(50),
        raw_payload JSONB,
        normalized_data JSONB,
        fetched_at TIMESTAMPTZ DEFAULT NOW(),
        updated_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)
    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS promo_simulations (
        id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
        scenario_id UUID NOT NULL REFERENCES promo_scenarios(id) ON DELETE CASCADE,
        ml_user_id VARCHAR(50),
        mlb_at_simulation VARCHAR(50),
        product_name_at_sim VARCHAR(255),
        promotion_id VARCHAR(100),
        promotion_type VARCHAR(50),
        promotion_snapshot JSONB,
        scenario_snapshot JSONB,
        simulation_result VARCHAR(30),
        seller_pct DECIMAL(10,4),
        sale_price DECIMAL(10,2),
        net_receivable DECIMAL(10,2),
        decision_reasons JSONB,
        missing_fields JSONB,
        cumulative_effects JSONB,
        created_at TIMESTAMPTZ DEFAULT NOW()
      );
    `)

    return NextResponse.json({ ok: true, message: 'Tabelas promo_* criadas com sucesso.' })
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
