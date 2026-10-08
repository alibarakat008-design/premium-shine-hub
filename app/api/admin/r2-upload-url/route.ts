// Stub - Vercel Blob usado no lugar de R2
import { NextResponse } from 'next/server'
export async function GET() {
  return NextResponse.json({ ok: false, error: 'Endpoint desativado — usando Vercel Blob' })
}
