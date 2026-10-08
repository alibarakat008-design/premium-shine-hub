/**
 * POST /api/ponto/receber
 * Recebe registros de ponto de sistemas externos (Tupy, etc.)
 * Insere em ponto_registros via Management API
 */
import { NextRequest, NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

const MANAGEMENT_API = 'https://api.supabase.com/v1/projects/ubpiaicdccbpdjjsctuz/database/query'
const PAT = process.env.SUPABASE_MANAGE_TOKEN

const TIPOS_VALIDOS = ['entrada', 'saida', 'intervalo_in', 'intervalo_out']

async function mgmtExec(sql: string): Promise<void> {
  const res = await fetch(MANAGEMENT_API, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${PAT}`,
      'apikey': PAT!,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: sql }),
  })
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Management API error ${res.status}: ${text}`)
  }
}

export async function POST(req: NextRequest) {
  if (!PAT) {
    return NextResponse.json({ error: 'Servidor em manutencao' }, { status: 503 })
  }

  try {
    const body = await req.json()
    const { employee_id, data_hora, tipo, fonte } = body

    // Validar campos obrigatorios
    if (!employee_id || !data_hora || !tipo) {
      return NextResponse.json(
        { error: 'Campos obrigatorios: employee_id, data_hora, tipo' },
        { status: 400 }
      )
    }

    // Validar tipo
    if (!TIPOS_VALIDOS.includes(tipo)) {
      return NextResponse.json(
        { error: `tipo invalido. Valores aceitos: ${TIPOS_VALIDOS.join(', ')}` },
        { status: 400 }
      )
    }

    // Validar data_hora
    const dataValid = new Date(data_hora)
    if (isNaN(dataValid.getTime())) {
      return NextResponse.json(
        { error: 'data_hora invalida. Use formato ISO 8601 (ex: 2026-08-25T09:00:00-03:00)' },
        { status: 400 }
      )
    }

    const safeEmployeeId = String(employee_id).replace(/'/g, "''")
    const safeTipo = tipo.replace(/'/g, "''")
    const safeFonte = (fonte || 'api').replace(/'/g, "''")
    const dataISO = dataValid.toISOString()

    await mgmtExec(`
      INSERT INTO ponto_registros (employee_id, data_hora, tipo, fonte)
      VALUES ('${safeEmployeeId}', '${dataISO}', '${safeTipo}', '${safeFonte}')
    `)

    return NextResponse.json({ success: true, registered: { employee_id, data_hora, tipo, fonte: fonte || 'api' } }, { status: 201 })

  } catch (e: any) {
    console.error('[/api/ponto/receber]', e)
    return NextResponse.json({ error: 'Erro interno ao salvar registro' }, { status: 500 })
  }
}
