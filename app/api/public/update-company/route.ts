/**
 * PUT /api/public/update-company
 *
 * Atualiza dados cadastrais da empresa (CNPJ, razão social, etc).
 * Endpoint PÚBLICO (sem Basic Auth) — usado pela página /vincular-ml.
 *
 * IMPORTANTE: este endpoint só permite atualizar dados CADASTRAIS (não token ML,
 * não dados financeiros). Pra isso o vendor precisa estar logado.
 *
 * Body: { company_id, cnpj, razao_social, nome_fantasia, email, telefone, endereco, ... }
 */
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const {
      company_id,
      nome_fantasia,
      cnpj,
      razao_social,
      email,
      telefone,
      endereco,
      inscricao_estadual,
      cnae,
    } = body

    if (!company_id) {
      return NextResponse.json({ ok: false, error: 'company_id obrigatório' }, { status: 400 })
    }

    // Validação mínima: CNPJ ou razao_social
    if (!nome_fantasia || !cnpj) {
      return NextResponse.json(
        { ok: false, error: 'Nome fantasia e CNPJ são obrigatórios' },
        { status: 400 }
      )
    }

    // Validação básica de CNPJ (formato: 00.000.000/0000-00 ou 00000000000000)
    const cnpjClean = String(cnpj).replace(/\D/g, '')
    if (cnpjClean.length !== 11 && cnpjClean.length !== 14) {
      return NextResponse.json(
        { ok: false, error: 'CNPJ inválido (deve ter 11 dígitos pra CPF ou 14 pra CNPJ)' },
        { status: 400 }
      )
    }

    // Verifica se a company existe
    const existing: any[] = await prisma.$queryRawUnsafe(
      `SELECT id, cnpj FROM companies WHERE id = $1::uuid LIMIT 1`,
      company_id
    )
    if (existing.length === 0) {
      return NextResponse.json({ ok: false, error: 'Empresa não encontrada' }, { status: 404 })
    }

    // Monta UPDATE dinâmico
    const updates: string[] = []
    const values: any[] = []
    let n = 1

    if (nome_fantasia !== undefined) {
      updates.push(`nome_fantasia = $${n++}`)
      values.push(String(nome_fantasia).substring(0, 255))
    }
    if (cnpj !== undefined) {
      updates.push(`cnpj = $${n++}`)
      values.push(String(cnpj).substring(0, 18))
    }
    if (razao_social !== undefined) {
      updates.push(`razao_social = $${n++}`)
      values.push(String(razao_social).substring(0, 255))
    }
    if (email !== undefined) {
      updates.push(`email = $${n++}`)
      values.push(String(email).substring(0, 255))
    }
    if (telefone !== undefined) {
      updates.push(`telefone = $${n++}`)
      values.push(String(telefone).substring(0, 20))
    }
    if (endereco !== undefined) {
      // endereco é JSONB — armazena como {logradouro: "..."} ou null
      const endVal = endereco ? JSON.stringify({ logradouro: String(endereco).substring(0, 500) }) : null
      updates.push(`endereco = $${n++}::jsonb`)
      values.push(endVal)
    }
    if (inscricao_estadual !== undefined) {
      updates.push(`inscricao_estadual = $${n++}`)
      values.push(String(inscricao_estadual).substring(0, 50))
    }
    if (cnae !== undefined) {
      updates.push(`cnae = $${n++}`)
      values.push(String(cnae).substring(0, 20))
    }

    updates.push(`updated_at = NOW()`)
    values.push(company_id)

    const sql = `UPDATE companies SET ${updates.join(', ')} WHERE id = $${n}::uuid RETURNING id, nome_fantasia, cnpj, razao_social, email, telefone, inscricao_estadual, cnae, endereco::text as endereco`
    const result: any[] = await prisma.$queryRawUnsafe(sql, ...values)

    return NextResponse.json({
      ok: true,
      message: 'Dados atualizados com sucesso',
      company: result[0],
    })
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 })
  } finally {
    await prisma.$disconnect()
  }
}
