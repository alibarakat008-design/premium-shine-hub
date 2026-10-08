// Endpoint temporário para ver JSON completo do shipment
import { NextRequest, NextResponse } from 'next/server'
import { getMLToken } from '@/lib/ml-auth'

export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get('authorization') || ''
  if (!authHeader.startsWith('Basic ')) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }
  const { searchParams } = new URL(req.url)
  const shipmentId = searchParams.get('shipment_id')
  if (!shipmentId) return NextResponse.json({ ok: false, error: 'passe ?shipment_id=' })

  const tokenResult = await getMLToken()
  if (!tokenResult) return NextResponse.json({ ok: false, error: 'no token' })

  const url = `https://api.mercadolibre.com/shipments/${shipmentId}?access_token=${tokenResult.token}`
  const res = await fetch(url)
  const j = await res.json()

  return NextResponse.json({ status: res.status, shipment: j })
}