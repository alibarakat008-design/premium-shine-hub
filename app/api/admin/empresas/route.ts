import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// GET: listar empresas
export async function GET(req: NextRequest) {
  try {
    const empresas = await prisma.$queryRawUnsafe<any[]>(`
      SELECT id, cnpj, razao_social, nome_fantasia, email, account_type, ativa
      FROM companies
      WHERE ativa = true
      ORDER BY nome_fantasia ASC
    `)
    return NextResponse.json({ ok: true, empresas })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  }
}

// POST: cadastrar nova empresa
export async function POST(req: NextRequest) {
  const auth = req.headers.get('authorization')
  if (auth !== `Basic ${Buffer.from('premium:shine2026').toString('base64')}`) {
    return NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { cnpj, razao_social, nome_fantasia, email, telefone, account_type, ativa } = body

    if (!cnpj || !razao_social) {
      return NextResponse.json({ ok: false, error: 'CNPJ e Razão Social são obrigatórios' }, { status: 400 })
    }

    // Validação simples de CNPJ (14 dígitos)
    const cnpjDigits = cnpj.replace(/\D/g, '')
    if (cnpjDigits.length !== 14) {
      return NextResponse.json({ ok: false, error: 'CNPJ deve ter 14 dígitos' }, { status: 400 })
    }

    // Verifica se já existe
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id FROM companies WHERE cnpj = $1`,
      cnpj,
    )
    if (existing.length > 0) {
      return NextResponse.json({ ok: false, error: `Já existe empresa com CNPJ ${cnpj}` }, { status: 409 })
    }

    // Cria a empresa
    const result: any = await prisma.$queryRawUnsafe(`
      INSERT INTO companies (cnpj, razao_social, nome_fantasia, email, account_type, ativa)
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING id, cnpj, razao_social, nome_fantasia, email, account_type, ativa
    `, cnpj, razao_social, nome_fantasia || null, email || null, account_type || 'parceiro', ativa !== false)

    return NextResponse.json({
      ok: true,
      message: 'Empresa cadastrada com sucesso',
      company: result[0],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}