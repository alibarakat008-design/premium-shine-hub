/**
 * Stub para /api/admin/folha-controle/upload
 * O pacote pdf-parse tem dependência native (@napi-rs/canvas) não disponível no Vercel.
 * Para reativar: instale @napi-rs/canvas e descomente o código original.
 */
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(req: NextRequest) {
  return NextResponse.json({
    ok: false,
    error: 'Funcionalidade temporariamente desabilitada (dependência native não disponível no ambiente serverless).'
  }, { status: 503 })
}
