// Vou minimizar o proxy e ver se responde 200
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // Teste minimalista
  return await fetch('https://www.mercadolivre.com/jms/mlb/lgz/login?platform_id=ML&loginType=explicit', {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      'Accept': 'text/html',
    },
    redirect: 'manual',
  })
}