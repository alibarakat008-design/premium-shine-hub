// /api/admin/folha-controle
// GET — lista registros
// POST — cria registros (itens extraídos do upload)
// PATCH — atualiza registro (responsável, status)
// DELETE — exclui registro
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

// Criar registros em lote
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { itens } = body

    if (!itens || !Array.isArray(itens) || itens.length === 0) {
      return NextResponse.json({ ok: false, error: 'Nenhum item informado' }, { status: 400 })
    }

    // Criar cada item como registro pendente
    const created = await Promise.all(
      itens.map((item: any) =>
        prisma.folhaControle.create({
          data: {
            codigo: item.codigo,
            sku: item.sku || null,
            nome: item.nome || null,
            quantidade: item.quantidade || 1,
            arquivo_origem: item.arquivo_origem || 'upload',
            status: 'pendente',
            responsavel: null,
            observacao: null,
            data_upload: new Date(),
          },
        })
      )
    )

    return NextResponse.json({ ok: true, created: created.length })
  } catch (e: any) {
    console.error('[folha-controle POST]', e)
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 500) }, { status: 500 })
  }
}

// Listar registros
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const status = searchParams.get('status')

    const where: any = {}
    if (status) where.status = status

    const registros = await prisma.folhaControle.findMany({
      where,
      orderBy: { created_at: 'desc' },
      take: 500,
    })

    return NextResponse.json({
      ok: true,
      data: registros.map((r: any) => ({
        id: r.id,
        item: {
          id: r.id,
          codigo: r.codigo,
          sku: r.sku,
          nome: r.nome,
          quantidade: r.quantidade,
          arquivo_origem: r.arquivo_origem,
          data_upload: r.data_upload?.toISOString?.() || r.data_upload,
        },
        responsavel: r.responsavel,
        observacao: r.observacao,
        status: r.status,
        data_separacao: r.updated_at?.toISOString?.() || null,
      })),
      total: registros.length,
    })
  } catch (e: any) {
    console.error('[folha-controle GET]', e)
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 500) }, { status: 500 })
  }
}

// Atualizar ou deletar
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'ID obrigatório' }, { status: 400 })

    const body = await req.json()
    const { responsavel, observacao, status } = body

    await prisma.folhaControle.update({
      where: { id },
      data: {
        ...(responsavel !== undefined && { responsavel }),
        ...(observacao !== undefined && { observacao }),
        ...(status && { status }),
        updated_at: new Date(),
      },
    })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[folha-controle PATCH]', e)
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 500) }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ ok: false, error: 'ID obrigatório' }, { status: 400 })

    await prisma.folhaControle.delete({ where: { id } })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[folha-controle DELETE]', e)
    return NextResponse.json({ ok: false, error: e.message?.substring(0, 500) }, { status: 500 })
  }
}
