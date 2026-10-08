/**
 * Stub para /api/admin/importar-nota
 * pdf-parse tem dependência native (@napi-rs/canvas) incompatível com Vercel Linux.
 */
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function GET() {
  return NextResponse.json({ ok: false, error: 'Funcionalidade temporariamente desabilitada.' }, { status: 503 })
}

export async function POST(req: NextRequest) {
  return NextResponse.json({ ok: false, error: 'Funcionalidade temporariamente desabilitada.' }, { status: 503 })
}
