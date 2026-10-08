/**
 * =====================================================
 * API: Importação de Produtos em Massa via CSV
 * =====================================================
 * POST /api/products/import-csv
 *   Content-Type: text/csv
 *   Body: CSV com colunas:
 *     sku,ean,nome,marca,categoria,volume,genero,custo,preco_venda,estoque
 *
 * GET /api/products/import-csv/template
 *   Retorna template CSV
 * =====================================================
 */

import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  // Retornar template
  const { searchParams } = new URL(request.url)
  if (searchParams.get('template') === 'true') {
    const template = `sku,ean,nome,marca,categoria,volume,genero,custo,preco_venda,estoque
P001,7891234500011,Perfume Asad 100ml,Isabelle La Belle,Perfumes,100ml,masculino,45.00,89.90,50
P002,7891234500028,Body Splash 200ml,Barbours,Body Splash,200ml,feminino,18.00,39.90,120
P003,7891234500035,Hidratante 300g,Pink Kali,Hidratantes,300g,unissex,22.00,49.90,80`
    return new NextResponse(template, {
      headers: {
        'Content-Type': 'text/csv',
        'Content-Disposition': 'attachment; filename="produtos-template.csv"',
      },
    })
  }
  return NextResponse.json({ error: 'Use ?template=true' }, { status: 400 })
}

export async function POST(request: NextRequest) {
  try {
    const text = await request.text()
    const lines = text.split('\n').filter(l => l.trim())
    if (lines.length < 2) {
      return NextResponse.json({ success: false, error: 'CSV vazio' }, { status: 400 })
    }

    const header = lines[0].toLowerCase().split(',').map(h => h.trim())
    const requiredCols = ['sku', 'nome']
    for (const col of requiredCols) {
      if (!header.includes(col)) {
        return NextResponse.json({ success: false, error: `Coluna obrigatória "${col}" não encontrada` }, { status: 400 })
      }
    }

    const idx = (col: string) => header.indexOf(col)
    const rows = lines.slice(1)
    const result = { criados: 0, atualizados: 0, erros: [] as string[] }

    // Buscar marcas e categorias pra mapear
    const brands = await prisma.brands.findMany()
    const categories = await prisma.categories.findMany()
    const brandByName = new Map(brands.map(b => [b.nome.toLowerCase(), b]))
    const catByName = new Map(categories.map(c => [c.nome.toLowerCase(), c]))

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i]
      // Parse simples (sem escape de vírgula, ideal seria usar lib CSV)
      const cols = row.split(',').map(c => c.trim().replace(/^"|"$/g, ''))
      const sku = cols[idx('sku')] || ''
      const nome = cols[idx('nome')] || ''
      if (!sku || !nome) {
        result.erros.push(`Linha ${i + 2}: SKU ou nome vazio`)
        continue
      }

      const marcaNome = cols[idx('marca')] || ''
      let marca = brandByName.get(marcaNome.toLowerCase())
      if (!marca && marcaNome) {
        marca = await prisma.brands.create({ data: { nome: marcaNome } })
        brandByName.set(marcaNome.toLowerCase(), marca)
      }
      if (!marca) {
        // Pega marca padrão
        marca = brandByName.get('premium shine') || brands[0]
      }

      const catNome = cols[idx('categoria')] || ''
      let categoria = catByName.get(catNome.toLowerCase())
      if (!categoria && catNome) {
        categoria = await prisma.categories.create({ data: { nome: catNome, slug: catNome.toLowerCase().replace(/\s+/g, '-') } })
        catByName.set(catNome.toLowerCase(), categoria)
      }

      const data: any = {
        sku,
        ean: cols[idx('ean')] || null,
        nome,
        marca_id: marca?.id,
        categoria_id: categoria?.id || null,
        volume: cols[idx('volume')] || null,
        genero: cols[idx('genero')] || null,
        ativo: true,
        destaque: false,
      }

      const custo = parseFloat((cols[idx('custo')] || '0').replace(',', '.'))
      const precoVenda = parseFloat((cols[idx('preco_venda')] || '0').replace(',', '.'))
      const estoque = parseInt(cols[idx('estoque')] || '0')

      try {
        const existing = await prisma.products.findFirst({ where: { sku } })
        let productId: string
        if (existing) {
          await prisma.products.update({ where: { id: existing.id }, data })
          productId = existing.id
          result.atualizados++
        } else {
          const novo = await prisma.products.create({ data })
          productId = novo.id
          result.criados++
        }

        // Criar/atualizar inventory
        if (estoque > 0 || custo > 0) {
          await prisma.inventory.upsert({
            where: { product_id: productId },
            create: {
              product_id: productId,
              quantidade_atual: estoque,
              quantidade_minima: Math.floor(estoque * 0.2),
              custo_medio: custo || null,
            },
            update: {
              quantidade_atual: estoque,
              custo_medio: custo || null,
            },
          })
        }

        // Criar/atualizar preço ML
        if (precoVenda > 0 || custo > 0) {
          const company = await prisma.companies.findFirst({ where: { ativa: true } })
          if (company) {
            await prisma.product_prices.upsert({
              where: {
                product_id_canal_company_id: {
                  product_id: productId,
                  canal: 'mercado_livre',
                  company_id: company.id,
                },
              },
              create: {
                product_id: productId,
                canal: 'mercado_livre',
                company_id: company.id,
                preco_venda: precoVenda,
                custo: custo,
                margem_pct: custo && precoVenda > 0 ? ((precoVenda - custo) / precoVenda) * 100 : null,
              },
              update: {
                preco_venda: precoVenda,
                custo: custo,
                margem_pct: custo && precoVenda > 0 ? ((precoVenda - custo) / precoVenda) * 100 : null,
              },
            })
          }
        }
      } catch (err: any) {
        result.erros.push(`Linha ${i + 2} (SKU ${sku}): ${err.message}`)
      }
    }

    return NextResponse.json({ success: true, ...result })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
