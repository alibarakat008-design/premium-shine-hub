// /app/api/brands/route.ts
// GET — lista marcas com analytics via Prisma (sem Management API)
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url)
    const analytics = searchParams.get('analytics') === 'true'

    if (!analytics) {
      // Lista simples de marcas com contagem de produtos
      const brands = await prisma.brands.findMany({
        orderBy: { nome: 'asc' },
        include: { _count: { select: { products: true } } },
      })
      const data = brands.map(b => ({
        id: b.id,
        nome: b.nome,
        descricao: b.descricao,
        logo_url: b.logo_url,
        _count: { products: b._count.products },
      }))
      return NextResponse.json({ success: true, data })
    }

    // Analytics — traz tudo junto e agrega em memória
    const brands = await prisma.brands.findMany({
      orderBy: { nome: 'asc' },
      include: {
        _count: { select: { products: true } },
        products: {
          select: {
            id: true,
            foto_principal_url: true,
            ativo: true,
          },
        },
      },
    })

    const result = brands.map(b => {
      const totalProdutos = b._count.products
      const produtosAtivos = b.products.filter(p => p.ativo).length
      const produtosComFoto = b.products.filter(p => p.foto_principal_url && p.foto_principal_url !== '').length

      return {
        id: b.id,
        nome: b.nome,
        logo_url: b.logo_url,
        total_produtos: totalProdutos,
        skus_listados: 0,
        produtos_anunciados: 0,
        produtos_com_foto: produtosComFoto,
        produtos_sem_foto: totalProdutos - produtosComFoto,
        total_vendas: 0,
        unidades_vendidas: 0,
        receita_total: 0,
        estoque_total: 0,
        capital_empatado: 0,
        ticket_medio: 0,
        sku_pct: 0,
        foto_pct: totalProdutos > 0 ? Math.round((produtosComFoto / totalProdutos) * 100) : 0,
        completeness: totalProdutos > 0 ? Math.round((produtosComFoto / totalProdutos) * 100) : 0,
      }
    })

    return NextResponse.json({ success: true, data: result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
